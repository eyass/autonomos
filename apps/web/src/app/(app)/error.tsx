"use client";
import { Button, Card } from "@/components/ui";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Card className="mx-auto mt-12 max-w-md p-6 text-center">
      <h2 className="font-semibold">Something went wrong</h2>
      <p className="mt-1 text-sm text-muted">{error.digest ? `Reference ${error.digest}. ` : ""}The error has been logged.</p>
      <Button className="mt-4" onClick={reset}>
        Try again
      </Button>
    </Card>
  );
}
