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

type Provider = "google" | "azure" | "github";

// Sign-in providers: the name people know them by and their mark.
const PROVIDERS: Record<Provider, { label: string; icon: React.ReactNode; scopes?: string }> = {
  google: {
    label: "Google",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.7z" />
        <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.4 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24z" />
        <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8l4-3.1z" />
        <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9z" />
      </svg>
    ),
  },
  // Supabase calls Microsoft sign-in (Entra ID) "azure"; it needs the email scope to return an address.
  azure: {
    label: "Microsoft",
    scopes: "email",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path fill="#F25022" d="M1 1h10.5v10.5H1z" />
        <path fill="#7FBA00" d="M12.5 1H23v10.5H12.5z" />
        <path fill="#00A4EF" d="M1 12.5h10.5V23H1z" />
        <path fill="#FFB900" d="M12.5 12.5H23V23H12.5z" />
      </svg>
    ),
  },
  github: {
    label: "GitHub",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
        <path d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2.2c-3.3.7-4-1.4-4-1.4-.6-1.4-1.4-1.8-1.4-1.8-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.7-.3-5.5-1.3-5.5-6 0-1.2.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0C17.3 4.5 18.3 4.8 18.3 4.8c.6 1.7.2 2.9.1 3.2.8.8 1.2 1.9 1.2 3.1 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .3" />
      </svg>
    ),
  },
};

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

export function AuthForm({ mode, providers = ["google"] }: { mode: "login" | "signup"; providers?: Provider[] }) {
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
      // Route handlers (finishing a connection) need a full page load, not a client navigation.
      if (next.startsWith("/api/")) return window.location.assign(next);
      router.push(next);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? friendly(e.message) : "Something went wrong. Try again.");
    } finally {
      setPending(false);
    }
  }

  async function oauth(provider: Provider) {
    const supabase = createClient();
    const scopes = PROVIDERS[provider].scopes;
    const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: callback(), ...(scopes ? { scopes } : {}) } });
    if (error) setError(error.message);
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">{mode === "signup" ? "Create your account" : "Welcome back"}</CardTitle>
        <CardDescription>{mode === "signup" ? "Start mapping what your company can automate" : "Sign in to your workspace"}</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={submit} noValidate>
          <FieldGroup>
            {providers.length ? (
              <>
                <Field className="gap-2">
                  {providers.map((p) => (
                    <Button key={p} type="button" variant="outline" className="w-full [&_svg]:size-4" onClick={() => oauth(p)}>
                      {PROVIDERS[p].icon}
                      Continue with {PROVIDERS[p].label}
                    </Button>
                  ))}
                </Field>
                <FieldSeparator className="*:data-[slot=field-separator-content]:bg-card">Or continue with email</FieldSeparator>
              </>
            ) : null}
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
