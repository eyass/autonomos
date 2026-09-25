import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

// Business logic refers to model classes, never to vendor model names (PRD section 60).
export type ModelClass = "FAST_MODEL" | "SMART_MODEL" | "AGENT_MODEL";
export type Provider = "anthropic" | "openai";

const DEFAULTS: Record<Provider, Record<ModelClass, string>> = {
  anthropic: {
    FAST_MODEL: "claude-haiku-4-5",
    SMART_MODEL: "claude-opus-5",
    AGENT_MODEL: "claude-opus-5",
  },
  openai: {
    FAST_MODEL: "gpt-5-mini",
    SMART_MODEL: "gpt-5",
    AGENT_MODEL: "gpt-5",
  },
};

// USD per million tokens. Anthropic first-party list prices. Cache reads are billed at 0.1x input.
// Override or extend with AI_MODEL_PRICING='{"model-id":{"input":1,"output":5,"cachedInput":0.1}}'.
const PRICING: Record<string, { input: number; output: number; cachedInput: number }> = {
  "claude-haiku-4-5": { input: 1, output: 5, cachedInput: 0.1 },
  "claude-sonnet-5": { input: 2, output: 10, cachedInput: 0.2 },
  "claude-opus-5": { input: 5, output: 25, cachedInput: 0.5 },
};

function pricingTable() {
  const raw = process.env.AI_MODEL_PRICING;
  if (!raw) return PRICING;
  try {
    return { ...PRICING, ...(JSON.parse(raw) as typeof PRICING) };
  } catch {
    return PRICING;
  }
}

export function providerFor(modelClass: ModelClass): Provider {
  const specific = process.env[`AI_${modelClass}_PROVIDER`];
  const provider = (specific ?? process.env.AI_PROVIDER ?? "anthropic") as Provider;
  return provider === "openai" ? "openai" : "anthropic";
}

export function modelIdFor(modelClass: ModelClass): string {
  return process.env[`AI_${modelClass}`] ?? DEFAULTS[providerFor(modelClass)][modelClass];
}

export function isMockMode(modelClass: ModelClass = "SMART_MODEL"): boolean {
  if (process.env.AI_MOCK === "1" || process.env.AI_MOCK === "true") return true;
  const provider = providerFor(modelClass);
  return provider === "anthropic" ? !process.env.ANTHROPIC_API_KEY : !process.env.OPENAI_API_KEY;
}

export function resolveModel(modelClass: ModelClass): { model: LanguageModel; modelId: string } {
  const modelId = modelIdFor(modelClass);
  const provider = providerFor(modelClass);
  const model = provider === "openai" ? createOpenAI()(modelId) : createAnthropic()(modelId);
  return { model, modelId };
}

export function estimateCostUsd(modelId: string, inputTokens: number, outputTokens: number, cachedInputTokens = 0): number | null {
  const price = pricingTable()[modelId];
  if (!price) return null;
  const uncached = Math.max(inputTokens - cachedInputTokens, 0);
  return (uncached * price.input + cachedInputTokens * price.cachedInput + outputTokens * price.output) / 1_000_000;
}
