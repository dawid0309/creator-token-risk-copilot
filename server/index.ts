import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import nacl from "tweetnacl";
import { PublicKey } from "@solana/web3.js";
import { env } from "./env.ts";
import { getHealth, getTokenDetail, getTokenFeed } from "./providers.ts";
import { analyzeToken } from "../src/lib/risk-engine.ts";
import {
  buildReviewSignatureMessage,
  matchesReviewSignatureMessage,
  normalizeReviewNotes,
  normalizeSignedMessage,
} from "../src/lib/review-signing.ts";
import {
  getApprovalBlockers,
  getFollowUpAction,
  getFollowUpChecklist,
  isApprovalEligible,
} from "../src/lib/review-policy.ts";
import {
  getReview,
  getReviewStoreStatus,
  refreshReviewsFromDisk,
  upsertReview,
} from "./review-store.ts";
import type {
  FeedMode,
  LaunchReviewPacket,
  ReviewDecision,
  ReviewRecord,
  ReviewSubmitPayload,
  RiskLevel,
} from "../src/types.ts";

function json(response: ServerResponse, statusCode: number, data: unknown) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
  });
  response.end(JSON.stringify(data));
}

async function readJsonBody<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const body = Buffer.concat(chunks).toString("utf8");
  return JSON.parse(body) as T;
}

function isDecision(value: string): value is ReviewDecision {
  return value === "Approve" || value === "Hold" || value === "Escalate";
}

function validateReviewPayload(payload: ReviewSubmitPayload) {
  if (!isDecision(payload.decision)) {
    return "Decision must be Approve, Hold, or Escalate.";
  }

  if (!normalizeReviewNotes(payload.reviewNotes || "")) {
    return "Review notes are required.";
  }

  if (!payload.reviewedByWallet?.trim()) {
    return "Reviewer wallet is required.";
  }

  if (!payload.walletSignature?.trim()) {
    return "Wallet signature is required.";
  }

  if (!payload.signedMessage?.trim()) {
    return "Signed message is required.";
  }

  if (!payload.signedAt?.trim()) {
    return "Signed timestamp is required.";
  }

  return null;
}

function decodeBase64(value: string) {
  return Uint8Array.from(Buffer.from(value, "base64"));
}

function encodeMessage(message: string) {
  return new TextEncoder().encode(message);
}

function verifyWalletSignature(input: {
  walletAddress: string;
  signedMessage: string;
  walletSignature: string;
}) {
  try {
    const publicKey = new PublicKey(input.walletAddress);
    const messageBytes = encodeMessage(input.signedMessage);
    const signatureBytes = decodeBase64(input.walletSignature);
    return nacl.sign.detached.verify(messageBytes, signatureBytes, publicKey.toBytes());
  } catch {
    return false;
  }
}

function buildLaunchReviewPacket(
  detail: Awaited<ReturnType<typeof getTokenDetail>>,
  review: Pick<
    ReviewRecord,
    "mintAddress" | "decisionSignals" | "decision" | "approvalEligible" | "approvalBlockers"
  >,
): LaunchReviewPacket {
  if (!detail) {
    throw new Error("Token detail is required to build a launch review packet.");
  }
  const token = detail.token;
  const followUpAction = getFollowUpAction(review.decision, review.approvalBlockers);
  return {
    createdAt: new Date().toISOString(),
    mintAddress: token.mintAddress,
    creatorProfile: {
      creator: token.creator,
      mintAddress: token.mintAddress,
      bagsSignalSummary:
        token.coverageSummary.bags === "verified"
          ? "Bags creator and fee signals are connected."
          : token.coverageSummary.bags === "partial"
            ? "Bags signals are partial and still need review."
            : "Bags creator signals are still thin.",
    },
    evidenceSnapshot: {
      marketSignal: {
        priceUsd: token.marketPriceUsd,
        liquidityUsd: token.marketLiquidityUsd,
        volume24hUsd: token.marketVolume24hUsd,
        priceChange24hPercent: token.marketPriceChange24hPercent,
      },
      holderSignal: {
        holders: token.holders,
        topHolderPercent: token.topHolderPercent,
        coverage: token.coverageSummary.chain,
      },
      historySignal: {
        historySource: token.historySource,
        historyPointCount: token.historyPointCount,
        coverage: token.coverageSummary.history,
      },
      feeSignal: {
        feeVelocityUsd: token.feeVelocityUsd,
        feeSpikeMultiple: token.feeSpikeMultiple,
        coverage: token.coverageSummary.bags,
      },
      score: review.decisionSignals.score,
      level: review.decisionSignals.level,
      confidenceLevel: token.confidenceLevel,
    },
    decisionState: {
      decision: review.decision,
      approvalEligible: review.approvalEligible,
      approvalBlockers: review.approvalBlockers,
    },
    followUpAction,
    followUpChecklist: getFollowUpChecklist(review.decision, review.approvalBlockers),
  };
}

const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || `localhost:${env.port}`}`);

  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type",
    });
    response.end();
    return;
  }

  try {
    if (url.pathname === "/api/config") {
      json(response, 200, {
        apiBaseUrl: `http://localhost:${env.port}`,
        defaultMode: "review",
      });
      return;
    }

    if (url.pathname === "/api/health") {
      json(response, 200, await getHealth());
      return;
    }

    if (url.pathname === "/api/tokens") {
      const mode = (url.searchParams.get("mode") as FeedMode | null) ?? "review";
      const query = url.searchParams.get("query") ?? undefined;
      const riskLevel = (url.searchParams.get("riskLevel") as RiskLevel | null) ?? undefined;
      const limit = url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : undefined;
      const demoMode = url.searchParams.get("demo") === "sample" ? "sample" : undefined;
      json(
        response,
        200,
        await getTokenFeed({
          mode,
          query,
          riskLevel,
          limit,
          demoMode,
        }),
      );
      return;
    }

    if (url.pathname === "/api/reviews" && request.method === "GET") {
      const items = await refreshReviewsFromDisk();
      json(response, 200, {
        items,
        updatedAt: new Date().toISOString(),
        storeStatus: getReviewStoreStatus(),
      });
      return;
    }

    const tokenMatch = url.pathname.match(/^\/api\/tokens\/([^/]+)$/);
    if (tokenMatch) {
      const detail = await getTokenDetail(decodeURIComponent(tokenMatch[1]));
      if (!detail) {
        json(response, 404, { message: "Token not found" });
        return;
      }
      json(response, 200, detail);
      return;
    }

    const reviewMatch = url.pathname.match(/^\/api\/reviews\/([^/]+)$/);
    if (reviewMatch && request.method === "GET") {
      json(response, 200, {
        review: await getReview(decodeURIComponent(reviewMatch[1])),
      });
      return;
    }

    if (reviewMatch && request.method === "POST") {
      const mintAddress = decodeURIComponent(reviewMatch[1]);
      const payload = await readJsonBody<ReviewSubmitPayload>(request);
      const errorMessage = validateReviewPayload(payload);
      if (errorMessage) {
        json(response, 400, { message: errorMessage });
        return;
      }

      const detail = await getTokenDetail(mintAddress);
      if (!detail) {
        json(response, 404, { message: "Token not found" });
        return;
      }

      const normalizedPayload = {
        decision: payload.decision,
        reviewNotes: normalizeReviewNotes(payload.reviewNotes),
        reviewedByWallet: payload.reviewedByWallet.trim(),
        walletSignature: payload.walletSignature.trim(),
        signedMessage: normalizeSignedMessage(payload.signedMessage),
        signedAt: payload.signedAt.trim(),
      } satisfies ReviewSubmitPayload;

      const expectedSignedMessage = buildReviewSignatureMessage({
        mintAddress,
        decision: normalizedPayload.decision,
        reviewNotes: normalizedPayload.reviewNotes,
        reviewedByWallet: normalizedPayload.reviewedByWallet,
        timestamp: normalizedPayload.signedAt,
      });

      if (
        !matchesReviewSignatureMessage({
          mintAddress,
          decision: normalizedPayload.decision,
          reviewNotes: normalizedPayload.reviewNotes,
          reviewedByWallet: normalizedPayload.reviewedByWallet,
          timestamp: normalizedPayload.signedAt,
          signedMessage: normalizedPayload.signedMessage,
        })
      ) {
        json(response, 400, {
          message: "Signed review payload does not match the submitted decision fields.",
          expectedSignedMessage,
        });
        return;
      }

      const signatureVerified = verifyWalletSignature({
        walletAddress: normalizedPayload.reviewedByWallet,
        signedMessage: normalizedPayload.signedMessage,
        walletSignature: normalizedPayload.walletSignature,
      });
      if (!signatureVerified) {
        json(response, 400, { message: "Wallet signature verification failed." });
        return;
      }

      const approvalBlockers = getApprovalBlockers(detail.token);
      const approvalEligible = isApprovalEligible(detail.token);
      if (payload.decision === "Approve" && !approvalEligible) {
        json(response, 400, {
          message: "Approve blocked by insufficient evidence.",
          approvalBlockers,
        });
        return;
      }

      const report = analyzeToken(detail.token);
      const review: ReviewRecord = {
        mintAddress,
        decision: payload.decision,
        summary: `${payload.decision} recorded for ${detail.token.name} using signed review evidence.`,
        reviewNotes: normalizedPayload.reviewNotes,
        reviewedByWallet: normalizedPayload.reviewedByWallet,
        walletSignature: normalizedPayload.walletSignature,
        signedMessage: normalizedPayload.signedMessage,
        signatureVerified: true,
        verifiedAt: new Date().toISOString(),
        reviewedAt: new Date().toISOString(),
        approvalEligible,
        approvalBlockers,
        launchReviewPacket: {
          createdAt: "",
          mintAddress,
          creatorProfile: {
            creator: "",
            mintAddress,
            bagsSignalSummary: "",
          },
          evidenceSnapshot: {
            marketSignal: {
              priceUsd: 0,
              liquidityUsd: 0,
              volume24hUsd: 0,
              priceChange24hPercent: 0,
            },
            holderSignal: {
              holders: 0,
              topHolderPercent: 0,
              coverage: detail.token.coverageSummary.chain,
            },
            historySignal: {
              historySource: detail.token.historySource,
              historyPointCount: detail.token.historyPointCount,
              coverage: detail.token.coverageSummary.history,
            },
            feeSignal: {
              feeVelocityUsd: 0,
              feeSpikeMultiple: 0,
              coverage: detail.token.coverageSummary.bags,
            },
            score: report.score,
            level: report.level,
            confidenceLevel: detail.token.confidenceLevel,
          },
          decisionState: {
            decision: payload.decision,
            approvalEligible,
            approvalBlockers,
          },
          followUpAction: "watch_for_more_history",
          followUpChecklist: [],
        },
        decisionSignals: {
          marketCoverage: detail.token.coverageSummary.market,
          holderCoverage: detail.token.coverageSummary.chain,
          bagsCoverage: detail.token.coverageSummary.bags,
          historyCoverage: detail.token.coverageSummary.history,
          score: report.score,
          level: report.level,
        },
      };

      review.launchReviewPacket = buildLaunchReviewPacket(detail, review);

      await upsertReview(review);
      json(response, 200, { review, storeStatus: getReviewStoreStatus() });
      return;
    }

    json(response, 404, { message: "Not found" });
  } catch (error) {
    json(response, 500, {
      message: error instanceof Error ? error.message : "Unknown server error",
    });
  }
});

server.listen(env.port, () => {
  console.log(`Creator Token Risk Copilot API listening on http://localhost:${env.port}`);
});
