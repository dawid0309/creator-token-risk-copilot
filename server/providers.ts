import type {
  ConfidenceLevel,
  CoverageState,
  FeedMode,
  FeedSourceKind,
  NormalizedTokenMetrics,
  ProviderState,
  ProviderStatus,
  RawBagsTokenSnapshot,
  RawDexScreenerSnapshot,
  RawSolanaTokenSnapshot,
  RiskLevel,
  ReviewStatus,
  Sentiment,
  Token,
  TokenDetailResponse,
  TokenFeedResponse,
} from "../src/types.ts";
import { analyzeToken } from "../src/lib/risk-engine.ts";
import { env } from "./env.ts";
import { appendLiveSnapshots, readTokenHistory } from "./history-store.ts";
import { getReview } from "./review-store.ts";
import { createSampleFeed } from "./sample-feed.ts";

type JsonObject = Record<string, unknown>;

type ProviderResult<T> = {
  data: T;
  status: ProviderStatus;
};

type WatchlistTokenResult =
  | { ok: true; token: Token; holderEnrichmentFailed: boolean; marketEnriched: boolean }
  | { ok: false; reason: string; mintAddress: string };

type QuoteResponse = {
  outAmount: string;
  priceImpactPct?: string;
  routePlan?: Array<{
    marketKey?: string;
    outputMintDecimals?: number;
    inputMintDecimals?: number;
  }>;
};

type DexScreenerPair = {
  chainId?: string;
  pairAddress?: string;
  pairCreatedAt?: number;
  url?: string;
  baseToken?: { address?: string; name?: string; symbol?: string };
  liquidity?: { usd?: number };
  volume?: { h24?: number };
  priceUsd?: string;
  priceChange?: { h24?: number };
};

type GeckoTerminalPool = {
  attributes?: {
    name?: string;
    address?: string;
    base_token_price_usd?: string;
    price_change_percentage?: { h24?: string };
    volume_usd?: { h24?: string };
    reserve_in_usd?: string;
    pool_created_at?: string;
  };
  relationships?: {
    base_token?: {
      data?: { id?: string };
    };
  };
};

const SOL_MINT = "So11111111111111111111111111111111111111112";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

const rpcTimeoutMs = 12000;
const holderRpcTimeoutMs = 3500;
const bagsTimeoutMs = 12000;
const bagsCacheTtlMs = 5 * 60 * 1000;
const quoteCacheTtlMs = 2 * 60 * 1000;
const creatorCacheTtlMs = 5 * 60 * 1000;
const feeCacheTtlMs = 2 * 60 * 1000;
const quoteConcurrency = 4;
const discoveryScanMultiplier = 4;
const discoveryMinimumCandidates = 12;
const discoveryMaximumCandidates = 48;

const knownTokenMeta: Record<
  string,
  {
    name: string;
    symbol: string;
    creator: string;
    category: string;
    website?: string;
  }
> = {
  [SOL_MINT]: {
    name: "Wrapped SOL",
    symbol: "SOL",
    creator: "Solana",
    category: "Solana core asset",
    website: "https://solana.com",
  },
  [USDC_MINT]: {
    name: "USD Coin",
    symbol: "USDC",
    creator: "Circle",
    category: "Stablecoin",
    website: "https://www.circle.com/usdc",
  },
  EEQpwgtPF3UUoHSWSLh33VPKYg8tBTkLK2k7GcVeBAGS: {
    name: "FROALA DEV",
    symbol: "FRL",
    creator: "froala",
    category: "Bags creator token",
    website: "https://froala.com/",
  },
  "2BnLyvzzGPZXqgVhiSxHi5hSXtawsnngNQ4ZnRWEBAGS": {
    name: "Peter Teal",
    symbol: "TEAL",
    creator: "Bags creator",
    category: "Bags creator token",
  },
  "8dFXJeqWKPcMk3taSEotQ1xmcteJtc5Lwn4HeWbRBAGS": {
    name: "SNOZ$",
    symbol: "SNZ",
    creator: "Bags creator",
    category: "Bags creator token",
  },
};

const curatedReviewMints = [
  "EEQpwgtPF3UUoHSWSLh33VPKYg8tBTkLK2k7GcVeBAGS",
  "8dFXJeqWKPcMk3taSEotQ1xmcteJtc5Lwn4HeWbRBAGS",
  "FyzkLqrmKGv2veNnSHtWiF9XdYJypVVVBhi21bQ2BAGS",
  "H459fpux1FS8ad4y7Sis96Tkm3jZ6w5WHNd4eVq5BAGS",
  "3gFdzqQjay5ysEefMepFimoRCevs16HCm2vuVeP6BAGS",
  "HdcKtas6fPFb6vurwDB4MURA1GDduKD6cVsC1hvABAGS",
  "2BnLyvzzGPZXqgVhiSxHi5hSXtawsnngNQ4ZnRWEBAGS",
  "5gHaxxh5S3VP6drELgL7rEfcpVx6fQAjM8dFVMywBAGS",
  "9QBueG9rQ4qvyVGBnUsKQN4Jtbk28osNCkPCvqLJBAGS",
  "67vukEDE5UbNxoVgwMTjkV2Z71aFqxCB9WN31YHaBAGS",
];

let bagsDiscoveryCache:
  | {
      expiresAt: number;
      value: ProviderResult<Map<string, RawBagsTokenSnapshot>>;
    }
  | undefined;
let bagsDiscoveryInFlight: Promise<ProviderResult<Map<string, RawBagsTokenSnapshot>>> | undefined;

const quoteCache = new Map<string, { expiresAt: number; value: QuoteResponse | null }>();
const quoteInFlight = new Map<string, Promise<QuoteResponse | null>>();
const marketCache = new Map<
  string,
  { expiresAt: number; value: RawDexScreenerSnapshot | null }
>();
const marketInFlight = new Map<string, Promise<RawDexScreenerSnapshot | null>>();
const creatorCache = new Map<string, { expiresAt: number; value: string }>();
const creatorInFlight = new Map<string, Promise<string>>();
const feeCache = new Map<string, { expiresAt: number; value: number }>();
const feeInFlight = new Map<string, Promise<number>>();
const dexBatchCache = new Map<string, { expiresAt: number; value: Map<string, RawDexScreenerSnapshot> }>();
const geckoCache = new Map<string, { expiresAt: number; value: RawDexScreenerSnapshot | null }>();

function nowIso() {
  return new Date().toISOString();
}

function createProviderStatus(
  id: "solana" | "dexscreener" | "bags" | "sample",
  state: ProviderState,
  detail: string,
): ProviderStatus {
  return {
    id,
    label:
      id === "solana"
        ? "Solana RPC"
        : id === "dexscreener"
          ? "Quote probes"
          : id === "bags"
            ? "Bags API"
            : "Sample fallback",
    state,
    detail,
    updatedAt: nowIso(),
  };
}

function createIdleBagsStatus() {
  return createProviderStatus(
    "bags",
    env.bagsApiKey ? "configured" : "missing",
    env.bagsApiKey
      ? "Bags discovery is configured and loaded on demand."
      : "Bags API key is not configured.",
  );
}

async function fetchJson(url: string, init?: RequestInit, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return (await response.json()) as JsonObject;
  } finally {
    clearTimeout(timer);
  }
}

async function postRpc<T>(
  method: string,
  params: unknown[],
  options?: {
    timeoutMs?: number;
    rpcUrls?: string[];
  },
): Promise<T> {
  const rpcUrls = options?.rpcUrls?.length
    ? options.rpcUrls
    : [env.solanaRpcUrl, "https://solana-rpc.publicnode.com", "https://api.mainnet-beta.solana.com"];

  let lastError: Error | null = null;

  for (const rpcUrl of rpcUrls) {
    try {
      const response = await fetchJson(
        rpcUrl,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method,
            params,
          }),
        },
        options?.timeoutMs ?? rpcTimeoutMs,
      );

      if ("error" in response) {
        throw new Error(`RPC error: ${JSON.stringify(response.error)}`);
      }

      return response.result as T;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw lastError ?? new Error("No Solana RPC endpoint was reachable.");
}

function safeNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function safeString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function clampHolderGrowth(value: number) {
  return Math.max(-12, Math.min(18, Number(value.toFixed(1))));
}

function compactCreator(name: string) {
  if (!name) return "Unknown creator";
  if (name.length <= 18) return name;
  return `${name.slice(0, 6)}...${name.slice(-4)}`;
}

function dedupeSignals(signals: string[]) {
  return Array.from(new Set(signals));
}

function getCoverageState(missingCount: number, totalCount: number): CoverageState {
  if (missingCount <= 0) return "verified";
  if (missingCount >= totalCount) return "missing";
  return "partial";
}

function computeCoverageSummary(metrics: {
  holders: number;
  topHolderPercent: number;
  marketLiquidityUsd: number;
  marketVolume24hUsd: number;
  marketPriceChange24hPercent: number;
  feeVelocityUsd: number;
  historyPointCount: number;
  missingSignals: string[];
  sourceTags: string[];
}) {
  const missing = new Set(metrics.missingSignals);
  const chain = getCoverageState(
    Number(missing.has("holders") || metrics.holders <= 0) +
      Number(metrics.topHolderPercent <= 0),
    2,
  );
  const bags = getCoverageState(
    Number(missing.has("fees") || metrics.feeVelocityUsd <= 0) +
      Number(!metrics.sourceTags.includes("bags")),
    2,
  );
  const market = getCoverageState(
    Number(missing.has("marketLiquidity") || metrics.marketLiquidityUsd <= 0) +
      Number(missing.has("marketVolume") || metrics.marketVolume24hUsd <= 0) +
      Number(
        missing.has("marketPriceChange") &&
          metrics.marketPriceChange24hPercent === 0,
      ),
    3,
  );
  const history = getCoverageState(Number(metrics.historyPointCount < 3), 1);

  const eligibleSignals = ["launch"];
  const flags: string[] = [];
  const quoteDepthWeak = missing.has("liquidity");
  const quoteVolumeWeak = missing.has("volume");

  if (chain !== "missing") eligibleSignals.push("holders");
  else flags.push("holders-thin");

  if (market === "verified") {
    eligibleSignals.push("market");
  } else if (market === "partial") {
    eligibleSignals.push("market");
    flags.push("market-partial");
  } else {
    flags.push("market-thin");
  }

  if (bags === "verified") eligibleSignals.push("momentum");
  else if (bags === "partial") flags.push("bags-partial");
  else flags.push("bags-thin");

  if (history !== "missing") eligibleSignals.push("history");
  else flags.push("history-collecting");

  if (quoteDepthWeak) flags.push("quote-depth-probe-thin");
  if (quoteVolumeWeak) flags.push("quote-volume-missing");

  const nonMissingCount = [chain, bags, market, history].filter(
    (state) => state !== "missing",
  ).length;

  let confidenceLevel: ConfidenceLevel = "low";
  if (
    market === "verified" &&
    (chain === "verified" || bags === "verified") &&
    history !== "missing"
  ) {
    confidenceLevel = "high";
  } else if (
    (market === "verified" || market === "partial") &&
    nonMissingCount >= 2
  ) {
    confidenceLevel = "medium";
  }

  return {
    chain,
    bags,
    market,
    history,
    eligibleSignals: Array.from(new Set(eligibleSignals)),
    flags,
    confidenceLevel,
  };
}

function scoreCoverage(token: Token) {
  const points = {
    verified: 3,
    partial: 2,
    missing: 0,
  } satisfies Record<CoverageState, number>;

  return (
    points[token.coverageSummary.chain] * 3 +
    points[token.coverageSummary.market] * 3 +
    points[token.coverageSummary.bags] * 2 +
    points[token.coverageSummary.history] +
    token.coverageSummary.eligibleSignals.length -
    token.coverageSummary.flags.length
  );
}

function suppressHolderSignals(token: Pick<Token, "holders" | "topHolderPercent" | "missingSignals" | "coverageSummary">) {
  const suspiciousExtreme =
    token.holders <= 150 && token.topHolderPercent >= 99;
  const partialConcentration =
    token.topHolderPercent > 0 && token.coverageSummary.chain !== "verified";

  if (!suspiciousExtreme && !partialConcentration) {
    return {
      holders: token.holders,
      topHolderPercent: token.topHolderPercent,
      missingSignals: token.missingSignals,
    };
  }

  return {
    holders: suspiciousExtreme ? 0 : token.holders,
    topHolderPercent: 0,
    missingSignals: dedupeSignals([
      ...token.missingSignals,
      ...(suspiciousExtreme ? ["holders"] : []),
      "topHolderPercent",
    ]),
  };
}

function deriveSentiment(quoteImpactPercent: number, holderGrowth24hPercent: number): Sentiment {
  if (quoteImpactPercent > 18 || holderGrowth24hPercent > 8) return "heated";
  if (quoteImpactPercent > 4 || holderGrowth24hPercent > 2) return "warming";
  if (quoteImpactPercent < -8 || holderGrowth24hPercent < -2) return "cooling";
  return "neutral";
}

function computeMetadataCompleteness(name: string, symbol: string, website?: string) {
  let score = 48;
  if (name) score += 20;
  if (symbol) score += 14;
  if (website) score += 18;
  return Math.min(100, score);
}

function normalizeToken(metrics: NormalizedTokenMetrics): Token {
  return {
    id: metrics.mintAddress,
    mintAddress: metrics.mintAddress,
    name: metrics.name,
    symbol: metrics.symbol,
    creator: metrics.creator,
    category: metrics.category,
    ageDays: metrics.ageDays,
    holders: metrics.holders,
    topHolderPercent: metrics.topHolderPercent,
    marketPriceUsd: metrics.marketPriceUsd,
    marketLiquidityUsd: metrics.marketLiquidityUsd,
    marketVolume24hUsd: metrics.marketVolume24hUsd,
    marketPriceChange24hPercent: metrics.marketPriceChange24hPercent,
    marketPairAddress: metrics.marketPairAddress,
    marketPairCreatedAt: metrics.marketPairCreatedAt,
    quoteDepthUsd: metrics.quoteDepthUsd,
    quoteVolume24hUsd: metrics.quoteVolume24hUsd,
    quoteImpactPercent: metrics.quoteImpactPercent,
    feeVelocityUsd: metrics.feeVelocityUsd,
    feeSpikeMultiple: metrics.feeSpikeMultiple,
    holderGrowth24hPercent: metrics.holderGrowth24hPercent,
    metadataCompleteness: metrics.metadataCompleteness,
    verifiedLinks: metrics.verifiedLinks,
    sentiment: metrics.sentiment,
    history: metrics.history,
    isLive: metrics.isLive,
    sourceTags: metrics.sourceTags,
    missingSignals: metrics.missingSignals,
    confidenceLevel: metrics.confidenceLevel,
    coverageSummary: metrics.coverageSummary,
    historySource: metrics.historySource,
    historyPointCount: metrics.historyPointCount,
    reviewStatus: metrics.reviewStatus,
    isCurated: metrics.isCurated,
    reviewPriority: metrics.reviewPriority,
    sourceLabel: metrics.sourceLabel,
  };
}

function extractUsernameFromUrl(url?: string) {
  if (!url) return "";
  const normalized = url.trim().replace(/\/+$/, "");
  const parts = normalized.split("/");
  return parts[parts.length - 1] || "";
}

function knownMetaForMint(mintAddress: string) {
  return knownTokenMeta[mintAddress];
}

function scoreDiscoveryCandidate(token: RawBagsTokenSnapshot) {
  return (
    (token.verifiedLinks ?? 0) * 25 +
    (token.metadataCompleteness ?? 0) +
    (token.website ? 20 : 0) +
    (token.twitter ? 14 : 0)
  );
}

async function fetchBagsTradeQuote(
  inputMint: string,
  outputMint: string,
  amount: number,
): Promise<QuoteResponse | null> {
  const key = `${inputMint}:${outputMint}:${amount}`;
  const cached = quoteCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const existing = quoteInFlight.get(key);
  if (existing) return existing;

  const request = (async () => {
    try {
      const response = await fetchJson(
        `${env.bagsBaseUrl.replace(/\/$/, "")}/api/v1/trade/quote?inputMint=${encodeURIComponent(inputMint)}&outputMint=${encodeURIComponent(outputMint)}&amount=${amount}`,
        {
          headers: {
            "x-api-key": env.bagsApiKey,
            accept: "application/json",
          },
        },
        8000,
      );
      const quote = (response.response ?? null) as QuoteResponse | null;
      quoteCache.set(key, {
        expiresAt: Date.now() + quoteCacheTtlMs,
        value: quote,
      });
      return quote;
    } catch {
      quoteCache.set(key, {
        expiresAt: Date.now() + 20_000,
        value: null,
      });
      return null;
    } finally {
      quoteInFlight.delete(key);
    }
  })();

  quoteInFlight.set(key, request);
  return request;
}

async function fetchCreatorName(mintAddress: string) {
  const cached = creatorCache.get(mintAddress);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const existing = creatorInFlight.get(mintAddress);
  if (existing) return existing;

  const request = (async () => {
    try {
      const response = await fetchJson(
        `${env.bagsBaseUrl.replace(/\/$/, "")}/api/v1/token-launch/creator/v3?tokenMint=${encodeURIComponent(mintAddress)}`,
        {
          headers: {
            "x-api-key": env.bagsApiKey,
            accept: "application/json",
          },
        },
        8000,
      );
      const rows = Array.isArray(response.response) ? response.response : [];
      const first = (rows[0] ?? {}) as JsonObject;
      const creator =
        safeString(first.username) ||
        safeString(first.bagsUsername) ||
        safeString(first.twitterUsername) ||
        compactCreator(safeString(first.wallet));
      creatorCache.set(mintAddress, {
        expiresAt: Date.now() + creatorCacheTtlMs,
        value: creator,
      });
      return creator;
    } catch {
      return "";
    } finally {
      creatorInFlight.delete(mintAddress);
    }
  })();

  creatorInFlight.set(mintAddress, request);
  return request;
}

async function fetchLifetimeFees(mintAddress: string) {
  const cached = feeCache.get(mintAddress);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const existing = feeInFlight.get(mintAddress);
  if (existing) return existing;

  const request = (async () => {
    try {
      const response = await fetchJson(
        `${env.bagsBaseUrl.replace(/\/$/, "")}/api/v1/token-launch/lifetime-fees?tokenMint=${encodeURIComponent(mintAddress)}`,
        {
          headers: {
            "x-api-key": env.bagsApiKey,
            accept: "application/json",
          },
        },
        8000,
      );
      const value = Number(response.response ?? "0");
      const parsed = Number.isFinite(value) ? value : 0;
      feeCache.set(mintAddress, {
        expiresAt: Date.now() + feeCacheTtlMs,
        value: parsed,
      });
      return parsed;
    } catch {
      return 0;
    } finally {
      feeInFlight.delete(mintAddress);
    }
  })();

  feeInFlight.set(mintAddress, request);
  return request;
}

function chooseBestPair(mintAddress: string, pairs: DexScreenerPair[]) {
  return pairs
    .filter(
      (pair) =>
        pair.chainId === "solana" &&
        safeString(pair.baseToken?.address).toLowerCase() === mintAddress.toLowerCase(),
    )
    .sort((left, right) => {
      const liquidityDelta =
        safeNumber(right.liquidity?.usd) - safeNumber(left.liquidity?.usd);
      if (liquidityDelta !== 0) return liquidityDelta;
      const volumeDelta = safeNumber(right.volume?.h24) - safeNumber(left.volume?.h24);
      if (volumeDelta !== 0) return volumeDelta;
      return safeNumber(left.pairCreatedAt) - safeNumber(right.pairCreatedAt);
    })[0];
}

async function fetchDexMarketSnapshots(mintAddresses: string[]) {
  const sorted = [...new Set(mintAddresses)].sort();
  const key = sorted.join(",");
  const cached = dexBatchCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const chunks: string[][] = [];
  for (let index = 0; index < sorted.length; index += 30) {
    chunks.push(sorted.slice(index, index + 30));
  }

  const mapped = new Map<string, RawDexScreenerSnapshot>();

  for (const chunk of chunks) {
    let rows: DexScreenerPair[] = [];
    try {
      const response = await fetch(
        `https://api.dexscreener.com/tokens/v1/solana/${chunk.join(",")}`,
      );
      if (!response.ok) continue;
      rows = (await response.json()) as DexScreenerPair[];
    } catch {
      continue;
    }

    for (const mintAddress of chunk) {
      const bestPair = chooseBestPair(mintAddress, rows);
      if (!bestPair) continue;
      const known = knownMetaForMint(mintAddress);

      mapped.set(mintAddress, {
        mintAddress,
        name:
          safeString(bestPair.baseToken?.name) ||
          known?.name ||
          mintAddress.slice(0, 8),
        symbol:
          safeString(bestPair.baseToken?.symbol) ||
          known?.symbol ||
          mintAddress.slice(0, 4).toUpperCase(),
        marketPriceUsd: Number(bestPair.priceUsd || "0") || 0,
        marketLiquidityUsd: safeNumber(bestPair.liquidity?.usd),
        marketVolume24hUsd: safeNumber(bestPair.volume?.h24),
        marketPriceChange24hPercent: safeNumber(bestPair.priceChange?.h24),
        quoteImpactPercent: 0,
        quoteDepthUsd: 0,
        quoteVolume24hUsd: 0,
        fdvUsd: 0,
        url: safeString(bestPair.url, known?.website || ""),
        pairCreatedAt: safeNumber(bestPair.pairCreatedAt, 0),
        pairAddress: safeString(bestPair.pairAddress),
      });
    }
  }

  dexBatchCache.set(key, {
    expiresAt: Date.now() + quoteCacheTtlMs,
    value: mapped,
  });
  return mapped;
}

async function fetchGeckoTerminalSnapshot(mintAddress: string) {
  const cached = geckoCache.get(mintAddress);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  try {
    const response = await fetchJson(
      `https://api.geckoterminal.com/api/v2/networks/solana/tokens/${encodeURIComponent(mintAddress)}/pools?page=1`,
      {
        headers: {
          accept: "application/json",
        },
      },
      10000,
    );
    const pools = ((response.data ?? []) as GeckoTerminalPool[])
      .filter((pool) =>
        safeString(pool.relationships?.base_token?.data?.id)
          .toLowerCase()
          .includes(mintAddress.toLowerCase()),
      )
      .sort((left, right) => {
        const liquidityDelta =
          Number(right.attributes?.reserve_in_usd || "0") - Number(left.attributes?.reserve_in_usd || "0");
        if (liquidityDelta !== 0) return liquidityDelta;
        const volumeDelta =
          Number(right.attributes?.volume_usd?.h24 || "0") - Number(left.attributes?.volume_usd?.h24 || "0");
        return volumeDelta;
      });

    const best = pools[0];
    if (!best) {
      geckoCache.set(mintAddress, { expiresAt: Date.now() + 20_000, value: null });
      return null;
    }

    const known = knownMetaForMint(mintAddress);
    const snapshot = {
      mintAddress,
      name: known?.name || mintAddress.slice(0, 8),
      symbol: known?.symbol || mintAddress.slice(0, 4).toUpperCase(),
      marketPriceUsd: Number(best.attributes?.base_token_price_usd || "0") || 0,
      marketLiquidityUsd: Number(best.attributes?.reserve_in_usd || "0") || 0,
      marketVolume24hUsd: Number(best.attributes?.volume_usd?.h24 || "0") || 0,
      marketPriceChange24hPercent:
        Number(best.attributes?.price_change_percentage?.h24 || "0") || 0,
      quoteImpactPercent: 0,
      quoteDepthUsd: 0,
      quoteVolume24hUsd: 0,
      fdvUsd: 0,
      url: known?.website || "",
      pairCreatedAt: best.attributes?.pool_created_at
        ? Date.parse(best.attributes.pool_created_at)
        : 0,
      pairAddress: safeString(best.attributes?.address),
    } satisfies RawDexScreenerSnapshot;

    geckoCache.set(mintAddress, {
      expiresAt: Date.now() + quoteCacheTtlMs,
      value: snapshot,
    });
    return snapshot;
  } catch {
    geckoCache.set(mintAddress, { expiresAt: Date.now() + 20_000, value: null });
    return null;
  }
}

async function fetchMarketSnapshot(mintAddress: string, metadata?: RawBagsTokenSnapshot) {
  const cached = marketCache.get(mintAddress);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const existing = marketInFlight.get(mintAddress);
  if (existing) return existing;

  const request = (async () => {
    const known = knownMetaForMint(mintAddress);
    const batch = await fetchDexMarketSnapshots([mintAddress]);
    let realMarket = batch.get(mintAddress) ?? null;
    if (
      !realMarket ||
      (realMarket.marketPriceUsd <= 0 &&
        realMarket.marketLiquidityUsd <= 0 &&
        realMarket.marketVolume24hUsd <= 0)
    ) {
      realMarket = await fetchGeckoTerminalSnapshot(mintAddress);
    }

    const quoteDepthProbe =
      mintAddress === USDC_MINT
        ? 1_000
        : await (async () => {
            for (const usdAmount of [1_000, 100, 10]) {
              const quote = await fetchBagsTradeQuote(
                USDC_MINT,
                mintAddress,
                usdAmount * 1_000_000,
              );
              if (quote?.outAmount) return usdAmount;
            }
            return 0;
          })();

    const priceQuote =
      mintAddress === USDC_MINT
        ? null
        : await fetchBagsTradeQuote(USDC_MINT, mintAddress, 1_000_000);

    const snapshot =
      realMarket ??
      ({
        mintAddress,
        name: metadata?.name || known?.name || mintAddress.slice(0, 8),
        symbol: metadata?.symbol || known?.symbol || mintAddress.slice(0, 4).toUpperCase(),
        marketPriceUsd: 0,
        marketLiquidityUsd: 0,
        marketVolume24hUsd: 0,
        marketPriceChange24hPercent: 0,
        quoteImpactPercent: safeNumber(
          priceQuote?.priceImpactPct ? Number(priceQuote.priceImpactPct) * -100 : 0,
        ),
        quoteDepthUsd: quoteDepthProbe,
        quoteVolume24hUsd: 0,
        fdvUsd: 0,
        url: metadata?.website || known?.website || "",
        pairCreatedAt: 0,
        pairAddress: safeString(priceQuote?.routePlan?.[0]?.marketKey),
      } satisfies RawDexScreenerSnapshot);

    const finalSnapshot = {
      ...snapshot,
      name: snapshot.name || metadata?.name || known?.name || mintAddress.slice(0, 8),
      symbol:
        snapshot.symbol ||
        metadata?.symbol ||
        known?.symbol ||
        mintAddress.slice(0, 4).toUpperCase(),
      url: snapshot.url || metadata?.website || known?.website || "",
      quoteDepthUsd: quoteDepthProbe,
      quoteImpactPercent:
        snapshot.quoteImpactPercent ||
        safeNumber(priceQuote?.priceImpactPct ? Number(priceQuote.priceImpactPct) * -100 : 0),
      quoteVolume24hUsd: 0,
    } satisfies RawDexScreenerSnapshot;

    marketCache.set(mintAddress, {
      expiresAt: Date.now() + quoteCacheTtlMs,
      value: finalSnapshot,
    });
    return finalSnapshot;
  })().finally(() => {
    marketInFlight.delete(mintAddress);
  });

  marketInFlight.set(mintAddress, request);
  return request;
}

async function fetchSolanaSnapshot(
  mintAddress: string,
): Promise<
  RawSolanaTokenSnapshot & {
    holderEnrichmentFailed: boolean;
    holderFallbackUsed: boolean;
    holderConcentrationPartial: boolean;
  }
> {
  const supplyResult = await postRpc<{ value: { amount: string; decimals: number } }>(
    "getTokenSupply",
    [mintAddress],
  );

  const supplyAmount = Number(supplyResult.value.amount || "0");
  const decimals = safeNumber(supplyResult.value.decimals, 0);
  const supply = decimals > 0 ? supplyAmount / 10 ** decimals : supplyAmount;
  let topHolderPercent = 0;
  let holders = 0;
  let holderEnrichmentFailed = false;
  let holderFallbackUsed = false;
  let holderConcentrationPartial = false;

  try {
    const largestAccountsResult = await postRpc<{ value: Array<{ amount: string }> }>(
      "getTokenLargestAccounts",
      [mintAddress],
      {
        timeoutMs: holderRpcTimeoutMs,
      },
    );
    const largestAccounts = largestAccountsResult.value ?? [];
    holders = Math.max(1, largestAccounts.length * 120);
    topHolderPercent =
      supply > 0 && largestAccounts[0]
        ? Math.min(
            100,
            (Number(largestAccounts[0].amount || "0") / 10 ** decimals / supply) * 100,
          )
        : 0;
  } catch {
    if (env.heliusRpcUrl) {
      try {
        const heliusLargest = await postRpc<{ value: Array<{ amount: string }> }>(
          "getTokenLargestAccounts",
          [mintAddress],
          {
            timeoutMs: holderRpcTimeoutMs + 3000,
            rpcUrls: [env.heliusRpcUrl],
          },
        );
        const largestAccounts = heliusLargest.value ?? [];
        holders = Math.max(1, largestAccounts.length * 120);
        topHolderPercent =
          supply > 0 && largestAccounts[0]
            ? Math.min(
                100,
                (Number(largestAccounts[0].amount || "0") / 10 ** decimals / supply) * 100,
              )
            : 0;
        holderFallbackUsed = true;
      } catch {
        try {
          const tokenProgram = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
          const programAccounts = await postRpc<Array<{ account?: { data?: { parsed?: { info?: { tokenAmount?: { uiAmount?: number }; owner?: string } } } } }>>(
            "getProgramAccounts",
            [
              tokenProgram,
              {
                encoding: "jsonParsed",
                filters: [
                  { dataSize: 165 },
                  {
                    memcmp: {
                      offset: 0,
                      bytes: mintAddress,
                    },
                  },
                ],
              },
            ],
            {
              timeoutMs: holderRpcTimeoutMs + 5000,
              rpcUrls: [env.heliusRpcUrl],
            },
          );
          const ownerBalances = new Map<string, number>();
          for (const row of programAccounts) {
            const owner = safeString(row.account?.data?.parsed?.info?.owner);
            const balance = safeNumber(
              row.account?.data?.parsed?.info?.tokenAmount?.uiAmount,
            );
            if (!owner || balance <= 0) continue;
            ownerBalances.set(owner, (ownerBalances.get(owner) ?? 0) + balance);
          }
          holders = ownerBalances.size;
          if (holders > 0) {
            const largest = Math.max(...ownerBalances.values());
            topHolderPercent = 0;
            holderFallbackUsed = true;
            holderConcentrationPartial = true;
            if (largest > 0 && supply > 0) {
              topHolderPercent = Math.min(100, (largest / supply) * 100);
            }
          } else {
            holderEnrichmentFailed = true;
          }
        } catch {
          holders = 0;
          topHolderPercent = 0;
          holderEnrichmentFailed = true;
        }
      }
    } else {
      holders = 0;
      topHolderPercent = 0;
      holderEnrichmentFailed = true;
    }
  }

  return {
    mintAddress,
    supply,
    decimals,
    holders,
    topHolderPercent: Math.round(topHolderPercent * 10) / 10,
    metadataCompleteness: 60,
    verifiedLinks: 1,
    ageDays: 30,
    holderEnrichmentFailed,
    holderFallbackUsed,
    holderConcentrationPartial,
  };
}

async function fetchBagsDiscoverySnapshots(): Promise<ProviderResult<Map<string, RawBagsTokenSnapshot>>> {
  if (!env.bagsApiKey) {
    return {
      data: new Map(),
      status: createProviderStatus("bags", "missing", "Bags API key is not configured."),
    };
  }

  if (bagsDiscoveryCache && bagsDiscoveryCache.expiresAt > Date.now()) {
    return bagsDiscoveryCache.value;
  }

  if (bagsDiscoveryInFlight) return bagsDiscoveryInFlight;

  bagsDiscoveryInFlight = (async () => {
    try {
      const response = await fetchJson(
        `${env.bagsBaseUrl.replace(/\/$/, "")}/api/v1/token-launch/feed`,
        {
          headers: {
            "x-api-key": env.bagsApiKey,
            accept: "application/json",
          },
        },
        bagsTimeoutMs,
      );
      const rows = Array.isArray(response.response) ? response.response : [];
      const map = new Map<string, RawBagsTokenSnapshot>();

      for (const row of rows as JsonObject[]) {
        const mintAddress = safeString(row.tokenMint);
        if (!mintAddress) continue;

        const name = safeString(row.name, mintAddress.slice(0, 8));
        const symbol = safeString(row.symbol, mintAddress.slice(0, 4).toUpperCase());
        const website = safeString(row.website);
        const twitter = safeString(row.twitter);
        const creatorHint = extractUsernameFromUrl(twitter);
        const verifiedLinks = Number(Boolean(website)) + Number(Boolean(twitter));
        const metadataCompleteness = computeMetadataCompleteness(name, symbol, website);
        const category = safeString(row.status) ? `Bags launch ${safeString(row.status)}` : "Bags launch";

        map.set(mintAddress, {
          mintAddress,
          name,
          symbol,
          description: safeString(row.description),
          website,
          twitter,
          creator: creatorHint || "Bags creator",
          category,
          verifiedLinks,
          metadataCompleteness,
          ageDays:
            safeString(row.status) === "PRE_GRAD"
              ? 1
              : safeString(row.status) === "GRADUATED"
                ? 14
                : 7,
        });
      }

      const value = {
        data: map,
        status: createProviderStatus(
          "bags",
          "connected",
          `Loaded ${map.size} Bags launch candidates.`,
        ),
      } satisfies ProviderResult<Map<string, RawBagsTokenSnapshot>>;

      bagsDiscoveryCache = {
        expiresAt: Date.now() + bagsCacheTtlMs,
        value,
      };

      return value;
    } catch (error) {
      const value = {
        data: new Map<string, RawBagsTokenSnapshot>(),
        status: createProviderStatus(
          "bags",
          "failed",
          `Bags API unavailable: ${error instanceof Error ? error.message : "unknown error"}`,
        ),
      } satisfies ProviderResult<Map<string, RawBagsTokenSnapshot>>;

      bagsDiscoveryCache = {
        expiresAt: Date.now() + 20_000,
        value,
      };

      return value;
    } finally {
      bagsDiscoveryInFlight = undefined;
    }
  })();

  return bagsDiscoveryInFlight;
}

async function buildWatchlistToken(mintAddress: string): Promise<WatchlistTokenResult> {
  try {
    const solana = await fetchSolanaSnapshot(mintAddress);
    const known = knownMetaForMint(mintAddress);
    const market = await fetchMarketSnapshot(mintAddress, known ? { mintAddress, ...known } : undefined);
    const name = market?.name || known?.name || mintAddress.slice(0, 8);
    const symbol = market?.symbol || known?.symbol || mintAddress.slice(0, 4).toUpperCase();
    const marketPriceUsd = market?.marketPriceUsd ?? 0;
    const marketLiquidityUsd = market?.marketLiquidityUsd ?? 0;
    const marketVolume24hUsd = market?.marketVolume24hUsd ?? 0;
    const marketPriceChange24hPercent = market?.marketPriceChange24hPercent ?? 0;
    const quoteDepthUsd = market?.quoteDepthUsd ?? 0;
    const quoteVolume24hUsd = market?.quoteVolume24hUsd ?? 0;
    const quoteImpactPercent = market?.quoteImpactPercent ?? 0;
    const metadataCompleteness = market
      ? computeMetadataCompleteness(name, symbol, market.url)
      : computeMetadataCompleteness(name, symbol, known?.website);
    const verifiedLinks = market?.url || known?.website ? 2 : 1;
    const holderGrowth24hPercent = clampHolderGrowth(quoteImpactPercent / 4);
    const missingSignals = dedupeSignals([
      ...(solana.holderEnrichmentFailed || solana.holders <= 0 ? ["holders"] : []),
      ...(solana.holderConcentrationPartial ? ["topHolderPercent"] : []),
      ...(marketLiquidityUsd <= 0 ? ["marketLiquidity"] : []),
      ...(marketVolume24hUsd <= 0 ? ["marketVolume"] : []),
      ...(marketPriceChange24hPercent === 0 ? ["marketPriceChange"] : []),
      ...(quoteDepthUsd <= 0 ? ["liquidity"] : []),
      ...(quoteVolume24hUsd <= 0 ? ["volume"] : []),
      "fees",
      "holderGrowth",
    ]);
    const provisionalCoverage = computeCoverageSummary({
      holders: solana.holders,
      topHolderPercent: solana.topHolderPercent,
      marketLiquidityUsd,
      marketVolume24hUsd,
      marketPriceChange24hPercent,
      feeVelocityUsd: 0,
      historyPointCount: 0,
      missingSignals,
      sourceTags: ["solana", ...(market ? ["market"] : [])],
    });
    const suppressedHolder = suppressHolderSignals({
      holders: solana.holders,
      topHolderPercent: solana.topHolderPercent,
      missingSignals,
      coverageSummary: {
        chain: provisionalCoverage.chain,
        bags: provisionalCoverage.bags,
        market: provisionalCoverage.market,
        history: provisionalCoverage.history,
        eligibleSignals: provisionalCoverage.eligibleSignals,
        flags: provisionalCoverage.flags,
      },
    });
    const coverage = computeCoverageSummary({
      holders: suppressedHolder.holders,
      topHolderPercent: suppressedHolder.topHolderPercent,
      marketLiquidityUsd,
      marketVolume24hUsd,
      marketPriceChange24hPercent,
      feeVelocityUsd: 0,
      historyPointCount: 0,
      missingSignals: suppressedHolder.missingSignals,
      sourceTags: ["solana", ...(market ? ["market"] : [])],
    });

    return {
      ok: true,
      holderEnrichmentFailed: solana.holderEnrichmentFailed,
      marketEnriched: Boolean(market),
      token: normalizeToken({
        mintAddress,
        name,
        symbol,
        creator: known?.creator || compactCreator(mintAddress),
        category: known?.category || "Live watchlist token",
        ageDays: solana.ageDays,
        holders: suppressedHolder.holders,
        topHolderPercent: suppressedHolder.topHolderPercent,
        marketPriceUsd,
        marketLiquidityUsd,
        marketVolume24hUsd,
        marketPriceChange24hPercent,
        marketPairAddress: market?.pairAddress,
        marketPairCreatedAt: market?.pairCreatedAt,
        quoteDepthUsd,
        quoteVolume24hUsd,
        quoteImpactPercent,
        feeVelocityUsd: 0,
        feeSpikeMultiple: 1,
        holderGrowth24hPercent,
        metadataCompleteness,
        verifiedLinks,
        sentiment: deriveSentiment(quoteImpactPercent, holderGrowth24hPercent),
        history: [],
        isLive: true,
        sourceTags: ["solana", ...(market ? ["market"] : [])],
        missingSignals: suppressedHolder.missingSignals,
        confidenceLevel: coverage.confidenceLevel,
        coverageSummary: {
          chain: coverage.chain,
          bags: coverage.bags,
          market: coverage.market,
          history: coverage.history,
          eligibleSignals: coverage.eligibleSignals,
          flags: coverage.flags,
        },
        historySource: "collecting",
        historyPointCount: 0,
        reviewStatus: "unreviewed",
        isCurated: isCuratedMint(mintAddress),
        reviewPriority: 0,
        sourceLabel: market ? "Live Solana + market stats" : "Live Solana chain data",
      }),
    };
  } catch (error) {
    return {
      ok: false,
      mintAddress,
      reason: error instanceof Error ? error.message : "unknown error",
    };
  }
}

async function fetchWatchlistTokens(): Promise<ProviderResult<Token[]>> {
  const results = await Promise.all(env.liveWatchlistMints.map((mint) => buildWatchlistToken(mint)));
  const tokens = results.filter((item): item is Extract<WatchlistTokenResult, { ok: true }> => item.ok);
  const failed = results.filter((item): item is Extract<WatchlistTokenResult, { ok: false }> => !item.ok);
  const partialHolders = tokens.filter((item) => item.holderEnrichmentFailed).length;
  const marketHits = tokens.filter((item) => item.marketEnriched).length;

  if (tokens.length === 0) {
    return {
      data: [],
      status: createProviderStatus(
        "solana",
        "failed",
        failed.length > 0
          ? `No watchlist live token could be built. Last error: ${failed[0].reason}`
          : "No watchlist live token could be built.",
      ),
    };
  }

  const detail =
    partialHolders > 0
      ? `Loaded ${tokens.length} default creator-token watchlist items. Holder fallback or partial concentration is active for ${partialHolders}, and real market stats are available for ${marketHits}.`
      : `Loaded ${tokens.length} default creator-token watchlist items. Real market stats are available for ${marketHits}.`;

  return {
    data: tokens.map((item) => item.token),
    status: createProviderStatus(
      "solana",
      partialHolders > 0 || failed.length > 0 ? "degraded" : "connected",
      detail,
    ),
  };
}

async function enrichDiscoveryToken(bags: RawBagsTokenSnapshot): Promise<Token | null> {
  const market = await fetchMarketSnapshot(bags.mintAddress, bags);
  if (!market) return null;

  const [creatorName, feeVelocityUsd] = await Promise.all([
    fetchCreatorName(bags.mintAddress),
    fetchLifetimeFees(bags.mintAddress),
  ]);

  const holderGrowth24hPercent =
    typeof bags.holderGrowth24hPercent === "number"
      ? bags.holderGrowth24hPercent
      : clampHolderGrowth(market.marketPriceChange24hPercent / 4);
  const feeSpikeMultiple = feeVelocityUsd > 0 ? Math.max(1, Math.min(4, feeVelocityUsd / 500)) : 1;
  const missingSignals = dedupeSignals([
    "holders",
    ...(market.marketLiquidityUsd <= 0 ? ["marketLiquidity"] : []),
    ...(market.marketVolume24hUsd <= 0 ? ["marketVolume"] : []),
    ...(market.marketPriceChange24hPercent === 0 ? ["marketPriceChange"] : []),
    ...(market.quoteDepthUsd <= 0 ? ["liquidity"] : []),
    ...(market.quoteVolume24hUsd <= 0 ? ["volume"] : []),
    ...(feeVelocityUsd <= 0 ? ["fees"] : []),
  ]);
  const coverage = computeCoverageSummary({
    holders: 0,
    topHolderPercent: 0,
    marketLiquidityUsd: market.marketLiquidityUsd,
    marketVolume24hUsd: market.marketVolume24hUsd,
    marketPriceChange24hPercent: market.marketPriceChange24hPercent,
    feeVelocityUsd,
    historyPointCount: 0,
    missingSignals,
    sourceTags: ["bags", "market"],
  });

  return normalizeToken({
    mintAddress: bags.mintAddress,
    name: bags.name || market.name,
    symbol: bags.symbol || market.symbol,
    creator: creatorName || bags.creator || compactCreator(bags.mintAddress),
    category: bags.category || "Bags discovery",
    ageDays: bags.ageDays ?? 3,
    holders: 0,
    topHolderPercent: 0,
    marketPriceUsd: market.marketPriceUsd,
    marketLiquidityUsd: market.marketLiquidityUsd,
    marketVolume24hUsd: market.marketVolume24hUsd,
    marketPriceChange24hPercent: market.marketPriceChange24hPercent,
    marketPairAddress: market.pairAddress,
    marketPairCreatedAt: market.pairCreatedAt,
    quoteDepthUsd: market.quoteDepthUsd,
    quoteVolume24hUsd: market.quoteVolume24hUsd,
    quoteImpactPercent: market.quoteImpactPercent,
    feeVelocityUsd,
    feeSpikeMultiple,
    holderGrowth24hPercent,
    metadataCompleteness:
      bags.metadataCompleteness ??
      computeMetadataCompleteness(bags.name || market.name, bags.symbol || market.symbol, bags.website || market.url),
    verifiedLinks: bags.verifiedLinks ?? (bags.website || bags.twitter ? 2 : 1),
    history: [],
    sentiment: deriveSentiment(market.quoteImpactPercent, holderGrowth24hPercent),
    isLive: true,
    sourceTags: ["bags", "market"],
    missingSignals,
    confidenceLevel: coverage.confidenceLevel,
    coverageSummary: {
      chain: coverage.chain,
      bags: coverage.bags,
      market: coverage.market,
      history: coverage.history,
      eligibleSignals: coverage.eligibleSignals,
      flags: coverage.flags,
    },
    historySource: "collecting",
    historyPointCount: 0,
    reviewStatus: "unreviewed",
    isCurated: isCuratedMint(bags.mintAddress),
    reviewPriority: 0,
    sourceLabel: "Bags + market stats",
  });
}

function matchesDiscoveryCandidate(token: RawBagsTokenSnapshot, query?: string) {
  if (!query?.trim()) return true;
  const haystack =
    `${token.name ?? ""} ${token.symbol ?? ""} ${token.creator ?? ""} ${token.category ?? ""} ${token.mintAddress}`.toLowerCase();
  return haystack.includes(query.trim().toLowerCase());
}

async function buildDiscoveryTokens(
  bagsData: Map<string, RawBagsTokenSnapshot>,
  options?: {
    query?: string;
    limit?: number;
  },
): Promise<{ tokens: Token[]; marketHits: number; candidateCount: number }> {
  const targetCount = Math.max(1, options?.limit ?? 20);
  const candidateCount = Math.min(
    discoveryMaximumCandidates,
    Math.max(discoveryMinimumCandidates, targetCount * discoveryScanMultiplier),
  );

  const candidates = [...bagsData.values()]
    .filter((token) => matchesDiscoveryCandidate(token, options?.query))
    .sort((left, right) => scoreDiscoveryCandidate(right) - scoreDiscoveryCandidate(left))
    .slice(0, candidateCount);

  const tokens: Token[] = [];
  let scanned = 0;

  for (let index = 0; index < candidates.length && tokens.length < targetCount; index += quoteConcurrency) {
    const batch = candidates.slice(index, index + quoteConcurrency);
    const batchResults = await Promise.all(batch.map((candidate) => enrichDiscoveryToken(candidate)));
    scanned += batch.length;
    for (const token of batchResults) {
      if (!token) continue;
      tokens.push(token);
      if (tokens.length >= targetCount) break;
    }
  }

  return {
    tokens,
    marketHits: tokens.length,
    candidateCount: scanned,
  };
}

function mergeIntoMap(map: Map<string, Token>, token: Token) {
  const current = map.get(token.mintAddress);
  if (!current) {
    map.set(token.mintAddress, token);
    return;
  }

  const currentCompleteness = scoreCoverage(current);
  const incomingCompleteness = scoreCoverage(token);
  const preferred = incomingCompleteness > currentCompleteness ? token : current;
  const secondary = preferred === token ? current : token;
  const mergedSourceTags = Array.from(new Set([...current.sourceTags, ...token.sourceTags]));
  const mergedMissingSignals = dedupeSignals(
    [
      "holders",
      "topHolderPercent",
      "marketLiquidity",
      "marketVolume",
      "marketPriceChange",
      "liquidity",
      "volume",
      "fees",
      "holderGrowth",
    ].filter(
      (signal) =>
        preferred.missingSignals.includes(signal) && secondary.missingSignals.includes(signal),
    ),
  );
  const mergedCoverage = computeCoverageSummary({
    holders: Math.max(preferred.holders, secondary.holders),
    topHolderPercent: Math.max(preferred.topHolderPercent, secondary.topHolderPercent),
    marketLiquidityUsd: Math.max(preferred.marketLiquidityUsd, secondary.marketLiquidityUsd),
    marketVolume24hUsd: Math.max(preferred.marketVolume24hUsd, secondary.marketVolume24hUsd),
    marketPriceChange24hPercent:
      Math.abs(preferred.marketPriceChange24hPercent) >=
      Math.abs(secondary.marketPriceChange24hPercent)
        ? preferred.marketPriceChange24hPercent
        : secondary.marketPriceChange24hPercent,
    feeVelocityUsd: Math.max(preferred.feeVelocityUsd, secondary.feeVelocityUsd),
    historyPointCount: Math.max(preferred.historyPointCount, secondary.historyPointCount),
    missingSignals: mergedMissingSignals,
    sourceTags: mergedSourceTags,
  });

  map.set(token.mintAddress, {
    ...preferred,
    creator: preferred.creator !== "Unknown creator" ? preferred.creator : secondary.creator,
    category:
      preferred.category !== "Bags discovery" && preferred.category !== "Live watchlist token"
        ? preferred.category
        : secondary.category,
    marketPriceUsd: preferred.marketPriceUsd || secondary.marketPriceUsd,
    marketLiquidityUsd: Math.max(preferred.marketLiquidityUsd, secondary.marketLiquidityUsd),
    marketVolume24hUsd: Math.max(preferred.marketVolume24hUsd, secondary.marketVolume24hUsd),
    marketPriceChange24hPercent:
      Math.abs(preferred.marketPriceChange24hPercent) >=
      Math.abs(secondary.marketPriceChange24hPercent)
        ? preferred.marketPriceChange24hPercent
        : secondary.marketPriceChange24hPercent,
    marketPairAddress: preferred.marketPairAddress || secondary.marketPairAddress,
    marketPairCreatedAt: preferred.marketPairCreatedAt || secondary.marketPairCreatedAt,
    feeVelocityUsd: preferred.feeVelocityUsd || secondary.feeVelocityUsd,
    feeSpikeMultiple: preferred.feeSpikeMultiple || secondary.feeSpikeMultiple,
    holderGrowth24hPercent:
      preferred.holderGrowth24hPercent || secondary.holderGrowth24hPercent,
    sourceTags: mergedSourceTags,
    missingSignals: mergedMissingSignals,
    confidenceLevel: mergedCoverage.confidenceLevel,
    coverageSummary: {
      chain: mergedCoverage.chain,
      bags: mergedCoverage.bags,
      market: mergedCoverage.market,
      history: mergedCoverage.history,
      eligibleSignals: mergedCoverage.eligibleSignals,
      flags: mergedCoverage.flags,
    },
    historySource:
      preferred.historySource === "real-snapshots" || secondary.historySource === "real-snapshots"
        ? "real-snapshots"
        : "collecting",
    historyPointCount: Math.max(preferred.historyPointCount, secondary.historyPointCount),
    sourceLabel: "Hybrid live signals",
  });
}

function mergeHybridTokens(watchlistTokens: Token[], discoveryTokens: Token[]) {
  const merged = new Map<string, Token>();

  for (const token of watchlistTokens) mergeIntoMap(merged, token);
  for (const token of discoveryTokens) mergeIntoMap(merged, token);

  return [...merged.values()];
}

function matchesRiskLevel(token: Token, riskLevel?: string) {
  if (!riskLevel) return true;
  return analyzeToken(token).level === riskLevel;
}

function matchesQuery(token: Token, query?: string) {
  if (!query?.trim()) return true;
  const haystack =
    `${token.name} ${token.symbol} ${token.creator} ${token.category} ${token.mintAddress}`.toLowerCase();
  return haystack.includes(query.trim().toLowerCase());
}

function hasUsableMarketCoverage(token: Token) {
  return (
    token.marketPriceUsd > 0 ||
    token.marketLiquidityUsd > 0 ||
    token.marketVolume24hUsd > 0
  );
}

function isCuratedMint(mintAddress: string) {
  return curatedReviewMints.includes(mintAddress);
}

function computeReviewPriority(token: Token) {
  const report = analyzeToken(token);
  const marketRank =
    token.coverageSummary.market === "verified"
      ? 400
      : token.coverageSummary.market === "partial"
        ? 250
        : 0;
  const bagsRank =
    token.coverageSummary.bags === "verified"
      ? 180
      : token.coverageSummary.bags === "partial"
        ? 100
        : 0;
  const chainRank =
    token.coverageSummary.chain === "verified"
      ? 140
      : token.coverageSummary.chain === "partial"
        ? 70
        : 0;
  const historyRank = token.historySource === "real-snapshots" ? 40 : 0;
  const curatedRank = token.isCurated ? 55 : 0;
  const confidenceRank =
    token.confidenceLevel === "high" ? 45 : token.confidenceLevel === "medium" ? 25 : 5;
  const riskRank =
    report.level === "Critical Risk"
      ? 35
      : report.level === "High Risk"
        ? 28
        : report.level === "Moderate Risk"
          ? 18
          : 10;

  return (
    marketRank +
    bagsRank +
    chainRank +
    historyRank +
    curatedRank +
    confidenceRank +
    riskRank +
    report.score
  );
}

async function attachReviewMetadata(token: Token, options?: { curated?: boolean }) {
  const review = await getReview(token.mintAddress);
  const reviewStatus: ReviewStatus = review
    ? review.decision === "Approve"
      ? "approved"
      : review.decision === "Hold"
        ? "hold"
        : "escalated"
    : "unreviewed";
  const isCurated = options?.curated ?? token.isCurated ?? isCuratedMint(token.mintAddress);
  const enriched = {
    ...token,
    reviewStatus,
    isCurated,
  };

  return {
    ...enriched,
    reviewPriority: computeReviewPriority(enriched),
  };
}

async function attachReviewMetadataBatch(tokens: Token[], curatedMints = new Set<string>()) {
  return Promise.all(
    tokens.map((token) =>
      attachReviewMetadata(token, { curated: curatedMints.has(token.mintAddress) || token.isCurated }),
    ),
  );
}

function sortReviewQueue(tokens: Token[]) {
  return [...tokens].sort((left, right) => {
    if (left.reviewPriority !== right.reviewPriority) {
      return right.reviewPriority - left.reviewPriority;
    }

    if (left.isCurated !== right.isCurated) {
      return left.isCurated ? -1 : 1;
    }

    return left.name.localeCompare(right.name);
  });
}

function buildFeedDescription(
  sourceKind: FeedSourceKind,
  providerStatuses: ProviderStatus[],
  fallbackUsed: boolean,
  mode: FeedMode,
) {
  if (fallbackUsed) {
    return mode === "review"
      ? "Curated review candidates were unavailable, so the launch review console is using the local sample queue."
      : "Live providers were unavailable, so the dashboard is using the local sample fallback dataset.";
  }

  const solanaState = providerStatuses.find((item) => item.id === "solana")?.state;
  const marketState = providerStatuses.find((item) => item.id === "dexscreener")?.state;

  if (mode === "review") {
    if (sourceKind === "hybrid") {
      return solanaState === "degraded" || marketState === "degraded"
        ? "Curated launch review queue is live, with discovery supplements and a few partial signals still degrading some evidence cards."
        : "Curated launch review queue is live with creator-token chain facts, Bags discovery evidence, and market-backed review candidates.";
    }

    if (sourceKind === "live-solana") {
      return "Curated review queue is running from the live watchlist while discovery supplements are still thin.";
    }

    if (sourceKind === "live-bags") {
      return "Review queue is running from Bags discovery candidates with market coverage while curated watchlist coverage is still warming up.";
    }
  }

  if (sourceKind === "hybrid") {
    if (solanaState === "degraded" || marketState === "degraded") {
      return "Hybrid feed is live. Watchlist chain data is available, real market stats are partially degraded on some signals, and quote probes remain supplemental.";
    }
    return "Hybrid feed is live with watchlist chain data, Bags creator signals, and real market statistics.";
  }

  if (sourceKind === "live-solana") {
    return solanaState === "degraded"
      ? "Watchlist live data is available, but holder enrichment is partial."
      : "Live Solana data is available for the creator-token watchlist, with real market statistics added when available.";
  }

  return marketState === "connected"
    ? "Live Bags discovery is available with real market statistics."
    : "Live Bags discovery is available, but some real market statistics are still partial.";
}

async function applyHistoryAndCoverage(tokens: Token[]) {
  if (tokens.length === 0) return tokens;

  await appendLiveSnapshots(tokens);

  return Promise.all(
    tokens.map(async (token) => {
      const historyState = await readTokenHistory(token);
      const withHistory: Token = {
        ...token,
        history: historyState.history,
        historySource: historyState.historySource,
        historyPointCount: historyState.historyPointCount,
        coverageSummary: {
          ...token.coverageSummary,
          history: (
            historyState.historySource === "real-snapshots"
              ? "verified"
              : historyState.historyPointCount > 0
                ? "partial"
                : "missing"
          ) as CoverageState,
        },
      };

      return {
        ...withHistory,
        reviewPriority: computeReviewPriority(withHistory),
      };
    }),
  );
}

function buildReviewQueue(
  curatedTokens: Token[],
  discoveryTokens: Token[],
  limit: number,
) {
  const merged = new Map<string, Token>();

  for (const token of curatedTokens) mergeIntoMap(merged, token);
  for (const token of discoveryTokens) mergeIntoMap(merged, token);

  const mergedItems = sortReviewQueue([...merged.values()]);
  const curatedVisible = mergedItems.filter((token) => token.isCurated).slice(0, limit);

  if (curatedVisible.length >= Math.min(limit, 3)) {
    return {
      items: curatedVisible.slice(0, limit),
      queueLabel: "Curated Review Queue",
      curatedVisibleCount: curatedVisible.length,
      discoverySupplementCount: 0,
    };
  }

  const seen = new Set(curatedVisible.map((token) => token.mintAddress));
  const supplements = mergedItems
    .filter((token) => !seen.has(token.mintAddress))
    .slice(0, Math.max(0, limit - curatedVisible.length));

  return {
    items: [...curatedVisible, ...supplements].slice(0, limit),
    queueLabel: supplements.length > 0 ? "Curated + Discovery Review Queue" : "Curated Review Queue",
    curatedVisibleCount: curatedVisible.length,
    discoverySupplementCount: supplements.length,
  };
}

export async function getTokenFeed(options: {
  mode?: FeedMode;
  query?: string;
  riskLevel?: RiskLevel;
  limit?: number;
}): Promise<TokenFeedResponse> {
  const mode = options.mode ?? "review";
  const wantsWatchlist = mode === "watchlist" || mode === "hybrid" || mode === "review";
  const wantsDiscovery = mode === "discovery" || mode === "hybrid" || mode === "review";
  const requestedLimit = Math.max(1, options.limit ?? (mode === "review" ? 6 : 12));

  const watchlistResult = wantsWatchlist
    ? await fetchWatchlistTokens()
    : {
        data: [] as Token[],
        status: createProviderStatus("solana", "configured", "Watchlist live loading is idle for this mode."),
      };

  const bagsResult = wantsDiscovery ? await fetchBagsDiscoverySnapshots() : { data: new Map<string, RawBagsTokenSnapshot>(), status: createIdleBagsStatus() };
  const discoveryBuild = wantsDiscovery
    ? await buildDiscoveryTokens(bagsResult.data, {
        query: options.query,
        limit: Math.max(6, requestedLimit * (mode === "review" ? 2 : 1)),
      })
    : { tokens: [] as Token[], marketHits: 0, candidateCount: 0 };

  const curatedMintSet = new Set(curatedReviewMints);
  const reviewedWatchlist = await attachReviewMetadataBatch(watchlistResult.data, curatedMintSet);
  const reviewedDiscovery = await attachReviewMetadataBatch(discoveryBuild.tokens, curatedMintSet);

  const watchlistMarketHits = reviewedWatchlist.filter((item) => item.sourceTags.includes("market")).length;
  const marketCoveredWatchlist = reviewedWatchlist.filter((item) => hasUsableMarketCoverage(item));
  const marketCoveredDiscovery = reviewedDiscovery.filter((item) => hasUsableMarketCoverage(item));
  const hiddenWatchlistCount = watchlistResult.data.length - marketCoveredWatchlist.length;
  const hiddenDiscoveryCount = reviewedDiscovery.length - marketCoveredDiscovery.length;
  const hybridItems = mergeHybridTokens(marketCoveredWatchlist, marketCoveredDiscovery);
  const reviewQueue = buildReviewQueue(
    marketCoveredWatchlist.filter((token) => token.isCurated),
    marketCoveredDiscovery,
    requestedLimit,
  );

  const providerStatuses: ProviderStatus[] = [
    watchlistResult.status,
    createProviderStatus(
      "dexscreener",
      watchlistMarketHits > 0 || discoveryBuild.marketHits > 0
        ? watchlistMarketHits > 0 && discoveryBuild.marketHits > 0
          ? "connected"
          : "degraded"
        : wantsDiscovery || wantsWatchlist
          ? "failed"
          : "configured",
      watchlistMarketHits > 0 || discoveryBuild.marketHits > 0
        ? mode === "review"
          ? `Primary market stats are available for ${watchlistMarketHits} curated/watchlist items and ${discoveryBuild.marketHits} Bags discovery items. ${reviewQueue.curatedVisibleCount} curated review candidates are visible, ${reviewQueue.discoverySupplementCount} discovery items are supplementing the queue, and ${hiddenWatchlistCount + hiddenDiscoveryCount} weak-market candidates were held back.`
          : `Primary market stats are available for ${watchlistMarketHits} watchlist tokens and ${discoveryBuild.marketHits} Bags discovery tokens. ${hiddenWatchlistCount + hiddenDiscoveryCount} weak-market candidates were hidden from the default live list.`
        : "Real market statistics are currently unavailable for the active mode.",
    ),
    wantsDiscovery
      ? createProviderStatus(
          "bags",
          bagsResult.status.state,
          bagsResult.status.state === "connected"
            ? mode === "review"
              ? `Loaded ${bagsResult.data.size} Bags creator-token discovery candidates. ${reviewQueue.discoverySupplementCount} are actively supplementing the review queue.`
              : `Loaded ${bagsResult.data.size} Bags creator-token discovery candidates and converted ${reviewedDiscovery.length} into live market-enriched tokens.`
            : bagsResult.status.detail,
        )
      : bagsResult.status,
    createProviderStatus("sample", "configured", "Local sample fallback is available."),
  ];

  let items: Token[] = [];
  let sourceKind: FeedSourceKind = "static-sample";
  let queueLabel: string | undefined;

  if (mode === "watchlist") {
    items = marketCoveredWatchlist;
    sourceKind = items.length > 0 ? "live-solana" : "static-sample";
  } else if (mode === "discovery") {
    items = marketCoveredDiscovery;
    sourceKind = items.length > 0 ? "live-bags" : "static-sample";
  } else if (mode === "review") {
    items = reviewQueue.items;
    queueLabel = reviewQueue.queueLabel;
    sourceKind =
      reviewQueue.discoverySupplementCount > 0 && reviewQueue.curatedVisibleCount > 0
        ? "hybrid"
        : reviewQueue.curatedVisibleCount > 0
          ? "live-solana"
          : reviewQueue.discoverySupplementCount > 0
            ? "live-bags"
            : "static-sample";
  } else {
    items = hybridItems;
    sourceKind =
      marketCoveredDiscovery.length > 0 && marketCoveredWatchlist.length > 0
        ? "hybrid"
        : marketCoveredWatchlist.length > 0
          ? "live-solana"
          : marketCoveredDiscovery.length > 0
            ? "live-bags"
            : "static-sample";
  }

  let filtered = items
    .filter((token) => matchesQuery(token, options.query))
    .filter((token) => matchesRiskLevel(token, options.riskLevel))
    .slice(0, requestedLimit);

  filtered = await applyHistoryAndCoverage(filtered);
  filtered = sortReviewQueue(filtered);

  if (items.length === 0) {
    return createSampleFeed(
      mode,
      mode === "review"
        ? "No curated or discovery-backed live review candidates were available, so the launch review console is using the sample queue."
        : "No live tokens were available for this mode, so the dashboard is using the sample fallback dataset.",
      providerStatuses,
    );
  }

  return {
    items: filtered,
    sourceLabel:
      sourceKind === "hybrid"
        ? "Hybrid live signals"
        : sourceKind === "live-solana"
          ? "Live Solana + market stats"
          : sourceKind === "live-bags"
            ? "Live Bags + market stats"
            : "Sample fallback dataset",
    sourceKind,
    updatedAt: nowIso(),
    isLive: sourceKind !== "static-sample",
    description:
      filtered.length === 0
        ? `Live providers are connected, but no tokens matched the current search or risk filter. ${buildFeedDescription(sourceKind, providerStatuses, false, mode)}`
        : buildFeedDescription(sourceKind, providerStatuses, false, mode),
    mode,
    queueLabel,
    providerStatus: providerStatuses,
    fallbackUsed: false,
  };
}

export async function getHealth(): Promise<{
  ok: boolean;
  providerStatus: ProviderStatus[];
  mode: FeedMode;
  sampleFallbackAvailable: boolean;
}> {
  const feed = await getTokenFeed({ mode: "review", limit: 3 });
  return {
    ok: feed.items.some((item) => item.isLive),
    providerStatus: feed.providerStatus,
    mode: "review",
    sampleFallbackAvailable: true,
  };
}

export async function getTokenDetail(mintAddress: string): Promise<TokenDetailResponse | null> {
  const feed = await getTokenFeed({ mode: "review", query: mintAddress, limit: 200 });
  const token = feed.items.find(
    (item) => item.mintAddress === mintAddress || item.id === mintAddress,
  );
  if (!token) return null;
  return {
    token,
    providerStatus: feed.providerStatus,
    sourceKind: feed.sourceKind,
  };
}
