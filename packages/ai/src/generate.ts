import { generateText, Output } from "ai";
import type { z } from "zod";
import { estimateCostUsd, isMockMode, modelIdFor, resolveModel, type ModelClass } from "./models";
import { UNTRUSTED_CONTENT_RULE, renderSections, type PromptSection } from "./prompt";

export type ModelUsageRecord = {
  purpose: string;
  modelClass: ModelClass;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  estimatedCost: number;
  durationMs: number;
  mock: boolean;
};

export type UsageSink = (usage: ModelUsageRecord) => Promise<void> | void;

export type StructuredRequest<S extends z.ZodType> = {
  purpose: string;
  modelClass: ModelClass;
  schema: S;
  schemaName: string;
  systemRules: string[];
  sections: PromptSection[];
  task: string;
  // Deterministic output used when no model credentials are configured (AI_MOCK or missing key).
  mock: () => z.infer<S>;
  onUsage?: UsageSink;
  maxAttempts?: number;
};

export class StructuredOutputError extends Error {
  constructor(message: string, readonly attempts: number) {
    super(message);
    this.name = "StructuredOutputError";
  }
}

export async function generateStructured<S extends z.ZodType>(req: StructuredRequest<S>): Promise<{
  object: z.infer<S>;
  usage: ModelUsageRecord;
}> {
  const started = Date.now();

  if (isMockMode(req.modelClass)) {
    const object = req.schema.parse(req.mock());
    const usage: ModelUsageRecord = {
      purpose: req.purpose,
      modelClass: req.modelClass,
      model: `mock:${modelIdFor(req.modelClass)}`,
      inputTokens: 0,
      outputTokens: 0,
      cachedInputTokens: 0,
      estimatedCost: 0,
      durationMs: Date.now() - started,
      mock: true,
    };
    await req.onUsage?.(usage);
    return { object, usage };
  }

  const { model, modelId } = resolveModel(req.modelClass);
  const system = [...req.systemRules, UNTRUSTED_CONTENT_RULE].join("\n\n");
  const basePrompt = `${renderSections(req.sections)}\n\n<task>\n${req.task}\n</task>`;
  const maxAttempts = req.maxAttempts ?? 3;

  let inputTokens = 0;
  let outputTokens = 0;
  let cachedInputTokens = 0;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const prompt =
      attempt === 1
        ? basePrompt
        : `${basePrompt}\n\n<previous_attempt_error>\nYour previous output did not match the required schema: ${String(
            (lastError as Error)?.message ?? lastError,
          ).slice(0, 800)}\nReturn output that matches the schema exactly.\n</previous_attempt_error>`;
    try {
      const result = await generateText({
        model,
        system,
        prompt,
        output: Output.object({ schema: req.schema, name: req.schemaName }),
      });
      inputTokens += result.totalUsage.inputTokens ?? 0;
      outputTokens += result.totalUsage.outputTokens ?? 0;
      cachedInputTokens += result.totalUsage.inputTokenDetails?.cacheReadTokens ?? 0;
      // Validate again: provider-side structured output is not a guarantee.
      const parsed = req.schema.safeParse(result.output);
      if (!parsed.success) {
        lastError = parsed.error;
        continue;
      }
      const usage = buildUsage(req, modelId, inputTokens, outputTokens, cachedInputTokens, started);
      await req.onUsage?.(usage);
      return { object: parsed.data, usage };
    } catch (error) {
      lastError = error;
      if (!isSchemaError(error)) {
        await req.onUsage?.(buildUsage(req, modelId, inputTokens, outputTokens, cachedInputTokens, started));
        throw error;
      }
    }
  }

  await req.onUsage?.(buildUsage(req, modelId, inputTokens, outputTokens, cachedInputTokens, started));
  throw new StructuredOutputError(
    `Model output for ${req.schemaName} failed validation after ${maxAttempts} attempts: ${String((lastError as Error)?.message ?? lastError)}`,
    maxAttempts,
  );
}

function isSchemaError(error: unknown): boolean {
  const name = (error as { name?: string })?.name ?? "";
  return name.includes("NoObjectGenerated") || name.includes("TypeValidation") || name.includes("JSONParse") || name === "ZodError";
}

function buildUsage(
  req: { purpose: string; modelClass: ModelClass },
  model: string,
  inputTokens: number,
  outputTokens: number,
  cachedInputTokens: number,
  started: number,
): ModelUsageRecord {
  return {
    purpose: req.purpose,
    modelClass: req.modelClass,
    model,
    inputTokens,
    outputTokens,
    cachedInputTokens,
    estimatedCost: estimateCostUsd(model, inputTokens, outputTokens, cachedInputTokens) ?? 0,
    durationMs: Date.now() - started,
    mock: false,
  };
}
