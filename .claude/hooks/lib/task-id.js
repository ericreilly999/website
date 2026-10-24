'use strict';
// Task ids shared by the dispatch gate (hooks/agent-dispatch-gate.js, tag parsing in common.js) and
// the ledger validator (fleet/scripts/audit-rollup.js), so a line that satisfies the TDD gate also
// validates. Vendored with the hooks by scripts/sync-project-definitions.js.

const T_ID = 'T-\\d+[a-z]?';
const B_ID = 'B-\\d+[a-z]?';

const T_ID_RE = new RegExp(`^${T_ID}$`);
const B_ID_RE = new RegExp(`^${B_ID}$`);
/** Any ledger/dispatch task: a T-id, a B-id, ritual or adhoc. */
const TASK_ID_RE = new RegExp(`^(?:${T_ID}|${B_ID}|ritual|adhoc)$`);
/** The same alternatives, unanchored, for embedding in a larger pattern (the dispatch tag). */
const TASK_ID_SRC = `${T_ID}|${B_ID}|ritual|adhoc`;

module.exports = { T_ID_RE, B_ID_RE, TASK_ID_RE, TASK_ID_SRC };
