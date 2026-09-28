import { redirect } from "next/navigation";
import { getUser } from "@/lib/session";
import { Logo } from "@/components/brand/logo";

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  if (!(await getUser())) redirect("/login");
  return (
    // Room at the bottom for the bar that holds each step's buttons.
    <div className="mx-auto max-w-2xl px-4 pt-12 pb-36">
      <div className="mb-8">
        <Logo markClassName="size-7" />
      </div>
      {children}
    </div>
  );
}
