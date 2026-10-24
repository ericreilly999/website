#!/usr/bin/env node
'use strict';
// PreToolUse on Bash (and PowerShell): blocks destructive git and prod terraform commands, and PR merges
// (`gh api -X PUT .../pulls/<n>/merge`, `gh pr merge`) that lack the FC-14 code-review verdict.
// Every `git push` is first run as `git push --dry-run --porcelain` (same cwd and arguments), so git itself resolves
// refspecs, push.default, remote.<name>.push and push URLs; an update of refs/heads/main or master is blocked unless
// the tree diff it brings is all under `.project/` or that push URL is fleet-state. A failed dry run blocks.
// The dry run sees the repo before the command runs, so a push must be the only git command in its Bash call that can
// change commits, branches, the index or refs (except a chain wholly in the fleet-state checkout).
// PreToolUse on `mcp__*__merge_pull_request`: always blocks, pointing to the `gh api` merge.
// PreToolUse on `mcp__*__push_files` / `mcp__*__create_or_update_file`: blocks a write to the default branch.
// Rules and what to do instead: docs/agent-conventions/hooks.md. Kill switch: FLEET_HOOKS=off.
// Each block carries a `gate` reason code (blockReason), which runHook logs as a gate-event line.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const C = require('./lib/common');

/** The home directory the shell expands `~` and `$HOME` to (Git Bash sets HOME to `/c/Users/<me>`). */
const homeDir = () => C.nativePath(String(process.env.HOME || os.homedir()).replace(/\\/g, '/'));

let cygpathMissing = false;
/** `cygpath -w` of an MSYS path (`/tmp/x`), or null when cygpath is not on PATH or fails. */
function cygpath(p) {
  if (cygpathMissing) return null;
  const r = spawnSync('cygpath', ['-w', p], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 2000 });
  if (r.error) { cygpathMissing = r.error.code === 'ENOENT'; return null; }
  const out = r.status === 0 ? String(r.stdout || '').trim() : '';
  return out || null;
}

/** A directory word as the shell would read it -> a native absolute path: `~`, `$HOME` and `${HOME}` (PowerShell
 * `$env:HOME`/`$env:USERPROFILE`) expanded; on Windows an MSYS drive path (`/c/x`) becomes `C:/x` and another MSYS
 * path (`/tmp/x`) goes through `cygpath -w` when it is on PATH (`/mnt/c/...` stays as it is); resolved against
 * `base`; and, where it exists, with symlinks and junctions followed (`~/.claude/fleet` -> the fleet-state checkout). */
function shellPath(base, word) {
  let p = String(word == null || word === '' ? '.' : word);
  p = p.replace(/^(?:~|\$HOME|\$\{HOME\}|\$env:HOME|\$env:USERPROFILE)(?=[\\/]|$)/i, () => homeDir());
  if (process.platform === 'win32') {
    if (/^\/[a-zA-Z](?:\/|$)/.test(p)) p = `${p[1].toUpperCase()}:/${p.slice(3)}`;
    else if (/^\/(?!\/|mnt\/)/.test(p)) p = cygpath(p) || p;
  }
  const abs = path.resolve(base || '.', p);
  try { return fs.realpathSync.native(abs); } catch { return abs; }
}

const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };

/** Index just past the line that closes a heredoc body opened before `from` (or s.length). */
function skipBody(s, from, done) {
  let start = from;
  while (start < s.length) {
    let nl = s.indexOf('\n', start); if (nl < 0) nl = s.length;
    if (done(s.slice(start, nl).replace(/\r$/, ''))) return nl;
    start = nl + 1;
  }
  return s.length;
}

/** Split a shell command into segments of word tokens, honouring quotes. Not a full parser.
 * Heredoc bodies (`<<EOF`, `<<-'EOF'`) and PowerShell here-strings (`@'...'@`, `@"..."@`) are data,
 * not commands, so they are skipped: a file written through a heredoc may mention `git reset --hard`.
 * Command substitutions inside double quotes (`"$(...)"`) and backtick substitutions (Bash) are
 * commands, so their text is returned in `segs.subs` for the caller to check too. With `opts.ps`
 * (PowerShell) a backtick escapes the next character instead. Redirections (`2>&1`, `> /dev/null`, `>>log`, `<in`,
 * `&>x`, `<<<word`, PowerShell `*>$null`) are not words of the command: the operator, its fd and its target are dropped. */
function segments(cmd, opts = {}) {
  const segs = []; let cur = []; let word = ''; let inWord = false; let q = null;
  const heredocs = []; const subs = [];
  const quoted = []; let curQ = new Set(); let wordQ = false; // words built with quotes or escapes, by segment and index
  let dropNext = false; // the next word is a redirection target
  const endWord = () => {
    if (inWord) { if (dropNext) dropNext = false; else { if (wordQ) curQ.add(cur.length); cur.push(word); } word = ''; inWord = false; }
    wordQ = false;
  };
  const endSeg = () => { endWord(); dropNext = false; if (cur.length) { segs.push(cur); quoted.push(curQ); } cur = []; curQ = new Set(); };
  const s = String(cmd || '');
  /** Text of `$( ... )` opening at i (s[i] === '$'), and the index of its closing paren. */
  const dollarParen = (i) => {
    let depth = 0; let sq = false;
    for (let j = i + 1; j < s.length; j++) {
      if (sq) { if (s[j] === "'") sq = false; continue; }
      if (s[j] === "'") sq = true;
      else if (s[j] === '(') depth += 1;
      else if (s[j] === ')' && --depth === 0) return [s.slice(i + 2, j), j];
    }
    return [s.slice(i + 2), s.length];
  };
  const backtick = (i) => { const j = s.indexOf('`', i + 1); return j < 0 ? [s.slice(i + 1), s.length] : [s.slice(i + 1, j), j]; };
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      if (ch === q) q = null;
      else if (ch === '\\' && q === '"' && i + 1 < s.length) word += s[++i];
      else if (q === '"' && opts.ps && ch === '`' && i + 1 < s.length) word += s[++i];
      else if (q === '"' && !opts.ps && ch === '`') { const [inner, j] = backtick(i); subs.push(inner); i = j; }
      else if (q === '"' && ch === '$' && s[i + 1] === '(') { const [inner, j] = dollarParen(i); subs.push(inner); i = j; }
      else word += ch;
      continue;
    }
    if (ch === '`' && opts.ps) { if (s[i + 1] === '\n') { i++; continue; } if (i + 1 < s.length) { word += s[++i]; inWord = true; wordQ = true; } continue; }
    if (ch === '`') { const [inner, j] = backtick(i); subs.push(inner); endWord(); i = j; continue; }
    if (ch === '<' && s[i + 1] === '<' && s[i + 2] !== '<') {
      const m = /^<<(-?)[ \t]*(?:'([^'\n]*)'|"([^"\n]*)"|\\?([^\s;&|()<>'"]+))/.exec(s.slice(i));
      if (m) {
        const delim = m[2] !== undefined ? m[2] : (m[3] !== undefined ? m[3] : m[4]);
        heredocs.push({ delim, strip: m[1] === '-' });
        endWord(); i += m[0].length - 1; continue;
      }
    }
    if (ch === '\n' && heredocs.length) {
      endSeg();
      let pos = i + 1;
      for (const h of heredocs.splice(0)) pos = skipBody(s, pos, (line) => (h.strip ? line.replace(/^\t+/, '') : line) === h.delim) + 1;
      i = pos - 1; continue;
    }
    if (ch === '@' && (s[i + 1] === "'" || s[i + 1] === '"') && /^\r?\n/.test(s.slice(i + 2, i + 4))) {
      const close = `${s[i + 1]}@`;
      endSeg();
      i = skipBody(s, s.indexOf('\n', i) + 1, (line) => line.startsWith(close)) - 1; continue;
    }
    if (ch === '"' || ch === "'") { q = ch; inWord = true; wordQ = true; continue; }
    if (ch === '\\' && i + 1 < s.length && s[i + 1] !== '\n') { word += s[++i]; inWord = true; wordQ = true; continue; }
    if (ch === '\\' && s[i + 1] === '\n') { i++; continue; }
    if (ch === '>' || ch === '<' || (ch === '&' && s[i + 1] === '>')) {
      const op = /^(?:&>>?|>>|>\||>&|>|<<<|<>|<&|<)/.exec(s.slice(i))[0];
      // `2>`, `2>>`, `2>&1`; PowerShell `*>`: the fd word belongs to the redirection.
      if (inWord && !wordQ && (/^\d+$/.test(word) || (opts.ps && word === '*'))) { word = ''; inWord = false; } else endWord();
      i += op.length - 1;
      const fd = op.endsWith('&') ? /^(?:\d+-?|-)/.exec(s.slice(i + 1)) : null;
      if (fd) i += fd[0].length; else dropNext = true; // `>&2` is complete; `> file`, `>&file` take a target word
      continue;
    }
    if (ch === ';' || ch === '\n' || ch === '&' || ch === '|' || ch === '(' || ch === ')') { endSeg(); continue; }
    if (/\s/.test(ch)) { endWord(); continue; }
    word += ch; inWord = true;
  }
  endSeg();
  Object.defineProperty(segs, 'subs', { value: subs, enumerable: false });
  Object.defineProperty(segs, 'quoted', { value: quoted, enumerable: false });
  return segs;
}

const ENV_ASSIGN = /^[A-Za-z_][A-Za-z0-9_]*=/;

/** Prefix commands that run the rest of the line: their options that take a value, and how many
 * positional words they take before the command (`timeout 30 gh ...`). */
const WRAPPERS = {
  sudo: { arg: ['-u', '-g', '-h', '-p', '-C', '-D', '-r', '-t', '-U', '-T', '--user', '--group', '--host', '--prompt', '--chdir', '--role', '--type', '--other-user', '--command-timeout'] },
  env: { arg: ['-u', '--unset', '-C', '--chdir'] },
  command: {}, exec: { arg: ['-a'] }, time: { arg: ['-f', '--format', '-o', '--output'] }, nohup: {},
  nice: { arg: ['-n', '--adjustment'] }, ionice: { arg: ['-c', '-n', '-p'] }, stdbuf: { arg: ['-i', '-o', '-e'] },
  timeout: { arg: ['-s', '--signal', '-k', '--kill-after'], positional: 1 },
};

function stripPrefix(tokens) {
  let t = tokens.slice();
  const env = {};
  while (t.length) {
    const m = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(t[0]);
    if (m) { env[m[1]] = m[2]; t = t.slice(1); continue; }
    const w = WRAPPERS[t[0]];
    if (!w) break;
    t = t.slice(1);
    while (t.length && t[0].startsWith('-')) {
      if (t[0] === '--') { t = t.slice(1); break; }
      t = t.slice((w.arg || []).includes(t[0]) ? 2 : 1);
    }
    t = t.slice(w.positional || 0);
  }
  t.env = env;
  return t;
}

/** The command text a shell wrapper runs (`bash -c '...'`, `eval ...`, `pwsh -Command ...`, `iex ...`), else null. */
function innerCommand(b, t) {
  if (['bash', 'sh', 'zsh', 'dash', 'ksh'].includes(b)) {
    const i = t.findIndex((x, k) => k > 0 && /^-[a-z]*c[a-z]*$/.test(x));
    return i > 0 && t[i + 1] !== undefined ? { cmd: t[i + 1], ps: false } : null;
  }
  if (b === 'eval') return { cmd: t.slice(1).join(' '), ps: false };
  if (b === 'pwsh' || b === 'powershell') {
    const i = t.findIndex((x, k) => k > 0 && /^-(c|command)$/i.test(x));
    return i > 0 ? { cmd: t.slice(i + 1).join(' '), ps: true } : null;
  }
  if (b === 'iex' || b === 'invoke-expression') return { cmd: t.slice(1).filter((x) => !/^-command$/i.test(x)).join(' '), ps: true };
  if (b === 'cmd') { const i = t.findIndex((x) => /^\/[ck]$/i.test(x)); return i > 0 ? { cmd: t.slice(i + 1).join(' '), ps: false } : null; }
  return null;
}

function baseName(tok) { return path.basename(String(tok || '')).replace(/\.exe$/i, '').toLowerCase(); }

/** git global options -> {cwd, sub, args}. */
function parseGit(tokens, cwd) {
  let i = 1; let dir = cwd; const env = tokens.env || {}; const dirWords = [];
  while (i < tokens.length && tokens[i].startsWith('-')) {
    const t = tokens[i];
    if (t === '-C') { dirWords.push(String(tokens[i + 1] || '.')); dir = shellPath(dir, tokens[i + 1]); i += 2; continue; }
    if (t === '-c' || t === '--git-dir' || t === '--work-tree' || t === '--namespace') { i += 2; continue; }
    i += 1;
  }
  // runPrefix: the global options without `-C`; the hook's own git calls run in `cwd` (every -C applied) instead, as
  // Windows git cannot read an MSYS `-C /c/x` or a `-C ~/x` the shell would have expanded.
  const prefix = tokens.slice(1, i);
  const runPrefix = prefix.filter((x, k) => x !== '-C' && prefix[k - 1] !== '-C');
  return { cwd: dir, sub: tokens[i], subIdx: i, args: tokens.slice(i + 1), env, prefix, runPrefix, dirWords, shellCwd: cwd };
}

function currentBranch(cwd, ctx) {
  if (ctx.currentBranch) return ctx.currentBranch(cwd);
  try { return C.git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']).trim(); } catch { return null; }
}

function worktreeBranches(cwd, ctx) {
  if (ctx.worktreeBranches) return ctx.worktreeBranches(cwd);
  try {
    const out = C.git(cwd, ['worktree', 'list', '--porcelain']);
    const res = []; let wt = null;
    for (const line of out.split(/\r?\n/)) {
      if (line.startsWith('worktree ')) wt = line.slice(9);
      else if (line.startsWith('branch ')) res.push({ path: wt, branch: line.slice(7).replace(/^refs\/heads\//, '') });
    }
    return res;
  } catch { return []; }
}

function localBranch(cwd, name, ctx) {
  if (ctx.localBranch) return ctx.localBranch(cwd, name);
  try { C.git(cwd, ['show-ref', '--verify', '--quiet', `refs/heads/${name}`]); return true; } catch { return false; }
}

const PROTECTED = ['main', 'master'];

const PR_FLOW = 'Push a branch instead (`git push -u origin <branch>`), open a PR '
  + '(`gh api repos/<owner>/<repo>/pulls -f title=... -f head=<branch> -f base=main -F body=@pr-body.md`), and let the code-reviewer review and merge it (FC-14).';
// All pushes in one command share PUSH_BUDGET_MS, kept under the hook's 30 s timeout: a hook that times out does not block.
const DRY_RUN_MS = 12000;
const DIFF_MS = 5000;
const PUSH_BUDGET_MS = 24000;
const MAIN_REF = /^refs\/heads\/(main|master)$/;

/** Environment for the hook's own git calls: the session's, never the command's `VAR=x` prefixes (a GIT_* or SSH*
 * one blocks first), no system config, and never a credential prompt. */
const gitEnv = () => ({ ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' });

/** The dry run's argv: the push's own words (segments() already stopped at `|`, `;`, `&&`, `||` and dropped redirections). */
function dryRunArgv(g) {
  // core.abbrev=no: full shas in the summary; --no-verify: no pre-push hook; -q/--quiet would hide the `To` blocks.
  const args = g.args.filter((x) => x !== '-q' && x !== '--quiet');
  return [...g.runPrefix, '-c', 'core.abbrev=no', 'push', '--dry-run', '--porcelain', '--no-verify', ...args];
}

/** Run the push as `git push --dry-run --porcelain` in g.cwd -> {stdout, stderr, status, timedOut, error}. Tests inject ctx.dryRunPush. */
function dryRunPush(g, ctx) {
  const argv = dryRunArgv(g);
  if (ctx.dryRunPush) return ctx.dryRunPush(g.cwd, argv, g);
  const left = ctx.pushBudget ? ctx.pushBudget.until - Date.now() : DRY_RUN_MS;
  if (left < 2000) return { stdout: '', stderr: `no time left in the ${PUSH_BUDGET_MS / 1000} s budget for one command's pushes; run each push in its own Bash call`, status: null };
  const r = spawnSync('git', argv, { cwd: g.cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: Math.min(DRY_RUN_MS, left), env: gitEnv(g), maxBuffer: 16 * 1024 * 1024 });
  return { stdout: r.stdout || '', stderr: r.stderr || '', status: r.status, timedOut: !!(r.error && r.error.code === 'ETIMEDOUT'), error: r.error && r.error.message };
}

/** `git push --porcelain` stdout -> [{url, refs: [{flag, from, to, summary}]}], one block per `To <url>`. */
function parsePorcelain(out) {
  const blocks = []; let cur = null;
  for (const line of String(out || '').split(/\r?\n/)) {
    if (line.startsWith('To ')) { cur = { url: line.slice(3).trim(), refs: [] }; blocks.push(cur); continue; }
    if (line === 'Done') { cur = null; continue; }
    const m = /^([ +\-*!=])\t([^\t]*)\t(.*)$/.exec(line);
    if (m && cur) { const i = m[2].indexOf(':'); cur.refs.push({ flag: m[1], from: i < 0 ? '' : m[2].slice(0, i), to: i < 0 ? m[2] : m[2].slice(i + 1), summary: m[3] }); }
  }
  return blocks;
}

/** Paths that differ between two commits (tree diff, both sides of a rename), or null when git cannot say. */
function diffFiles(g, from, to, ctx) {
  if (ctx.diffFiles) return ctx.diffFiles(g, from, to);
  try {
    return execFileSync('git', [...g.runPrefix, 'diff', '--name-only', '--no-renames', from, to], { cwd: g.cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: DIFF_MS, env: gitEnv(g), maxBuffer: 64 * 1024 * 1024 })
      .split(/\r?\n/).filter(Boolean);
  } catch { return null; }
}

const isFleetState = (url) => { const r = slugFrom(url); return !!(r && r.repo.toLowerCase() === 'fleet-state'); };
const ALLOWED = 'Pushes whose changes to main are all under `.project/` (the PM\'s state commits), and fast-forward pushes to fleet-state, are allowed.';

/** Block message when the push (as git resolves it) writes refs/heads/main or master, else null. Fails closed. */
function checkPushMain(g, ctx) {
  const a = g.args;
  if (a.includes('--dry-run') || a.includes('-n')) return null; // writes nothing
  // The dry run would apply these (and could run a program they name) before the command is approved, so it never runs.
  const opt = a.find((x) => /^--(receive-pack|exec|config)/.test(x))
    || g.prefix.find((x) => x === '-c' || /^--config/.test(x) || /^-c./.test(x))
    || Object.keys(g.env || {}).find((k) => /^(GIT_|SSH)/i.test(k))
    || [...g.prefix, ...a].find((x) => /(^|=)(ext|fd)::/i.test(x));
  if (opt) {
    return `Direct pushes to main/master skip review and the FC-14 merge gate, so every push is checked with a dry run first, and this push carries \`${String(opt).split('=')[0]}\`, `
      + 'which the dry run would apply (and could run a program from) before the command is approved. Push without config overrides, `GIT_*`/`SSH*` variables, '
      + '`--receive-pack`/`--exec` or `ext::`/`fd::` URLs.';
  }
  const where = g.dirWords.length ? `\`-C ${g.dirWords.join(' -C ')}\`` : 'the shell\'s working directory';
  if (!ctx.dryRunPush && !isDir(g.cwd)) {
    return `Direct pushes to main/master skip review and the FC-14 merge gate, so every push is checked with \`git push --dry-run --porcelain\` first, and that failed `
      + `in the path step: the push runs in ${where}, which the hook resolved to ${g.cwd}, and that is not a directory. `
      + 'Name the directory as an absolute path (`C:/...`, `/c/...` and `~/...` are understood) and retry; the hook does not let a push it cannot check through.';
  }
  const r = dryRunPush(g, ctx);
  const why = r.timedOut ? `it timed out after ${DRY_RUN_MS / 1000} s`
    : ((String(r.stderr || '').trim().split(/\r?\n/).filter((l) => !/^(hint|warning):/.test(l)).pop() || r.error || `exit ${r.status}`).slice(0, 200));
  const blocks = r.timedOut ? [] : parsePorcelain(r.stdout);
  if (!blocks.length) {
    if (!ctx.fleetChain && !r.timedOut && r.status === 0 && /Everything up-to-date/.test(r.stderr || '')) return null; // nothing to push (in a fleet chain the target must still be seen)
    const pathStep = /cannot change to|not a git repository|no such file or directory/i.test(String(r.stderr || ''));
    const ran = `The dry run ran \`git ${dryRunArgv(g).join(' ')}\` in ${g.cwd} (from ${where}).`;
    return `Direct pushes to main/master skip review and the FC-14 merge gate, so every push is checked with \`git push --dry-run --porcelain\` first, and that failed `
      + (pathStep ? `in the path step (git cannot use that directory): ${why}. ${ran} Fix the path and retry; `
        : `in the dry-run step, on the push arguments as parsed: ${why}. ${ran} If those are not the push's own words, report the hook; otherwise fix the remote or the arguments and retry; `)
      + 'the hook does not let a push it cannot check through.';
  }
  if (ctx.fleetChain) {
    const away = blocks.find((b) => !isFleetState(b.url));
    // Earlier commands in this call change the repo, so the dry run's flags (`=`, `!` rejected) say nothing about the real push.
    if (away) return `Run \`git push\` in its own Bash call. This call changes the fleet-state checkout and then pushes to ${away.url}, which is not fleet-state; only pushes to fleet-state may share a call with a commit.`;
  }
  for (const b of blocks) {
    for (const ref of b.refs) {
      if (!MAIN_REF.test(ref.to) || ref.flag === '=' || ref.flag === '!') continue; // up to date, or rejected by git anyway (no earlier command in this call changed the repo)
      const dest = ref.to.replace(/^refs\/heads\//, '');
      if (ref.flag === '-') return `Direct pushes to main/master skip review and the FC-14 merge gate: this push deletes ${dest} on ${b.url}, which is blocked on every repository, fleet-state included.`;
      if (ref.flag === '+') return `Force-pushing main/master rewrites shared history: this push force-updates ${dest} on ${b.url} (blocked on every repository, fleet-state included). Push a branch and open a PR; to undo a merged change, \`git revert\` it on a branch.`;
      if (isFleetState(b.url)) continue; // the coordinator's state repo: commits go straight to main (fleet SKILL)
      if (ref.flag === '*') return `Direct pushes to main/master skip review and the FC-14 merge gate: this push creates ${dest} on ${b.url}. ${PR_FLOW}`;
      const m = /^([0-9a-f]{7,64})\.\.([0-9a-f]{7,64})\b/.exec(ref.summary);
      const files = m ? diffFiles(g, m[1], m[2], ctx) : null;
      const outside = files && files.filter((f) => !f.startsWith('.project/'));
      if (files && !outside.length) continue; // only .project/ state (FC-14 lets a session merge such a PR, too)
      const what = files ? `changes ${outside.slice(0, 3).join(', ')}${outside.length > 3 ? ', ...' : ''} outside .project/`
        : `cannot be checked (no tree diff for \`${ref.summary}\`)`;
      return `Direct pushes to main/master skip review and the FC-14 merge gate: this push to ${dest} on ${b.url} ${what}. ${PR_FLOW} ${ALLOWED}`;
    }
  }
  return null;
}

// ---- A push runs alone (review of #51) ------------------------------------------------------------------------
// The hook runs before any of the command does, so a dry run cannot see what an earlier `git commit`/`merge`/`pull` in
// the same Bash call will change. A call with a `git push` may hold only read-only git commands, unless every git
// command in it targets the fleet-state checkout (the coordinator's one-call state commit, fleet SKILL).
const READ_ONLY_GIT = new Set(['status', 'log', 'diff', 'show', 'rev-parse', 'ls-files', 'ls-remote', 'ls-tree', 'cat-file', 'describe', 'blame',
  'shortlog', 'grep', 'merge-base', 'name-rev', 'for-each-ref', 'version', 'help', 'count-objects', 'rev-list', 'show-ref', 'check-ignore', 'var', 'whatchanged']);

/** True when the git command cannot change commits, branches, the index, refs or the config a push reads. */
function readOnlyGit(g) {
  const a = g.args || []; const pos = a.filter((x) => !x.startsWith('-'));
  // Config overrides, GIT_* or pager variables, and pager/external-diff flags can run a program (core.fsmonitor,
  // core.pager, GIT_EXTERNAL_DIFF, `grep -O<cmd>`), and a program can commit.
  if ((g.prefix || []).some((x) => x === '-c' || /^-c./.test(x) || /^--(config-env|exec-path|paginate)/.test(x) || x === '-p')) return false;
  if (Object.keys(g.env || {}).some((k) => /^(GIT_|PAGER$|LESS|SSH)/i.test(k))) return false;
  if (a.some((x) => /^(-O|--open-files-in-pager|--ext-diff|--textconv|--exec|--upload-pack|--receive-pack)/.test(x))) return false;
  if (!g.sub || READ_ONLY_GIT.has(g.sub)) return true;
  switch (g.sub) {
    case 'remote': return !a.length || ['-v', '--verbose', 'get-url', 'show'].includes(a[0]);
    case 'fetch': return pos.length <= 1; // a refspec can move local refs
    case 'branch': return a.every((x) => ['--show-current', '-a', '-r', '-v', '-vv', '--list', '--all', '--remotes', '--verbose'].includes(x));
    case 'config': return a.some((x) => ['--get', '--get-all', '--get-regexp', '--list', '-l'].includes(x));
    case 'stash': case 'worktree': return a[0] === 'list' || (g.sub === 'stash' && a[0] === 'show');
    case 'tag': return a.every((x) => x === '-l' || x === '--list');
    default: return false;
  }
}

const isPush = (g) => g.sub === 'push' && !(g.args || []).some((x) => x === '--dry-run' || x === '-n');

/** Every git command in `cmd` (shell wrappers and substitutions included) as parsed by parseGit, plus env exports.
 * `opaque`: the subcommand word was quoted, escaped or built from an expansion (`pu''sh`, `p\ush`, `$x`), so it may be a push. */
function collectGit(cmd, cwd0, ps, depth, out = { gits: [], exports: [] }) {
  if (depth > 4) return out;
  let cwd = cwd0;
  const segs = segments(cmd, { ps });
  for (let si = 0; si < segs.length; si++) {
    const raw = segs[si];
    const t = stripPrefix(raw);
    if (!t.length) continue;
    const b = baseName(t[0]);
    if (b === 'cd' || b === 'pushd' || b === 'set-location') { if (t[1]) cwd = shellPath(cwd, t[1]); continue; }
    if (b === 'export' && t.slice(1).some((x) => /^(GIT_|SSH|PAGER=|LESS)/i.test(x))) out.exports.push(t.join(' '));
    if (/^\$env:(GIT_|SSH|PAGER|LESS)/i.test(t[0])) out.exports.push(t.join(' '));
    if (b === 'git') {
      const g = parseGit(t, cwd);
      const at = raw.length - t.length + g.subIdx; // stripPrefix drops words from the front only
      const opaque = g.sub != null && ((segs.quoted[si] && segs.quoted[si].has(at)) || /[$`%@{}*?]/.test(g.sub));
      out.gits.push({ g, text: t.join(' '), opaque });
      continue;
    }
    const inner = innerCommand(b, t);
    if (inner) collectGit(inner.cmd, cwd, inner.ps, depth + 1, out);
  }
  for (const sub of segs.subs) collectGit(sub, cwd, ps, depth + 1, out);
  return out;
}

const FLEET_STATE_SLUG = 'ericreilly999/fleet-state';

/** Block for a call that pushes and also changes the repo (or exports a GIT_ or SSH variable), else null. */
function checkPushChain(cmd, cwd, ps, ctx) {
  const { gits, exports } = collectGit(cmd, cwd, ps, 0);
  const odd = gits.find((x) => x.opaque);
  if (odd) {
    return {
      block: `Blocked: ${odd.text.slice(0, 120)}\nDirect pushes to main/master skip review and the FC-14 merge gate, and the git subcommand \`${String(odd.g.sub).slice(0, 40)}\` `
        + 'is quoted, escaped or built from an expansion, so the hook cannot tell whether it is a push. Write the subcommand plainly (`git push ...`, `git status`).',
      gate: { reason: 'push_main' },
    };
  }
  if (!gits.some((x) => isPush(x.g))) return null;
  const others = gits.filter((x) => !isPush(x.g) && !readOnlyGit(x.g));
  if (!others.length && !exports.length) return null;
  const fleet = (dir) => { const r = originRepo(dir, ctx); return !!(r && `${r.owner}/${r.repo}`.toLowerCase() === FLEET_STATE_SLUG); };
  // Fleet-state chain: allowed only when nothing in it can change where a push goes (remote/config writes), and then
  // every push must also go to fleet-state, which checkPushMain checks per `To` block (ctx.fleetChain).
  if (!exports.length && gits.every((x) => fleet(x.g.cwd)) && !others.some((x) => ['remote', 'config'].includes(x.g.sub))) {
    return { fleetChain: true };
  }
  const push = gits.find((x) => isPush(x.g)).text;
  const what = exports.length ? `sets ${exports[0].slice(0, 60)}` : `also runs \`${others[0].text.slice(0, 60)}\``;
  return {
    block: `Blocked: ${push.slice(0, 120)}\nRun \`git push\` in its own Bash call. This call ${what}, and the push guard checks a push before any of the call runs, `
      + 'so it would judge the repository as it was before that command. Run the other commands first, then the push alone in a separate Bash call '
      + '(read-only git such as `status`, `log`, `diff` or `fetch` may share it). Only a chain in which every git command targets the fleet-state checkout may stay in one call.',
    gate: { reason: 'push_chained' },
  };
}

function checkGit(g, ctx) {
  const a = g.args; const has = (...f) => a.some((x) => f.includes(x));
  switch (g.sub) {
    case 'reset':
      if (has('--hard')) return '`git reset --hard` discards work. Use `git stash push -u -m <why>` (recoverable), `git reset --keep <ref>`, or start a fresh branch/worktree from the ref you want.';
      break;
    case 'checkout': {
      const dd = a.indexOf('--');
      const paths = dd >= 0 ? a.slice(dd + 1) : a.filter((x) => !x.startsWith('-'));
      if ((dd >= 0 || a.length === 1) && paths.some((p) => ['.', ':/', '*', './'].includes(p))) {
        return '`git checkout -- .` throws away every uncommitted change. Restore named files only (`git restore <file>`), or `git stash push -u` first.';
      }
      break;
    }
    case 'restore': {
      const paths = a.filter((x) => !x.startsWith('-'));
      const stagedOnly = has('--staged', '-S') && !has('--worktree', '-W');
      if (!stagedOnly && paths.some((p) => ['.', ':/', '*', './'].includes(p))) {
        return '`git restore .` throws away every uncommitted change. Restore named files only, or `git stash push -u` first.';
      }
      break;
    }
    case 'clean':
      if (a.some((x) => x === '--force' || /^-[a-zA-Z]*f/.test(x))) {
        return '`git clean -f` deletes untracked files permanently. List them with `git clean -n`, move what must go aside, or ask the PM (agent-worktree-discipline.md rule 3).';
      }
      break;
    case 'push': {
      const force = a.some((x) => x === '--force' || x === '-f' || x.startsWith('--force-with-lease') || x.startsWith('--force-if-includes') || /^-[a-zA-Z]*f[a-zA-Z]*$/.test(x));
      const pos = a.filter((x) => !x.startsWith('-'));
      const refspecs = pos.slice(1);
      // `v1.2.0` is a tag cut unless a local branch has that name (`git push origin v2-redesign`).
      const vTag = (r) => { const src = r.replace(/^\+/, '').split(':')[0]; return /^v\d/.test(src) && !localBranch(g.cwd, src, ctx); };
      if (has('--tags', '--follow-tags') || refspecs.some((r) => /(^\+?refs\/tags\/)|(:refs\/tags\/)/.test(r) || vTag(r)) || (pos[1] === 'tag')) {
        if (/^[A-Z][A-Z0-9]{0,5}-\d+$/.test(String(g.env.FLEET_TAG_APPROVED || ''))) break; // approved cut, id cited
        return 'Tag pushes are release-candidate cuts (Tier 3). Raise a decide card for the owner and push the branch without tags. '
          + 'Once the owner has approved the cut, push with the approving decision id: `FLEET_TAG_APPROVED=GC-123 git push origin <tag>`.';
      }
      const dest = (r) => r.replace(/^\+/, '').split(':').pop().replace(/^refs\//, '').replace(/^heads\//, '');
      const plus = refspecs.some((r) => r.startsWith('+') && PROTECTED.includes(dest(r)));
      const toProtected = refspecs.some((r) => PROTECTED.includes(dest(r)))
        || (refspecs.length === 0 && PROTECTED.includes(currentBranch(g.cwd, ctx)))
        || refspecs.some((r) => r === 'HEAD' && PROTECTED.includes(currentBranch(g.cwd, ctx)))
        || has('--mirror', '--all', '--branches');
      if ((force && toProtected) || plus) {
        return 'Force-pushing main/master rewrites shared history. Push a branch and open a PR; to undo a merged change, `git revert` it on a branch.';
      }
      const msg = checkPushMain(g, ctx);
      if (msg) return msg;
      break;
    }
    case 'branch': {
      const forceDelete = a.some((x) => x === '-D' || /^-[a-zA-Z]*D/.test(x)) || (has('-d', '--delete') && has('-f', '--force'));
      if (!forceDelete) break;
      const names = a.filter((x) => !x.startsWith('-'));
      const wts = worktreeBranches(g.cwd, ctx);
      const hit = names.map((n) => wts.find((w) => w.branch === n)).find(Boolean);
      if (hit) return `Branch ${hit.branch} is checked out in worktree ${hit.path}. Push it, then \`git worktree remove ${hit.path}\`, then delete the branch (PM rule 5).`;
      break;
    }
    default: break;
  }
  return null;
}

function checkTerraform(tokens, cwd) {
  let chdir = null; let i = 1;
  for (; i < tokens.length && tokens[i].startsWith('-'); i++) {
    const m = /^-chdir=(.*)$/.exec(tokens[i]); if (m) chdir = m[1];
  }
  const sub = tokens[i];
  if (!['apply', 'destroy'].includes(sub)) return null;
  const where = [cwd || '', chdir || ''].join(' ').replace(/\\/g, '/').toLowerCase();
  if (/(^|[/\s_.-])prod(uction)?($|[/\s_.-])/.test(where)) {
    return `\`terraform ${sub}\` against prod runs only through the deploy pipeline (FL-6), under P-7/P-10 or after owner approval. Run \`terraform plan\` and raise the change as a decide card or pipeline dispatch.`;
  }
  return null;
}

// ---- Merge gate (owner decision FC-14, 2026-10-21) ------------------------------------------------
// A PR merges only after the code-reviewer posted a review whose first non-empty line is
// `Verdict: APPROVE` on the current head commit, or when every changed file is under `.project/`.
// Checked through `gh api` REST (GraphQL is blocked in cloud sessions). A failed lookup blocks:
// this is a gate, not a guard, so it does not fail open.

const MERGE_EP = /^(?:https?:\/\/[^/]+\/)?\/?repos\/([^/\s]+)\/([^/\s]+)\/pulls\/([^/\s]+)\/merge\/?(?:\?.*)?$/i;
const VERDICT = 'Verdict: APPROVE';
const PER_PAGE = 100;
const MAX_PAGES = 30; // the files endpoint stops at 3000 files
// All lookups for one merge share this budget, kept under the hook's 30 s timeout in
// settings.fragment.json: a hook that times out does not block, so the gate must answer first.
const BUDGET_MS = 20000;
const CALL_MS = 8000;
const NON_LITERAL = /[$`@%]/; // a shell variable, substitution or splat: the value is unknown here

class GhError extends Error {}

/** Default gh runner: `gh` on PATH, or $FLEET_GH_BIN (a .js file runs under node) for tests. */
function runGh(args, env = process.env, timeout = CALL_MS) {
  const bin = env.FLEET_GH_BIN || 'gh';
  const [file, argv] = /\.[cm]?js$/i.test(bin) ? [process.execPath, [bin, ...args]] : [bin, args];
  return execFileSync(file, argv, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout, maxBuffer: 64 * 1024 * 1024, env });
}

function ghJson(ctx, endpoint) {
  let out;
  const left = (ctx.deadline || Infinity) - Date.now();
  if (left <= 0) throw new GhError(`lookups took over ${BUDGET_MS / 1000}s (at gh api ${endpoint})`);
  try { out = ctx.gh ? ctx.gh(['api', endpoint]) : runGh(['api', endpoint], ctx.env || process.env, Math.min(CALL_MS, left)); } catch (e) {
    const why = String((e && (e.stderr || e.message)) || e).trim().split(/\r?\n/)[0];
    throw new GhError(`gh api ${endpoint} failed: ${why.slice(0, 200)}`);
  }
  try { return JSON.parse(out); } catch { throw new GhError(`gh api ${endpoint} returned no JSON`); }
}

function ghPages(ctx, endpoint) {
  const all = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const rows = ghJson(ctx, `${endpoint}${endpoint.includes('?') ? '&' : '?'}per_page=${PER_PAGE}&page=${page}`);
    if (!Array.isArray(rows)) throw new GhError(`gh api ${endpoint} did not return a list`);
    all.push(...rows);
    if (rows.length < PER_PAGE) break;
  }
  return all;
}

function firstLine(body) { return (String(body || '').split(/\r?\n/).find((l) => l.trim()) || '').trim(); }

/** `gh api` tokens -> {owner, repo, number} when the call is a PUT on pulls/<n>/merge, else null.
 * A method or endpoint given through a variable (`-X $M`, `pulls/$N/merge`, `-X PU`T` in PowerShell
 * is already unescaped) counts as a possible merge; one the hook cannot name throws (blocks). */
function parseGhApiMerge(tokens) {
  let method = null; let ep = null; let opaque = null; let first = null;
  for (let i = 2; i < tokens.length; i++) {
    const t = tokens[i];
    let m;
    if (t === '-X' || t === '--method') { method = tokens[i + 1]; i += 1; continue; }
    if ((m = /^(?:-X=?|--method=)(.+)$/.exec(t))) { method = m[1]; continue; }
    if (['-H', '--header', '-f', '--raw-field', '-F', '--field', '--input', '-q', '--jq', '-t', '--template', '--hostname', '-p', '--preview', '--cache'].includes(t)) { i += 1; continue; }
    if (t.startsWith('-') || ep) continue;
    if (first === null) first = t;
    if (MERGE_EP.test(t)) ep = t;
    else if (NON_LITERAL.test(t) && (/merge|pulls/i.test(t) || /^\$\{?\w+\}?$/.test(t))) opaque = opaque || t;
  }
  const meth = method == null ? '' : String(method);
  const put = meth.toUpperCase() === 'PUT' || NON_LITERAL.test(meth);
  // `pulls/../contents/x/merge` matches the repo's `pulls/*/merge` allow rule but is not a merge the gate can name.
  if (put && first && (/(^|\/)\.\.?(\/|$)/.test(first) || /%2[ef]/i.test(first))) {
    throw new GhError(`\`${first}\` has a \`.\`/\`..\` or encoded path segment; name the endpoint plainly (repos/O/R/pulls/N/merge)`);
  }
  if (!put || (!ep && !opaque)) return null;
  if (!ep) throw new GhError(`the endpoint \`${opaque}\` is built from a variable, so the hook cannot tell which PR it merges`);
  const m = MERGE_EP.exec(ep);
  if ([m[1], m[2], m[3]].some((x) => NON_LITERAL.test(x)) || !/^\d+$/.test(m[3])) {
    throw new GhError(`\`${ep}\` names the PR through a variable, so the hook cannot tell which PR it merges`);
  }
  return { owner: m[1], repo: m[2], number: Number(m[3]) };
}

/** `gh pr merge` tokens -> {repoFlag, selector}, else null. */
function parseGhPrMerge(tokens) {
  if (tokens[1] !== 'pr' || tokens[2] !== 'merge') return null;
  if (tokens.slice(3).some((t) => ['--disable-auto', '--help', '-h'].includes(t))) return null; // not a merge
  let repoFlag = null; let selector = null;
  for (let i = 3; i < tokens.length; i++) {
    const t = tokens[i];
    let m;
    if (t === '-R' || t === '--repo') { repoFlag = tokens[i + 1]; i += 1; continue; }
    if ((m = /^(?:-R=?|--repo=)(.+)$/.exec(t))) { repoFlag = m[1]; continue; }
    if (['-t', '--subject', '-b', '--body', '-F', '--body-file', '--match-head-commit', '-A', '--author-email'].includes(t)) { i += 1; continue; }
    if (!t.startsWith('-') && selector === null) selector = t;
  }
  return { repoFlag, selector };
}

function slugFrom(s) {
  const m = /(?:github\.com[/:])?([^/:\s]+)\/([^/\s]+?)(?:\.git)?\/?$/.exec(String(s || ''));
  return m ? { owner: m[1], repo: m[2] } : null;
}

function originRepo(cwd, ctx) {
  if (ctx.originRepo) return ctx.originRepo(cwd);
  try { return slugFrom(C.git(cwd, ['remote', 'get-url', 'origin']).trim()); } catch { return null; }
}

/** Resolve `{owner}`/`{repo}` placeholders (gh fills them from GH_REPO or the cwd's origin). */
// In a cloud session a merge must name its repository literally: `gh` fills `{owner}/{repo}` and a bare
// `gh pr merge` from GH_REPO (also an `export` earlier in the session) or an `upstream` remote, which the
// hook cannot see, so it could check one repo's PR while gh merges another's (review of claude PR 41).
const isCloud = (ctx) => (ctx.env || process.env).CLAUDE_CODE_REMOTE === 'true';
const LITERAL_REPO = 'in a cloud session name the repository literally: `gh api -X PUT repos/<owner>/<repo>/pulls/<n>/merge -f merge_method=squash`';

function resolveRepo(target, cwd, env, ctx) {
  if (!/^\{(owner|repo)\}$/.test(target.owner) && !/^\{(owner|repo)\}$/.test(target.repo)) return target;
  if (isCloud(ctx)) throw new GhError(`\`{owner}/{repo}\` placeholders: ${LITERAL_REPO}`);
  const r = slugFrom(env.GH_REPO || (ctx.env || process.env).GH_REPO) || originRepo(cwd, ctx);
  if (!r) throw new GhError(`cannot resolve {owner}/{repo} from GH_REPO or the origin remote of ${cwd}`);
  return { ...target, owner: target.owner === '{owner}' ? r.owner : target.owner, repo: target.repo === '{repo}' ? r.repo : target.repo };
}

/** `gh pr merge` selector (number, URL, branch or none) -> {owner, repo, number}. */
function resolvePrMerge(pm, cwd, env, ctx) {
  const url = /github\.com\/([^/\s]+)\/([^/\s]+)\/pull\/(\d+)/.exec(pm.selector || '');
  if (url) return { owner: url[1], repo: url[2], number: Number(url[3]) };
  if (isCloud(ctx) && !(pm.repoFlag && slugFrom(pm.repoFlag) && !NON_LITERAL.test(pm.repoFlag))) throw new GhError(`\`gh pr merge\` without a literal --repo or PR URL: ${LITERAL_REPO}`);
  const r = (pm.repoFlag && slugFrom(pm.repoFlag)) || slugFrom(env.GH_REPO || (ctx.env || process.env).GH_REPO) || originRepo(cwd, ctx);
  if (!r) throw new GhError(`cannot tell which repository \`gh pr merge\` targets (no --repo, GH_REPO or origin remote in ${cwd})`);
  const num = /^#?(\d+)$/.exec(pm.selector || '');
  if (num) return { ...r, number: Number(num[1]) };
  const branch = pm.selector || currentBranch(cwd, ctx);
  if (!branch || branch === 'HEAD') throw new GhError('cannot tell which pull request `gh pr merge` targets (no number and no current branch)');
  const owner = branch.includes(':') ? '' : `${r.owner}:`;
  const prs = ghJson(ctx, `repos/${r.owner}/${r.repo}/pulls?state=open&head=${encodeURIComponent(owner + branch)}`);
  if (!Array.isArray(prs) || !prs.length) throw new GhError(`no open pull request for branch ${branch} in ${r.owner}/${r.repo}`);
  return { ...r, number: Number(prs[0].number) };
}

// Paths of the definitions repo (ericreilly999/claude) that a cloud session never merges, whatever the
// review says (owner, 2026-10-24: the weekly improvement routine merges its own PRs after an AI review,
// except changes to the gates, the autonomy and approval rules, setup and permission writing, and its
// own instructions, the reviewer and verifier that judge its PRs, and the audit scripts that measure it).
// Such a PR is merged by the owner or a local session. A prefix ending in `/` is a folder; matching
// ignores case (a Windows checkout writes `Hooks/x.js` over `hooks/x.js`).
const PROTECTED_PATHS = [
  'hooks/', '.github/', '.claude/', 'claude.md',
  'scripts/cloud-setup.sh', 'scripts/install-links.js', 'scripts/sync-project-definitions.js', 'scripts/aws-proxy-assume.js',
  'scripts/apply-rulesets.js', 'scripts/checks/', 'fleet/scripts/',
  'agents/code-reviewer.md', 'agents/verifier.md', 'skills/code-reviewer/',
  'docs/agent-conventions/autonomy-bar.md', 'docs/agent-conventions/decision-card.md', 'docs/agent-conventions/verification-checks.md',
  'docs/agent-conventions/ci-discipline.md', 'docs/agent-conventions/github-api.md', 'docs/cloud-environment.md',
  'skills/fleet/', 'skills/fleet-improve/', 'skills/fleet-cost/', 'skills/fleet-standards/', 'docs/standards/',
];
const isProtected = (f) => { const l = f.toLowerCase(); return PROTECTED_PATHS.some((p) => (p.endsWith('/') ? l.startsWith(p) : l === p)); };

/** null when FC-14 is met for the PR, else the block message. */
function checkMerge(t, ctx) {
  const pr = `${t.owner}/${t.repo}#${t.number}`;
  const base = `repos/${t.owner}/${t.repo}`;
  const comply = `To comply: dispatch the code-reviewer agent on ${pr}. It reviews the current head and posts `
    + `\`gh api ${base}/pulls/${t.number}/reviews -f event=COMMENT -F body=@review.md\` whose first line is \`${VERDICT}\`, then merges. `
    + 'A PR that changes only .project/ files may be merged by the session.';
  try {
    const p = ghJson(ctx, `${base}/pulls/${t.number}`);
    const head = p && p.head && p.head.sha;
    if (!head) throw new GhError(`${base}/pulls/${t.number} has no head.sha`);
    // A rename out of src/ into .project/ removes src/ code: both sides of a rename count.
    const rows = ghPages(ctx, `${base}/pulls/${t.number}/files`);
    const files = rows.flatMap((f) => [f.filename, f.previous_filename].filter(Boolean).map(String));
    const complete = !Number.isFinite(p.changed_files) || rows.length >= p.changed_files; // >3000 files: list truncated
    const env = ctx.env || process.env;
    if (env.CLAUDE_CODE_REMOTE === 'true' && t.repo.toLowerCase() === 'claude') { // any owner: no setting can move it
      const hit = files.filter(isProtected);
      if (hit.length || !complete || !files.length) {
        return `Protected path: ${pr} ${hit.length ? `changes ${hit.slice(0, 3).join(', ')}${hit.length > 3 ? ', ...' : ''}` : 'has a file list the hook cannot read in full'}, `
          + 'which a cloud session never merges (owner rule 2026-10-24: gates, autonomy and approval rules, setup, and the improvement routine itself). '
          + 'Leave the PR open with its review posted and name it in the report; the owner or a local session merges it.';
      }
    }
    if (files.length && complete && files.every((f) => f.startsWith('.project/'))) return null;
    // The latest verdict on the head decides: a later `Verdict: REQUEST_CHANGES` (or native
    // CHANGES_REQUESTED) on the same head overrides an earlier approval.
    const reviews = ghPages(ctx, `${base}/pulls/${t.number}/reviews`).filter((r) => !['DISMISSED', 'PENDING'].includes(r.state));
    const verdictOf = (body, state) => {
      const fl = firstLine(body);
      if (fl === VERDICT) return true;
      if (/^Verdict:/i.test(fl)) return false;
      return state === 'APPROVED' ? true : (state === 'CHANGES_REQUESTED' ? false : null);
    };
    const approving = reviews.filter((r) => verdictOf(r.body, r.state) === true);
    const events = reviews.filter((r) => r.commit_id === head)
      .map((r, k) => ({ at: Date.parse(r.submitted_at) || 0, k, ok: verdictOf(r.body, r.state) }));
    const comments = ghPages(ctx, `${base}/issues/${t.number}/comments`).filter((c) => verdictOf(c.body) !== null);
    let fresh = [];
    if (comments.length) {
      const commit = ghJson(ctx, `${base}/commits/${head}`);
      const at = Date.parse(commit && commit.commit && commit.commit.committer && commit.commit.committer.date);
      if (!Number.isFinite(at)) throw new GhError(`${base}/commits/${head} has no committer date`);
      fresh = comments.filter((c) => Date.parse(c.created_at) > at);
      events.push(...fresh.map((c, k) => ({ at: Date.parse(c.created_at), k: reviews.length + k, ok: verdictOf(c.body) })));
    }
    const decisive = events.filter((e) => e.ok !== null).sort((x, y) => (x.at - y.at) || (x.k - y.k));
    const last = decisive[decisive.length - 1];
    if (last && last.ok) return null;
    const outside = files.filter((f) => !f.startsWith('.project/'));
    const what = !files.length ? 'lists no changed files'
      : (outside.length ? `changes ${outside.length} file(s) outside .project/ (${outside.slice(0, 3).join(', ')}${outside.length > 3 ? ', ...' : ''})`
        : `lists ${rows.length} of ${p.changed_files} changed files (truncated)`);
    if (last) return `FC-14: ${pr} ${what}, and the latest verdict on head ${head.slice(0, 7)} is not \`${VERDICT}\`: fix the findings, then re-request review.\n${comply}`;
    const old = approving.find((r) => r.commit_id);
    const stale = old ? ` An approving review exists for ${String(old.commit_id).slice(0, 7)}, but the head moved since: the new commits need a review.`
      : (comments.some((c) => verdictOf(c.body)) ? ' An approving comment exists, but it predates the head commit: the new commits need a review.' : '');
    return `FC-14: ${pr} ${what} and has no review whose first line is \`${VERDICT}\` on head ${head.slice(0, 7)}.${stale}\n${comply}`;
  } catch (e) {
    // Any failure (gh missing, proxy refusal, odd JSON) blocks: the gate never fails open.
    return `FC-14: can't verify the review for ${pr}; retry. (${(e && e.message) || e})\n${comply}`;
  }
}

function checkGh(tokens, cwd, ctx0) {
  const sub = tokens[1];
  if (sub !== 'api' && sub !== 'pr') return null;
  const ctx = { ...ctx0, deadline: ctx0.deadline || Date.now() + BUDGET_MS };
  let target = null;
  try {
    if (sub === 'api') { target = parseGhApiMerge(tokens); if (target) target = resolveRepo(target, cwd, tokens.env || {}, ctx); }
    else if (sub === 'pr') { const pm = parseGhPrMerge(tokens); if (pm) target = resolvePrMerge(pm, cwd, tokens.env || {}, ctx); }
  } catch (e) {
    return `FC-14: can't verify the review for this merge; retry. (${(e && e.message) || e})\n`
      + `Name the PR explicitly (\`gh api -X PUT repos/O/R/pulls/N/merge -f merge_method=squash\`). It needs a code-reviewer review whose first line is \`${VERDICT}\` on its head, or only .project/ changes.`;
  }
  return target ? checkMerge(target, ctx) : null;
}

/** The gate-event reason code (lib/common.js GATE_REASONS) for a block message of checkGit, checkTerraform or checkGh. */
const GIT_REASONS = { reset: 'git_reset_hard', checkout: 'git_discard_all', restore: 'git_discard_all', clean: 'git_clean_force', branch: 'branch_delete_checked_out' };
function blockReason(tool, sub, msg) {
  if (tool === 'terraform') return 'terraform_prod';
  if (tool === 'gh') {
    if (msg.startsWith("FC-14: can't verify")) return 'merge_unverified';
    if (msg.startsWith('Protected path:')) return 'merge_protected_path';
    return /the latest verdict on head/.test(msg) ? 'merge_changes_requested' : 'merge_no_approve';
  }
  if (sub === 'push') {
    if (msg.startsWith('Tag pushes')) return 'tag_push_unapproved';
    if (msg.startsWith('Run `git push` in its own')) return 'push_chained';
    return msg.startsWith('Direct pushes') ? 'push_main' : 'force_push_protected';
  }
  return GIT_REASONS[sub] || null;
}

/** First block message for `cmd`, checking shell-wrapper (`bash -c`, `eval`, `iex`) and substitution text too. */
function scan(cmd, cwd0, ps, ctx, depth) {
  if (depth > 4) return null;
  let cwd = cwd0;
  const segs = segments(cmd, { ps });
  for (const raw of segs) {
    const t = stripPrefix(raw);
    if (!t.length) continue;
    const b = baseName(t[0]);
    if (b === 'cd' || b === 'pushd' || b === 'set-location') { if (t[1]) cwd = shellPath(cwd, t[1]); continue; }
    let msg = null; let tool = null; let sub = null;
    if (b === 'git') { const g = parseGit(t, cwd); tool = 'git'; sub = g.sub; msg = checkGit(g, ctx); }
    else if (b === 'terraform' || b === 'tofu') { tool = 'terraform'; msg = checkTerraform(t, cwd); }
    else if (b === 'gh') { tool = 'gh'; msg = checkGh(t, cwd, ctx); }
    else { const inner = innerCommand(b, t); if (inner) { const r = scan(inner.cmd, cwd, inner.ps, ctx, depth + 1); if (r) return r; } }
    if (msg) {
      let reason = null;
      try { reason = blockReason(tool, sub, msg); } catch { /* the reason code is telemetry; the block stands */ }
      return { block: `Blocked: ${t.join(' ').slice(0, 120)}\n${msg}`, ...(reason ? { gate: { reason } } : {}) };
    }
  }
  for (const sub of segs.subs) { const r = scan(sub, cwd, ps, ctx, depth + 1); if (r) return r; }
  return null;
}

// An MCP merge tool (`mcp__github__merge_pull_request`, or the same tool on another GitHub server) merges
// without a command the FC-14 gate can read, so it is blocked outright: the one merge path is the
// `gh api ... /merge` command, which the gate above checks (standard CLOUD-04, owner rulings 2026-10-24).
const MCP_MERGE = /^mcp__.+__merge_pull_request$/;

function checkMcpMerge(payload) {
  const i = payload.tool_input || {};
  const lit = (v, d) => (v != null && /^[A-Za-z0-9_.-]+$/.test(String(v)) ? String(v) : d);
  const owner = lit(i.owner, '<owner>'); const repo = lit(i.repo, '<repo>');
  const n = lit(i.pullNumber ?? i.pull_number ?? i.number, '<n>');
  return {
    block: `Blocked: ${payload.tool_name}\nFC-14: merge with \`gh api -X PUT repos/${owner}/${repo}/pulls/${n}/merge -f merge_method=squash\` instead. `
      + 'The merge gate checks that command for a `Verdict: APPROVE` review on the head commit; an MCP merge tool skips that check, so it is never used (standard CLOUD-04). '
      + `Post the review first (\`gh api repos/${owner}/${repo}/pulls/${n}/reviews -f event=COMMENT -F body=@review.md\`, first line \`${VERDICT}\`), then run the merge in a separate Bash call.`,
    gate: { reason: 'merge_mcp' },
  };
}

// An MCP file write (`mcp__github__push_files`, `create_or_update_file(s)`, `delete_file`, or the same tool on another
// GitHub server) to the default branch commits to main with no PR, so neither review nor FC-14 sees it.
const MCP_FILE_WRITE = /^mcp__.+__(push_files|create_or_update_files?|delete_file)$/;
const DEFAULT_LOOKUP_MS = 5000;

/** The repo's default branch through `gh api` REST, or null when the lookup fails (the hook does not block on its own error). */
function defaultBranch(owner, repo, ctx) {
  try {
    const out = ctx.gh ? ctx.gh(['api', `repos/${owner}/${repo}`]) : runGh(['api', `repos/${owner}/${repo}`], ctx.env || process.env, DEFAULT_LOOKUP_MS);
    const b = JSON.parse(out).default_branch;
    return typeof b === 'string' && b ? b : null;
  } catch { return null; }
}

function checkMcpFileWrite(payload, ctx) {
  const i = payload.tool_input || {};
  const branch = String(i.branch == null ? '' : i.branch).trim().replace(/^refs\/heads\//, '');
  const lit = (v) => v != null && /^[A-Za-z0-9_.-]+$/.test(String(v));
  let hit = !branch || PROTECTED.includes(branch); // no branch: GitHub writes to the default branch
  if (!hit && lit(i.owner) && lit(i.repo)) hit = defaultBranch(String(i.owner), String(i.repo), ctx) === branch;
  if (!hit) return null;
  const slug = lit(i.owner) && lit(i.repo) ? `${i.owner}/${i.repo}` : 'the repository';
  return {
    block: `Blocked: ${payload.tool_name} to ${slug} ${branch || '(default branch)'}\n`
      + `Direct writes to the default branch skip review and the FC-14 merge gate. ${PR_FLOW}`,
    gate: { reason: 'push_main' },
  };
}

function decide(payload, ctx = {}) {
  if (MCP_MERGE.test(String(payload.tool_name || ''))) return checkMcpMerge(payload);
  if (MCP_FILE_WRITE.test(String(payload.tool_name || ''))) return checkMcpFileWrite(payload, ctx);
  if (!['Bash', 'PowerShell'].includes(payload.tool_name)) return null;
  const cmd = (payload.tool_input || {}).command;
  if (!cmd || !/\b(git|terraform|tofu|gh)\b/.test(cmd)) return null;
  const ps = payload.tool_name === 'PowerShell'; const cwd = shellPath(null, payload.cwd || process.cwd());
  const chained = checkPushChain(cmd, cwd, ps, ctx);
  if (chained && chained.block) return chained;
  return scan(cmd, cwd, ps, { ...ctx, fleetChain: !!(chained && chained.fleetChain), pushBudget: { until: Date.now() + PUSH_BUDGET_MS } }, 0);
}

module.exports = { decide, blockReason, segments, shellPath, checkGit, checkTerraform, parseGit, parseGhApiMerge, parseGhPrMerge, checkMerge, firstLine, VERDICT };
if (require.main === module) C.runHook(decide, 'git-guard');
