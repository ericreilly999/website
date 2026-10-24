#!/usr/bin/env node
/**
 * AWS CLI credential_process for cloud sessions: assume a role with an UNSIGNED sts:AssumeRole
 * request, which the claude.ai agent proxy signs with the fleet-cloud-agent key (an AWS SigV4
 * network secret on the STS hosts). Only the one-hour role credentials enter the VM.
 *
 *   ~/.aws/config:  credential_process = node /path/aws-proxy-assume.js <role-arn> [session-name]
 *
 * Prints the credential_process JSON (Version 1) on stdout; errors go to stderr with exit 1.
 * Written into ~/.aws/config by cloud-setup.sh from fleet-state/cloud-aws-profiles.json (project mode:
 * the project's vendored .claude/aws-profiles.json).
 */
'use strict';
const cp = require('node:child_process');

const [roleArn, sessionName = 'fleet-cloud'] = process.argv.slice(2);
if (!roleArn || !/^arn:aws:iam::\d{12}:role\/.+/.test(roleArn)) {
  console.error('usage: aws-proxy-assume.js <role-arn> [session-name]');
  process.exit(1);
}
// No ambient credentials or profile: the request must leave unsigned for the proxy to sign, and a
// profile pointing back at this credential_process would recurse.
const env = Object.assign({}, process.env);
for (const k of ['AWS_PROFILE', 'AWS_DEFAULT_PROFILE', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN']) delete env[k];

let out;
try {
  out = cp.execFileSync('aws', ['sts', 'assume-role', '--role-arn', roleArn, '--role-session-name', sessionName,
    '--duration-seconds', '3600', '--no-sign-request', '--region', 'us-east-1', '--output', 'json'],
  { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000 });
} catch (e) {
  console.error(`assume-role ${roleArn} failed: ${String(e.stderr || e.message).trim().split('\n').pop()}`);
  console.error('If the error is about a missing signature or credentials, the fleet-cloud-agent network secret is absent or not attached to sts hosts.');
  process.exit(1);
}
const c = JSON.parse(out).Credentials;
process.stdout.write(JSON.stringify({ Version: 1, AccessKeyId: c.AccessKeyId, SecretAccessKey: c.SecretAccessKey, SessionToken: c.SessionToken, Expiration: c.Expiration }));
