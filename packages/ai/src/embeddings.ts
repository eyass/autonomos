import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { embedMany } from "ai";

// Vectors for searching company knowledge by meaning. Gemini by default (also for workspaces
// that write with Anthropic, which has no embedding model), OpenAI when AI_PROVIDER=openai.
// Without credentials (AI_MOCK, tests, local dev) a deterministic vector stands in, so similar
// words still land close together and search works end to end.

export const EMBEDDING_DIMENSIONS = 768;
const BATCH = 100;

export type EmbeddingKind = "document" | "query";

function embeddingProvider(): "google" | "openai" | "mock" {
  if (process.env.AI_MOCK === "1" || process.env.AI_MOCK === "true") return "mock";
  if (process.env.AI_PROVIDER === "openai" && process.env.OPENAI_API_KEY) return "openai";
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) return "google";
  if (process.env.OPENAI_API_KEY) return "openai";
  return "mock";
}

export const embeddingModelId = () => ({ google: "gemini-embedding-001", openai: "text-embedding-3-small", mock: "mock-embedding" })[embeddingProvider()];

export async function embedTexts(texts: string[], kind: EmbeddingKind): Promise<number[][]> {
  if (!texts.length) return [];
  const provider = embeddingProvider();
  if (provider === "mock") return texts.map(mockVector);
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH) {
    const values = texts.slice(i, i + BATCH).map((t) => t.slice(0, 8000));
    const { embeddings } =
      provider === "google"
        ? await embedMany({
            model: createGoogleGenerativeAI().textEmbeddingModel("gemini-embedding-001"),
            values,
            providerOptions: { google: { outputDimensionality: EMBEDDING_DIMENSIONS, taskType: kind === "query" ? "RETRIEVAL_QUERY" : "RETRIEVAL_DOCUMENT" } },
            maxRetries: 3,
          })
        : await embedMany({
            model: createOpenAI().textEmbeddingModel("text-embedding-3-small"),
            values,
            providerOptions: { openai: { dimensions: EMBEDDING_DIMENSIONS } },
            maxRetries: 3,
          });
    out.push(...embeddings.map(normalise));
  }
  return out;
}

function normalise(v: number[]): number[] {
  const n = Math.hypot(...v) || 1;
  return v.map((x) => x / n);
}

// Hashed bag of word stems: texts that share words point the same way.
export function mockVector(text: string): number[] {
  const v = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
  for (const word of text.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []) {
    const stem = word.slice(0, 6);
    let h = 2166136261;
    for (let i = 0; i < stem.length; i++) h = Math.imul(h ^ stem.charCodeAt(i), 16777619) >>> 0;
    v[h % EMBEDDING_DIMENSIONS]! += 1;
  }
  return normalise(v);
}
