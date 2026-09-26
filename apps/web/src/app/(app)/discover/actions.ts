"use server";
import { redirect } from "next/navigation";
import { runAction } from "@/lib/actions";
import { rateLimit } from "@/lib/rate-limit";
import { requireSessionOrThrow } from "@/lib/session";
import { z } from "zod";
import { answerInterview, DocumentImportSchema, finishInterview, importDocument, startInterview } from "@/server/processes";
import { acceptProposals, proposeFromRun, rejectProposal, scanRunSystem, startDiscoveryRun, undoRejectProposal } from "@/server/system-discovery";

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

// Discovery from connected systems, driven step by step so the page shows each system being read.
export async function startDiscoveryAction() {
  return runAction(async () => {
    const session = await requireSessionOrThrow();
    rateLimit(`ai:${session.user.id}`, 30, 60_000);
    return startDiscoveryRun(session);
  });
}

export async function scanSystemAction(runId: string, key: string) {
  return runAction(async () => scanRunSystem(await requireSessionOrThrow(), z.string().uuid().parse(runId), z.string().min(1).parse(key)));
}

export async function proposeAction(runId: string) {
  return runAction(async () => {
    const session = await requireSessionOrThrow();
    rateLimit(`ai:${session.user.id}`, 30, 60_000);
    return proposeFromRun(session, z.string().uuid().parse(runId));
  });
}

export async function acceptProposalsAction(runId: string, titles: string[]) {
  const result = await runAction(async () => acceptProposals(await requireSessionOrThrow(), z.string().uuid().parse(runId), z.array(z.string()).max(20).parse(titles)));
  if (!result.ok) return result;
  redirect(`/processes?status=draft&drafted=${result.data.length}`);
}

// One-by-one review: approve adds the process as a draft, reject remembers it for good.
const Review = z.object({ runId: z.string().uuid(), title: z.string().min(1).max(300) });

export async function approveProposalAction(runId: string, title: string) {
  return runAction(async () => {
    const r = Review.parse({ runId, title });
    const ids = await acceptProposals(await requireSessionOrThrow(), r.runId, [r.title]);
    return { id: ids[0] ?? null };
  });
}

export async function rejectProposalAction(runId: string, title: string) {
  return runAction(async () => {
    const r = Review.parse({ runId, title });
    await rejectProposal(await requireSessionOrThrow(), r.runId, r.title);
    return { ok: true };
  });
}

export async function undoRejectProposalAction(runId: string, title: string) {
  return runAction(async () => {
    const r = Review.parse({ runId, title });
    await undoRejectProposal(await requireSessionOrThrow(), r.runId, r.title);
    return { ok: true };
  });
}
