import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ConfidenceLevel, Token, TokenHistoryPoint } from "../src/types.ts";
import { analyzeToken } from "../src/lib/risk-engine.ts";

type HistorySnapshot = {
  timestamp: string;
  marketPriceUsd: number;
  marketLiquidityUsd: number;
  marketVolume24hUsd: number;
  marketPriceChange24hPercent: number;
  holders: number;
  topHolderPercent: number;
  feeVelocityUsd: number;
  confidenceLevel: ConfidenceLevel;
};

type HistoryStore = Record<string, HistorySnapshot[]>;

const historyPath = path.resolve("server/state/live-history.json");
const maxSnapshotsPerMint = 168;

let cache: HistoryStore | null = null;
let initialized = false;
let writeChain = Promise.resolve();

function hourBucket(timestamp: string) {
  return timestamp.slice(0, 13);
}

async function ensureLoaded() {
  if (initialized) return;
  initialized = true;
  try {
    const raw = await readFile(historyPath, "utf8");
    cache = JSON.parse(raw) as HistoryStore;
  } catch {
    cache = {};
  }
}

async function persist() {
  await mkdir(path.dirname(historyPath), { recursive: true });
  await writeFile(historyPath, JSON.stringify(cache ?? {}, null, 2), "utf8");
}

export async function appendLiveSnapshots(tokens: Token[]) {
  const liveTokens = tokens.filter((token) => token.isLive);
  if (liveTokens.length === 0) return;

  await ensureLoaded();

  writeChain = writeChain.then(async () => {
    const store = cache ?? {};
    const now = new Date().toISOString();

    for (const token of liveTokens) {
      const existing = store[token.mintAddress] ?? [];
      const snapshot: HistorySnapshot = {
        timestamp: now,
        marketPriceUsd: token.marketPriceUsd,
        marketLiquidityUsd: token.marketLiquidityUsd,
        marketVolume24hUsd: token.marketVolume24hUsd,
        marketPriceChange24hPercent: token.marketPriceChange24hPercent,
        holders: token.holders,
        topHolderPercent: token.topHolderPercent,
        feeVelocityUsd: token.feeVelocityUsd,
        confidenceLevel: token.confidenceLevel,
      };

      const next = existing.filter((item) => hourBucket(item.timestamp) !== hourBucket(now));
      next.push(snapshot);
      store[token.mintAddress] = next
        .sort((left, right) => left.timestamp.localeCompare(right.timestamp))
        .slice(-maxSnapshotsPerMint);
    }

    cache = store;
    await persist();
  });

  await writeChain;
}

export async function readTokenHistory(token: Token): Promise<{
  history: TokenHistoryPoint[];
  historySource: Token["historySource"];
  historyPointCount: number;
}> {
  if (!token.isLive) {
    return {
      history: token.history,
      historySource: "sample-static",
      historyPointCount: token.history.length,
    };
  }

  await ensureLoaded();
  const snapshots = (cache?.[token.mintAddress] ?? []).slice(-7);
  if (snapshots.length < 3) {
    return {
      history: [],
      historySource: "collecting",
      historyPointCount: snapshots.length,
    };
  }

  return {
    history: snapshots.map((snapshot, index) => {
      const report = analyzeToken({
        ...token,
        marketPriceUsd: snapshot.marketPriceUsd,
        marketLiquidityUsd: snapshot.marketLiquidityUsd,
        marketVolume24hUsd: snapshot.marketVolume24hUsd,
        marketPriceChange24hPercent: snapshot.marketPriceChange24hPercent,
        holders: snapshot.holders,
        topHolderPercent: snapshot.topHolderPercent,
        feeVelocityUsd: snapshot.feeVelocityUsd,
        confidenceLevel: snapshot.confidenceLevel,
      });

      return {
        day: index === snapshots.length - 1 ? "Now" : snapshot.timestamp.slice(5, 10),
        risk: report.score,
        volume: Math.round(snapshot.marketVolume24hUsd),
        holders: snapshot.holders,
      };
    }),
    historySource: "real-snapshots",
    historyPointCount: snapshots.length,
  };
}
