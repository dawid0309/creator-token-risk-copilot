import { describe, expect, it } from "vitest";
import { tokens } from "../data/tokens";
import type { Token } from "../types";
import { evaluateAlert } from "./alerts";
import { analyzeToken, getRiskLevel } from "./risk-engine";

function makeLiveToken(overrides: Partial<Token> = {}): Token {
  return {
    ...tokens[0],
    id: "live-test-token",
    mintAddress: "So11111111111111111111111111111111111111112",
    name: "Live Test Token",
    symbol: "LIVE",
    creator: "live",
    category: "Live market token",
    marketPriceUsd: 1,
    marketLiquidityUsd: 180000,
    marketVolume24hUsd: 92000,
    marketPriceChange24hPercent: 6.5,
    marketPairAddress: "test-pair",
    marketPairCreatedAt: 1710000000000,
    isLive: true,
    sourceTags: ["solana"],
    missingSignals: [],
    confidenceLevel: "high",
    coverageSummary: {
      chain: "verified",
      bags: "verified",
      market: "verified",
      history: "verified",
      eligibleSignals: ["holders", "market", "momentum", "launch"],
      flags: [],
    },
    historySource: "real-snapshots",
    historyPointCount: 7,
    reviewStatus: "unreviewed",
    isCurated: true,
    reviewPriority: 520,
    sourceLabel: "Live Solana + market stats",
    ...overrides,
  };
}

describe("risk engine", () => {
  it("keeps scores inside the 0-100 range", () => {
    for (const token of tokens) {
      const report = analyzeToken(token);

      expect(report.score).toBeGreaterThanOrEqual(0);
      expect(report.score).toBeLessThanOrEqual(100);
      for (const dimension of report.dimensions) {
        expect(dimension.score).toBeGreaterThanOrEqual(0);
        expect(dimension.score).toBeLessThanOrEqual(100);
      }
    }
  });

  it("flags concentrated holders", () => {
    const report = analyzeToken(tokens.find((token) => token.id === "meme-rush")!);

    expect(report.redFlags.some((flag) => flag.id === "holder-critical")).toBe(true);
  });

  it("uses expected risk level boundaries", () => {
    expect(getRiskLevel(85)).toBe("Low Risk");
    expect(getRiskLevel(65)).toBe("Moderate Risk");
    expect(getRiskLevel(45)).toBe("High Risk");
    expect(getRiskLevel(20)).toBe("Critical Risk");
  });

  it("marks young incomplete launches as needing more data", () => {
    const report = analyzeToken(tokens.find((token) => token.id === "meme-rush")!);

    expect(report.action).toBe("Needs More Data");
  });

  it("keeps stronger tokens comparatively calmer", () => {
    const strong = analyzeToken(tokens.find((token) => token.id === "token-sight")!);
    const risky = analyzeToken(tokens.find((token) => token.id === "privybag")!);

    expect(strong.score).toBeGreaterThan(risky.score);
    expect(strong.redFlags.filter((flag) => flag.severity !== "info").length).toBeLessThan(
      risky.redFlags.filter((flag) => flag.severity !== "info").length,
    );
  });

  it("evaluates alert presets against live report values", () => {
    const token = tokens.find((item) => item.id === "meme-rush")!;
    const report = analyzeToken(token);

    expect(evaluateAlert("score", token, report).triggered).toBe(true);
    expect(evaluateAlert("volatility", token, report).triggered).toBe(true);
    expect(evaluateAlert("holders", token, report).triggered).toBe(true);
    expect(evaluateAlert("fees", token, report).triggered).toBe(true);
  });

  it("handles missing live fee and holder signals without throwing", () => {
    const report = analyzeToken(
      makeLiveToken({
        feeSpikeMultiple: 0,
        feeVelocityUsd: 0,
        holderGrowth24hPercent: 0,
        missingSignals: ["fees", "holderGrowth"],
        coverageSummary: {
          chain: "verified",
          bags: "missing",
          market: "verified",
          history: "partial",
          eligibleSignals: ["holders", "market", "launch"],
          flags: ["bags-thin"],
        },
        confidenceLevel: "medium",
        historyPointCount: 2,
        historySource: "collecting",
      }),
    );

    expect(report.score).toBeGreaterThanOrEqual(0);
    expect(report.redFlags.some((flag) => flag.id === "fees-missing")).toBe(true);
  });

  it("uses conservative messaging when liquidity signals are missing", () => {
    const report = analyzeToken(
      makeLiveToken({
        quoteDepthUsd: 0,
        quoteVolume24hUsd: 0,
        marketLiquidityUsd: 0,
        marketVolume24hUsd: 0,
        missingSignals: ["liquidity", "volume"],
        coverageSummary: {
          chain: "verified",
          bags: "partial",
          market: "missing",
          history: "missing",
          eligibleSignals: ["holders", "launch"],
          flags: ["market-thin", "quote-thin", "quote-volume-missing"],
        },
        confidenceLevel: "low",
        historyPointCount: 0,
        historySource: "collecting",
      }),
    );

    expect(report.summary.toLowerCase()).toContain("available signals");
    expect(report.dimensions.find((item) => item.id === "liquidity")?.detail).toContain("incomplete");
  });

  it("gates weak live probes and falls back to needs more data", () => {
    const report = analyzeToken(
      makeLiveToken({
        topHolderPercent: 100,
        marketLiquidityUsd: 0,
        marketVolume24hUsd: 0,
        quoteDepthUsd: 100,
        quoteVolume24hUsd: 0,
        missingSignals: ["holders", "volume", "fees", "holderGrowth"],
        coverageSummary: {
          chain: "missing",
          bags: "missing",
          market: "missing",
          history: "missing",
          eligibleSignals: ["launch"],
          flags: ["holders-thin", "market-thin", "quote-depth-probe-thin", "quote-volume-missing"],
        },
        confidenceLevel: "low",
        historyPointCount: 0,
        historySource: "collecting",
      }),
    );

    expect(report.action).toBe("Needs More Data");
    expect(report.confidenceLevel).toBe("low");
    expect(report.redFlags.some((flag) => flag.id === "holders-low-confidence" || flag.id === "holders-missing")).toBe(true);
  });

  it("does not treat suppressed holder extremes as verified concentration", () => {
    const report = analyzeToken(
      makeLiveToken({
        holders: 0,
        topHolderPercent: 0,
        missingSignals: ["holders", "topHolderPercent"],
        coverageSummary: {
          chain: "partial",
          bags: "verified",
          market: "verified",
          history: "partial",
          eligibleSignals: ["market", "momentum", "launch"],
          flags: ["holders-thin"],
        },
        confidenceLevel: "medium",
      }),
    );

    expect(report.redFlags.some((flag) => flag.id === "holder-critical")).toBe(false);
    expect(report.redFlags.some((flag) => flag.id === "holders-missing")).toBe(true);
  });
});
