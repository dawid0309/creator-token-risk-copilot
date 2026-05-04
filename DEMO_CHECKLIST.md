# Demo Checklist

## Before Recording

- `npm install`
- `npm run dev`
- confirm `/api/health` loads
- confirm the homepage lands on the review queue
- confirm at least one live candidate is visible
- confirm at least one candidate shows approval blockers or approval-ready state correctly
- note the internal demo fallback URL in case live candidates are unavailable
- unlock Phantom or Solflare

## During Demo

- show queue label
- show one curated candidate
- show provider notes
- show review evidence summary
- show coverage card
- show live history or collecting state
- connect wallet
- enter reviewer note
- sign and submit decision
- show signature verified state
- show persisted state
- show creator follow-up packet

## Safety Checks

- keep one fallback candidate available in case the top candidate changes
- if live queue is empty, use the explicit API sample fallback and say it is internal demo mode only
- avoid describing quote probes as full market stats
- avoid calling the rule engine "AI reasoning"
- mention that signatures are locally persisted, not written onchain
- mention that sample fallback is not approval evidence
