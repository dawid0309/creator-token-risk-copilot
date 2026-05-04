import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import type { ReviewRecord, ReviewStoreStatus } from "../src/types.ts";

type ReviewStore = Record<string, ReviewRecord>;

const reviewPath = path.resolve("server/state/reviews.json");

let cache: ReviewStore | null = null;
let initialized = false;
let writeChain = Promise.resolve();
let lastPersistedAt: string | null = null;
let lastReloadedAt: string | null = null;

function normalizeReviewRecord(record: ReviewRecord): ReviewRecord {
  return {
    ...record,
    approvalEligible: record.approvalEligible ?? false,
    approvalBlockers: record.approvalBlockers ?? [],
    signatureVerified: record.signatureVerified ?? false,
    verifiedAt: record.verifiedAt ?? null,
    launchReviewPacket: {
      createdAt: record.launchReviewPacket?.createdAt ?? "",
      mintAddress: record.launchReviewPacket?.mintAddress ?? record.mintAddress,
      creatorProfile: {
        creator: record.launchReviewPacket?.creatorProfile?.creator ?? "",
        mintAddress:
          record.launchReviewPacket?.creatorProfile?.mintAddress ?? record.mintAddress,
        bagsSignalSummary:
          record.launchReviewPacket?.creatorProfile?.bagsSignalSummary ?? "",
      },
      evidenceSnapshot: {
        marketSignal: {
          priceUsd: record.launchReviewPacket?.evidenceSnapshot?.marketSignal?.priceUsd ?? 0,
          liquidityUsd:
            record.launchReviewPacket?.evidenceSnapshot?.marketSignal?.liquidityUsd ?? 0,
          volume24hUsd:
            record.launchReviewPacket?.evidenceSnapshot?.marketSignal?.volume24hUsd ?? 0,
          priceChange24hPercent:
            record.launchReviewPacket?.evidenceSnapshot?.marketSignal?.priceChange24hPercent ?? 0,
        },
        holderSignal: {
          holders: record.launchReviewPacket?.evidenceSnapshot?.holderSignal?.holders ?? 0,
          topHolderPercent:
            record.launchReviewPacket?.evidenceSnapshot?.holderSignal?.topHolderPercent ?? 0,
          coverage:
            record.launchReviewPacket?.evidenceSnapshot?.holderSignal?.coverage ?? "missing",
        },
        historySignal: {
          historySource:
            record.launchReviewPacket?.evidenceSnapshot?.historySignal?.historySource ?? "collecting",
          historyPointCount:
            record.launchReviewPacket?.evidenceSnapshot?.historySignal?.historyPointCount ?? 0,
          coverage:
            record.launchReviewPacket?.evidenceSnapshot?.historySignal?.coverage ?? "missing",
        },
        feeSignal: {
          feeVelocityUsd:
            record.launchReviewPacket?.evidenceSnapshot?.feeSignal?.feeVelocityUsd ?? 0,
          feeSpikeMultiple:
            record.launchReviewPacket?.evidenceSnapshot?.feeSignal?.feeSpikeMultiple ?? 0,
          coverage:
            record.launchReviewPacket?.evidenceSnapshot?.feeSignal?.coverage ?? "missing",
        },
        score: record.launchReviewPacket?.evidenceSnapshot?.score ?? record.decisionSignals.score,
        level: record.launchReviewPacket?.evidenceSnapshot?.level ?? record.decisionSignals.level,
        confidenceLevel:
          record.launchReviewPacket?.evidenceSnapshot?.confidenceLevel ?? "low",
      },
      decisionState: {
        decision:
          record.launchReviewPacket?.decisionState?.decision ?? record.decision,
        approvalEligible:
          record.launchReviewPacket?.decisionState?.approvalEligible ?? record.approvalEligible ?? false,
        approvalBlockers:
          record.launchReviewPacket?.decisionState?.approvalBlockers ?? record.approvalBlockers ?? [],
      },
      followUpAction:
        record.launchReviewPacket?.followUpAction ?? "watch_for_more_history",
      followUpChecklist: record.launchReviewPacket?.followUpChecklist ?? [],
    },
  };
}

function normalizeReviewStore(input: unknown): ReviewStore {
  if (!input || typeof input !== "object") return {};

  const entries = Object.entries(input as Record<string, ReviewRecord>);
  return Object.fromEntries(
    entries.map(([mintAddress, record]) => [mintAddress, normalizeReviewRecord(record)]),
  );
}

async function ensureLoaded() {
  if (initialized) return;
  initialized = true;

  try {
    const raw = await readFile(reviewPath, "utf8");
    cache = normalizeReviewStore(JSON.parse(raw));
    lastReloadedAt = new Date().toISOString();
  } catch {
    cache = {};
    await persist();
    lastReloadedAt = new Date().toISOString();
  }
}

async function persist() {
  await mkdir(path.dirname(reviewPath), { recursive: true });
  await writeFile(reviewPath, JSON.stringify(cache ?? {}, null, 2), "utf8");
  lastPersistedAt = new Date().toISOString();
}

export function getReviewStoreStatus(): ReviewStoreStatus {
  const fileExists = existsSync(reviewPath);
  const reviewCount = Object.keys(cache ?? {}).length;
  return {
    storagePath: reviewPath,
    reviewCount,
    fileExists,
    diskSynced: fileExists && Boolean(lastPersistedAt || lastReloadedAt),
    lastPersistedAt,
    lastReloadedAt,
  };
}

export async function listReviews(): Promise<ReviewRecord[]> {
  await ensureLoaded();
  return Object.values(cache ?? {}).sort((left, right) =>
    right.reviewedAt.localeCompare(left.reviewedAt),
  );
}

export async function refreshReviewsFromDisk() {
  initialized = false;
  cache = null;
  await ensureLoaded();
  return listReviews();
}

export async function getReview(mintAddress: string): Promise<ReviewRecord | null> {
  await ensureLoaded();
  return cache?.[mintAddress] ?? null;
}

export async function upsertReview(review: ReviewRecord): Promise<ReviewRecord> {
  await ensureLoaded();

  writeChain = writeChain.then(async () => {
    cache = {
      ...(cache ?? {}),
      [review.mintAddress]: review,
    };
    await persist();
  });

  await writeChain;
  return review;
}
