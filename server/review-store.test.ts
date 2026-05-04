import { describe, expect, it } from "vitest";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { refreshReviewsFromDisk } from "./review-store";

const reviewPath = path.resolve("server/state/reviews.json");

describe("review store reload", () => {
  it("normalizes legacy records that are missing newer workflow fields", async () => {
    const original = await readFile(reviewPath, "utf8").catch(() => null);

    try {
      await writeFile(
        reviewPath,
        JSON.stringify(
          {
            "legacy-mint": {
              mintAddress: "legacy-mint",
              decision: "Hold",
              summary: "legacy review",
              reviewNotes: "legacy note",
              reviewedByWallet: "wallet",
              walletSignature: "sig",
              signedMessage: "message",
              reviewedAt: "2026-05-05T00:00:00.000Z",
              decisionSignals: {
                marketCoverage: "partial",
                holderCoverage: "missing",
                bagsCoverage: "partial",
                historyCoverage: "missing",
                score: 55,
                level: "Moderate Risk",
              },
            },
          },
          null,
          2,
        ),
        "utf8",
      );

      const records = await refreshReviewsFromDisk();
      expect(records).toHaveLength(1);
      expect(records[0].approvalEligible).toBe(false);
      expect(records[0].approvalBlockers).toEqual([]);
      expect(records[0].signatureVerified).toBe(false);
      expect(records[0].launchReviewPacket.mintAddress).toBe("legacy-mint");
      expect(records[0].launchReviewPacket.decisionState.decision).toBe("Hold");
    } finally {
      if (original === null) {
        await writeFile(reviewPath, "{}", "utf8");
      } else {
        await writeFile(reviewPath, original, "utf8");
      }
      await refreshReviewsFromDisk();
    }
  });
});
