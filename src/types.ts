export type Sentiment = "cooling" | "neutral" | "warming" | "heated";
export type ConfidenceLevel = "high" | "medium" | "low";
export type CoverageState = "verified" | "partial" | "missing";
export type ReviewStatus =
  | "unreviewed"
  | "in_review"
  | "approved"
  | "hold"
  | "escalated";
export type ReviewDecision = "Approve" | "Hold" | "Escalate";

export type CoverageSummary = {
  chain: CoverageState;
  bags: CoverageState;
  market: CoverageState;
  history: CoverageState;
  eligibleSignals: string[];
  flags: string[];
};

export type TokenHistoryPoint = {
  day: string;
  risk: number;
  volume: number;
  holders: number;
};

export type Token = {
  id: string;
  mintAddress: string;
  name: string;
  symbol: string;
  creator: string;
  category: string;
  ageDays: number;
  holders: number;
  topHolderPercent: number;
  marketPriceUsd: number;
  marketLiquidityUsd: number;
  marketVolume24hUsd: number;
  marketPriceChange24hPercent: number;
  marketPairAddress?: string;
  marketPairCreatedAt?: number;
  quoteDepthUsd: number;
  quoteVolume24hUsd: number;
  quoteImpactPercent: number;
  feeVelocityUsd: number;
  feeSpikeMultiple: number;
  holderGrowth24hPercent: number;
  metadataCompleteness: number;
  verifiedLinks: number;
  sentiment: Sentiment;
  history: TokenHistoryPoint[];
  isLive: boolean;
  sourceTags: string[];
  missingSignals: string[];
  confidenceLevel: ConfidenceLevel;
  coverageSummary: CoverageSummary;
  historySource: "real-snapshots" | "collecting" | "sample-static";
  historyPointCount: number;
  reviewStatus: ReviewStatus;
  isCurated: boolean;
  reviewPriority: number;
  sourceLabel?: string;
};

export type RiskLevel =
  | "Low Risk"
  | "Moderate Risk"
  | "High Risk"
  | "Critical Risk";

export type RiskAction =
  | "Monitor"
  | "Review Carefully"
  | "High Caution"
  | "Needs More Data";

export type RiskDimension = {
  id: string;
  label: string;
  score: number;
  detail: string;
  weighting: "primary" | "informational";
};

export type RedFlag = {
  id: string;
  severity: "info" | "medium" | "high" | "critical";
  title: string;
  detail: string;
};

export type RiskReport = {
  tokenId: string;
  score: number;
  level: RiskLevel;
  action: RiskAction;
  confidenceLevel: ConfidenceLevel;
  dimensions: RiskDimension[];
  redFlags: RedFlag[];
  summary: string;
};

export type AlertPresetId = "score" | "volatility" | "holders" | "fees";

export type AlertPreset = {
  id: AlertPresetId;
  label: string;
  description: string;
};

export type AlertEvaluation = {
  id: AlertPresetId;
  triggered: boolean;
  detail: string;
};

export type FeedSourceKind = "live-solana" | "live-bags" | "hybrid" | "static-sample";
export type FeedMode = "watchlist" | "discovery" | "hybrid" | "review";

export type ProviderState = "connected" | "configured" | "degraded" | "failed" | "missing";

export type ProviderStatus = {
  id: "solana" | "dexscreener" | "bags" | "sample";
  label: string;
  state: ProviderState;
  detail: string;
  updatedAt: string;
};

export type TokenFeed = {
  items: Token[];
  sourceLabel: string;
  sourceKind: FeedSourceKind;
  updatedAt: string;
  isLive: boolean;
  description: string;
  mode: FeedMode;
  queueLabel?: string;
  providerStatus: ProviderStatus[];
};

export type TokenFeedResponse = TokenFeed & {
  fallbackUsed: boolean;
};

export type AppConfig = {
  apiBaseUrl: string;
  defaultMode: FeedMode;
};

export type HealthResponse = {
  ok: boolean;
  providerStatus: ProviderStatus[];
  mode: FeedMode;
  sampleFallbackAvailable: boolean;
};

export type TokenDetailResponse = {
  token: Token;
  providerStatus: ProviderStatus[];
  sourceKind: FeedSourceKind;
};

export type ReviewDecisionSignals = {
  marketCoverage: CoverageState;
  holderCoverage: CoverageState;
  bagsCoverage: CoverageState;
  historyCoverage: CoverageState;
  score: number;
  level: RiskLevel;
};

export type ReviewRecord = {
  mintAddress: string;
  decision: ReviewDecision;
  summary: string;
  reviewNotes: string;
  reviewedByWallet: string;
  walletSignature: string;
  signedMessage: string;
  reviewedAt: string;
  decisionSignals: ReviewDecisionSignals;
};

export type ReviewSubmitPayload = {
  decision: ReviewDecision;
  reviewNotes: string;
  reviewedByWallet: string;
  walletSignature: string;
  signedMessage: string;
};

export type ReviewListResponse = {
  items: ReviewRecord[];
  updatedAt: string;
};

export type ReviewDetailResponse = {
  review: ReviewRecord | null;
};

export type ReviewSubmitResponse = {
  review: ReviewRecord;
};

export type RawSolanaTokenSnapshot = {
  mintAddress: string;
  supply: number;
  decimals: number;
  holders: number;
  topHolderPercent: number;
  metadataCompleteness: number;
  verifiedLinks: number;
  ageDays: number;
};

export type RawDexScreenerSnapshot = {
  mintAddress: string;
  name: string;
  symbol: string;
  marketPriceUsd: number;
  marketLiquidityUsd: number;
  marketVolume24hUsd: number;
  marketPriceChange24hPercent: number;
  quoteImpactPercent: number;
  quoteDepthUsd: number;
  quoteVolume24hUsd: number;
  fdvUsd: number;
  url?: string;
  pairCreatedAt?: number;
  pairAddress?: string;
};

export type RawBagsTokenSnapshot = {
  mintAddress: string;
  name?: string;
  symbol?: string;
  description?: string;
  image?: string;
  website?: string;
  twitter?: string;
  creatorWallet?: string;
  creator?: string;
  category?: string;
  feeVelocityUsd?: number;
  feeSpikeMultiple?: number;
  holderGrowth24hPercent?: number;
  pools?: number;
  quotePriceUsd?: number;
  quoteDepthUsd?: number;
  quoteVolume24hUsd?: number;
  quoteImpactPercent?: number;
  ageDays?: number;
  verifiedLinks?: number;
  metadataCompleteness?: number;
};

export type NormalizedTokenMetrics = {
  mintAddress: string;
  name: string;
  symbol: string;
  creator: string;
  category: string;
  ageDays: number;
  holders: number;
  topHolderPercent: number;
  marketPriceUsd: number;
  marketLiquidityUsd: number;
  marketVolume24hUsd: number;
  marketPriceChange24hPercent: number;
  marketPairAddress?: string;
  marketPairCreatedAt?: number;
  quoteDepthUsd: number;
  quoteVolume24hUsd: number;
  quoteImpactPercent: number;
  feeVelocityUsd: number;
  feeSpikeMultiple: number;
  holderGrowth24hPercent: number;
  metadataCompleteness: number;
  verifiedLinks: number;
  history: TokenHistoryPoint[];
  sentiment: Sentiment;
  isLive: boolean;
  sourceTags: string[];
  missingSignals: string[];
  confidenceLevel: ConfidenceLevel;
  coverageSummary: CoverageSummary;
  historySource: "real-snapshots" | "collecting" | "sample-static";
  historyPointCount: number;
  reviewStatus: ReviewStatus;
  isCurated: boolean;
  reviewPriority: number;
  sourceLabel?: string;
};
