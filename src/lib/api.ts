import type {
  AppConfig,
  FeedMode,
  HealthResponse,
  ReviewDetailResponse,
  ReviewListResponse,
  ReviewSubmitPayload,
  ReviewSubmitResponse,
  RiskLevel,
  TokenDetailResponse,
  TokenFeedResponse,
} from "../types";

const fallbackApiBase = import.meta.env.VITE_API_BASE_URL || "http://localhost:4173";

async function getJson<T>(path: string) {
  const response = await fetch(`${fallbackApiBase}${path}`);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return (await response.json()) as T;
}

export async function loadAppConfig() {
  return getJson<AppConfig>("/api/config");
}

export async function loadHealth() {
  return getJson<HealthResponse>("/api/health");
}

export async function loadTokenFeedRequest({
  mode = "review",
  query,
  riskLevel,
}: {
  mode?: FeedMode;
  query?: string;
  riskLevel?: RiskLevel | "All levels";
}) {
  const params = new URLSearchParams();
  params.set("mode", mode);
  if (query?.trim()) params.set("query", query.trim());
  if (riskLevel && riskLevel !== "All levels") params.set("riskLevel", riskLevel);
  return getJson<TokenFeedResponse>(`/api/tokens?${params.toString()}`);
}

export async function loadTokenDetail(mintAddress: string) {
  return getJson<TokenDetailResponse>(`/api/tokens/${mintAddress}`);
}

export async function loadReviews() {
  return getJson<ReviewListResponse>("/api/reviews");
}

export async function loadReview(mintAddress: string) {
  return getJson<ReviewDetailResponse>(`/api/reviews/${mintAddress}`);
}

export async function submitReview(mintAddress: string, payload: ReviewSubmitPayload) {
  const response = await fetch(`${fallbackApiBase}/api/reviews/${mintAddress}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(data?.message || `Request failed: ${response.status}`);
  }

  return (await response.json()) as ReviewSubmitResponse;
}
