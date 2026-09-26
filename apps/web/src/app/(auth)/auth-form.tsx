"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { FormField } from "@/components/app/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldSeparator } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Input } from "@/components/ui/input";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/";
  const [error, setError] = useState<string | null>(params.get("error"));
  const [info, setInfo] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [usePassword, setUsePassword] = useState(true);
  const callback = () => `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

  async function submit(form: FormData) {
    const supabase = createClient();
    setPending(true);
    setError(null);
    setInfo(null);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    try {
      if (mode === "signup") {
        const firstName = String(form.get("firstName") ?? "").trim();
        const lastName = String(form.get("lastName") ?? "").trim();
        if (!firstName || !lastName) throw new Error("First and last name are required");
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { first_name: firstName, last_name: lastName }, emailRedirectTo: callback() },
        });
        if (error) throw error;
        if (!data.session) {
          setInfo("Check your inbox to confirm your email address.");
          return;
        }
        await fetch("/api/analytics/signup", { method: "POST" });
        router.push("/onboarding/company");
        router.refresh();
        return;
      }
      if (!usePassword) {
        const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: callback(), shouldCreateUser: false } });
        if (error) throw error;
        setInfo("We sent you a sign-in link.");
        return;
      }
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      router.push(next);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setPending(false);
    }
  }

  async function google() {
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: callback() } });
    if (error) setError(error.message);
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">{mode === "signup" ? "Create your account" : "Welcome back"}</CardTitle>
        <CardDescription>{mode === "signup" ? "Start mapping what your company can automate" : "Sign in with Google or your work email"}</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={submit}>
          <FieldGroup>
            <Field>
              <Button type="button" variant="outline" className="w-full" onClick={google}>
                Continue with Google
              </Button>
            </Field>
            <FieldSeparator className="*:data-[slot=field-separator-content]:bg-card">Or continue with email</FieldSeparator>
            {mode === "signup" ? (
              <div className="grid grid-cols-2 gap-3">
                <FormField label="First name" htmlFor="firstName">
                  <Input id="firstName" name="firstName" required autoComplete="given-name" />
                </FormField>
                <FormField label="Last name" htmlFor="lastName">
                  <Input id="lastName" name="lastName" required autoComplete="family-name" />
                </FormField>
              </div>
            ) : null}
            <FormField label="Work email" htmlFor="email">
              <Input id="email" name="email" type="email" required autoComplete="email" placeholder="you@company.com" />
            </FormField>
            {mode === "signup" || usePassword ? (
              <FormField label="Password" htmlFor="password" hint={mode === "signup" ? "At least 8 characters" : undefined}>
                <Input id="password" name="password" type="password" required minLength={mode === "signup" ? 8 : undefined} autoComplete={mode === "signup" ? "new-password" : "current-password"} />
              </FormField>
            ) : null}
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            {info ? (
              <Alert variant="success">
                <AlertDescription>{info}</AlertDescription>
              </Alert>
            ) : null}
            <Field>
              <Button type="submit" className="w-full" disabled={pending}>
                {pending ? <Spinner /> : null}
                {mode === "signup" ? "Create account" : usePassword ? "Sign in" : "Email me a link"}
              </Button>
              {mode === "login" ? (
                <Button type="button" variant="link" size="sm" className="text-muted-foreground" onClick={() => setUsePassword((v) => !v)}>
                  {usePassword ? "Use a magic link instead" : "Use a password instead"}
                </Button>
              ) : null}
              <FieldDescription className="text-center">
                {mode === "signup" ? (
                  <>
                    Already have an account? <Link href="/login">Sign in</Link>
                  </>
                ) : (
                  <>
                    New to AutonomOS? <Link href="/signup">Create an account</Link>
                  </>
                )}
              </FieldDescription>
            </Field>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
