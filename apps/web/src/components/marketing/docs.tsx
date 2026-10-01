import Link from "next/link";
import type * as React from "react";

export type DocPage = { slug: string; href: string; title: string; description: string; body: () => React.ReactNode };

// The public documentation. `DOCS_ROUTES` is the list the app can link to (for example a Help link to /docs).
export const DOCS: DocPage[] = [
  {
    slug: "",
    href: "/docs",
    title: "Getting started",
    description: "The loop from company setup to your first agent running under approvals.",
    body: GettingStarted,
  },
  {
    slug: "autonomy-levels",
    href: "/docs/autonomy-levels",
    title: "Agent modes",
    description: "Manual, Draft, Approve and Auto: what each means and when to move an agent up.",
    body: AutonomyLevels,
  },
  {
    slug: "approvals",
    href: "/docs/approvals",
    title: "Approvals and the Inbox",
    description: "How approvals, money thresholds and hard limits work, and where they wait.",
    body: Approvals,
  },
  {
    slug: "integrations",
    href: "/docs/integrations",
    title: "Integrations and sandbox data",
    description: "Connect systems in sandbox mode or to live accounts.",
    body: Integrations,
  },
  {
    slug: "running-agents",
    href: "/docs/running-agents",
    title: "Running agents",
    description: "Test runs, production runs and what an administrator needs to set up.",
    body: RunningAgents,
  },
  {
    slug: "api",
    href: "/docs/api",
    title: "API",
    description: "Authenticate with an API key and call AutonomOS from other systems.",
    body: Api,
  },
  {
    slug: "faq",
    href: "/docs/faq",
    title: "FAQ",
    description: "Common questions about AutonomOS.",
    body: Faq,
  },
];

export const DOCS_ROUTES = DOCS.map((d) => ({ href: d.href, title: d.title }));

function GettingStarted() {
  return (
    <>
      <p>AutonomOS works as a loop: map the work, pick what to automate, deploy an agent under control, and measure the result. Your first agent can run on sandbox data within one session.</p>
      <ol>
        <li>
          <strong>Set up your company.</strong> Enter your company name and website. AutonomOS reads a few public pages of your website and drafts a company profile you can edit.
        </li>
        <li>
          <strong>Connect your systems.</strong> Connect the tools your team works in, such as Zendesk, Stripe, Slack or Gmail. Each one can start on sandbox data. See{" "}
          <Link href="/docs/integrations">Integrations and sandbox data</Link>.
        </li>
        <li>
          <strong>Review the drafted processes.</strong> AutonomOS drafts your process inventory from your profile, your connected systems and a short guided interview. Correct anything that is wrong.
        </li>
        <li>
          <strong>Approve one process.</strong> Pick a process you know well, check its steps, volume and time, and approve it.
        </li>
        <li>
          <strong>Create the opportunity.</strong> AutonomOS scores the process by value, difficulty and risk, shows the evidence, and proposes the mode the work could run in.
        </li>
        <li>
          <strong>Build and test the agent.</strong> The agent wizard drafts instructions, tools and policies. Run a test: every write is simulated, and the result lists the approvals a production run
          would need.
        </li>
        <li>
          <strong>Go live in Draft or Approve mode.</strong> Start where a person still sends or approves. Move to Auto once the agent has a record you trust. See{" "}
          <Link href="/docs/autonomy-levels">Agent modes</Link>.
        </li>
      </ol>
      <p>Home then shows how much of your work runs on agents, your live agents and the time saved.</p>
    </>
  );
}

function AutonomyLevels() {
  const levels = [
    ["Manual", "Your team does the work. AutonomOS maps and measures it."],
    ["Draft", "The agent researches and prepares the work. A person checks it and takes every action."],
    ["Approve", "The agent prepares each action. A person approves it before it runs."],
    ["Auto", "The agent acts on routine cases. Exceptions and anything above a money limit go to a person."],
  ];
  return (
    <>
      <p>Every agent runs in one mode. The mode decides which actions need a person. Allowed tools, policies and hard limits apply in every mode.</p>
      <ul>
        {levels.map(([name, body]) => (
          <li key={name}>
            <strong>{name}.</strong> {body}
          </li>
        ))}
      </ul>
      <h2>Choosing a mode</h2>
      <ul>
        <li>Start new agents in Draft or Approve.</li>
        <li>Move to Auto when approvals are almost always granted unchanged.</li>
        <li>Keep money actions above your limit under approval, even in Auto.</li>
      </ul>
      <h2>Work on agents</h2>
      <p>Home shows the share of your recurring work that runs on agents. Each process counts by the time it takes and by its mode: none in Manual, a fifth in Draft, two fifths in Approve and four fifths in Auto, where people still handle exceptions.</p>
    </>
  );
}

function Approvals() {
  return (
    <>
      <p>When an agent reaches an action that needs a person, the run pauses and an approval request appears in the Inbox. The run continues once someone decides.</p>
      <p>
        The Inbox also lists work an agent handed to a person. Hand-offs from tests are grouped separately and labelled Test: nothing real waits on them, and they are not counted in the Inbox badge.
      </p>
      <h2>What needs approval</h2>
      <ul>
        <li>Every action the agent&apos;s mode does not allow it to take alone.</li>
        <li>Financial and other high-risk actions, by default.</li>
        <li>Amounts above the agent&apos;s money threshold.</li>
        <li>Cases a policy flags, for example a customer who had a recent refund.</li>
      </ul>
      <h2>Deciding</h2>
      <p>Each request shows the proposed action, its arguments and why the policy asked for approval. Approve it and the action runs; reject it and the agent does not take it.</p>
      <h2>Approval limits</h2>
      <p>Admins can give each approver a personal limit in Settings → Members. An approver cannot approve an amount above their limit; someone with a higher limit has to.</p>
      <h2>Hard limits</h2>
      <p>Hard limits are the ceiling. An action beyond a hard limit is denied even if someone approves it.</p>
      <h2>Emergency stop</h2>
      <p>Admins can pause all agents from Settings. The pause is checked before every external write, and runs stop until you resume.</p>
    </>
  );
}

function Integrations() {
  return (
    <>
      <p>Agents act through integrations. Each integration can connect in one of two ways.</p>
      <h2>Sandbox data</h2>
      <p>
        Choose <em>Use sandbox data</em> when you connect. AutonomOS provides realistic sample customers, payments and refund history for that system, held in AutonomOS. Agents behave exactly as they
        would on a live account, so you can see the whole loop without touching real data.
      </p>
      <h2>Live accounts</h2>
      <p>
        Connecting a live account opens that system&apos;s own sign-in page. Our connection partner holds the sign-in tokens; AutonomOS stores only the connected account id. Production runs act on the
        live account once it is connected.
      </p>
      <h2>Test runs</h2>
      <p>Test runs simulate every write, whichever way an integration is connected.</p>
      <h2>Events</h2>
      <p>An agent can start when an integration event arrives, such as a new ticket. Admins find the webhook URL and signing secret on the Integrations page.</p>
    </>
  );
}

function RunningAgents() {
  return (
    <>
      <p>Agent runs keep going through restarts, so a run can wait hours for an approval and pick up exactly where it stopped.</p>
      <h2>Test runs and production runs</h2>
      <ul>
        <li>A test run simulates every write and lists the approvals a production run would need.</li>
        <li>A production run starts once you activate the agent, either by hand or when an event arrives.</li>
      </ul>
      <h2>Execution readiness</h2>
      <p>
        Settings, Execution shows whether your workspace is ready to run agents. Until it is, AutonomOS will not start runs and tells you what is missing. If it says agents cannot run yet, ask your
        administrator or contact support.
      </p>
    </>
  );
}

function Faq() {
  const items: Array<[string, React.ReactNode]> = [
    ["Do I need to connect live systems to try AutonomOS?", "No. Every integration can use sandbox data, and test runs simulate every write."],
    ["Can an agent do something it was not given a tool for?", "No. Each agent has an explicit tool allowlist, and the policy engine checks every write in code before it runs."],
    ["What stops an agent refunding the same order twice?", "Each write carries an idempotency key, so a retried step does not repeat the action."],
    ["Which AI models are used?", "Leading commercial AI models, chosen per task. The providers are listed on the Security page."],
    [
      "Where is my data stored?",
      <>
        In the region your workspace was set up in, the EU or the US. See <Link href="/security">Security</Link>.
      </>,
    ],
    [
      "How do I delete my workspace?",
      <>
        There is no self-serve deletion yet. Email <a href="mailto:hello@autonomos.ai?subject=Delete%20workspace">hello@autonomos.ai</a> and we will delete it.
      </>,
    ],
    [
      "What does it cost?",
      <>
        You can start free. See <Link href="/#pricing">Pricing</Link>.
      </>,
    ],
  ];
  return (
    <>
      {items.map(([q, a]) => (
        <div key={q}>
          <h2>{q}</h2>
          <p>{a}</p>
        </div>
      ))}
    </>
  );
}

function Api() {
  return (
    <>
      <p>
        Admins create API keys in Settings → Developers. A key is shown once and stored only as a hash. It acts with the current role of the admin who created it, so removing that person, or revoking
        the key, stops it working.
      </p>
      <h2>Authentication</h2>
      <pre>
        <code>{`curl https://your-workspace.example/api/agents \\
  -H "Authorization: Bearer aos_live_..."`}</code>
      </pre>
      <p>
        Every response is JSON: <code>{`{ "ok": true, "data": ... }`}</code> or <code>{`{ "ok": false, "error": "..." }`}</code> with a matching HTTP status.
      </p>
      <h2>Endpoints</h2>
      <ul>
        <li>
          <code>GET /api/agents</code>: agents with status and mode (autonomy level 1 Manual, 2 Draft, 3 Approve, 4 Auto).
        </li>
        <li>
          <code>GET /api/activity?limit=50</code>: what AutonomOS and its agents did, newest first.
        </li>
        <li>
          <code>POST /api/agents/:id/test</code>, <code>/run</code>, <code>/activate</code>, <code>/pause</code>. Test and run take <code>{`{ "input": { ... } }`}</code>.
        </li>
        <li>
          <code>POST /api/approvals/:id/approve</code>, <code>/reject</code>, or <code>/modify</code> with <code>{`{ "changes": { "amount": 50 }, "comment": "..." }`}</code>. Approval limits apply.
        </li>
        <li>
          <code>POST /api/processes</code> creates a process; <code>PATCH /api/processes/:id</code> edits one; <code>POST /api/processes/:id/generate-opportunities</code> finds opportunities.
        </li>
        <li>
          <code>POST /api/opportunities/:id/create-agent</code> builds an agent, optionally with a full configuration.
        </li>
      </ul>
      <h2>Incoming webhooks</h2>
      <p>
        Systems that push events send them to <code>POST /api/webhooks/:connectionId</code> with <code>X-AutonomOS-Signature: sha256=HMAC_SHA256(body, secret)</code>. Each connection has its own
        signing secret, shown to admins on the Integrations page, where it can also be rotated.
      </p>
    </>
  );
}
