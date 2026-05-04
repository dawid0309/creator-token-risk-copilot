import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ReviewRecord } from "../src/types.ts";

type ReviewStore = Record<string, ReviewRecord>;

const reviewPath = path.resolve("server/state/reviews.json");

let cache: ReviewStore | null = null;
let initialized = false;
let writeChain = Promise.resolve();

async function ensureLoaded() {
  if (initialized) return;
  initialized = true;

  try {
    const raw = await readFile(reviewPath, "utf8");
    cache = JSON.parse(raw) as ReviewStore;
  } catch {
    cache = {};
  }
}

async function persist() {
  await mkdir(path.dirname(reviewPath), { recursive: true });
  await writeFile(reviewPath, JSON.stringify(cache ?? {}, null, 2), "utf8");
}

export async function listReviews(): Promise<ReviewRecord[]> {
  await ensureLoaded();
  return Object.values(cache ?? {}).sort((left, right) =>
    right.reviewedAt.localeCompare(left.reviewedAt),
  );
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
