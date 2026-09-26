import { redirect } from "next/navigation";
import { getUser } from "@/lib/session";
import { Logo } from "@/components/brand/logo";

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  if (!(await getUser())) redirect("/login");
  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <div className="mb-8">
        <Logo markClassName="size-7" />
      </div>
      {children}
    </div>
  );
}
