import { describe, expect, it } from "vitest";
import { checkWarehouseSql, WAREHOUSE_ROW_LIMIT } from "../src/warehouse";

const scope = { project: "pmg-prod", dataset: "crm" };
const ok = (sql: string) => {
  const r = checkWarehouseSql(sql, scope);
  if (!r.ok) throw new Error(`expected allowed: ${r.reason}`);
  return r.sql;
};
const reason = (sql: string) => {
  const r = checkWarehouseSql(sql, scope);
  if (r.ok) throw new Error(`expected denied: ${sql}`);
  return r.reason;
};

describe("checkWarehouseSql", () => {
  it("allows a lookup in the dataset and caps the rows", () => {
    const sql = ok("SELECT email, plan FROM crm.customers WHERE email = 'a@b.com'");
    expect(sql).toBe(`SELECT * FROM (SELECT email, plan FROM crm.customers WHERE email = 'a@b.com') LIMIT ${WAREHOUSE_ROW_LIMIT}`);
  });

  it("allows fully qualified and backticked names, joins, CTEs and UNNEST", () => {
    ok("SELECT * FROM `pmg-prod.crm.customers` c JOIN pmg-prod.crm.orders o ON o.customer_id = c.id");
    ok("WITH recent AS (SELECT * FROM crm.orders WHERE created_at > '2026-01-01') SELECT c.id FROM crm.customers c LEFT JOIN recent r ON r.customer_id = c.id");
    ok("SELECT c.id, tag FROM crm.customers c, UNNEST(c.tags) AS tag");
    ok("SELECT * FROM (SELECT id FROM crm.customers) sub");
    ok("select id from crm.customers;");
  });

  it("allows the dataset's own INFORMATION_SCHEMA", () => {
    ok("SELECT table_name, column_name FROM crm.INFORMATION_SCHEMA.COLUMNS");
  });

  it("ignores keywords and names inside string literals", () => {
    ok("SELECT id FROM crm.customers WHERE note = 'please delete from other.table'");
  });

  it("denies anything that is not a single SELECT", () => {
    expect(reason("DELETE FROM crm.customers WHERE id = 1")).toMatch(/SELECT/);
    expect(reason("UPDATE crm.customers SET plan = 'x'")).toMatch(/SELECT/);
    expect(reason("SELECT 1; DROP TABLE crm.customers")).toMatch(/one statement/);
    expect(reason("WITH x AS (SELECT 1) INSERT INTO crm.customers SELECT * FROM x")).toMatch(/INSERT/);
    expect(reason("SELECT * FROM EXTERNAL_QUERY('conn', 'select 1')")).toMatch(/EXTERNAL_QUERY/);
  });

  it("denies comments, which could hide a second statement", () => {
    expect(reason("SELECT id FROM crm.customers -- ; DROP TABLE x")).toMatch(/comments/);
    expect(reason("SELECT /* x */ id FROM crm.customers")).toMatch(/comments/);
  });

  it("denies tables outside the dataset or without one", () => {
    expect(reason("SELECT * FROM finance.payments")).toMatch(/finance\.payments/);
    expect(reason("SELECT * FROM other-project.crm.customers")).toMatch(/other-project/);
    expect(reason("SELECT * FROM crm.customers c JOIN hr.salaries s ON s.id = c.id")).toMatch(/hr\.salaries/);
    expect(reason("SELECT * FROM customers")).toMatch(/dataset/);
    expect(reason("SELECT * FROM crm.customers, finance.payments")).toMatch(/finance\.payments/);
    expect(reason("SELECT * FROM `region-eu`.INFORMATION_SCHEMA.TABLES")).toMatch(/region-eu/);
  });

  it("reads FROM inside EXTRACT as part of an expression, not a table", () => {
    ok("SELECT EXTRACT(YEAR FROM created_at) AS year, COUNT(*) FROM crm.customers GROUP BY year");
  });

  it("checks tables inside subqueries too", () => {
    expect(reason("SELECT * FROM crm.customers WHERE id IN (SELECT customer_id FROM finance.invoices)")).toMatch(/finance\.invoices/);
  });

  it("denies empty and very long queries", () => {
    expect(reason("   ")).toMatch(/empty/);
    expect(reason(`SELECT ${"a, ".repeat(3000)}b FROM crm.customers`)).toMatch(/long/);
  });
});
