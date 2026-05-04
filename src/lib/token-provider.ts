import { loadTokenFeedRequest } from "./api";
import type { RiskLevel, TokenFeed } from "../types";

export async function loadTokenFeed(options?: {
  query?: string;
  riskLevel?: RiskLevel | "All levels";
}) {
  const feed = await loadTokenFeedRequest({
    mode: "review",
    query: options?.query,
    riskLevel: options?.riskLevel,
  });

  return feed as TokenFeed;
}
