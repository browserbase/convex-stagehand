# @browserbasehq/convex-stagehand

## 0.0.2

### Patch Changes

- [#7](https://github.com/browserbase/convex-stagehand/pull/7) [`3ab9545`](https://github.com/browserbase/convex-stagehand/commit/3ab95452b00bd331ab170c26e0abc9888a099be9) Thanks [@shrey150](https://github.com/shrey150)! - Fix agent endpoint URL typo causing 404 errors. The agentExecute function was calling `/sessions/{id}/agent/execute` but the correct Stagehand API endpoint is `/sessions/{id}/agentExecute`. This fixes the `stagehand.agent()` function which was previously broken.

- [#3](https://github.com/browserbase/convex-stagehand/pull/3) [`14db9a8`](https://github.com/browserbase/convex-stagehand/commit/14db9a81c53d02300adbd0d19454c1c85fee9e1e) Thanks [@shrey150](https://github.com/shrey150)! - Fix ComponentApi type to eliminate type assertion requirement. The ComponentApi type now correctly specifies "internal" visibility for component functions, matching the types generated for consumers. Users no longer need to use `as unknown as ComponentApi` type assertion when initializing the Stagehand client.

  **Before:**

  ```typescript
  const stagehand = new Stagehand(components.stagehand as unknown as ComponentApi, { ... });
  ```

  **After:**

  ```typescript
  const stagehand = new Stagehand(components.stagehand, { ... });
  ```
