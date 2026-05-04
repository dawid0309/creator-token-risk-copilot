# Creator Token Risk Copilot

Creator Token Risk Copilot is now a live Bags API creator launch review workflow, not just a passive risk panel.

The current build combines:

- A curated live review queue for Bags creator-token candidates
- Bags discovery, creator identity, and fee signals
- Solana RPC chain facts with degraded-safe holder handling
- DexScreener plus GeckoTerminal market coverage
- Real local snapshot history
- A wallet-connected decision console that signs review outcomes
- A persisted launch review packet for each signed decision

## What This Version Is

- A live hybrid MVP built around `Bags API`
- A creator launch review console with signed review actions
- Honest about coverage gaps, proxy probes, and partial chain evidence
- Runnable locally with a small Node API and React frontend

## What This Version Is Not

- Not an AI agent
- Not a model-reasoning copilot
- Not a fully trusted production risk terminal
- Not an onchain execution tool

## Product Flow

1. Open the curated review queue.
2. Inspect a Bags creator-token candidate.
3. Review risk score, red flags, coverage, and live history.
4. Connect Phantom or Solflare.
5. Add a short reviewer note.
6. Sign and submit `Approve`, `Hold`, or `Escalate`.
7. Persist the signed decision and launch review packet into the local review ledger.

## Main Architecture

- `src/` contains the React review console and rule-based risk engine.
- `server/` contains the local API, provider aggregation, history snapshots, and review persistence.
- `server/state/live-history.json` stores real snapshot history.
- `server/state/reviews.json` stores signed local review decisions.
- Review reads refresh from disk so saved decisions can be verified after restart.

## Current Live Data Reality

- Bags API provides discovery, creator identity, lifetime fees, and quote probes.
- Solana RPC provides supply plus best-effort holder enrichment.
- DexScreener is the primary market stats layer.
- GeckoTerminal is the secondary market fallback.
- Quote probes remain supplemental execution signals, not full market stats.
- Curated review mode prefers market-covered creator-token candidates and only supplements with discovery when needed.

## Important Limits

- Some live candidates still have partial holder coverage.
- Quote probes are still weaker than full execution analytics.
- Snapshot history is real, but it is locally accumulated over time rather than backfilled from an external historical data source.
- Wallet signing is real, and review submission now includes local server-side signature verification.
- Review packets are local workflow artifacts, not onchain governance records.

## Run Locally

```bash
npm install
npm run dev
```

Server-side environment values live in `.env`.

Important variables:

- `BAGS_API_KEY`
- `BAGS_BASE_URL`
- `SOLANA_RPC_URL`
- `HELIUS_API_KEY` (optional)
- `HELIUS_RPC_URL` (optional)
- `LIVE_WATCHLIST_MINTS`
- `VITE_API_BASE_URL`

## Verify

```bash
npm run test
npm run build
```

## Demo Focus

This round is optimized for a stable demo:

- Homepage defaults to `mode=review`
- Curated live creator-token candidates come first
- Discovery only supplements the queue
- Sample fallback only appears when no live review items are usable

## Submission Assets

- `DEMO_SCRIPT.md`
- `DEMO_CHECKLIST.md`
- `DEMO_STORYBOARD.md`
- `REPO_READY.md`

## Disclaimer

This project is an educational creator-token review MVP. It does not provide financial advice and does not execute trades.
