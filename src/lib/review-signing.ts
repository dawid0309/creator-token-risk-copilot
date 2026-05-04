import type { ReviewDecision } from "../types";

export type ReviewSignatureMessageInput = {
  mintAddress: string;
  decision: ReviewDecision;
  reviewNotes: string;
  reviewedByWallet: string;
  timestamp: string;
};

function normalizeLineEndings(value: string) {
  return value.replace(/\r\n/g, "\n");
}

export function normalizeReviewNotes(reviewNotes: string) {
  return normalizeLineEndings(reviewNotes).trim();
}

export function normalizeSignedMessage(signedMessage: string) {
  return normalizeLineEndings(signedMessage).trim();
}

export function buildReviewSignatureMessage(input: ReviewSignatureMessageInput) {
  return [
    "Creator Token Risk Copilot",
    "Action: creator launch review",
    `Mint: ${input.mintAddress.trim()}`,
    `Decision: ${input.decision}`,
    `Reviewer Wallet: ${input.reviewedByWallet.trim()}`,
    `Timestamp: ${input.timestamp.trim()}`,
    `Review Note: ${normalizeReviewNotes(input.reviewNotes)}`,
  ].join("\n");
}

export function matchesReviewSignatureMessage(
  input: ReviewSignatureMessageInput & { signedMessage: string },
) {
  return normalizeSignedMessage(input.signedMessage) === buildReviewSignatureMessage(input);
}
