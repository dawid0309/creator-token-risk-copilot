import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Eye,
  FileSignature,
  Info,
  LineChart,
  Search,
  ShieldAlert,
  ShieldCheck,
  Siren,
  Star,
  Wallet,
} from "lucide-react";
import {
  Suspense,
  lazy,
  type CSSProperties,
  useDeferredValue,
  useEffect,
  useState,
} from "react";
import { formatCurrency, formatNumber, formatPercent } from "./lib/format";
import { loadHealth, loadReviews, submitReview } from "./lib/api";
import { analyzeToken } from "./lib/risk-engine";
import { loadTokenFeed } from "./lib/token-provider";
import { readStoredList, writeStoredList } from "./lib/storage";
import type {
  CoverageState,
  HealthResponse,
  ProviderStatus,
  ReviewDecision,
  ReviewRecord,
  ReviewStoreStatus,
  RiskLevel,
  Token,
  TokenFeed,
} from "./types";

const HistoryChart = lazy(() =>
  import("./components/history-chart").then((module) => ({ default: module.HistoryChart })),
);

const watchlistKey = "ctrc-watchlist";
const riskFilters: Array<RiskLevel | "All levels"> = [
  "All levels",
  "Low Risk",
  "Moderate Risk",
  "High Risk",
  "Critical Risk",
];
const decisionOptions: ReviewDecision[] = ["Approve", "Hold", "Escalate"];

function levelClass(level: RiskLevel) {
  if (level === "Low Risk") return "text-emerald-700 bg-emerald-100 border-emerald-200";
  if (level === "Moderate Risk") return "text-amber-700 bg-amber-100 border-amber-200";
  if (level === "High Risk") return "text-orange-700 bg-orange-100 border-orange-200";
  return "text-red-700 bg-red-100 border-red-200";
}

function reviewStatusClass(status: Token["reviewStatus"]) {
  if (status === "approved") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "hold") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "escalated") return "border-red-200 bg-red-50 text-red-700";
  if (status === "in_review") return "border-sky-200 bg-sky-50 text-sky-700";
  return "border-slate-200 bg-slate-100 text-slate-600";
}

function confidenceBadgeClass(level: Token["confidenceLevel"]) {
  if (level === "high") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (level === "medium") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-red-200 bg-red-50 text-red-700";
}

function coverageTone(state: CoverageState) {
  if (state === "verified") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (state === "partial") return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-red-200 bg-red-50 text-red-900";
}

function scoreRing(score: number) {
  return {
    background: `conic-gradient(var(--risk-accent) ${score * 3.6}deg, #e5e7eb 0deg)`,
  };
}

function flagClass(severity: "info" | "medium" | "high" | "critical") {
  if (severity === "critical") return "border-red-300 bg-red-50 text-red-900";
  if (severity === "high") return "border-orange-300 bg-orange-50 text-orange-900";
  if (severity === "medium") return "border-amber-300 bg-amber-50 text-amber-900";
  return "border-emerald-200 bg-emerald-50 text-emerald-900";
}

function flagIcon(severity: "info" | "medium" | "high" | "critical") {
  if (severity === "info") return <CheckCircle2 className="h-4 w-4" />;
  if (severity === "medium") return <Info className="h-4 w-4" />;
  return <AlertTriangle className="h-4 w-4" />;
}

function statusLabel(status: Token["reviewStatus"]) {
  if (status === "approved") return "Approved";
  if (status === "hold") return "Hold";
  if (status === "escalated") return "Escalated";
  if (status === "in_review") return "In review";
  return "Unreviewed";
}

function decisionToStatus(decision: ReviewDecision): Token["reviewStatus"] {
  if (decision === "Approve") return "approved";
  if (decision === "Hold") return "hold";
  return "escalated";
}

function createSignedMessage(input: {
  mintAddress: string;
  decision: ReviewDecision;
  score: number;
  note: string;
}) {
  return [
    "Creator Token Risk Copilot",
    "Action: creator launch review",
    `Mint: ${input.mintAddress}`,
    `Decision: ${input.decision}`,
    `Score: ${input.score}`,
    `Timestamp: ${new Date().toISOString()}`,
    `Note: ${input.note.trim()}`,
  ].join("\n");
}

function encodeMessage(message: string) {
  return new TextEncoder().encode(message);
}

function encodeBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function isReviewPersisted(review: ReviewRecord | null) {
  return Boolean(review?.launchReviewPacket?.createdAt);
}

export default function App() {
  const wallet = useWallet();
  const [feed, setFeed] = useState<TokenFeed | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [reviews, setReviews] = useState<Record<string, ReviewRecord>>({});
  const [reviewStoreStatus, setReviewStoreStatus] = useState<ReviewStoreStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [feedError, setFeedError] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [riskFilter, setRiskFilter] = useState<RiskLevel | "All levels">("All levels");
  const [watchlist, setWatchlist] = useState<string[]>(() => readStoredList(watchlistKey));
  const [reviewNote, setReviewNote] = useState("");
  const [selectedDecision, setSelectedDecision] = useState<ReviewDecision>("Approve");
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [lastSubmitted, setLastSubmitted] = useState("");

  const tokenItems = feed?.items ?? [];
  const selected = tokenItems.find((token) => token.id === selectedId) ?? tokenItems[0];
  const report = selected ? analyzeToken(selected) : null;
  const reviewedCount = tokenItems.filter((token) => token.reviewStatus !== "unreviewed").length;
  const readyFeed = feed;
  const selectedReview = selected ? reviews[selected.mintAddress] ?? null : null;
  const walletAddress = wallet.publicKey?.toBase58() ?? "";
  const canSign = Boolean(wallet.connected && wallet.signMessage && walletAddress);
  const approveBlocked = selectedDecision === "Approve" && !selected.approvalEligible;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setFeedError("");

      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const [nextFeed, nextHealth, nextReviews] = await Promise.all([
            loadTokenFeed({
              query: deferredQuery,
              riskLevel: riskFilter,
            }),
            loadHealth(),
            loadReviews(),
          ]);
          if (cancelled) return;

          setFeed(nextFeed);
          setHealth(nextHealth);
          setReviews(
            Object.fromEntries(nextReviews.items.map((review) => [review.mintAddress, review])),
          );
          setReviewStoreStatus(nextReviews.storeStatus);
          setSelectedId((current) => current || nextFeed.items[0]?.id || "");
          return;
        } catch {
          if (attempt === 2) {
            if (!cancelled) {
              setFeedError("Live review providers are still warming up. Please try again in a moment.");
            }
          } else {
            await new Promise((resolve) => setTimeout(resolve, 700 * (attempt + 1)));
          }
        }
      }
    }

    void load().finally(() => {
      if (!cancelled) {
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [deferredQuery, riskFilter]);

  useEffect(() => {
    writeStoredList(watchlistKey, watchlist);
  }, [watchlist]);

  useEffect(() => {
    if (!selected && tokenItems[0]) {
      setSelectedId(tokenItems[0].id);
      return;
    }

    if (selected && !tokenItems.some((token) => token.id === selected.id) && tokenItems[0]) {
      setSelectedId(tokenItems[0].id);
    }
  }, [selected, tokenItems]);

  useEffect(() => {
    if (!selected) return;
    const review = reviews[selected.mintAddress];
    if (review) {
      setReviewNote(review.reviewNotes);
      setSelectedDecision(review.decision);
    } else {
      setReviewNote("");
      setSelectedDecision("Approve");
    }
    setSubmitError("");
  }, [reviews, selected]);

  function toggleWatchlist(id: string) {
    setWatchlist((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  async function refreshFeedAndReviews() {
    const [nextFeed, nextReviews] = await Promise.all([
      loadTokenFeed({
        query: deferredQuery,
        riskLevel: riskFilter,
      }),
      loadReviews(),
    ]);
    setFeed(nextFeed);
    setReviews(Object.fromEntries(nextReviews.items.map((review) => [review.mintAddress, review])));
    setReviewStoreStatus(nextReviews.storeStatus);
  }

  async function handleSubmitDecision() {
    if (!selected || !report) return;
    if (selectedDecision === "Approve" && !selected.approvalEligible) {
      setSubmitError(selected.approvalBlockers[0] || "Approve is blocked until evidence is stronger.");
      return;
    }
    if (!canSign || !wallet.signMessage) {
      setSubmitError("Connect Phantom or Solflare to sign the review decision.");
      return;
    }
    if (!reviewNote.trim()) {
      setSubmitError("Add a short reviewer note before submitting a decision.");
      return;
    }

    try {
      setSubmitting(true);
      setSubmitError("");

      const signedMessage = createSignedMessage({
        mintAddress: selected.mintAddress,
        decision: selectedDecision,
        score: report.score,
        note: reviewNote,
      });
      const signature = await wallet.signMessage(encodeMessage(signedMessage));

      const result = await submitReview(selected.mintAddress, {
        decision: selectedDecision,
        reviewNotes: reviewNote.trim(),
        reviewedByWallet: walletAddress,
        walletSignature: encodeBase64(signature),
        signedMessage,
      });

      setReviews((current) => ({
        ...current,
        [result.review.mintAddress]: result.review,
      }));
      setReviewStoreStatus(result.storeStatus);
      setFeed((current) =>
        current
          ? {
              ...current,
              items: current.items.map((token) =>
                token.id === selected.id
                  ? { ...token, reviewStatus: decisionToStatus(result.review.decision) }
                  : token,
              ),
            }
          : current,
      );
      await refreshFeedAndReviews();
      setLastSubmitted(`${selectedDecision} submitted for ${selected.symbol}`);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Decision submission failed.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[var(--page)] text-slate-950">
        <div className="mx-auto flex min-h-screen w-full max-w-[1560px] items-center justify-center px-4 py-6">
          <div className="panel w-full max-w-xl">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">
              Loading review queue
            </p>
            <h1 className="mt-3 text-3xl font-black">Creator Launch Review Console</h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Checking curated live candidates, Bags discovery supplements, and recent review state.
            </p>
          </div>
        </div>
      </main>
    );
  }

  if (feedError || !readyFeed) {
    return (
      <main className="min-h-screen bg-[var(--page)] text-slate-950">
        <div className="mx-auto flex min-h-screen w-full max-w-[1560px] items-center justify-center px-4 py-6">
          <div className="panel w-full max-w-xl">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-red-600">
              Queue unavailable
            </p>
            <h1 className="mt-3 text-3xl font-black">Review console offline</h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              {feedError || "No review candidates were available."}
            </p>
          </div>
        </div>
      </main>
    );
  }

  if (!selected || !report) {
    return (
      <main className="min-h-screen bg-[var(--page)] text-slate-950">
        <div className="mx-auto flex min-h-screen w-full max-w-[1560px] items-center justify-center px-4 py-6">
          <div className="panel w-full max-w-2xl">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">
              No matching review items
            </p>
            <h1 className="mt-3 text-3xl font-black">Creator Launch Review Console</h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">{readyFeed.description}</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {(health?.providerStatus ?? readyFeed.providerStatus).map((status) => (
                <ProviderStateRow key={status.id} status={status} />
              ))}
            </div>
          </div>
        </div>
      </main>
    );
  }

  const isWatched = watchlist.includes(selected.id);

  return (
    <main className="min-h-screen bg-[var(--page)] text-slate-950">
      <div className="mx-auto flex w-full max-w-[1560px] flex-col gap-4 px-4 py-4 lg:px-6">
        <header className="review-header">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase text-emerald-700 sm:text-xs">
              <ShieldCheck className="h-4 w-4" />
              Live Bags creator launch review workflow
              <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-slate-500">
                {readyFeed.queueLabel ?? "Review Queue"}
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-slate-500">
                {readyFeed.sourceLabel}
              </span>
            </div>
            <h1 className="text-3xl font-black leading-tight tracking-normal text-slate-950 md:text-5xl">
              Creator Launch Review Console
            </h1>
            <p className="max-w-3xl text-sm leading-6 text-slate-600">
              A wallet-connected Bags creator-token review workflow. The queue favors curated live
              candidates first, then adds discovery-backed supplements, so the demo path stays stable
              while each final decision is signed by the reviewer wallet.
            </p>
          </div>

          <div className="review-header-actions">
            <div className="header-stat">
              <span className="header-stat-label">Queue</span>
              <span className="header-stat-value">{tokenItems.length}</span>
            </div>
            <div className="header-stat">
              <span className="header-stat-label">Reviewed</span>
              <span className="header-stat-value">{reviewedCount}</span>
            </div>
            <div className="wallet-shell">
              <WalletMultiButton className="wallet-button-reset" />
            </div>
          </div>
        </header>

        <section className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)_360px]">
          <aside className="panel h-fit">
            <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
              <Search className="h-4 w-4 text-slate-500" />
              <input
                className="w-full bg-transparent text-sm outline-none"
                placeholder="Search mint, creator, symbol"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_130px]">
              <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-500">
                Curated live candidates stay first. Discovery supplements only fill empty review slots.
              </div>
              <select
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold outline-none"
                value={riskFilter}
                onChange={(event) => setRiskFilter(event.target.value as RiskLevel | "All levels")}
              >
                {riskFilters.map((option) => (
                  <option value={option} key={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-4 flex items-center justify-between">
              <h2 className="section-title">
                <Eye className="h-5 w-5" />
                Review Queue
              </h2>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-black uppercase text-slate-600">
                {readyFeed.queueLabel ?? "Queue"}
              </span>
            </div>

            <div className="mt-3 space-y-2">
              {tokenItems.map((token) => {
                const tokenReport = analyzeToken(token);
                return (
                  <button
                    className={`token-row ${token.id === selected.id ? "token-row-active" : ""}`}
                    key={token.id}
                    onClick={() => setSelectedId(token.id)}
                  >
                    <span className="flex min-w-0 flex-col text-left">
                      <span className="truncate font-bold">{token.name}</span>
                      <span className="truncate text-xs text-slate-500">
                        {token.symbol} by {token.creator}
                      </span>
                      <span className="mt-1 flex flex-wrap gap-1 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
                        <span
                          className={`rounded-full border px-2 py-0.5 ${reviewStatusClass(token.reviewStatus)}`}
                        >
                          {statusLabel(token.reviewStatus)}
                        </span>
                        <span>{token.isCurated ? "Curated" : "Discovery"}</span>
                        <span
                          className={`rounded-full border px-2 py-0.5 ${confidenceBadgeClass(token.confidenceLevel)}`}
                        >
                          {token.confidenceLevel}
                        </span>
                      </span>
                    </span>
                    <span className={`risk-pill ${levelClass(tokenReport.level)}`}>
                      {tokenReport.score}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-5 border-t border-slate-200 pt-4">
              <h2 className="section-label">Watchlist</h2>
              <div className="mt-2 space-y-2">
                {watchlist.length === 0 ? (
                  <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500">
                    No watched review items yet.
                  </p>
                ) : (
                  watchlist.map((id) => {
                    const token = tokenItems.find((item) => item.id === id);
                    if (!token) return null;
                    return (
                      <button className="token-row" key={id} onClick={() => setSelectedId(id)}>
                        <span className="font-bold">{token.name}</span>
                        <Star className="h-4 w-4 text-amber-500" />
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </aside>

          <section className="space-y-4">
            <div className="panel">
              <div className="grid gap-5 xl:grid-cols-[220px_minmax(0,1fr)]">
                <div className="flex items-center justify-center">
                  <div
                    className="score-ring"
                    style={
                      {
                        ...scoreRing(report.score),
                        "--risk-accent":
                          report.score >= 80
                            ? "#059669"
                            : report.score >= 60
                              ? "#d97706"
                              : report.score >= 40
                                ? "#ea580c"
                                : "#dc2626",
                      } as CSSProperties
                    }
                  >
                    <div className="score-ring-inner">
                      <span className="text-5xl font-black">{report.score}</span>
                      <span className="text-xs font-bold uppercase text-slate-500">review score</span>
                    </div>
                  </div>
                </div>

                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`risk-pill ${levelClass(report.level)}`}>{report.level}</span>
                    <span
                      className={`rounded-full border px-3 py-1 text-[11px] font-black uppercase ${reviewStatusClass(selected.reviewStatus)}`}
                    >
                      {statusLabel(selected.reviewStatus)}
                    </span>
                    <span className="rounded-full border border-slate-200 px-3 py-1 text-xs font-bold text-slate-500">
                      {report.action}
                    </span>
                  </div>

                  <h2 className="mt-3 text-3xl font-black tracking-normal">{selected.name}</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {selected.symbol} by {selected.creator} · {selected.category}
                  </p>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-black uppercase text-slate-600">
                      {selected.isCurated ? "Curated candidate" : "Discovery supplement"}
                    </span>
                    <span
                      className={`rounded-full border px-3 py-1 text-[11px] font-black uppercase ${confidenceBadgeClass(selected.confidenceLevel)}`}
                    >
                      {selected.confidenceLevel === "low"
                        ? "Low confidence"
                        : `${selected.confidenceLevel} confidence`}
                    </span>
                    <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-black uppercase text-slate-600">
                      {selected.sourceLabel ?? readyFeed.sourceLabel}
                    </span>
                    <span
                      className={`rounded-full border px-3 py-1 text-[11px] font-black uppercase ${selected.approvalEligible ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}
                    >
                      {selected.approvalEligible ? "Approval ready" : "Approval blocked"}
                    </span>
                  </div>

                  <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                    <div className="mb-2 flex items-center gap-2 text-sm font-black text-emerald-900">
                      <Info className="h-4 w-4" />
                      Review evidence summary
                    </div>
                    <p className="text-sm leading-6 text-emerald-950">{report.summary}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-4">
              {report.dimensions.map((dimension) => (
                <div className="panel compact" key={dimension.id}>
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-black">{dimension.label}</h3>
                    <span className="text-xl font-black">{dimension.score}</span>
                  </div>
                  <div className="mt-3 h-2 rounded-full bg-slate-100">
                    <div
                      className="h-2 rounded-full bg-slate-950"
                      style={{ width: `${dimension.score}%` }}
                    />
                  </div>
                  <p className="mt-3 text-xs leading-5 text-slate-500">{dimension.detail}</p>
                </div>
              ))}
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
              <div className="panel">
                <h2 className="section-title">
                  <ShieldAlert className="h-5 w-5" />
                  Risk + signal evidence
                </h2>
                <div className="mt-4 grid gap-3">
                  {report.redFlags.map((flag) => (
                    <div className={`flag-card ${flagClass(flag.severity)}`} key={flag.id}>
                      {flagIcon(flag.severity)}
                      <div>
                        <h3 className="font-black">{flag.title}</h3>
                        <p className="mt-1 text-sm leading-5 opacity-80">{flag.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="panel">
                <h2 className="section-title">
                  <Wallet className="h-5 w-5" />
                  Decision signals
                </h2>
                <div className="mt-4 grid gap-3">
                  <CoverageRow label="Solana chain signals" state={selected.coverageSummary.chain} />
                  <CoverageRow label="Bags creator signals" state={selected.coverageSummary.bags} />
                  <CoverageRow label="Market statistics" state={selected.coverageSummary.market} />
                  <CoverageRow label="Live history" state={selected.coverageSummary.history} />
                </div>
                <div className="mt-4 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-xs leading-5 text-slate-600">
                  Coverage不足时，分数仅用于初筛。Quote probes 会继续保留，但不会单独支撑强审阅结论。
                </div>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
              <div className="panel">
                <h2 className="section-title">
                  <LineChart className="h-5 w-5" />
                  Live history
                </h2>
                {selected.historySource === "real-snapshots" && selected.historyPointCount >= 3 ? (
                  <>
                    <p className="mt-3 text-xs leading-5 text-slate-500">
                      Historical risk is recalculated from stored live snapshots.
                    </p>
                    <Suspense
                      fallback={
                        <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm leading-6 text-slate-600">
                          Loading live history chart...
                        </div>
                      }
                    >
                      <HistoryChart history={selected.history} />
                    </Suspense>
                  </>
                ) : (
                  <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm leading-6 text-slate-600">
                    Collecting live history. This token currently has {selected.historyPointCount} real
                    snapshot{selected.historyPointCount === 1 ? "" : "s"}, so the chart stays hidden until
                    at least 3 points are available.
                  </div>
                )}
              </div>

              <div className="panel">
                <h2 className="section-title">
                  <FileSignature className="h-5 w-5" />
                  Review evidence card
                </h2>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <Metric
                    label="Market liquidity"
                    value={
                      selected.marketLiquidityUsd > 0
                        ? formatCurrency(selected.marketLiquidityUsd)
                        : "Unavailable"
                    }
                  />
                  <Metric
                    label="24h volume"
                    value={
                      selected.marketVolume24hUsd > 0
                        ? formatCurrency(selected.marketVolume24hUsd)
                        : "Unavailable"
                    }
                  />
                  <Metric
                    label="Solana holders"
                    value={selected.holders > 0 ? formatNumber(selected.holders) : "Needs more data"}
                  />
                  <Metric
                    label="Top holder"
                    value={
                      selected.coverageSummary.chain === "verified" && selected.topHolderPercent > 0
                        ? `${selected.topHolderPercent}%`
                        : "Needs more data"
                    }
                  />
                  <Metric
                    label="24h price change"
                    value={
                      selected.marketPriceChange24hPercent !== 0
                        ? formatPercent(selected.marketPriceChange24hPercent)
                        : "Unavailable"
                    }
                  />
                  <Metric label="Fee velocity" value={`${selected.feeSpikeMultiple.toFixed(1)}x`} />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <Metric
                    label="Quote depth probe"
                    value={selected.quoteDepthUsd > 0 ? formatCurrency(selected.quoteDepthUsd) : "Unavailable"}
                  />
                  <Metric
                    label="Quote impact probe"
                    value={
                      selected.quoteImpactPercent !== 0
                        ? formatPercent(selected.quoteImpactPercent)
                        : "Unavailable"
                    }
                  />
                </div>
              </div>
            </div>
          </section>

          <aside className="space-y-4">
            <div className="panel">
              <h2 className="section-title">
                <FileSignature className="h-5 w-5" />
                Decision Console
              </h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Connect a reviewer wallet, leave a short note, then sign the decision message to move
                this token into an auditable review state.
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                {decisionOptions.map((decision) => (
                  <button
                    className={`decision-chip ${selectedDecision === decision ? "decision-chip-active" : ""}`}
                    key={decision}
                    disabled={decision === "Approve" && !selected.approvalEligible}
                    onClick={() => setSelectedDecision(decision)}
                  >
                    {decision}
                  </button>
                ))}
              </div>

              {!selected.approvalEligible ? (
                <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                  <div className="font-black uppercase">Approve blocked</div>
                  <div className="mt-2">
                    {selected.approvalBlockers.length > 0
                      ? selected.approvalBlockers.join(" · ")
                      : "This token still needs stronger evidence before approval."}
                  </div>
                </div>
              ) : (
                <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs leading-5 text-emerald-900">
                  Approval-ready evidence is available for this live token.
                </div>
              )}

              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                <p className="font-black text-slate-900">Reviewer wallet</p>
                <p className="mt-2 break-all text-xs leading-5">
                  {walletAddress || "Connect Phantom or Solflare to unlock signed review submission."}
                </p>
              </div>

              <textarea
                className="review-textarea mt-4"
                placeholder="Add a short reviewer note explaining why this launch candidate should be approved, held, or escalated."
                rows={6}
                value={reviewNote}
                onChange={(event) => setReviewNote(event.target.value)}
              />

              <button
                className="primary-button mt-4 w-full justify-center"
                onClick={() => {
                  if (selected.reviewStatus === "unreviewed") {
                    setFeed((current) =>
                      current
                        ? {
                            ...current,
                            items: current.items.map((token) =>
                              token.id === selected.id ? { ...token, reviewStatus: "in_review" } : token,
                            ),
                          }
                        : current,
                    );
                  }
                }}
              >
                <Clock3 className="h-4 w-4" />
                Mark in review
              </button>

              <button
                className="primary-button mt-3 w-full justify-center"
                onClick={() => void handleSubmitDecision()}
                disabled={submitting || approveBlocked}
              >
                <FileSignature className="h-4 w-4" />
                {submitting ? "Signing decision..." : `Sign and submit ${selectedDecision}`}
              </button>

              {submitError ? (
                <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {submitError}
                </p>
              ) : null}

              {lastSubmitted ? (
                <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                  {lastSubmitted}
                </p>
              ) : null}

              {selectedReview ? (
                <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`rounded-full border px-3 py-1 text-[11px] font-black uppercase ${reviewStatusClass(decisionToStatus(selectedReview.decision))}`}
                    >
                      {selectedReview.decision}
                    </span>
                    <span className="text-[11px] font-black uppercase text-slate-500">
                      {new Date(selectedReview.reviewedAt).toLocaleString()}
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-700">{selectedReview.reviewNotes}</p>
                  <div className="mt-3 grid gap-2 text-xs text-slate-500">
                    <span>Wallet: {selectedReview.reviewedByWallet}</span>
                    <span>Signature saved: {selectedReview.walletSignature.slice(0, 24)}...</span>
                    <span>Signature verified: {selectedReview.signatureVerified ? "yes" : "no"}</span>
                    <span>Packet saved: {isReviewPersisted(selectedReview) ? "yes" : "no"}</span>
                    <span>
                      Disk synced: {reviewStoreStatus?.diskSynced ? "yes" : "pending"}
                      {reviewStoreStatus?.lastPersistedAt
                        ? ` · ${new Date(reviewStoreStatus.lastPersistedAt).toLocaleString()}`
                        : ""}
                    </span>
                  </div>
                  <div className="mt-3 grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-[11px] leading-5 text-slate-600">
                    <span>
                      Evidence state:{" "}
                      {selectedReview.approvalEligible ? "Approval-ready evidence" : "Partial evidence review"}
                    </span>
                    <span>Follow-up action: {selectedReview.launchReviewPacket.followUpAction}</span>
                    <span>Creator: {selectedReview.launchReviewPacket.creatorProfile.creator}</span>
                    <span>
                      Market:{" "}
                      {selectedReview.launchReviewPacket.evidenceSnapshot.marketSignal.liquidityUsd > 0
                        ? formatCurrency(selectedReview.launchReviewPacket.evidenceSnapshot.marketSignal.liquidityUsd)
                        : "Thin"}
                      {" / "}
                      {selectedReview.launchReviewPacket.evidenceSnapshot.marketSignal.volume24hUsd > 0
                        ? formatCurrency(selectedReview.launchReviewPacket.evidenceSnapshot.marketSignal.volume24hUsd)
                        : "No volume"}
                    </span>
                    <span>
                      History: {selectedReview.launchReviewPacket.evidenceSnapshot.historySignal.historySource} ·{" "}
                      {selectedReview.launchReviewPacket.evidenceSnapshot.historySignal.historyPointCount} points
                    </span>
                    <span>
                      Blockers:{" "}
                      {selectedReview.approvalBlockers.length > 0
                        ? selectedReview.approvalBlockers.join(" · ")
                        : "none"}
                    </span>
                    <span>
                      Checklist: {selectedReview.launchReviewPacket.followUpChecklist.join(" · ")}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600">
                  No signed review decision has been saved for this token yet.
                </div>
              )}
            </div>

            <div className="panel">
              <h2 className="section-title">
                <Siren className="h-5 w-5" />
                Queue status
              </h2>
              <div className="mt-4 grid gap-3">
                <Metric label="Queue label" value={readyFeed.queueLabel ?? "Review Queue"} />
                <Metric label="Source type" value={readyFeed.sourceLabel} />
                <Metric label="Current state" value={statusLabel(selected.reviewStatus)} />
                <Metric label="Confidence" value={selected.confidenceLevel} />
                <Metric label="Approval" value={selected.approvalEligible ? "Ready" : "Blocked"} />
                <Metric
                  label="Review ledger"
                  value={
                    reviewStoreStatus
                      ? `${reviewStoreStatus.reviewCount} saved${reviewStoreStatus.diskSynced ? " · disk synced" : ""}`
                      : "Loading"
                  }
                />
              </div>
              <div className="mt-4 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-600">
                {readyFeed.description}
              </div>
              {reviewStoreStatus ? (
                <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3 text-xs leading-5 text-slate-600">
                  <div>Storage path: {reviewStoreStatus.storagePath}</div>
                  <div>
                    Last disk reload:{" "}
                    {reviewStoreStatus.lastReloadedAt
                      ? new Date(reviewStoreStatus.lastReloadedAt).toLocaleString()
                      : "Not yet"}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="panel">
              <h2 className="section-title">Provider notes</h2>
              <div className="mt-4 space-y-2">
                {(health?.providerStatus ?? readyFeed.providerStatus).map((status) => (
                  <ProviderStateRow key={status.id} status={status} />
                ))}
              </div>
            </div>

            <div className="panel">
              <h2 className="section-title">Quick actions</h2>
              <div className="mt-4 space-y-3">
                <button className="icon-link-row" onClick={() => toggleWatchlist(selected.id)}>
                  <span className="flex items-center gap-2">
                    <Star className={`h-4 w-4 ${isWatched ? "fill-amber-400 text-amber-500" : ""}`} />
                    {isWatched ? "Watching this candidate" : "Add to watchlist"}
                  </span>
                </button>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-600">
                  Curated candidates keep the homepage stable. Discovery items still surface when they
                  have enough live market coverage to support review.
                </div>
              </div>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}

function ProviderStateRow({ status }: { status: ProviderStatus }) {
  const tone =
    status.state === "connected" || status.state === "configured"
      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
      : status.state === "missing" || status.state === "degraded"
        ? "border-amber-200 bg-amber-50 text-amber-900"
        : "border-red-200 bg-red-50 text-red-900";

  return (
    <div className={`rounded-lg border px-3 py-3 ${tone}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-black uppercase tracking-[0.12em]">{status.label}</span>
        <span className="text-[11px] font-black uppercase">{status.state}</span>
      </div>
      <p className="mt-2 text-xs leading-5 opacity-85">{status.detail}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-bold uppercase text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-black">{value}</p>
    </div>
  );
}

function CoverageRow({ label, state }: { label: string; state: CoverageState }) {
  return (
    <div className={`rounded-lg border px-3 py-3 ${coverageTone(state)}`}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-black">{label}</span>
        <span className="text-[11px] font-black uppercase">{state}</span>
      </div>
    </div>
  );
}
