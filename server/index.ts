import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { env } from "./env.ts";
import { getHealth, getTokenDetail, getTokenFeed } from "./providers.ts";
import { analyzeToken } from "../src/lib/risk-engine.ts";
import { getReview, listReviews, upsertReview } from "./review-store.ts";
import type {
  FeedMode,
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

  if (!payload.reviewNotes?.trim()) {
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

  return null;
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
      json(
        response,
        200,
        await getTokenFeed({
          mode,
          query,
          riskLevel,
          limit,
        }),
      );
      return;
    }

    if (url.pathname === "/api/reviews" && request.method === "GET") {
      json(response, 200, {
        items: await listReviews(),
        updatedAt: new Date().toISOString(),
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

      const report = analyzeToken(detail.token);
      const review: ReviewRecord = {
        mintAddress,
        decision: payload.decision,
        summary: `${payload.decision} recorded for ${detail.token.name} using signed review evidence.`,
        reviewNotes: payload.reviewNotes.trim(),
        reviewedByWallet: payload.reviewedByWallet.trim(),
        walletSignature: payload.walletSignature.trim(),
        signedMessage: payload.signedMessage.trim(),
        reviewedAt: new Date().toISOString(),
        decisionSignals: {
          marketCoverage: detail.token.coverageSummary.market,
          holderCoverage: detail.token.coverageSummary.chain,
          bagsCoverage: detail.token.coverageSummary.bags,
          historyCoverage: detail.token.coverageSummary.history,
          score: report.score,
          level: report.level,
        },
      };

      await upsertReview(review);
      json(response, 200, { review });
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
