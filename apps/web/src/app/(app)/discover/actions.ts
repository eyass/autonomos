"use server";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { runAction } from "@/lib/actions";
import { rateLimit } from "@/lib/rate-limit";
import { requireSessionOrThrow } from "@/lib/session";
import { z } from "zod";
import { cancelInterviewTurn, DocumentImportSchema, finishInterview, importDocument, retryInterviewTurn, runInterviewTurn, startInterview, submitInterviewAnswer } from "@/server/processes";
import { acceptProposals, activeDiscoveryRun, getDiscoveryRun, rejectProposal, runDiscovery, startDiscoveryRun, undoRejectProposal } from "@/server/system-discovery";

export async function startInterviewAction(department: string) {
  return runAction(async () => startInterview(await requireSessionOrThrow(), department));
}

// The answer is saved and the turn runs after the response, so this returns at once and
// the page polls GET /api/interviews/:id. Nothing long runs inside a server action.
export async function answerInterviewAction(sessionId: string, answer: string) {
  return runAction(async () => {
    const session = await requireSessionOrThrow();
    rateLimit(`ai:${session.user.id}`, 30, 60_000);
    const { since, state } = await submitInterviewAnswer(session, z.string().uuid().parse(sessionId), z.string().max(6000).parse(answer));
    after(() => runInterviewTurn(session, state.id, since));
    return state;
  });
}

export async function retryInterviewAction(sessionId: string) {
  return runAction(async () => {
    const session = await requireSessionOrThrow();
    rateLimit(`ai:${session.user.id}`, 30, 60_000);
    const { since, state } = await retryInterviewTurn(session, z.string().uuid().parse(sessionId));
    after(() => runInterviewTurn(session, state.id, since));
    return state;
  });
}

export async function cancelInterviewAction(sessionId: string) {
  return runAction(async () => cancelInterviewTurn(await requireSessionOrThrow(), z.string().uuid().parse(sessionId)));
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
// Starts discovery on the server and returns at once; the page polls getDiscoveryRunAction.
export async function startDiscoveryAction() {
  return runAction(async () => {
    const session = await requireSessionOrThrow();
    const active = await activeDiscoveryRun(session);
    if (active) return active;
    rateLimit(`ai:${session.user.id}`, 30, 60_000);
    const run = await startDiscoveryRun(session);
    after(() => runDiscovery(session, run.id));
    return run;
  });
}

export async function getDiscoveryRunAction(runId: string) {
  return runAction(async () => getDiscoveryRun(await requireSessionOrThrow(), z.string().uuid().parse(runId)));
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
