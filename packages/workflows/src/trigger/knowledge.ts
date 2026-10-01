import { logger, task } from "@trigger.dev/sdk";
import { createServiceClient, ingestSource } from "@autonomos/db";

// Reads one company-knowledge source (a whole website, a help centre, a file or pasted text)
// into passages and the company brief. A website read that runs out of time saves its place
// and this task starts itself again from there, so very large sites are read in full.
export const knowledgeIngestTask = task({
  id: "knowledge-ingest",
  queue: { name: "knowledge", concurrencyLimit: 10 },
  retry: { maxAttempts: 3, minTimeoutInMs: 5_000, maxTimeoutInMs: 60_000, factor: 2, randomize: true },
  maxDuration: 900,
  run: async (payload: { sourceId: string; round?: number }) => {
    const round = payload.round ?? 1;
    const result = await ingestSource(createServiceClient(), payload.sourceId, { budgetMs: 13 * 60_000 });
    logger.info("knowledge source read", { sourceId: payload.sourceId, round, result });
    if (!result.done && round < 20) await knowledgeIngestTask.trigger({ sourceId: payload.sourceId, round: round + 1 }, { idempotencyKey: `knowledge-${payload.sourceId}-${Date.now()}-${round + 1}` });
    return result;
  },
});
