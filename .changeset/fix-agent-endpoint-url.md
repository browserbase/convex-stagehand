---
"@browserbasehq/convex-stagehand": patch
---

Fix agent endpoint URL typo causing 404 errors. The agentExecute function was calling `/sessions/{id}/agent/execute` but the correct Stagehand API endpoint is `/sessions/{id}/agentExecute`. This fixes the `stagehand.agent()` function which was previously broken.
