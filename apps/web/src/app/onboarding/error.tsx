"use client";
import { ErrorPanel } from "@/components/app/error-panel";

export default function OnboardingError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorPanel error={error} reset={reset} what="this step" links={[{ href: "/onboarding", label: "Back to setup" }]} />;
}
