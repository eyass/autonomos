import { OG_IMAGES } from "@/components/marketing/config";
import type { Metadata } from "next";
import { PageIntro, Prose, RetentionList, SECURITY_EMAIL, SubprocessorTable } from "@/components/marketing/site";

const description = "How AutonomOS isolates tenants, constrains agents, records every action and handles your data.";

export const metadata: Metadata = {
  title: "Security",
  description,
  alternates: { canonical: "/security" },
  openGraph: { title: "Security · AutonomOS", description, url: "/security", type: "article", images: OG_IMAGES },
};

const FLOW = [
  { from: "Your browser", to: "the AutonomOS app", note: "Encrypted with HTTPS" },
  { from: "The app", to: "your workspace database", note: "Stored in the region your workspace was set up in, EU or US" },
  { from: "The app", to: "the agent runner", note: "Runs keep going through restarts and can wait for approvals" },
  { from: "The app and agent runner", to: "the AI model", note: "Only the text needed for the task" },
  { from: "The agent runner", to: "your live systems", note: "Only for systems connected to a live account, through a secure connection partner" },
];

// Controls in place today, mapped to the SOC 2 Trust Services Criteria. No certification is claimed.
const SOC2 = [
  {
    criterion: "Security",
    controls: "Row level security on every tenant table, role checks on every change, an explicit tool allowlist per agent and a policy engine evaluated in code before every write.",
  },
  { criterion: "Availability", controls: "Agent runs survive restarts and resume where they stopped; an emergency stop pauses every agent at once." },
  { criterion: "Processing integrity", controls: "Idempotency keys on every write, simulated writes in every test run and versioned agent configurations that cannot be changed once written." },
  {
    criterion: "Confidentiality",
    controls: "Data stays in the workspace region, sign-in tokens stay with the connection partner, secrets are server-only and models receive only the text a task needs.",
  },
  { criterion: "Privacy", controls: "Documented retention periods, a published subprocessor list and an append-only audit log of every action." },
];

export default function SecurityPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      <PageIntro eyebrow="Security" title="Security at AutonomOS">
        Agents that take real actions need hard boundaries. This page describes how the product is built today, including what it does not do yet.
      </PageIntro>

      <Prose>
        <h2 id="data-flow">Data flow</h2>
        <ol className="!list-none !pl-0">
          {FLOW.map((f, i) => (
            <li key={i} className="rounded-md border border-border bg-card px-4 py-3">
              <div className="font-medium">
                {f.from} <span className="text-muted-foreground">to</span> {f.to}
              </div>
              <div className="text-sm text-muted-foreground">{f.note}</div>
            </li>
          ))}
        </ol>
        <ul>
          <li>Your data is stored in the region your workspace was set up in, the EU or the US.</li>
          <li>Agent runs keep going through restarts and wait for approvals without anything left open.</li>
          <li>AI models receive only the text needed for the task at hand.</li>
          <li>Sign-in tokens for live systems are held by our connection partner; AutonomOS stores only the connected account id.</li>
          <li>Webhook signing secrets are server-only: signed-in users and the public API cannot read them, and admins can rotate them at any time.</li>
        </ul>

        <h2 id="isolation">Tenant isolation</h2>
        <ul>
          <li>
            Every tenant table carries an <code>organization_id</code> and is protected by Postgres row level security, so a user can only read rows of workspaces they belong to.
          </li>
          <li>
            Runtime tables (runs, actions, approvals, interventions and activity) are read-only for users. They are written by server code after membership and role checks, so an approval cannot be
            resolved from the browser.
          </li>
        </ul>

        <h2 id="sandbox">Sandbox and production</h2>
        <ul>
          <li>Every integration can run on sandbox data held in AutonomOS: realistic customers, payments and refund history.</li>
          <li>Test runs simulate every write. No write reaches a connected system during a test.</li>
          <li>Production runs act on live accounts only when an integration is connected to a live account. Otherwise they act on the sandbox.</li>
        </ul>

        <h2 id="controls">Agent controls</h2>
        <ul>
          <li>
            <strong>Explicit tool allowlist.</strong> Each agent can call only the tools listed in its configuration.
          </li>
          <li>
            <strong>Deterministic policy engine.</strong> Policies are evaluated in code before every write. The model cannot talk its way past them.
          </li>
          <li>
            <strong>Approvals.</strong> Actions that need a person wait for one. Financial and other high-risk actions need approval by default.
          </li>
          <li>
            <strong>Money thresholds and hard limits.</strong> Amounts above a threshold require approval; hard limits deny an action even after approval.
          </li>
          <li>
            <strong>Emergency stop.</strong> An admin can pause every agent at once. The pause is checked before every external write.
          </li>
          <li>
            <strong>Idempotency keys.</strong> Each write carries a key, so a retried step cannot issue the same refund twice.
          </li>
          <li>
            <strong>Untrusted content is fenced.</strong> Tickets, emails and tool output are passed to the model as marked data, separate from the agent&apos;s instructions.
          </li>
        </ul>

        <h2 id="audit">Audit</h2>
        <ul>
          <li>The audit log is append-only. A database trigger rejects any update or delete.</li>
          <li>Agent configurations are versioned. A version cannot be changed once written; a change creates a new version, so every run points to the exact configuration it used.</li>
        </ul>

        <h2 id="retention">Retention</h2>
        <RetentionList />

        <h2 id="subprocessors">Subprocessors</h2>
        <SubprocessorTable />

        <h2 id="compliance">Compliance and SOC 2</h2>
        <p>
          AutonomOS controls are designed against the AICPA SOC 2 Trust Services Criteria. An independent SOC 2 Type II audit is planned. When the report is issued, its scope and audit period will be
          listed here and the report shared with customers under NDA.
        </p>
        <div className="not-prose my-4 overflow-hidden rounded-lg border border-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/60 text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Criterion</th>
                <th className="px-4 py-2 font-medium">How AutonomOS meets it</th>
              </tr>
            </thead>
            <tbody>
              {SOC2.map((c) => (
                <tr key={c.criterion} className="border-t border-border align-top">
                  <td className="px-4 py-3 font-medium whitespace-nowrap">{c.criterion}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.controls}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          For a security review, questionnaires or the data processing agreement, email <a href={`mailto:${SECURITY_EMAIL}`}>{SECURITY_EMAIL}</a>.
        </p>

        <h2 id="disclosure">Responsible disclosure</h2>
        <p>
          If you believe you have found a vulnerability, email <a href={`mailto:${SECURITY_EMAIL}`}>{SECURITY_EMAIL}</a>. Please give us reasonable time to fix it before disclosing it publicly. We
          will acknowledge your report and keep you informed.
        </p>
      </Prose>
    </div>
  );
}
