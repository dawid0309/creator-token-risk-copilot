# E2E Notes

## Automated Browser Coverage

This project now treats browser verification as a pre-demo check, not just an implementation detail.

Recommended browser checks:

1. Open the local app in the browser.
2. Confirm the homepage does not fall back to sample by default.
3. Confirm `GET /api/tokens?mode=review` drives the main queue.
4. Confirm `GET /api/health` matches the provider notes shown in the UI.
5. Confirm a failed `GET /api/reviews` does not take the whole homepage offline.
6. Confirm the explicit `demo=sample` backdoor only appears when requested directly.

## Manual Wallet Step

Wallet connection and signing remain manual verification steps:

1. Connect Phantom or Solflare.
2. Submit one signed decision.
3. Refresh the page.
4. Restart the server.
5. Confirm the same review record is still readable.
