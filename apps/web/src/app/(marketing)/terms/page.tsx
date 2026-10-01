import { OG_IMAGES } from "@/components/marketing/config";
import type { Metadata } from "next";
import { CONTACT_EMAIL, DraftNotice, PageIntro, Prose } from "@/components/marketing/site";

const description = "The terms that apply when you use AutonomOS.";

export const metadata: Metadata = {
  // Draft until counsel signs off: readable by customers, kept out of search results.
  robots: { index: false, follow: true },
  title: "Terms of service",
  description,
  alternates: { canonical: "/terms" },
  openGraph: { title: "Terms of service · AutonomOS", description, url: "/terms", type: "article", images: OG_IMAGES },
};

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      <DraftNotice />
      <PageIntro title="Terms of service">Last updated 26 September 2026.</PageIntro>
      <Prose>
        <h2>1. Who these terms are between</h2>
        <p>
          These terms are between AutonomOS (&quot;we&quot;) and the organisation that creates a workspace (&quot;you&quot;). The person who accepts them confirms they may do so on behalf of that
          organisation.
        </p>

        <h2>2. The service</h2>
        <p>
          AutonomOS helps you map recurring work, choose what to automate, and run AI agents that act in your connected systems under the modes, policies, approvals and limits you configure.
          We improve the service continuously, so features may change.
        </p>

        <h2>3. Your responsibilities</h2>
        <ul>
          <li>Keep your account credentials secure and tell us about any unauthorised use.</li>
          <li>Only connect systems and data you are allowed to use, and configure agents in line with your own policies and the law.</li>
          <li>
            Review and approve processes, agent configurations and actions that need approval. You remain responsible for actions taken in your systems, including actions an agent takes within the
            limits you set.
          </li>
          <li>Do not use the service to break the law, harm others, or attempt to access other workspaces.</li>
        </ul>

        <h2>4. Agents and automated actions</h2>
        <p>
          Agents can make mistakes. We provide controls such as tool allowlists, a policy engine, approvals, money limits, hard limits and an emergency stop. Start agents in Draft or Approve mode, on
          sandbox data, and move them to Auto only when you are satisfied with their record.
        </p>

        <h2>5. Your data</h2>
        <p>
          You own the data you put into AutonomOS and the data agents read from your systems. You give us permission to process it only to provide and improve the service, as described in the Privacy
          Policy.
        </p>

        <h2>6. Third-party services</h2>
        <p>The service depends on providers such as hosting, database, model and integration providers. Your use of connected third-party systems is also governed by their own terms.</p>

        <h2>7. Fees</h2>
        <p>Fees are those of your plan, shown on the pricing page and in Settings. We tell you before any change to them applies.</p>

        <h2>8. Suspension and ending</h2>
        <p>You can stop using the service at any time and ask us to delete your workspace. We may suspend access if you breach these terms or if needed to protect the service or other customers.</p>

        <h2>9. Disclaimers and liability</h2>
        <p>
          The service is provided as is, without warranties beyond those the law requires. To the extent the law allows, we are not liable for indirect or
          consequential losses. Nothing in these terms limits liability that cannot be limited by law.
        </p>

        <h2>10. Changes</h2>
        <p>We may update these terms. We will tell you about material changes before they take effect.</p>

        <h2>11. Contact</h2>
        <p>
          Questions about these terms: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
      </Prose>
    </div>
  );
}
