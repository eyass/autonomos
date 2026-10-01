# Any tool for a playbook step, and data warehouses for lookups

Date: 2026-10-01. Agreed in chat: if a company's customers live in BigQuery, a playbook should not require a CRM.

## Any connected tool (revised)

The kind of system a step names is a recommendation, not a requirement. Each slot lists:
- **Recommended:** connected tools of that kind (the default);
- **Data warehouse:** connected warehouses, on read-only slots, with a dataset to pick;
- **Your other tools:** every other connected tool.

It also offers "Connect a different tool", which opens the full directory and returns to the slot it was connected for (`?for=<capability>`).

AI picks actions from whichever tool is chosen. Starting fails with "has no action to …" when the tool has none for a step. Warehouses are never offered as general tools: they only read, through the guarded query.

## Warehouse rule

A data warehouse can stand in for any system a playbook only **reads** from: every step of that capability has `access: "read"`. Where a capability has a write step (update a deal), only a real tool of that kind fits, and the page says why. Today 10 of the 14 published playbooks that use a CRM qualify.

## Scope

The person picks a **dataset** (agreed option). The agent may query any table in it, joins included, and nothing else.

## Pieces

1. **Capability** `warehouse` ("Data warehouse", BigQuery). Stand-ins come from `WAREHOUSE_QUERY_TOOLS` (integrations with a guarded query tool).
2. **Tool** `warehouse.query` (built-in, read): input `{ project_id, dataset, sql, location? }`. Runs Composio `GOOGLEBIGQUERY_QUERY`.
3. **Guard** `checkWarehouseSql(sql, scope)` in `packages/integrations/src/warehouse.ts`, used twice (policy and executor):
   - one statement, starting `SELECT` or `WITH`; no comments; at most 5,000 characters;
   - no DML, DDL, scripting or federated access (`INSERT`, `UPDATE`, `DELETE`, `MERGE`, `CREATE`, `DROP`, `ALTER`, `TRUNCATE`, `GRANT`, `REVOKE`, `CALL`, `EXECUTE`, `EXPORT`, `LOAD`, `DECLARE`, `SET`, `BEGIN`, `COMMIT`, `ROLLBACK`, `EXTERNAL_QUERY`);
   - every table after `FROM` / `JOIN` (and comma joins) is a CTE, `UNNEST(...)`, a subquery, or `dataset.table` / `project.dataset.table` inside the allowed dataset;
   - the statement runs wrapped as `SELECT * FROM (<sql>) LIMIT 50`.
4. **Policy**: `PolicyConfig.dataScopes` (`{ tool, project, dataset, location? }[]`, jsonb, no migration). `evaluatePolicy` denies `warehouse.query` without a scope, outside it, or failing the guard, at every level.
5. **Setup**: a read-only slot lists connected warehouses after the matching tools ("BigQuery · data warehouse"); choosing one asks for the dataset (from the connection inventory). `startFromPlaybook` takes `scopes`, assigns `warehouse.query` to those steps directly, and stores the scope and the dataset's tables on the opportunity (`playbook_bindings.dataScope`).
6. **Build**: `playbookAgentConfig` adds the scope to the policy and the dataset's tables and columns to `instructions.context`.
7. **Feedback** after connecting (`?connected=`): which step the system now covers, that a warehouse needs a dataset, or that it does not fit this playbook.

## Not now

Writes to a warehouse, warehouses other than BigQuery, scopes in the agent editor UI (the scope is kept when an agent is edited).

## Tests

Guard unit tests (allowed, forbidden statements, out-of-scope tables, CTEs, comments, multiple statements, wrapping); policy tests for deny/allow; slot logic for read-only versus write capabilities.
