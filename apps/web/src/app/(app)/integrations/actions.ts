"use server";
import { redirect } from "next/navigation";
import { runAction } from "@/lib/actions";
import { requireSessionOrThrow } from "@/lib/session";
import { connectSandbox, disconnect, startOAuthConnection } from "@/server/integrations";

export async function connectSandboxAction(key: string) {
  return runAction(async () => connectSandbox(await requireSessionOrThrow(), key));
}

export async function connectOAuthAction(key: string) {
  const result = await runAction(async () => startOAuthConnection(await requireSessionOrThrow(), key, process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"));
  if (!result.ok) return result;
  redirect(result.data);
}

export async function disconnectAction(key: string) {
  return runAction(async () => disconnect(await requireSessionOrThrow(), key));
}
