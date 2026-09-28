import { Suspense } from "react";
import { enabledAuthProviders } from "@/lib/auth-providers";
import { AuthForm } from "../auth-form";

export const metadata = { title: "Create account" };

export default async function SignupPage() {
  return (
    <Suspense>
      <AuthForm mode="signup" providers={await enabledAuthProviders()} />
    </Suspense>
  );
}
