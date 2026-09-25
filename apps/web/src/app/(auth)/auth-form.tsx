"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, Field, Input, Notice } from "@/components/ui";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const supabase = createClient();
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/";
  const [error, setError] = useState<string | null>(params.get("error"));
  const [info, setInfo] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [usePassword, setUsePassword] = useState(true);
  const callback = () => `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

  async function submit(form: FormData) {
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
    const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: callback() } });
    if (error) setError(error.message);
  }

  return (
    <Card className="p-6">
      <h1 className="mb-4 text-base font-semibold">{mode === "signup" ? "Create your account" : "Sign in"}</h1>
      <Button type="button" variant="secondary" className="w-full" onClick={google}>
        Continue with Google
      </Button>
      <div className="my-4 flex items-center gap-3 text-xs text-muted">
        <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
      </div>
      <form action={submit} className="space-y-3">
        {mode === "signup" ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="First name" htmlFor="firstName">
              <Input id="firstName" name="firstName" required autoComplete="given-name" />
            </Field>
            <Field label="Last name" htmlFor="lastName">
              <Input id="lastName" name="lastName" required autoComplete="family-name" />
            </Field>
          </div>
        ) : null}
        <Field label="Work email" htmlFor="email">
          <Input id="email" name="email" type="email" required autoComplete="email" />
        </Field>
        {mode === "signup" || usePassword ? (
          <Field label="Password" htmlFor="password" hint={mode === "signup" ? "At least 8 characters" : undefined}>
            <Input id="password" name="password" type="password" required minLength={mode === "signup" ? 8 : undefined} autoComplete={mode === "signup" ? "new-password" : "current-password"} />
          </Field>
        ) : null}
        {error ? <Notice tone="danger">{error}</Notice> : null}
        {info ? <Notice tone="ok">{info}</Notice> : null}
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "Please wait…" : mode === "signup" ? "Create account" : usePassword ? "Sign in" : "Email me a link"}
        </Button>
      </form>
      {mode === "login" ? (
        <button type="button" className="mt-3 w-full text-center text-xs text-muted hover:text-foreground" onClick={() => setUsePassword((v) => !v)}>
          {usePassword ? "Use a magic link instead" : "Use a password instead"}
        </button>
      ) : null}
      <p className="mt-5 text-center text-sm text-muted">
        {mode === "signup" ? (
          <>
            Already have an account? <Link className="text-accent hover:underline" href="/login">Sign in</Link>
          </>
        ) : (
          <>
            New to AutonomOS? <Link className="text-accent hover:underline" href="/signup">Create an account</Link>
          </>
        )}
      </p>
    </Card>
  );
}
