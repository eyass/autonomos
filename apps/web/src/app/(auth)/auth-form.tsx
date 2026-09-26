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

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Turns Supabase auth errors into messages a person can act on.
function friendly(message: string) {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "The email or password is incorrect.";
  if (m.includes("email not confirmed")) return "Confirm your email address first. Check your inbox for the link.";
  if (m.includes("already registered") || m.includes("already been registered")) return "An account with this email already exists. Sign in instead.";
  if (m.includes("rate limit") || m.includes("too many")) return "Too many attempts. Wait a minute and try again.";
  if (m.includes("password should be")) return "Choose a longer password: at least 8 characters.";
  return message;
}

// "eve.tester@acme.com" -> Eve / Tester. Only a starting point; the fields stay editable.
function namesFromEmail(email: string) {
  const local = email.split("@")[0] ?? "";
  const parts = local.split(/[._-]+/).filter((p) => /^[a-z\u00c0-\u024f]{2,}$/i.test(p));
  const cap = (w?: string) => (w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : "");
  return parts.length >= 2 ? { first: cap(parts[0]), last: cap(parts.slice(1).join(" ")) } : { first: cap(parts[0]), last: "" };
}

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/";
  const [error, setError] = useState<string | null>(params.get("error"));
  const [info, setInfo] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [usePassword, setUsePassword] = useState(true);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [namesEdited, setNamesEdited] = useState(false);
  const callback = () => `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

  async function submit(form: FormData) {
    const supabase = createClient();
    setPending(true);
    setError(null);
    setInfo(null);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    try {
      if (!email) throw new Error("Enter your work email.");
      if (!EMAIL_PATTERN.test(email)) throw new Error("Enter a valid email address, like name@company.com.");
      if (mode === "signup" || usePassword) {
        if (!password) throw new Error("Enter your password.");
        if (mode === "signup" && password.length < 8) throw new Error("Your password needs at least 8 characters.");
      }
      if (mode === "signup") {
        const firstName = String(form.get("firstName") ?? "").trim();
        const lastName = String(form.get("lastName") ?? "").trim();
        if (!firstName || !lastName) throw new Error("Enter your first and last name.");
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
      setError(e instanceof Error ? friendly(e.message) : "Something went wrong. Try again.");
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
        <form action={submit} noValidate>
          <FieldGroup>
            <Field>
              <Button type="button" variant="outline" className="w-full" onClick={google}>
                Continue with Google
              </Button>
            </Field>
            <FieldSeparator className="*:data-[slot=field-separator-content]:bg-card">Or continue with email</FieldSeparator>
            <FormField label="Work email" htmlFor="email">
              <Input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@company.com"
                onChange={(e) => {
                  if (mode !== "signup" || namesEdited) return;
                  const guess = namesFromEmail(e.target.value);
                  setFirstName(guess.first);
                  setLastName(guess.last);
                }}
              />
            </FormField>
            {mode === "signup" ? (
              <div className="grid grid-cols-2 gap-3">
                <FormField label="First name" htmlFor="firstName">
                  <Input id="firstName" name="firstName" required autoComplete="given-name" value={firstName} onChange={(e) => (setNamesEdited(true), setFirstName(e.target.value))} />
                </FormField>
                <FormField label="Last name" htmlFor="lastName">
                  <Input id="lastName" name="lastName" required autoComplete="family-name" value={lastName} onChange={(e) => (setNamesEdited(true), setLastName(e.target.value))} />
                </FormField>
              </div>
            ) : null}
            {mode === "signup" || usePassword ? (
              <div>
                <FormField label="Password" htmlFor="password" hint={mode === "signup" ? "At least 8 characters" : undefined}>
                  <Input id="password" name="password" type="password" required minLength={mode === "signup" ? 8 : undefined} autoComplete={mode === "signup" ? "new-password" : "current-password"} />
                </FormField>
                {mode === "login" ? (
                  <div className="mt-1.5 text-right">
                    <Link href="/forgot-password" className="text-xs text-muted-foreground hover:text-foreground hover:underline">
                      Forgot password?
                    </Link>
                  </div>
                ) : null}
              </div>
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
              {mode === "signup" ? (
                <FieldDescription className="text-center text-xs">
                  By continuing you agree to the <Link href="/terms">Terms</Link> and <Link href="/privacy">Privacy Policy</Link>.
                </FieldDescription>
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
