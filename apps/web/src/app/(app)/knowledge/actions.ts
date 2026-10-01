"use server";
import { z } from "zod";
import { runAction } from "@/lib/actions";
import { requireSessionOrThrow } from "@/lib/session";
import { addPasteSource, addUrlSource, originalFileUrl, readAgain, removeSource } from "@/server/knowledge";

export async function addUrlSourceAction(url: string) {
  return runAction(async () => addUrlSource(await requireSessionOrThrow(), { url: z.string().trim().min(3).max(500).parse(url) }));
}

export async function addPasteSourceAction(input: { title: string; text: string }) {
  return runAction(async () => addPasteSource(await requireSessionOrThrow(), z.object({ title: z.string().max(200), text: z.string().max(500_000) }).parse(input)));
}

export async function readAgainAction(sourceId: string) {
  return runAction(async () => readAgain(await requireSessionOrThrow(), z.string().uuid().parse(sourceId)));
}

export async function removeSourceAction(sourceId: string) {
  return runAction(async () => removeSource(await requireSessionOrThrow(), z.string().uuid().parse(sourceId)));
}

export async function originalFileAction(sourceId: string) {
  return runAction(async () => originalFileUrl(await requireSessionOrThrow(), z.string().uuid().parse(sourceId)));
}
