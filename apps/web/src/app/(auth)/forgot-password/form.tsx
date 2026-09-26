"use client";
import Link from "next/link";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { FormField } from "@/components/app/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESET_SENT_MESSAGE = "If an account exists for that email, we sent a reset link.";

export function ForgotPasswordForm() {
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);

  async function submit(form: FormData) {
    const email = String(form.get("email") ?? "").trim();
    setError(null);
    if (!EMAIL_PATTERN.test(email)) {
      setError("Enter a valid email address, like name@company.com.");
      return;
    }
    setPending(true);
    try {
      const supabase = createClient();
      // The result is deliberately ignored: the same message is shown whether or not the
      // account exists, so this form cannot be used to discover accounts.
      await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/auth/callback?next=/reset-password` });
    } catch {
      // Same neutral outcome on failure.
    } finally {
      setPending(false);
      setSent(true);
    }
  }

  return (
    <Card className="p-6">
      <h1 className="mb-1 text-base font-semibold">Reset your password</h1>
      <p className="mb-4 text-sm text-muted-foreground">Enter your work email and we will send you a link to choose a new password.</p>
      {sent ? (
        <div role="status">
          <Alert variant="success">
            <AlertDescription>{RESET_SENT_MESSAGE}</AlertDescription>
          </Alert>
        </div>
      ) : (
        <form action={submit} noValidate className="space-y-3">
          <FormField label="Work email" htmlFor="email">
            <Input id="email" name="email" type="email" required autoComplete="email" />
          </FormField>
          {error ? (
            <div role="alert">
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            </div>
          ) : null}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Please wait…" : "Send reset link"}
          </Button>
        </form>
      )}
      <p className="mt-5 text-center text-sm text-muted-foreground">
        Remembered it?{" "}
        <Link className="text-primary hover:underline" href="/login">
          Sign in
        </Link>
      </p>
    </Card>
  );
}
