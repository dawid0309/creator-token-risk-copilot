import { tokens as sampleTokens } from "../src/data/tokens.ts";
import type { FeedMode, ProviderStatus, TokenFeedResponse } from "../src/types.ts";

export function createSampleFeed(mode: FeedMode, reason: string, providerStatus: ProviderStatus[]): TokenFeedResponse {
  return {
    items: sampleTokens,
    sourceLabel: "Sample fallback dataset",
    sourceKind: "static-sample",
    updatedAt: new Date().toISOString(),
    isLive: false,
    mode,
    demoMode: "sample",
    queueLabel: mode === "review" ? "Sample Review Queue" : undefined,
    fallbackUsed: true,
    description: reason,
    providerStatus,
  };
}
