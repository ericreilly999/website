#!/usr/bin/env node
'use strict';
/**
 * Helper for iam-simulate.sh (kept in Node so the shell script needs no jq).
 *
 *   node lib/iam.js plan --project <dir> --env <env> [--config f] [--profile p] --work <dir>
 *       Writes <work>/<n>.input.json (simulate-principal-policy --cli-input-json) per role and prints
 *       "<n>\t<arn>\t<inputfile>" lines; the first line is "profile\t<profile>".
 *   node lib/iam.js evaluate --work <dir> --env <env> [--out dir]
 *       Reads <work>/<n>.out.json / <n>.err and prints the check result JSON; exits 0/1/3.
 */
const fs = require('node:fs');
const path = require('node:path');
const { EXIT, CheckError, loadChecksConfig, finish } = require('./common');

const CHECK = 'iam-simulate';

/** Normalise the "iam" config into [{arn, actions, resources, context}] for one env. */
function planRoles(iam, env) {
  const accounts = iam.accounts || {};
  const fill = (s) => String(s).replaceAll('{env}', env).replaceAll('{account}', accounts[env] || '{account}');
  let roles = iam.roles || [];
  if (!Array.isArray(roles)) {
    // Map form: {"<arn>": ["action", ...]} or {"<arn>": {actions, resources, env}}
    roles = Object.entries(roles).map(([arn, v]) => (Array.isArray(v) ? { arn, actions: v } : { arn, ...v }));
  }
  const out = [];
  for (const r of roles) {
    const envs = r.env == null ? null : [].concat(r.env);
    if (envs && !envs.includes(env)) continue;
    if (!r.arn || !Array.isArray(r.actions) || !r.actions.length) throw new CheckError(`iam role entry needs "arn" and a non-empty "actions" list: ${JSON.stringify(r)}`, EXIT.USAGE);
    const arn = fill(r.arn);
    if (arn.includes('{account}')) throw new CheckError(`role ${r.arn} uses {account} but iam.accounts.${env} is not set`, EXIT.USAGE);
    out.push({
      arn,
      actions: r.actions.map(fill),
      resources: (r.resources || []).map(fill),
      context: r.context || [],
    });
  }
  return out;
}

function cliInput(role) {
  const input = { PolicySourceArn: role.arn, ActionNames: role.actions };
  if (role.resources.length) input.ResourceArns = role.resources;
  if (role.context.length) input.ContextEntries = role.context;
  return input;
}

/** Turn per-role simulate output into denies. `outputs`: [{arn, json?, error?}] */
function evaluate(outputs) {
  const denies = [];
  const errors = [];
  let notRun = null;
  let checked = 0;
  for (const o of outputs) {
    if (o.error != null) {
      if (/AccessDenied|not authorized to perform: iam:SimulatePrincipalPolicy/i.test(o.error)) {
        notRun = `caller may not call iam:SimulatePrincipalPolicy: ${o.error.trim().slice(0, 300)}`;
      } else errors.push({ arn: o.arn, error: o.error.trim().slice(0, 500) });
      continue;
    }
    for (const r of (o.json && o.json.EvaluationResults) || []) {
      checked++;
      if (r.EvalDecision !== 'allowed') {
        denies.push({
          arn: o.arn,
          action: r.EvalActionName,
          resource: r.EvalResourceName,
          decision: r.EvalDecision,
          missingContext: r.MissingContextValues && r.MissingContextValues.length ? r.MissingContextValues : undefined,
        });
      }
    }
  }
  if (notRun && !checked) return { exitCode: EXIT.NOT_RUN, summary: notRun, denies, errors, checked };
  const bad = denies.length + errors.length;
  return {
    exitCode: bad ? EXIT.FAIL : EXIT.PASS,
    summary: bad
      ? `${denies.length} denied action/resource pair(s), ${errors.length} role error(s) (e.g. role missing)`
      : `all ${checked} action/resource pair(s) allowed across ${outputs.length} role(s)`,
    denies,
    errors,
    checked,
  };
}

function args(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) { out[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true; }
  }
  return out;
}

function main() {
  const [mode, ...rest] = process.argv.slice(2);
  const a = args(rest);
  try {
    if (mode === 'plan') {
      const { config } = loadChecksConfig(a.project || '.', a.config);
      const iam = config.iam;
      if (!iam) throw new CheckError('no "iam" section in .project/checks.json', EXIT.USAGE);
      const roles = planRoles(iam, a.env);
      if (!roles.length) throw new CheckError(`no iam roles configured for env "${a.env}"`, EXIT.USAGE);
      const profile = a.profile || (iam.profiles || {})[a.env] || '';
      fs.mkdirSync(a.work, { recursive: true });
      const lines = [`profile\t${profile}`];
      roles.forEach((r, i) => {
        const file = path.join(a.work, `${i}.input.json`).replace(/\\/g, '/');
        fs.writeFileSync(file, JSON.stringify(cliInput(r), null, 2));
        fs.writeFileSync(path.join(a.work, `${i}.arn`), r.arn);
        lines.push(`${i}\t${r.arn}\t${file}`);
      });
      process.stdout.write(lines.join('\n') + '\n');
      return;
    }
    if (mode === 'evaluate') {
      const files = fs.readdirSync(a.work).filter((f) => /^\d+\.arn$/.test(f)).sort((x, y) => parseInt(x, 10) - parseInt(y, 10));
      const outputs = files.map((f) => {
        const n = parseInt(f, 10);
        const arn = fs.readFileSync(path.join(a.work, f), 'utf8');
        const outFile = path.join(a.work, `${n}.out.json`);
        const errFile = path.join(a.work, `${n}.err`);
        const code = fs.existsSync(path.join(a.work, `${n}.code`)) ? fs.readFileSync(path.join(a.work, `${n}.code`), 'utf8').trim() : '0';
        if (code !== '0') return { arn, error: fs.existsSync(errFile) ? fs.readFileSync(errFile, 'utf8') : `aws exit ${code}` };
        try { return { arn, json: JSON.parse(fs.readFileSync(outFile, 'utf8')) }; } catch (e) { return { arn, error: `unparseable aws output: ${e.message}` }; }
      });
      const result = evaluate(outputs);
      finish({ check: CHECK, env: a.env, profile: a.profile || null, roles: outputs.length, ...result }, { out: a.out === true ? undefined : a.out });
      return;
    }
    throw new CheckError(`unknown mode "${mode}" (plan|evaluate)`, EXIT.USAGE);
  } catch (e) {
    const exitCode = e instanceof CheckError ? e.exitCode : EXIT.NOT_RUN;
    if (mode === 'plan') { process.stderr.write(`${e.message}\n`); process.exit(exitCode); }
    finish({ check: CHECK, exitCode, summary: e.message });
  }
}

if (require.main === module) main();

module.exports = { planRoles, cliInput, evaluate };
