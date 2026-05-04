# Manual Verification

## Goal

Run the highest-value live checks that are not suitable for browser automation, especially wallet signing and review persistence.

## Live Review Queue

1. Start the app locally.
2. Confirm the API base is pointing at the Creator Token Risk Copilot server rather than another local service.
2. Open the homepage.
3. Confirm the app lands on the live review queue by default.
4. Confirm the queue does not show sample items by default.
5. If no live candidates are available, confirm the empty state clearly says live evidence is too thin rather than implying a crash.

## Internal Demo Fallback

1. Open the explicit sample backdoor through `GET /api/tokens?mode=review&demo=sample`.
2. Confirm the returned feed is marked as sample/demo mode.
3. Confirm sample tokens still show approval blockers.
4. Confirm sample data is not described as approval-ready evidence.

## Wallet Signing

1. Connect Phantom or Solflare.
2. Select a live token.
3. Enter a short reviewer note.
4. Sign and submit one decision.
5. Confirm the saved review card shows:
   - wallet address
   - signature saved
   - signature verified
   - packet saved
   - disk synced

## Review Persistence

1. After submission, open `GET /api/reviews`.
2. Confirm the new record appears.
3. Open `GET /api/reviews/:mint`.
4. Confirm the same record is returned.
5. Refresh the page and confirm the saved review card still appears.
6. Restart the local server.
7. Reload the app and confirm the review still appears after disk reload.

## Demo Readiness

1. Run `npm run demo:check`.
2. Confirm `npm run test` passes.
3. Confirm `npm run build` passes.
4. Confirm the demo script and checklist still match actual behavior.
