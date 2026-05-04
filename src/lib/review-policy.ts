import type { ReviewDecision, Token } from "../types";

function hasMissing(token: Token, signal: string) {
  return token.missingSignals.includes(signal);
}

export function getApprovalBlockers(token: Token) {
  const blockers: string[] = [];

  if (!token.isLive) blockers.push("Needs live provider evidence");
  if (token.sourceTags.includes("sample")) blockers.push("Sample fallback is not approval evidence");
  if (token.coverageSummary.market !== "verified") blockers.push("Needs verified market stats");
  if (token.coverageSummary.chain === "missing") blockers.push("Needs chain holder coverage");
  if (token.historySource !== "real-snapshots" || token.historyPointCount < 3) {
    blockers.push("Needs real history");
  }
  if (token.confidenceLevel === "low") blockers.push("Confidence is still low");
  if (hasMissing(token, "marketLiquidity")) blockers.push("Needs market liquidity coverage");
  if (hasMissing(token, "marketVolume")) blockers.push("Needs 24h market volume coverage");
  if (hasMissing(token, "marketPriceChange")) blockers.push("Needs 24h market change coverage");
  if (hasMissing(token, "holders")) blockers.push("Holder coverage is still partial");
  if (hasMissing(token, "topHolderPercent")) blockers.push("Top-holder concentration is still partial");
  if (token.coverageSummary.chain !== "verified" && token.topHolderPercent > 0) {
    blockers.push("Holder concentration is not verified");
  }

  return Array.from(new Set(blockers));
}

export function isApprovalEligible(token: Token) {
  return getApprovalBlockers(token).length === 0;
}

export function getFollowUpAction(
  decision: ReviewDecision,
  blockers: string[],
): "creator_outreach" | "watch_for_more_history" | "manual_fee_review" | "escalation_review" {
  if (decision === "Approve") return "creator_outreach";
  if (decision === "Escalate") return "escalation_review";
  if (blockers.some((blocker) => blocker.toLowerCase().includes("history"))) {
    return "watch_for_more_history";
  }
  return "manual_fee_review";
}

export function getFollowUpChecklist(
  decision: ReviewDecision,
  blockers: string[],
) {
  const action = getFollowUpAction(decision, blockers);
  if (action === "creator_outreach") {
    return [
      "Confirm creator identity and launch context.",
      "Share the approval-ready evidence snapshot with the creator team.",
      "Track next launch milestone and fee behavior after follow-up.",
    ];
  }
  if (action === "watch_for_more_history") {
    return [
      "Collect at least 3 real snapshot history points.",
      "Re-check market liquidity and 24h volume after more live history arrives.",
      "Re-open approval review only after history blockers clear.",
    ];
  }
  if (action === "manual_fee_review") {
    return [
      "Review Bags fee velocity against current holder growth.",
      "Re-check holder concentration and missing chain signals.",
      "Decide whether evidence is strong enough for approval or escalation.",
    ];
  }
  return [
    "Escalate the candidate to manual review.",
    "Attach the saved evidence snapshot and reviewer note.",
    "Resolve approval blockers before any creator outreach.",
  ];
}
