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

async function ensureLoaded() {
  if (initialized) return;
  initialized = true;

  try {
    const raw = await readFile(reviewPath, "utf8");
    cache = JSON.parse(raw) as ReviewStore;
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
