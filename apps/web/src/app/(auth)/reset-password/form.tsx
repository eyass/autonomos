"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { FormField } from "@/components/app/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type SessionState = "checking" | "ready" | "missing";

// Reached from the password reset email via /auth/callback, which exchanges the link's code
// for a recovery session. Without that session the link has expired or was already used.
export function ResetPasswordForm() {
  const router = useRouter();
  const [session, setSession] = useState<SessionState>("checking");
  const [errors, setErrors] = useState<{ password?: string; confirm?: string; form?: string }>({});
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let active = true;
    let supabase: ReturnType<typeof createClient>;
    try {
      supabase = createClient();
    } catch {
      // No Supabase configuration in this deployment: treat it like an unusable link.
      void Promise.resolve().then(() => active && setSession("missing"));
      return;
    }
    const { data: listener } = supabase.auth.onAuthStateChange((event, s) => {
      if (active && s && (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN")) setSession("ready");
    });
    supabase.auth
      .getUser()
      .then(({ data }) => {
        if (active) setSession((prev) => (data.user ? "ready" : prev === "ready" ? prev : "missing"));
      })
      .catch(() => active && setSession("missing"));
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function submit(form: FormData) {
    const password = String(form.get("password") ?? "");
    const confirm = String(form.get("confirm") ?? "");
    const next: typeof errors = {};
    if (password.length < 8) next.password = "Your password needs at least 8 characters.";
    if (!confirm) next.confirm = "Enter the new password again.";
    else if (confirm !== password) next.confirm = "The passwords do not match.";
    setErrors(next);
    if (next.password || next.confirm) return;

    setPending(true);
    try {
      const { error } = await createClient().auth.updateUser({ password });
      if (error) throw error;
      router.replace("/");
      router.refresh();
    } catch (e) {
      const message = e instanceof Error ? e.message : "";
      setErrors({ form: /different from the old/i.test(message) ? "Choose a password different from your current one." : message || "Could not update your password. Try again." });
      setPending(false);
    }
  }

  if (session === "checking") {
    return (
      <Card className="p-6">
        <p className="text-sm text-muted-foreground">Checking your reset link…</p>
      </Card>
    );
  }

  if (session === "missing") {
    return (
      <Card className="p-6">
        <h1 className="mb-2 text-base font-semibold">This link has expired</h1>
        <p className="text-sm text-muted-foreground">Password reset links work once and expire after a short time.</p>
        <Link href="/forgot-password" className="mt-4 inline-flex h-9 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          Request a new link
        </Link>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <h1 className="mb-4 text-base font-semibold">Choose a new password</h1>
      <form action={submit} noValidate className="space-y-3">
        <div>
          <FormField label="New password" htmlFor="password" hint={errors.password ? undefined : "At least 8 characters"}>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              aria-invalid={Boolean(errors.password)}
              aria-describedby={errors.password ? "password-error" : undefined}
            />
          </FormField>
          {errors.password ? (
            <p id="password-error" className="mt-1 text-xs text-destructive">
              {errors.password}
            </p>
          ) : null}
        </div>
        <div>
          <FormField label="Confirm new password" htmlFor="confirm">
            <Input id="confirm" name="confirm" type="password" autoComplete="new-password" aria-invalid={Boolean(errors.confirm)} aria-describedby={errors.confirm ? "confirm-error" : undefined} />
          </FormField>
          {errors.confirm ? (
            <p id="confirm-error" className="mt-1 text-xs text-destructive">
              {errors.confirm}
            </p>
          ) : null}
        </div>
        {errors.form ? (
          <div role="alert">
            <Alert variant="destructive">
              <AlertDescription>{errors.form}</AlertDescription>
            </Alert>
          </div>
        ) : null}
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "Please wait…" : "Update password"}
        </Button>
      </form>
    </Card>
  );
}
