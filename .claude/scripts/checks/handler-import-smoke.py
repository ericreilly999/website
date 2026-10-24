#!/usr/bin/env python3
"""handler-import-smoke: import every Lambda handler from the packaged release artifact.

Catches release zips that are missing modules (the incident where every handler failed import
after deploy). Each handler is imported in its own subprocess with ONLY the artifact root (plus
any layers, merged like Lambda's /opt) and the stdlib on sys.path: the local site-packages are
hidden, so a dependency that is installed on this machine but missing from the zip still fails.
Modules the Lambda runtime provides (boto3, botocore, ...) are allowed through from the local
install. Stdlib only.

Exit: 0 all handlers import, 1 any import failure, 2 usage, 3 not run (no artifact, no handlers,
docker unavailable, or every failure was inconclusive because of a native-wheel platform mismatch).
"""

from __future__ import annotations

import argparse
import glob
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

CHECK = "handler-import-smoke"
EXIT_PASS, EXIT_FAIL, EXIT_USAGE, EXIT_NOT_RUN = 0, 1, 2, 3
STATUS = {0: "pass", 1: "fail", 2: "usage", 3: "not_run"}

DEFAULT_RUNTIME_PROVIDED = ["boto3", "botocore", "s3transfer", "jmespath", "dateutil", "urllib3", "six"]
DEFAULT_ENV = {
    "AWS_REGION": "us-east-1",
    "AWS_DEFAULT_REGION": "us-east-1",
    "AWS_ACCESS_KEY_ID": "smoke-test",
    "AWS_SECRET_ACCESS_KEY": "smoke-test",
    "AWS_LAMBDA_FUNCTION_NAME": "handler-import-smoke",
}
TF_HANDLER = re.compile(r'\bhandler\s*=\s*"([A-Za-z_][\w.]*\.[A-Za-z_]\w*)"')
RESULT_MARK = "\x1eHANDLER_SMOKE_RESULT"

# Runs inside the subprocess. argv: paths_json handler allowed_json site_dirs_json
PROBE = r'''
import importlib, importlib.machinery, json, sys, traceback
paths, handler, allowed, site_dirs = json.loads(sys.argv[1]), sys.argv[2], set(json.loads(sys.argv[3])), json.loads(sys.argv[4])
sys.path[:0] = paths
class RuntimeProvided:
    """Lets runtime-provided top-level packages (boto3, ...) resolve from the host site-packages."""
    def find_spec(self, name, path=None, target=None):
        if "." in name or name not in allowed:
            return None
        return importlib.machinery.PathFinder.find_spec(name, site_dirs)
if allowed:
    sys.meta_path.append(RuntimeProvided())
mod, _, fn = handler.rpartition(".")
try:
    m = importlib.import_module(mod)
    f = getattr(m, fn, None)
    if f is None:
        r = {"ok": False, "kind": "MissingFunction", "error": "module %s has no attribute %s" % (mod, fn)}
    elif not callable(f):
        r = {"ok": False, "kind": "NotCallable", "error": "%s is not callable" % handler}
    else:
        r = {"ok": True}
except BaseException as e:
    r = {"ok": False, "kind": type(e).__name__, "error": str(e), "missing": getattr(e, "name", None),
         "traceback": traceback.format_exc()[-4000:]}
sys.stdout.write("\x1eHANDLER_SMOKE_RESULT" + json.dumps(r) + "\n")
'''


class UsageError(Exception):
    pass


class NotRun(Exception):
    pass


def finish(result: dict, out: str | None) -> None:
    code = result.get("exitCode", EXIT_PASS)
    full = {"ok": code == EXIT_PASS, "check": CHECK, "status": STATUS[code], **result, "exitCode": code}
    if out:
        os.makedirs(out, exist_ok=True)
        Path(out, f"{CHECK}.json").write_text(json.dumps(full, indent=2) + "\n", encoding="utf-8")
    sys.stdout.write(json.dumps(full) + "\n")
    sys.exit(code)


def load_config(project: str, explicit: str | None) -> dict:
    path = Path(explicit) if explicit else Path(project, ".project", "checks.json")
    if not path.exists():
        return {}
    try:
        cfg = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        raise UsageError(f"invalid JSON in {path}: {e}")
    return cfg if isinstance(cfg, dict) else {}


def materialise(src: Path, dest: Path) -> Path:
    """Extract a zip into dest (or copy a directory) and return the root."""
    if not src.exists():
        raise NotRun(f"artifact not found: {src}")
    if src.is_dir():
        shutil.copytree(src, dest, dirs_exist_ok=True)
    elif zipfile.is_zipfile(src):
        with zipfile.ZipFile(src) as z:
            z.extractall(dest)  # zipfile strips absolute and ".." members
    else:
        raise UsageError(f"artifact is neither a directory nor a zip: {src}")
    return dest


def handlers_from_terraform(patterns: list[str], base: Path) -> list[str]:
    found: list[str] = []
    for pat in patterns:
        for f in sorted(glob.glob(str(base / pat), recursive=True)):
            try:
                text = Path(f).read_text(encoding="utf-8", errors="replace")
            except OSError:
                continue
            found += TF_HANDLER.findall(text)
    return found


def handlers_from_glob(root: Path, pattern: str, function: str) -> list[str]:
    out = []
    for f in sorted(root.glob(pattern)):
        if f.suffix != ".py" or not f.is_file():
            continue
        rel = f.relative_to(root).with_suffix("")
        parts = list(rel.parts)
        if parts[-1] == "__init__":
            parts = parts[:-1]
        out.append(".".join(parts + [function]))
    return out


def dedupe(items: list[str]) -> list[str]:
    seen, out = set(), []
    for i in items:
        if i not in seen:
            seen.add(i)
            out.append(i)
    return out


NATIVE_SUFFIX = re.compile(r"(?:\.(?:cpython-\d+[^.]*|abi3|cp\d+-win[^.]*))?\.(?:so|pyd)$")


def native_index(roots: list[Path]) -> dict[str, str]:
    """Map dotted module name -> extension filename for every native extension in the artifact."""
    idx: dict[str, str] = {}
    for root in roots:
        if not root.exists():
            continue
        for f in root.rglob("*"):
            if f.suffix not in (".so", ".pyd") or not f.is_file():
                continue
            rel = f.relative_to(root)
            name = NATIVE_SUFFIX.sub("", rel.name)
            dotted = ".".join(list(rel.parts[:-1]) + [name])
            # layer layout: python/<pkg> or python/lib/python3.x/site-packages/<pkg>
            dotted = re.sub(r"^python\.(?:lib\.python[\d.]+\.site-packages\.)?", "", dotted)
            idx[dotted] = rel.name
    return idx


def incompatible(filename: str, platform: str = sys.platform, py: tuple = sys.version_info[:2]) -> bool:
    """True when a native extension filename cannot load on this host (other OS or CPython version)."""
    lower = filename.lower()
    if lower.endswith(".so"):
        if platform.startswith("linux"):
            os_ok = "darwin" not in lower
        elif platform == "darwin":
            os_ok = "darwin" in lower
        else:
            os_ok = False
        if not os_ok:
            return True
    if lower.endswith(".pyd") and platform != "win32":
        return True
    m = re.search(r"cpython-(\d)(\d+)", lower) or re.search(r"cp(\d)(\d+)-", lower)
    if m and (int(m.group(1)), int(m.group(2))) != tuple(py):
        return True
    return False


def classify(result: dict, natives: dict[str, str], platform: str = sys.platform, py: tuple = sys.version_info[:2]) -> str:
    if result.get("ok"):
        return "pass"
    bad = {name for name, fn in natives.items() if incompatible(fn, platform, py)}
    if not bad:
        return "fail"
    missing = result.get("missing") or ""
    text = f"{result.get('error', '')}\n{result.get('traceback', '')}"
    if missing in bad or any(missing and (b.startswith(missing + ".") or missing.startswith(b + ".")) for b in bad):
        return "inconclusive"
    if result.get("kind") in ("ImportError", "ModuleNotFoundError", "OSError") and any(b in text for b in bad):
        return "inconclusive"
    return "fail"


def lambda_paths(root: Path, opt: Path | None, prefix_root: str, prefix_opt: str) -> list[str]:
    """sys.path entries Lambda gives a function: /var/task, then /opt/python and its site-packages."""
    paths = [prefix_root]
    if opt is not None:
        paths.append(f"{prefix_opt}/python")
        for sp in sorted((opt / "python" / "lib").glob("python*/site-packages")) if (opt / "python" / "lib").exists() else []:
            paths.append(f"{prefix_opt}/python/lib/{sp.parent.name}/site-packages")
    return paths


def interpreter_info(python: str) -> dict:
    """Site dirs, version and platform of the interpreter that will run the imports."""
    code = ("import json,sys,sysconfig;p=sysconfig.get_paths();"
            "print(json.dumps({'site':[p['purelib'],p['platlib']],'version':list(sys.version_info[:2]),'platform':sys.platform}))")
    try:
        out = subprocess.run([python, "-I", "-c", code], capture_output=True, text=True, timeout=60, check=True).stdout
        info = json.loads(out)
    except (OSError, subprocess.SubprocessError, json.JSONDecodeError) as e:
        raise NotRun(f"cannot run interpreter {python}: {e}")
    info["site"] = dedupe(info["site"])
    info["version"] = tuple(info["version"])
    return info


def run_probe(handler: str, *, root: Path, opt: Path | None, env: dict, allowed: list[str], python: str,
              timeout: int, docker_image: str | None, site_dirs: list[str]) -> dict:
    if docker_image:
        paths = lambda_paths(root, opt, "/var/task", "/opt")
        cmd = ["docker", "run", "--rm", "-v", f"{root}:/var/task:ro", "-w", "/var/task"]
        if opt is not None:
            cmd += ["-v", f"{opt}:/opt:ro"]
        for k, v in env.items():
            cmd += ["-e", f"{k}={v}"]
        cmd += ["--entrypoint", "python3", docker_image, "-c", PROBE, json.dumps(paths), handler, "[]", "[]"]
        proc_env = None
    else:
        paths = [str(root)]
        if opt is not None:
            paths += [str(opt / "python")] + [str(p) for p in sorted(opt.glob("python/lib/python*/site-packages"))]
        # -I: ignore PYTHON* env vars and user site; -S: no site-packages at all.
        cmd = [python, "-I", "-S", "-c", PROBE, json.dumps(paths), handler, json.dumps(allowed), json.dumps(site_dirs)]
        proc_env = {**{k: v for k, v in os.environ.items() if k.upper() in ("SYSTEMROOT", "PATH", "TEMP", "TMP", "HOME", "USERPROFILE")}, **env}
    try:
        p = subprocess.run(cmd, cwd=str(root), env=proc_env, capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        return {"ok": False, "kind": "Timeout", "error": f"import did not finish within {timeout}s"}
    except FileNotFoundError as e:
        raise NotRun(f"cannot start {cmd[0]}: {e}")
    for line in p.stdout.split("\n"):  # not splitlines(): it also splits on the \x1e marker
        if line.startswith(RESULT_MARK):
            return json.loads(line[len(RESULT_MARK):].strip())
    if docker_image and p.returncode != 0 and ("docker daemon" in p.stderr.lower() or "cannot connect" in p.stderr.lower()):
        raise NotRun(f"docker unavailable: {p.stderr.strip()[:300]}")
    return {"ok": False, "kind": "ProbeCrashed", "error": f"exit {p.returncode}: {(p.stderr or p.stdout).strip()[-1500:]}"}


def bundles_from(args, cfg: dict, project: Path) -> list[dict]:
    section = cfg.get("handlers") or {}
    if args.artifact:
        section = {**(section if isinstance(section, dict) else {}), "artifact": args.artifact}
        if args.handler:
            section["handlers"] = args.handler
            section.pop("fromTerraform", None)
            section.pop("glob", None)
        if args.layer:
            section["layers"] = args.layer
    bundles = section if isinstance(section, list) else [section]
    out = []
    for b in bundles:
        if not b.get("artifact"):
            raise UsageError("no artifact: pass --artifact or set handlers.artifact in .project/checks.json")
        out.append({
            "artifact": str((project / b["artifact"]).resolve()) if not os.path.isabs(b["artifact"]) else b["artifact"],
            "handlers": list(b.get("handlers") or []),
            "fromTerraform": list(b.get("fromTerraform") or []),
            "glob": b.get("glob"),
            "function": b.get("function", "lambda_handler"),
            "layers": [str((project / l).resolve()) if not os.path.isabs(l) else l for l in b.get("layers") or []],
            "env": {**DEFAULT_ENV, **(b.get("env") or {})},
            "runtimeProvided": b.get("runtimeProvided", DEFAULT_RUNTIME_PROVIDED),
            "dockerImage": b.get("dockerImage"),
        })
    return out


def run_bundle(b: dict, args, project: Path, work: Path) -> dict:
    root = materialise(Path(b["artifact"]), work / "task")
    opt = None
    if b["layers"]:
        opt = work / "opt"
        for layer in b["layers"]:  # later layers overwrite earlier ones, as in Lambda
            materialise(Path(layer), opt)
    handlers = list(b["handlers"])
    handlers += handlers_from_terraform(b["fromTerraform"], project)
    if b["glob"]:
        handlers += handlers_from_glob(root, b["glob"], b["function"])
    handlers = dedupe(handlers)
    if not handlers:
        raise NotRun(f"no handlers found for {b['artifact']} (set handlers/fromTerraform/glob)")
    env = dict(b["env"])
    for kv in args.env_var or []:
        if "=" not in kv:
            raise UsageError(f"--env-var needs KEY=VALUE, got {kv!r}")
        k, v = kv.split("=", 1)
        env[k] = v
    allowed = [] if args.no_runtime_provided else b["runtimeProvided"]
    docker_image = args.docker_image or b["dockerImage"]
    natives = {} if docker_image else native_index([root] + ([opt] if opt else []))
    info = {"site": [], "version": None, "platform": "linux"} if docker_image else interpreter_info(args.python)
    results = []
    for h in handlers:
        r = run_probe(h, root=root, opt=opt, env=env, allowed=allowed, python=args.python, timeout=args.timeout,
                      docker_image=docker_image, site_dirs=info["site"])
        status = classify(r, natives, info["platform"], info["version"]) if natives else ("pass" if r.get("ok") else "fail")
        results.append({"handler": h, "status": status, **{k: v for k, v in r.items() if k != "ok"}})
    version = None if docker_image else ".".join(map(str, info["version"]))
    return {"artifact": b["artifact"], "layers": b["layers"], "docker": docker_image, "python": version, "results": results}


def main(argv=None) -> None:
    ap = argparse.ArgumentParser(
        prog="handler-import-smoke.py",
        description=__doc__.split("\n\n")[0] + " See docs/agent-conventions/verification-checks.md.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            'Config: .project/checks.json "handlers" (an object, or a list of them for several artifacts):\n'
            '  {"artifact": "backend/dist/lambda.zip", "layers": ["backend/dist/deps-layer.zip"],\n'
            '   "handlers": ["app.series.handler.lambda_handler"],          # explicit list, and/or\n'
            '   "fromTerraform": ["backend/terraform/**/*.tf"],              # every handler = "..." in these\n'
            '   "glob": "app/**/handler.py", "function": "lambda_handler",   # discovery inside the artifact\n'
            '   "env": {"TABLE_NAME": "smoke"}, "runtimeProvided": ["boto3", "botocore"],\n'
            '   "dockerImage": "public.ecr.aws/lambda/python:3.12"}\n'
            "Exit: 0 pass, 1 import failure, 2 usage, 3 not run."
        ),
    )
    ap.add_argument("--project", default=".", help="project root holding .project/checks.json (\"handlers\" section)")
    ap.add_argument("--config", help="explicit checks.json path")
    ap.add_argument("--artifact", help="zip or directory to test (overrides handlers.artifact)")
    ap.add_argument("--handler", action="append", help="module.function (repeatable; overrides config discovery)")
    ap.add_argument("--layer", action="append", help="layer zip or dir, merged into /opt in order (repeatable)")
    ap.add_argument("--env-var", action="append", help="KEY=VALUE set for the import (repeatable)")
    ap.add_argument("--no-runtime-provided", action="store_true", help="do not let boto3 & co. resolve from the host")
    ap.add_argument("--docker-image", help="import inside this image instead, e.g. public.ecr.aws/lambda/python:3.12")
    ap.add_argument("--python", default=sys.executable, help="interpreter for local imports (match the Lambda runtime)")
    ap.add_argument("--timeout", type=int, default=60, help="seconds per handler import")
    ap.add_argument("--out", help="also write <out>/handler-import-smoke.json")
    try:
        args = ap.parse_args(argv)
    except SystemExit as e:
        if e.code in (0, None):
            raise
        finish({"exitCode": EXIT_USAGE, "summary": "invalid arguments (see --help)"}, None)
        return
    project = Path(args.project).resolve()
    try:
        cfg = load_config(str(project), args.config)
        bundles = bundles_from(args, cfg, project)
        reports = []
        for i, b in enumerate(bundles):
            work = Path(tempfile.mkdtemp(prefix=f"handler-smoke-{i}-"))
            try:
                reports.append(run_bundle(b, args, project, work))
            finally:
                shutil.rmtree(work, ignore_errors=True)
    except UsageError as e:
        finish({"exitCode": EXIT_USAGE, "summary": str(e)}, args.out)
        return
    except NotRun as e:
        finish({"exitCode": EXIT_NOT_RUN, "summary": str(e)}, args.out)
        return
    all_results = [r for rep in reports for r in rep["results"]]
    failed = [r for r in all_results if r["status"] == "fail"]
    inconclusive = [r for r in all_results if r["status"] == "inconclusive"]
    if failed:
        code = EXIT_FAIL
        summary = f"{len(failed)}/{len(all_results)} handler(s) failed to import: " + ", ".join(r["handler"] for r in failed[:5])
    elif inconclusive:
        code = EXIT_NOT_RUN
        summary = (f"{len(inconclusive)} handler(s) inconclusive: native extensions built for another platform/Python; "
                   "rerun with --docker-image public.ecr.aws/lambda/python:<ver> or on Linux")
    else:
        code = EXIT_PASS
        summary = f"all {len(all_results)} handler(s) imported"
    finish({"exitCode": code, "summary": summary, "bundles": reports}, args.out)


if __name__ == "__main__":
    main()
