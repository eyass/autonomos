// Read-only SQL against a company's data warehouse, inside one dataset it chose.
//
// An agent may use a warehouse instead of a CRM (or another system) for steps that only look
// things up. The query it writes is checked here twice: by the policy engine before the call,
// and by the executor before it reaches the warehouse. A query passes only if it is a single
// SELECT, touches no table outside the allowed dataset, and returns at most WAREHOUSE_ROW_LIMIT
// rows. This is a conservative check, not a full SQL parser: anything it cannot read as safe is
// refused, and the reason says what to change.

export const WAREHOUSE_ROW_LIMIT = 50;
const MAX_LENGTH = 5000;

// The integrations whose guarded query tool exists; a warehouse can stand in only through one.
export const WAREHOUSE_QUERY_TOOLS: Record<string, string> = { googlebigquery: "warehouse.query" };

export type WarehouseScope = { project: string; dataset: string; location?: string };
export type WarehouseCheck = { ok: true; sql: string } | { ok: false; reason: string };

// Statements and functions that change data, run scripts or reach outside the warehouse.
const FORBIDDEN = [
  "INSERT",
  "UPDATE",
  "DELETE",
  "MERGE",
  "CREATE",
  "DROP",
  "ALTER",
  "TRUNCATE",
  "GRANT",
  "REVOKE",
  "CALL",
  "EXECUTE",
  "EXPORT",
  "LOAD",
  "DECLARE",
  "SET",
  "BEGIN",
  "COMMIT",
  "ROLLBACK",
  "EXTERNAL_QUERY",
];

// The query with string literals blanked out (quotes kept), so keywords and names inside
// strings are ignored. Backticked names are kept, or also blanked with `blankNames`.
// Returns null when the query contains a comment.
function mask(sql: string, blankNames: boolean): string | null {
  let out = "";
  let quote: string | null = null;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i]!;
    if (quote) {
      if (c === "\\" && quote !== "`") {
        out += "  ";
        i++;
        continue;
      }
      if (c === quote) {
        quote = null;
        out += c;
      } else out += quote === "`" && !blankNames ? c : " ";
      continue;
    }
    if (c === "'" || c === '"' || c === "`") {
      quote = c;
      out += c;
      continue;
    }
    if ((c === "-" && sql[i + 1] === "-") || (c === "/" && sql[i + 1] === "*") || c === "#") return null;
    out += c;
  }
  return out;
}

export function checkWarehouseSql(input: string, scope: WarehouseScope): WarehouseCheck {
  const sql = input.trim().replace(/;\s*$/, "");
  if (!sql) return { ok: false, reason: "The query is empty." };
  if (sql.length > MAX_LENGTH) return { ok: false, reason: `The query is too long (at most ${MAX_LENGTH} characters).` };
  const names = mask(sql, false);
  const words = mask(sql, true);
  if (names === null || words === null) return { ok: false, reason: "Remove the comments from the query." };
  if (words.includes(";")) return { ok: false, reason: "Send one statement at a time." };
  if (!/^\s*(SELECT|WITH)\b/i.test(words)) return { ok: false, reason: "Only SELECT queries can run here." };
  const forbidden = FORBIDDEN.find((w) => new RegExp(`\\b${w}\\b`, "i").test(words));
  if (forbidden) return { ok: false, reason: `${forbidden} is not allowed; only SELECT queries can run here.` };

  const ctes = new Set([...words.matchAll(/(?:\bWITH\s+(?:RECURSIVE\s+)?|,\s*)([A-Za-z_]\w*)\s+AS\s*\(/gi)].map((m) => m[1]!.toLowerCase()));
  for (const ref of tableRefs(names)) {
    const problem = outsideScope(ref, scope, ctes);
    if (problem) return { ok: false, reason: problem };
  }
  return { ok: true, sql: `SELECT * FROM (${sql}) LIMIT ${WAREHOUSE_ROW_LIMIT}` };
}

// Every table named after FROM or JOIN, and after commas in a comma join. Subqueries and
// UNNEST(...) are not tables. FROM inside EXTRACT(part FROM value) is not a table either.
function tableRefs(sql: string): string[] {
  const refs: string[] = [];
  const keyword = /\b(FROM|JOIN)\s+/gi;
  for (let m = keyword.exec(sql); m; m = keyword.exec(sql)) {
    if (m[1]!.toUpperCase() === "FROM" && /\bEXTRACT\s*\(\s*\w+\s*$/i.test(sql.slice(0, m.index))) continue;
    let i = m.index + m[0].length;
    for (;;) {
      while (/\s/.test(sql[i] ?? "")) i++;
      if (sql[i] === "(" || /^UNNEST\s*\(/i.test(sql.slice(i))) break;
      const ref = /^(`[^`]+`|[\w-]+)(\.(`[^`]+`|[\w-]+))*/.exec(sql.slice(i));
      if (!ref) break;
      refs.push(ref[0]);
      i += ref[0].length;
      // An alias, then a comma means another table in a comma join.
      const alias = /^\s+(?:AS\s+)?(?!(?:WHERE|JOIN|LEFT|RIGHT|INNER|FULL|CROSS|ON|USING|GROUP|ORDER|LIMIT|HAVING|WINDOW|QUALIFY|UNION|EXCEPT|INTERSECT)\b)[A-Za-z_]\w*/i.exec(sql.slice(i));
      if (alias) i += alias[0].length;
      while (/\s/.test(sql[i] ?? "")) i++;
      if (sql[i] !== ",") break;
      i++;
    }
  }
  return refs;
}

function outsideScope(ref: string, scope: WarehouseScope, ctes: Set<string>): string | null {
  const parts = ref.replace(/`/g, "").split(".").filter(Boolean);
  const name = parts.join(".");
  const where = `the ${scope.dataset} dataset`;
  if (parts.length === 1) return ctes.has(parts[0]!.toLowerCase()) ? null : `Name the dataset with the table: ${scope.dataset}.${parts[0]}.`;
  const schemaAt = parts.findIndex((p) => p.toUpperCase() === "INFORMATION_SCHEMA");
  const path = schemaAt >= 0 ? parts.slice(0, schemaAt) : parts.slice(0, -1);
  const [project, dataset] = path.length === 2 ? path : path.length === 1 ? [scope.project, path[0]] : [null, null];
  if (project !== scope.project || dataset !== scope.dataset || (schemaAt < 0 && parts.length > 3)) return `${name} is outside ${where}; only its tables can be queried.`;
  return null;
}
