import type { Metadata } from "next";
import { CONTACT_EMAIL, DraftNotice, PageIntro, Prose, SubprocessorTable } from "@/components/marketing/site";

const description = "What data AutonomOS processes, why, who helps us process it, and your choices.";

export const metadata: Metadata = {
  title: "Privacy policy",
  description,
  alternates: { canonical: "/privacy" },
  openGraph: { title: "Privacy policy · AutonomOS", description, url: "/privacy", type: "article" },
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      <DraftNotice />
      <PageIntro title="Privacy policy">Last updated 26 September 2026.</PageIntro>
      <Prose>
        <h2>What we process</h2>
        <ul>
          <li>
            <strong>Account details:</strong> your name and work email, and how you sign in.
          </li>
          <li>
            <strong>Company profile:</strong> your company name, industry and website, and a profile we draft by reading a few public pages of that website once during onboarding.
          </li>
          <li>
            <strong>Process descriptions:</strong> the processes, steps, volumes and times you and AutonomOS record, including answers to the guided interview and documents you upload.
          </li>
          <li>
            <strong>Integration data read by agents:</strong> records agents read from connected systems while they run, such as tickets, customers and payments, together with the actions they take
            and the approvals given.
          </li>
          <li>
            <strong>Usage analytics:</strong> product events, such as signing up or activating an agent, to understand how the product is used.
          </li>
        </ul>
        <p>We do not store sign-in tokens for live systems; our connection partner holds them and we keep only the connected account id.</p>

        <h2>Why we process it</h2>
        <ul>
          <li>To provide the service you asked for: mapping processes, scoring opportunities, and running agents.</li>
          <li>To keep the service secure, including audit logs of every agent action.</li>
          <li>To understand and improve the product.</li>
          <li>To send you account emails, such as sign-in links and password resets.</li>
        </ul>

        <h2>AI models</h2>
        <p>Text from your workspace, including data an agent is working on, is sent to an AI model provider to generate drafts and decide on actions. The providers we use are listed below.</p>

        <h2>Subprocessors</h2>
        <SubprocessorTable />

        <h2>Where data is stored</h2>
        <p>Your data is stored in the region your workspace was set up in, the EU or the US.</p>

        <h2>How long we keep it</h2>
        <p>
          Run history, tool inputs and outputs, and audit events are kept for the life of the workspace. Deleting a workspace deletes its data. There is no self-serve deletion yet;{" "}
          <a href={`mailto:${CONTACT_EMAIL}?subject=Delete%20workspace`}>contact us to delete a workspace</a>.
        </p>

        <h2>Your rights</h2>
        <p>
          You can ask to access, correct, export or delete your personal data, or object to how we use it. Email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. If your organisation controls
          the workspace, we may refer you to them.
        </p>

        <h2>Contact</h2>
        <p>
          Privacy questions: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
      </Prose>
    </div>
  );
}
