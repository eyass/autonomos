import { Suspense } from "react";
import { enabledAuthProviders } from "@/lib/auth-providers";
import { AuthForm } from "../auth-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  return (
    <Suspense>
      <AuthForm mode="login" providers={await enabledAuthProviders()} />
    </Suspense>
  );
}
