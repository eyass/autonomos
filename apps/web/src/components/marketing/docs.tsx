import Link from "next/link";
import type * as React from "react";

export const README_URL = "https://github.com/eyass/autonomos#production-vercel--supabase--triggerdev";

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
    title: "Autonomy levels",
    description: "What L1 to L5 mean and when to raise an agent's level.",
    body: AutonomyLevels,
  },
  {
    slug: "approvals",
    href: "/docs/approvals",
    title: "Approvals",
    description: "How approvals, money thresholds and hard limits work.",
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
          <strong>Create the opportunity.</strong> AutonomOS scores the process by value, difficulty and risk, shows the evidence, and proposes a target autonomy level.
        </li>
        <li>
          <strong>Build and test the agent.</strong> The agent wizard drafts instructions, tools and policies. Run a test: every write is simulated, and the result lists the approvals a production run
          would need.
        </li>
        <li>
          <strong>Activate at L2 or L3.</strong> Start where a person still acts or approves. Raise the level once the agent has a record you trust. See{" "}
          <Link href="/docs/autonomy-levels">Autonomy levels</Link>.
        </li>
      </ol>
      <p>The overview then shows your autonomy score, active agents and time saved.</p>
    </>
  );
}

function AutonomyLevels() {
  const levels = [
    ["L1", "Human only", "People do the work. AutonomOS maps and measures it."],
    ["L2", "Agent assists", "The agent researches and drafts. A person takes every action."],
    ["L3", "Agent proposes", "The agent prepares each action. A person approves it before it runs."],
    ["L4", "Agent executes with exceptions", "The agent acts on routine cases. Exceptions and anything above a threshold go to a person."],
    ["L5", "Autonomous", "The agent runs the process end to end within its policies and hard limits. People monitor."],
  ];
  return (
    <>
      <p>Every agent runs at one autonomy level. The level decides which actions need a person. Policies and hard limits apply at every level.</p>
      <ul>
        {levels.map(([code, name, body]) => (
          <li key={code}>
            <strong>
              {code}, {name}.
            </strong>{" "}
            {body}
          </li>
        ))}
      </ul>
      <h2>Choosing a level</h2>
      <ul>
        <li>Start new agents at L2 or L3.</li>
        <li>Move to L4 when approvals are almost always granted unchanged.</li>
        <li>Keep financial actions above your money threshold under approval, even at L4.</li>
      </ul>
      <h2>The autonomy score</h2>
      <p>Your company autonomy score weighs each process by the time it takes and by the level it runs at. It rises as more of your recurring work runs at higher levels.</p>
    </>
  );
}

function Approvals() {
  return (
    <>
      <p>When an agent reaches an action that needs a person, the run pauses and an approval request appears on the Approvals page. The run continues once someone decides.</p>
      <h2>What needs approval</h2>
      <ul>
        <li>Every action the agent&apos;s autonomy level does not allow it to take alone.</li>
        <li>Financial and other high-risk actions, by default.</li>
        <li>Amounts above the agent&apos;s money threshold.</li>
        <li>Cases a policy flags, for example a customer who had a recent refund.</li>
      </ul>
      <h2>Deciding</h2>
      <p>Each request shows the proposed action, its arguments and why the policy asked for approval. Approve it and the action runs; reject it and the agent does not take it.</p>
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
        Connecting a live account starts an OAuth flow through Composio. Composio holds the tokens; AutonomOS stores only the connected account id. Production runs act on the live account once it is
        connected.
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
      <p>AutonomOS runs agents on a durable runtime, so a run can wait hours for an approval and pick up exactly where it stopped.</p>
      <h2>Test runs and production runs</h2>
      <ul>
        <li>A test run simulates every write and lists the approvals a production run would need.</li>
        <li>A production run starts once you activate the agent, either by hand or when an event arrives.</li>
      </ul>
      <h2>Execution readiness</h2>
      <p>
        Agents run only once the durable runtime (Trigger.dev) is connected to your workspace&apos;s deployment. Until then, AutonomOS will not start runs and tells you so. Connecting it is a one-time
        task for an administrator. If you see that runs are unavailable, ask your administrator to complete the setup below.
      </p>
      <h2 id="administrators">For administrators</h2>
      <p>Set these environment variables in the web host (for example Vercel) and the worker:</p>
      <ul>
        <li>
          <code>TRIGGER_SECRET_KEY</code>: the Trigger.dev secret key for the environment the worker is deployed to. Required to run agents.
        </li>
        <li>
          <code>GOOGLE_GENERATIVE_AI_API_KEY</code>: the key for Gemini, the default model provider. Without a model key, AI steps run in a mock mode.
        </li>
        <li>
          <code>COMPOSIO_API_KEY</code>: optional, needed to connect live accounts. Without it, integrations use sandbox data only.
        </li>
      </ul>
      <p>
        The full production setup is in the <a href={README_URL}>README</a>.
      </p>
    </>
  );
}

function Faq() {
  const items: Array<[string, React.ReactNode]> = [
    ["Do I need to connect live systems to try AutonomOS?", "No. Every integration can use sandbox data, and test runs simulate every write."],
    ["Can an agent do something it was not given a tool for?", "No. Each agent has an explicit tool allowlist, and the policy engine checks every write in code before it runs."],
    ["What stops an agent refunding the same order twice?", "Each write carries an idempotency key, so a retried step does not repeat the action."],
    ["Which AI models are used?", "Google Gemini by default. An administrator can switch to Anthropic or OpenAI models."],
    [
      "Where is my data stored?",
      <>
        In the Supabase project your workspace is deployed with. See <Link href="/security">Security</Link>.
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
        AutonomOS is free for design partners. See <Link href="/#pricing">Pricing</Link>.
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
