import { describe, expect, it } from "vitest";
import { getApprovalBlockers, getFollowUpAction, isApprovalEligible } from "../src/lib/review-policy";
import type { Token } from "../src/types";

function makeToken(overrides: Partial<Token> = {}): Token {
  return {
    id: "mint-1",
    mintAddress: "mint-1",
    name: "Token One",
    symbol: "ONE",
    creator: "creator",
    category: "Bags creator token",
    ageDays: 14,
    holders: 2400,
    topHolderPercent: 24,
    marketPriceUsd: 1.2,
    marketLiquidityUsd: 100_000,
    marketVolume24hUsd: 50_000,
    marketPriceChange24hPercent: 8,
    marketPairAddress: "pair-1",
    marketPairCreatedAt: 1710000000000,
    quoteDepthUsd: 100_000,
    quoteVolume24hUsd: 50_000,
    quoteImpactPercent: 8,
    feeVelocityUsd: 1200,
    feeSpikeMultiple: 1.4,
    holderGrowth24hPercent: 2,
    metadataCompleteness: 72,
    verifiedLinks: 2,
    sentiment: "warming",
    history: [],
    isLive: true,
    sourceTags: ["bags", "market"],
    missingSignals: [],
    confidenceLevel: "high",
    coverageSummary: {
      chain: "verified",
      bags: "verified",
      market: "verified",
      history: "verified",
      eligibleSignals: ["holders", "market", "momentum", "launch", "history"],
      flags: [],
    },
    historySource: "real-snapshots",
    historyPointCount: 4,
    reviewStatus: "unreviewed",
    isCurated: true,
    reviewPriority: 640,
    approvalEligible: true,
    approvalBlockers: [],
    sourceLabel: "Hybrid live signals",
    ...overrides,
  };
}

describe("review approval policy", () => {
  it("blocks approval when history is still collecting", () => {
    const token = makeToken({
      historySource: "collecting",
      historyPointCount: 1,
      coverageSummary: {
        chain: "verified",
        bags: "verified",
        market: "verified",
        history: "missing",
        eligibleSignals: ["holders", "market", "momentum", "launch"],
        flags: ["history-collecting"],
      },
    });

    expect(isApprovalEligible(token)).toBe(false);
    expect(getApprovalBlockers(token)).toContain("Needs real history");
  });

  it("blocks approval when holder concentration is still partial", () => {
    const token = makeToken({
      topHolderPercent: 100,
      coverageSummary: {
        chain: "partial",
        bags: "verified",
        market: "verified",
        history: "verified",
        eligibleSignals: ["market", "momentum", "launch", "history"],
        flags: ["holders-thin"],
      },
      missingSignals: ["topHolderPercent"],
    });

    expect(isApprovalEligible(token)).toBe(false);
    expect(getApprovalBlockers(token)).toContain("Top-holder concentration is still partial");
  });

  it("maps hold with history blockers to watch_for_more_history", () => {
    expect(getFollowUpAction("Hold", ["Needs real history"])).toBe("watch_for_more_history");
  });

  it("maps approve to creator_outreach", () => {
    expect(getFollowUpAction("Approve", [])).toBe("creator_outreach");
  });
});
