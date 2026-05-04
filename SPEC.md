# Creator Token Risk Copilot Spec

## Summary

Creator Token Risk Copilot is a live Bags API creator launch review workflow.

This version is intentionally scoped as:

- A local review console with real provider integration
- A deterministic rule-based scoring system
- A signed decision workflow for creator launch review
- A demo-ready MVP, not a production governance or trading system

## One-Sentence Pitch

A Bags-native creator-token launch review console that combines live chain facts, Bags creator signals, market coverage, and signed reviewer decisions into one local workflow.

## Core User

- A reviewer screening Bags creator-token launches
- A hackathon judge looking for a real Bags API workflow, not a static dashboard
- A builder exploring creator-token review operations

## Product Shift In This Version

The homepage is no longer a generic hybrid dashboard.

The default entry point is now:

- `mode=review`
- curated live creator-token queue first
- discovery-backed supplements second
- sample fallback only when no live review items are usable

## Workflow States

Each token can be in one of these local review states:

- `unreviewed`
- `in_review`
- `approved`
- `hold`
- `escalated`

## Signed Decision Actions

The user can submit one of three decisions:

- `Approve`
- `Hold`
- `Escalate`

Submission rules:

- Reviewer wallet must be connected
- Reviewer note must be present
- Message must be signed before the review record is stored
- The server must verify the submitted signature before persistence
- `Approve` must be blocked when evidence is not approval-ready

## Review Record Shape

Each persisted review record stores:

- `mintAddress`
- `decision`
- `summary`
- `reviewNotes`
- `reviewedByWallet`
- `walletSignature`
- `signedMessage`
- `reviewedAt`
- `approvalEligible`
- `approvalBlockers`
- `signatureVerified`
- `verifiedAt`
- `launchReviewPacket.creatorProfile`
- `launchReviewPacket.evidenceSnapshot`
- `launchReviewPacket.decisionState`
- `launchReviewPacket.followUpAction`
- `launchReviewPacket.followUpChecklist`
- `decisionSignals.marketCoverage`
- `decisionSignals.holderCoverage`
- `decisionSignals.bagsCoverage`
- `decisionSignals.historyCoverage`
- `decisionSignals.score`
- `decisionSignals.level`

## API Surface

Existing routes retained:

- `GET /api/config`
- `GET /api/health`
- `GET /api/tokens`
- `GET /api/tokens/:mint`

New workflow routes:

- `GET /api/reviews`
- `GET /api/reviews/:mint`
- `POST /api/reviews/:mint`

Review reads must reload from disk so persisted decisions can be verified after restart.

New token mode:

- `GET /api/tokens?mode=review`

Approval-readiness metadata returned on tokens:

- `approvalEligible`
- `approvalBlockers`

## Data Sources

### Bags

- discovery queue
- creator identity
- lifetime fees
- quote probes

### Solana

- supply
- best-effort holder enrichment
- degraded-safe concentration handling

### Market

- DexScreener primary stats
- GeckoTerminal fallback
- quote probes only as supplemental execution hints

### History

- local JSON snapshots
- historical risk recomputed from stored snapshots

## Queue Semantics

Review queue ranking prefers:

1. market-verified items
2. bags-verified items
3. non-missing chain coverage
4. real snapshot history
5. higher risk review urgency

Curated review candidates are allowed to dominate the homepage so the demo remains stable.

Approval eligibility is stricter than review eligibility.

`Approve` is only available for live, non-sample candidates that have:

- verified market coverage
- non-missing chain coverage
- real snapshot history with at least 3 points
- non-low confidence
- no missing core market or holder signals
- no suppressed holder extreme pattern

## Honesty Rules

- Missing holder coverage must remain visible
- Quote probes must not be presented as full market statistics
- Snapshot history must be described as locally collected
- Wallet signing must be described as local review authorization, not as an onchain action
- Sample fallback must not be described as approval evidence
- Follow-up packets must be described as local workflow artifacts

## Out Of Scope For This Round

- onchain execution
- wallet-driven swaps or transfers
- fee-sharing execution
- multi-user collaboration
- cloud sync
- server-side remote trust or onchain verification

## Success Criteria

- Default homepage lands on a stable review queue
- Review decisions can be signed with Phantom or Solflare
- Review signatures are verified locally by the server before persistence
- Weak-evidence candidates can still be reviewed but cannot be approved
- Review state persists after refresh
- Docs, demo assets, and local repo readiness all match the implementation
