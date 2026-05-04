# DoraHacks Submission Draft

## Project Name

Creator Token Risk Copilot

## Track

`Bags API`

## Tagline

A Bags-native creator launch review workflow with signed reviewer decisions.

## One-Line Description

Creator Token Risk Copilot turns Bags creator-token discovery, live market and chain signals, and wallet-signed review decisions into a single launch review workflow.

## Short Description

Creator Token Risk Copilot is a live Bags API review console for creator-token screening. It combines Bags discovery, creator and fee signals, Solana chain facts, market coverage, local history snapshots, and wallet-signed reviewer decisions in one workflow. Instead of just showing a score, it helps a reviewer inspect evidence, apply an approval gate, save a signed decision, and generate a follow-up review packet.

## Problem

Creator-token review is usually fragmented. Discovery lives in one place, chain facts in another, market context in another, and final decisions are often informal. That makes it hard to run a repeatable review process or explain why a token was approved, held, or escalated.

## Solution

This project turns that process into a single local workflow:

- A curated Bags creator-token review queue
- Live Bags discovery, creator identity, and fee context
- Solana chain facts with degraded-safe holder handling
- DexScreener primary market stats with GeckoTerminal fallback
- Real locally collected history snapshots
- Wallet-connected signed review actions
- Persistent local review ledger
- A structured creator follow-up packet after each decision

## Why This Fits Bags API

This is not a generic token dashboard with Bags added at the end. Bags sits on the main product path:

- the default homepage is a creator-token review queue
- Bags discovery supplies review candidates
- Bags creator and fee signals feed the evidence layer
- the workflow is framed around creator launch review, not general token browsing

## What Is Real In This Build

- Real Bags API integration
- Real Solana RPC integration
- Real market enrichment through DexScreener and GeckoTerminal
- Real wallet connection and message signing
- Local server-side signature verification before a review is saved
- Persistent review records that reload from disk after restart
- An approval gate that blocks weak-evidence candidates from being approved

## Core Workflow

1. Open the curated review queue.
2. Select a live Bags creator-token candidate.
3. Inspect score, red flags, coverage, and live history.
4. Connect Phantom or Solflare.
5. Add a short reviewer note.
6. Sign and submit `Approve`, `Hold`, or `Escalate`.
7. Save the decision, verification state, and creator follow-up packet to the local review ledger.

## Differentiation

Most Bags demos in this category stop at explanation. This project pushes one step further:

- it starts from a review queue, not a generic token list
- it separates evidence quality from final action
- it prevents weak-evidence candidates from being approved
- it ties the final decision to a reviewer wallet and signed message
- it produces a follow-up workflow artifact, not just a score

## Scope Honesty

This is a local workflow MVP, not a production governance system.

- Review records are stored locally, not onchain.
- Signatures are verified locally by the server, not through an external trust layer.
- Default review flow is live-only.
- Sample data is retained only as an explicit internal demo fallback and is not approval-ready evidence.
- The scoring engine is deterministic and rule-based, not model-generated.
- The product stops at signed review action and follow-up planning, not onchain execution.

## Current Limitations

- Some live candidates still have partial holder or market coverage.
- History is real but locally accumulated over time, not backfilled from a third-party historical source.
- The workflow is local-only and not yet a shared multi-user or onchain review system.

## Demo Link / Repo

Repository: [github.com/dawid0309/creator-token-risk-copilot](https://github.com/dawid0309/creator-token-risk-copilot)

## Why Judges Should Trust It

- The data path is real.
- The workflow action is real.
- Coverage gaps are exposed instead of hidden.
- Approval is harder than review.
- Saved decisions survive refresh and restart, so this is more than a one-screen demo.

## Disclaimer

This project is an educational creator-token review MVP. It does not provide financial advice and does not execute trades.
