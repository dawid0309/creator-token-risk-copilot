import { describe, expect, it } from "vitest";
import {
  buildReviewSignatureMessage,
  matchesReviewSignatureMessage,
} from "./review-signing";

const baseInput = {
  mintAddress: "mint-123",
  decision: "Approve" as const,
  reviewNotes: "Approve after checking live liquidity.",
  reviewedByWallet: "wallet-abc",
  timestamp: "2026-05-05T00:00:00.000Z",
};

describe("review signing message", () => {
  it("accepts the canonical message", () => {
    const signedMessage = buildReviewSignatureMessage(baseInput);

    expect(matchesReviewSignatureMessage({ ...baseInput, signedMessage })).toBe(true);
  });

  it("rejects a message when the decision is changed after signing", () => {
    const signedMessage = buildReviewSignatureMessage(baseInput);

    expect(
      matchesReviewSignatureMessage({
        ...baseInput,
        decision: "Hold",
        signedMessage,
      }),
    ).toBe(false);
  });

  it("rejects a message when the review note is changed after signing", () => {
    const signedMessage = buildReviewSignatureMessage(baseInput);

    expect(
      matchesReviewSignatureMessage({
        ...baseInput,
        reviewNotes: "Escalate after checking live liquidity.",
        signedMessage,
      }),
    ).toBe(false);
  });

  it("rejects a message when the mint address is changed after signing", () => {
    const signedMessage = buildReviewSignatureMessage(baseInput);

    expect(
      matchesReviewSignatureMessage({
        ...baseInput,
        mintAddress: "mint-456",
        signedMessage,
      }),
    ).toBe(false);
  });

  it("rejects an arbitrary signed message", () => {
    expect(
      matchesReviewSignatureMessage({
        ...baseInput,
        signedMessage: "signed any text",
      }),
    ).toBe(false);
  });
});
