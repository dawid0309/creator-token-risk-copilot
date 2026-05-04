import { describe, expect, it } from "vitest";
import { analyzeToken } from "../src/lib/risk-engine";
import type { Token } from "../src/types";

function makeToken(overrides: Partial<Token> = {}): Token {
  return {
    id: "mint-1",
    mintAddress: "mint-1",
    name: "Token One",
    symbol: "ONE",
    creator: "creator",
    category: "Bags pool discovery",
    ageDays: 14,
    holders: 0,
    topHolderPercent: 0,
    marketPriceUsd: 1.2,
    marketLiquidityUsd: 100_000,
    marketVolume24hUsd: 50_000,
    marketPriceChange24hPercent: 8,
    marketPairAddress: "pair-1",
    marketPairCreatedAt: 1710000000000,
    quoteDepthUsd: 100_000,
    quoteVolume24hUsd: 50_000,
    quoteImpactPercent: 8,
    feeVelocityUsd: 0,
    feeSpikeMultiple: 1,
    holderGrowth24hPercent: 2,
    metadataCompleteness: 72,
    verifiedLinks: 2,
    sentiment: "warming",
    history: [],
    isLive: true,
    sourceTags: ["bags", "market"],
    missingSignals: ["holders"],
    confidenceLevel: "medium",
    coverageSummary: {
      chain: "missing",
      bags: "partial",
      market: "verified",
      history: "missing",
      eligibleSignals: ["market", "launch"],
      flags: ["holders-thin", "bags-partial"],
    },
    historySource: "collecting",
    historyPointCount: 0,
    reviewStatus: "unreviewed",
    isCurated: false,
    reviewPriority: 180,
    sourceLabel: "Bags + market stats",
    ...overrides,
  };
}

describe("hybrid live token behavior", () => {
  it("keeps market-enriched bags discovery tokens analyzable", () => {
    const token = makeToken();
    const report = analyzeToken(token);

    expect(token.quoteDepthUsd).toBeGreaterThan(0);
    expect(token.quoteVolume24hUsd).toBeGreaterThan(0);
    expect(report.score).toBeGreaterThanOrEqual(0);
    expect(report.score).toBeLessThanOrEqual(100);
  });

  it("treats holder-missing live tokens as degraded, not broken", () => {
    const token = makeToken({
      sourceTags: ["solana", "market"],
      sourceLabel: "Live Solana + market stats",
      missingSignals: ["holders", "fees", "holderGrowth"],
    });
    const report = analyzeToken(token);

    expect(report.redFlags.some((flag) => flag.id === "holders-missing")).toBe(true);
    expect(report.summary.toLowerCase()).toContain("available signals");
  });

  it("does not look like sample fallback when live market fields exist", () => {
    const token = makeToken({
      isLive: true,
      sourceTags: ["bags", "market"],
      sourceLabel: "Hybrid live signals",
    });

    expect(token.isLive).toBe(true);
    expect(token.sourceTags).toContain("bags");
    expect(token.sourceTags).toContain("market");
    expect(token.sourceLabel).not.toBe("Sample fallback");
  });

  it("marks thin quote probes as low confidence", () => {
    const token = makeToken({
      quoteDepthUsd: 100,
      quoteVolume24hUsd: 0,
      confidenceLevel: "low",
      coverageSummary: {
        chain: "missing",
        bags: "missing",
        market: "partial",
        history: "missing",
        eligibleSignals: ["launch"],
        flags: ["quote-depth-probe-thin", "quote-volume-missing"],
      },
      missingSignals: ["holders", "volume", "fees"],
    });
    const report = analyzeToken(token);

    expect(report.confidenceLevel).toBe("low");
    expect(report.action).toBe("Needs More Data");
  });

  it("treats suspicious holder extremes as degraded rather than verified", () => {
    const token = makeToken({
      holders: 120,
      topHolderPercent: 100,
      coverageSummary: {
        chain: "partial",
        bags: "verified",
        market: "verified",
        history: "missing",
        eligibleSignals: ["market", "momentum", "launch"],
        flags: ["holders-thin"],
      },
      missingSignals: ["holders", "topHolderPercent"],
    });
    const report = analyzeToken(token);

    expect(report.redFlags.some((flag) => flag.id === "holders-missing" || flag.id === "holders-low-confidence")).toBe(true);
    expect(report.redFlags.some((flag) => flag.id === "holder-critical")).toBe(false);
  });

  it("supports review queue metadata on live tokens", () => {
    const token = makeToken({
      reviewStatus: "approved",
      isCurated: true,
      reviewPriority: 640,
    });

    expect(token.reviewStatus).toBe("approved");
    expect(token.isCurated).toBe(true);
    expect(token.reviewPriority).toBeGreaterThan(0);
  });
});
