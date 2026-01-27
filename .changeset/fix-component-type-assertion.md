---
"@browserbasehq/convex-stagehand": patch
---

Fix ComponentApi type to eliminate type assertion requirement. The ComponentApi type now correctly specifies "internal" visibility for component functions, matching the types generated for consumers. Users no longer need to use `as unknown as ComponentApi` type assertion when initializing the Stagehand client.

**Before:**
```typescript
const stagehand = new Stagehand(components.stagehand as unknown as ComponentApi, { ... });
```

**After:**
```typescript
const stagehand = new Stagehand(components.stagehand, { ... });
```
