"use server";
import { redirect } from "next/navigation";
import { runAction } from "@/lib/actions";
import { rateLimit } from "@/lib/rate-limit";
import { requireSessionOrThrow } from "@/lib/session";
import { answerInterview, discoverFromIntegrations, DocumentImportSchema, finishInterview, importDocument, startInterview } from "@/server/processes";

export async function startInterviewAction(department: string) {
  return runAction(async () => startInterview(await requireSessionOrThrow(), department));
}

export async function answerInterviewAction(sessionId: string, answer: string) {
  return runAction(async () => {
    const session = await requireSessionOrThrow();
    rateLimit(`ai:${session.user.id}`, 30, 60_000);
    return answerInterview(session, sessionId, answer);
  });
}

export async function finishInterviewAction(sessionId: string, titles: string[]) {
  return runAction(async () => finishInterview(await requireSessionOrThrow(), sessionId, titles));
}

export async function importDocumentAction(input: { title: string; content: string; source: "upload" | "paste" }) {
  return runAction(async () => {
    const session = await requireSessionOrThrow();
    rateLimit(`ai:${session.user.id}`, 30, 60_000);
    return importDocument(session, DocumentImportSchema.parse(input));
  });
}

export async function discoverFromIntegrationsAction() {
  const result = await runAction(async () => {
    const session = await requireSessionOrThrow();
    rateLimit(`ai:${session.user.id}`, 30, 60_000);
    return discoverFromIntegrations(session);
  });
  if (!result.ok) return result;
  redirect("/processes?status=draft");
}
