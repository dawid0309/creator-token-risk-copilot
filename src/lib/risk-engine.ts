import type {
  RedFlag,
  RiskAction,
  RiskDimension,
  RiskLevel,
  RiskReport,
  Token,
} from "../types";
import { clamp } from "./format";

function hasMissing(token: Token, signal: string) {
  return token.missingSignals.includes(signal);
}

function isEligible(token: Token, signal: string) {
  return token.coverageSummary.eligibleSignals.includes(signal);
}

function scoreHolderConcentration(token: Token) {
  if (!isEligible(token, "holders") || hasMissing(token, "holders")) return 45;
  return clamp(100 - Math.max(0, token.topHolderPercent - 15) * 1.8);
}

function scoreQuoteDepth(token: Token) {
  if (!isEligible(token, "market")) return 42;
  if (hasMissing(token, "marketLiquidity") || hasMissing(token, "marketVolume")) return 42;

  const liquidityToVolume = token.marketLiquidityUsd / Math.max(token.marketVolume24hUsd, 1);
  const volatilityPenalty = Math.abs(token.marketPriceChange24hPercent) * 0.55;
  const thinLiquidityPenalty =
    token.marketLiquidityUsd < 30000 ? 24 : token.marketLiquidityUsd < 80000 ? 12 : 0;
  const turnoverPenalty = liquidityToVolume < 0.45 ? 18 : liquidityToVolume < 0.8 ? 8 : 0;

  return clamp(100 - volatilityPenalty - thinLiquidityPenalty - turnoverPenalty);
}

function scoreMomentum(token: Token) {
  if (!isEligible(token, "momentum")) return 50;
  const feePenalty = hasMissing(token, "fees")
    ? 0
    : token.feeSpikeMultiple > 3
      ? 20
      : token.feeSpikeMultiple > 2
        ? 10
        : 0;
  const holderPenalty = hasMissing(token, "holderGrowth")
    ? 4
    : token.holderGrowth24hPercent < 0
      ? 16
      : 0;
  const overheatedPenalty =
    token.sentiment === "heated" && token.marketPriceChange24hPercent > 25 ? 18 : 0;
  const coolingPenalty =
    token.sentiment === "cooling" && token.marketPriceChange24hPercent < -10 ? 12 : 0;

  return clamp(100 - feePenalty - holderPenalty - overheatedPenalty - coolingPenalty);
}

function scoreLaunchConfidence(token: Token) {
  const agePenalty = token.ageDays < 4 ? 28 : token.ageDays < 10 ? 14 : 0;
  const metadataPenalty = Math.max(0, 80 - token.metadataCompleteness) * 0.8;
  const linkPenalty = token.verifiedLinks < 2 ? 14 : token.verifiedLinks < 3 ? 6 : 0;
  const livePenalty = token.isLive ? 0 : 8;

  return clamp(100 - agePenalty - metadataPenalty - linkPenalty - livePenalty);
}

export function getRiskLevel(score: number): RiskLevel {
  if (score >= 80) return "Low Risk";
  if (score >= 60) return "Moderate Risk";
  if (score >= 40) return "High Risk";
  return "Critical Risk";
}

function getAction(token: Token, score: number, flags: RedFlag[]): RiskAction {
  if (token.confidenceLevel === "low") return "Needs More Data";
  if (token.metadataCompleteness < 60 || token.missingSignals.length >= 3) return "Needs More Data";
  if (token.ageDays < 5) return "Needs More Data";
  if (score < 40 || flags.some((flag) => flag.severity === "critical")) return "High Caution";
  if (score < 70 || flags.some((flag) => flag.severity === "high")) return "Review Carefully";
  return "Monitor";
}

function detectRedFlags(token: Token): RedFlag[] {
  const flags: RedFlag[] = [];

  if (hasMissing(token, "holders")) {
    flags.push({
      id: "holders-missing",
      severity: "medium",
      title: "Holder coverage is partial",
      detail: "Available live signals are too thin to treat holder concentration as a strong conclusion.",
    });
  } else if (token.coverageSummary.chain !== "verified" && token.topHolderPercent > 0) {
    flags.push({
      id: "holders-low-confidence",
      severity: "medium",
      title: "Top-holder reading is low confidence",
      detail: `A ${token.topHolderPercent}% holder concentration signal is visible, but chain coverage is not strong enough to treat it as a verified extreme.`,
    });
  } else if (token.topHolderPercent > 55) {
    flags.push({
      id: "holder-critical",
      severity: "critical",
      title: "Top holder concentration is extreme",
      detail: `Available signals show ${token.topHolderPercent}% of supply clustered in the largest holder group.`,
    });
  } else if (token.topHolderPercent > 45) {
    flags.push({
      id: "holder-high",
      severity: "high",
      title: "Top holder concentration is high",
      detail: `Available signals show ${token.topHolderPercent}% top-holder concentration, which deserves manual review.`,
    });
  } else if (token.topHolderPercent > 32) {
    flags.push({
      id: "holder-medium",
      severity: "medium",
      title: "Ownership is somewhat concentrated",
      detail: `Available signals show ${token.topHolderPercent}% in the top holder cluster, which narrows the margin of safety.`,
    });
  }

  if (
    !isEligible(token, "market") ||
    hasMissing(token, "marketLiquidity") ||
    hasMissing(token, "marketVolume")
  ) {
    flags.push({
      id: "market-depth-missing",
      severity: "medium",
      title: "Real market coverage is incomplete",
      detail: "Liquidity or 24h volume could not be fully verified, so the review is conservative.",
    });
  } else if (token.marketLiquidityUsd < 30000 && Math.abs(token.marketPriceChange24hPercent) > 15) {
    flags.push({
      id: "thin-volatile",
      severity: "high",
      title: "Thin live liquidity with unstable 24h price change",
      detail: `${Math.abs(token.marketPriceChange24hPercent).toFixed(1)}% 24h change is happening on only $${Math.round(token.marketLiquidityUsd).toLocaleString()} of observed market liquidity.`,
    });
  }

  if (hasMissing(token, "fees")) {
    flags.push({
      id: "fees-missing",
      severity: "info",
      title: "Bags fee signals are not connected",
      detail: "Fee-based confidence checks are currently unavailable, so this review leans on thinner live coverage.",
    });
  } else if (token.feeSpikeMultiple > 3 && token.holderGrowth24hPercent < 20) {
    flags.push({
      id: "fee-spike",
      severity: "high",
      title: "Fee spike needs context",
      detail: `Fees are ${token.feeSpikeMultiple.toFixed(1)}x baseline without enough holder growth to confirm durable demand.`,
    });
  } else if (token.feeSpikeMultiple > 2) {
    flags.push({
      id: "fee-warming",
      severity: "medium",
      title: "Fee velocity is heating up",
      detail: `Fees are ${token.feeSpikeMultiple.toFixed(1)}x baseline, so the move may be crowded.`,
    });
  }

  if (token.ageDays < 5) {
    flags.push({
      id: "young-token",
      severity: "medium",
      title: "Limited launch history",
      detail: `This token appears to be only ${token.ageDays} days old, so the available signal window is still thin.`,
    });
  }

  if (token.metadataCompleteness < 65) {
    flags.push({
      id: "metadata",
      severity: "medium",
      title: "Project metadata is incomplete",
      detail: `Metadata completeness is ${token.metadataCompleteness}/100, which makes verification harder for new users.`,
    });
  }

  if (
    !hasMissing(token, "holderGrowth") &&
    token.holderGrowth24hPercent < 0 &&
    token.marketPriceChange24hPercent < -10
  ) {
    flags.push({
      id: "cooling",
      severity: "medium",
      title: "Holder and market momentum are both cooling",
      detail: `Holder growth is ${token.holderGrowth24hPercent.toFixed(1)}% while 24h price change is down ${Math.abs(token.marketPriceChange24hPercent).toFixed(1)}%.`,
    });
  }

  if (flags.length === 0) {
    flags.push({
      id: "stable",
      severity: "info",
      title: "No major red flag detected",
      detail: "Available signals look balanced right now, but continued monitoring is still useful.",
    });
  }

  const rank: Record<RedFlag["severity"], number> = { critical: 0, high: 1, medium: 2, info: 3 };
  return flags.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

function buildSummary(token: Token, report: Omit<RiskReport, "summary">) {
  const topFlag = report.redFlags[0];
  const weakest = report.dimensions.reduce((lowest: RiskDimension, dimension: RiskDimension) =>
    dimension.score < lowest.score ? dimension : lowest,
  );
  const confidenceLine =
    token.confidenceLevel === "low"
      ? "Coverage is too thin for a strong conclusion."
      : token.confidenceLevel === "medium"
        ? "Coverage is partial, so the readout should be treated as an initial screen."
        : "Coverage is broad enough for a stronger first-pass review.";
  const scoreLine = `${token.name} is currently marked ${report.level.toLowerCase()} with a ${report.score}/100 rule-based review based on available live signals.`;
  const weaknessLine = `The weakest area based on available signals is ${weakest.label.toLowerCase()} at ${weakest.score}/100.`;
  const flagLine =
    topFlag.severity === "info"
      ? "No severe warning is visible in the current signal set, but some indicators may still be incomplete."
      : `${topFlag.title}: ${topFlag.detail}`;
  const actionLine = `Suggested next step: ${report.action.toLowerCase()}, not a buy or sell decision.`;

  return `${scoreLine} ${confidenceLine} ${weaknessLine} ${flagLine} ${actionLine}`;
}

export function analyzeToken(token: Token): RiskReport {
  const dimensions: RiskDimension[] = [
    {
      id: "holders",
      label: "Holder concentration",
      score: Math.round(scoreHolderConcentration(token)),
      weighting: isEligible(token, "holders") ? "primary" : "informational",
      detail: hasMissing(token, "holders")
        ? "Top-holder ownership is only partially available from the current live sources."
        : `${token.topHolderPercent}% controlled by the largest holder cluster.`,
    },
    {
      id: "liquidity",
      label: "Market liquidity",
      score: Math.round(scoreQuoteDepth(token)),
      weighting: isEligible(token, "market") ? "primary" : "informational",
      detail:
        !isEligible(token, "market") ||
        hasMissing(token, "marketLiquidity") ||
        hasMissing(token, "marketVolume")
          ? "Real market liquidity or volume is incomplete, so this score is conservative."
          : `$${Math.round(token.marketLiquidityUsd).toLocaleString()} market liquidity vs $${Math.round(token.marketVolume24hUsd).toLocaleString()} 24h volume.`,
    },
    {
      id: "momentum",
      label: "Momentum stability",
      score: Math.round(scoreMomentum(token)),
      weighting: isEligible(token, "momentum") ? "primary" : "informational",
      detail: hasMissing(token, "fees")
        ? `${token.marketPriceChange24hPercent.toFixed(1)}% 24h price change with Bags fee signals currently unavailable.`
        : `${token.marketPriceChange24hPercent.toFixed(1)}% 24h price change and ${token.feeSpikeMultiple.toFixed(1)}x fee velocity.`,
    },
    {
      id: "launch",
      label: "Launch confidence",
      score: Math.round(scoreLaunchConfidence(token)),
      weighting: "primary",
      detail: `${token.ageDays} days old with ${token.metadataCompleteness}/100 metadata completeness.`,
    },
  ];

  const dimensionWeights: Record<string, number> = {
    holders: 0.3,
    liquidity: 0.34,
    momentum: 0.24,
    launch: 0.12,
  };
  const weighted = dimensions.map((dimension) => {
    const baseWeight = dimensionWeights[dimension.id] ?? 0;
    const appliedWeight = dimension.weighting === "primary" ? baseWeight : 0.06;
    return {
      score: dimension.score,
      weight: appliedWeight,
    };
  });
  const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0);
  const weightedScore = Math.round(
    weighted.reduce((sum, item) => sum + item.score * item.weight, 0) / Math.max(totalWeight, 0.18),
  );
  const redFlags = detectRedFlags(token);
  const level = getRiskLevel(weightedScore);
  const action = getAction(token, weightedScore, redFlags);
  const reportWithoutSummary = {
    tokenId: token.id,
    score: weightedScore,
    level,
    action,
    confidenceLevel: token.confidenceLevel,
    dimensions,
    redFlags,
  };

  return {
    ...reportWithoutSummary,
    summary: buildSummary(token, reportWithoutSummary),
  };
}
