# DoraHacks Submission Draft

## Project Name

Creator Token Risk Copilot

## Tagline

A Bags API creator launch review console with signed reviewer decisions.

## Short Description

Creator Token Risk Copilot is a live Bags API MVP that turns creator-token discovery, chain facts, market coverage, and signed wallet-backed reviewer decisions into a single launch review workflow.

## Problem

Most token surfaces optimize for hype, movement, or speculation. A creator-token reviewer needs something more practical: a clear queue, visible evidence, and a defensible review action that can be saved and revisited.

## Solution

This MVP combines live provider data with a real review workflow:

- Curated live creator-token review queue
- Bags discovery-backed queue supplements
- Rule-based score and red flag evidence
- Coverage-aware signal disclosure
- Real snapshot history
- Wallet-connected signed review decision
- Persistent local review ledger
- Launch review packet with follow-up action

## Track Fit

Recommended track: `Bags API`

Why:

- Bags discovery is in the live product path
- creator identity and fee signals are used in scoring context
- the homepage is organized around Bags creator-token review candidates
- the product is no longer just a generic dashboard with a Bags wrapper

## Scope Honesty

This is a live local MVP, not a final production system.

- Bags API integration is real.
- Solana RPC integration is real.
- Market enrichment is real through DexScreener and GeckoTerminal.
- The review flow uses real wallet connection and real message signing.
- Review records are stored locally and not written onchain.
- Each saved review now includes a locally verified creator follow-up packet for the next workflow step.
- The scoring engine is deterministic and rule-based, not model-generated.
- `Approve` is only available when the token passes a stricter approval-evidence gate.

## Core Demo Flow

1. Open the curated review queue.
2. Select a live Bags creator-token candidate.
3. Show risk evidence, coverage, and real snapshot history.
4. Connect Phantom or Solflare.
5. Enter a short review note.
6. Sign and submit `Approve`, `Hold`, or `Escalate`.
7. Refresh or switch tokens to show that the review state persists.

## Why This Is Better Than A Generic Dashboard

- It starts from a launch review queue, not a broad token list.
- It separates evidence from action.
- It attaches a reviewer wallet identity to each final decision.
- It prevents weak-evidence candidates from being approved.
- It is designed around Bags creator-token candidates first.

## Tech Stack

- Vite
- React
- TypeScript
- Tailwind CSS
- Lucide React
- Recharts
- Local Node API layer
- Solana wallet adapter
- Vitest

## Current Limitations

- Some live candidates still have partial holder or market coverage.
- Review signatures are verified locally on the server before they are persisted, but they are not written onchain.
- Sample fallback items can demonstrate workflow, but they are not approval-ready evidence.
- The workflow stops at signed review action and does not yet execute deeper onchain creator operations.

## Why Judges Should Trust It

- The live data path is real.
- The workflow action is real.
- Coverage gaps are disclosed instead of hidden.
- Review state survives refresh, so the product demonstrates more than a one-frame UI.

## Disclaimer

This is not financial advice. The product is a creator-token review MVP and does not execute trades.
