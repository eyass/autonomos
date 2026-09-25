import "server-only";
import { unstable_rethrow } from "next/navigation";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { HttpError } from "./session";

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

function messageFor(error: unknown): { status: number; message: string } {
  if (error instanceof HttpError) return { status: error.status, message: error.message };
  if (error instanceof ZodError) return { status: 400, message: error.issues.map((i) => i.message).join("; ") };
  console.error(error);
  return { status: 500, message: "Something went wrong. The error has been logged." };
}

// Wraps a server action so expected failures come back as data instead of crashing the page.
export async function runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    unstable_rethrow(error);
    return { ok: false, error: messageFor(error).message };
  }
}

// Same for route handlers (PRD section 105 API).
export async function handle<T>(fn: () => Promise<T>) {
  try {
    const data = await fn();
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    const { status, message } = messageFor(error);
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
