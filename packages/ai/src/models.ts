import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

// Business logic refers to model classes, never to vendor model names (PRD section 60).
export type ModelClass = "FAST_MODEL" | "SMART_MODEL" | "AGENT_MODEL";
export type Provider = "anthropic" | "openai" | "google";

const DEFAULTS: Record<Provider, Record<ModelClass, string>> = {
  anthropic: {
    FAST_MODEL: "claude-haiku-4-5",
    SMART_MODEL: "claude-opus-5",
    AGENT_MODEL: "claude-opus-5",
  },
  google: {
    FAST_MODEL: "gemini-3.5-flash-lite",
    SMART_MODEL: "gemini-3.8-flash",
    AGENT_MODEL: "gemini-3.8-flash",
  },
  openai: {
    FAST_MODEL: "gpt-5-mini",
    SMART_MODEL: "gpt-5",
    AGENT_MODEL: "gpt-5",
  },
};

// USD per million tokens, standard paid tier. Anthropic: first-party list prices, cache reads 0.1x input.
// Gemini: ai.google.dev/gemini-api/docs/pricing as of 2026-09-26 (prompts up to 200k tokens).
// Gemini 3.7 and 3.8 Flash prices are introductory until 2026-12-31 and double on 2027-01-01.
// Override or extend with AI_MODEL_PRICING='{"model-id":{"input":1,"output":5,"cachedInput":0.1}}'.
const PRICING: Record<string, { input: number; output: number; cachedInput: number }> = {
  "claude-haiku-4-5": { input: 1, output: 5, cachedInput: 0.1 },
  "claude-sonnet-5": { input: 2, output: 10, cachedInput: 0.2 },
  "claude-opus-5": { input: 5, output: 25, cachedInput: 0.5 },
  "gemini-3.8-flash": { input: 0.75, output: 3.75, cachedInput: 0.075 },
  "gemini-3.7-flash": { input: 0.75, output: 3.75, cachedInput: 0.075 },
  "gemini-3.5-flash": { input: 1.5, output: 9, cachedInput: 0.15 },
  "gemini-3.5-flash-lite": { input: 0.3, output: 2.5, cachedInput: 0.03 },
  "gemini-3.1-flash-lite": { input: 0.25, output: 1.5, cachedInput: 0.025 },
  "gemini-3.1-pro-preview": { input: 2, output: 12, cachedInput: 0.2 },
  "gemini-2.5-pro": { input: 1.25, output: 10, cachedInput: 0.125 },
  "gemini-2.5-flash": { input: 0.3, output: 2.5, cachedInput: 0.03 },
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
  const provider = specific ?? process.env.AI_PROVIDER ?? "google";
  return provider === "openai" || provider === "anthropic" ? provider : "google";
}

export function modelIdFor(modelClass: ModelClass): string {
  return process.env[`AI_${modelClass}`] ?? DEFAULTS[providerFor(modelClass)][modelClass];
}

export function isMockMode(modelClass: ModelClass = "SMART_MODEL"): boolean {
  if (process.env.AI_MOCK === "1" || process.env.AI_MOCK === "true") return true;
  const provider = providerFor(modelClass);
  const key = { anthropic: "ANTHROPIC_API_KEY", openai: "OPENAI_API_KEY", google: "GOOGLE_GENERATIVE_AI_API_KEY" }[provider];
  return !process.env[key];
}

export function resolveModel(modelClass: ModelClass): { model: LanguageModel; modelId: string } {
  const modelId = modelIdFor(modelClass);
  const provider = providerFor(modelClass);
  const model =
    provider === "openai" ? createOpenAI()(modelId) : provider === "google" ? createGoogleGenerativeAI()(modelId) : createAnthropic()(modelId);
  return { model, modelId };
}

export function estimateCostUsd(modelId: string, inputTokens: number, outputTokens: number, cachedInputTokens = 0): number | null {
  const price = pricingTable()[modelId];
  if (!price) return null;
  const uncached = Math.max(inputTokens - cachedInputTokens, 0);
  return (uncached * price.input + cachedInputTokens * price.cachedInput + outputTokens * price.output) / 1_000_000;
}
