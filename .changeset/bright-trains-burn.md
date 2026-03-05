---
"@browserbasehq/convex-stagehand": minor
---

Fix region handling for Stagehand sessions by persisting session region metadata and routing follow-up API calls to the correct regional Stagehand endpoint.

- Store `region` on session metadata and resolve region internally for `extract`, `act`, `observe`, `agent`, and `endSession`.
- Retry once on region-mismatch errors by parsing the returned region and updating metadata.
- Keep operation request payloads aligned with Stagehand API docs (region is not sent in operation bodies).
- Tighten internal TypeScript typing for region-aware API routing.
