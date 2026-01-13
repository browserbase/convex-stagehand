import { defineApp } from "convex/server";
import stagehand from "../../convex.config.js";

const app = defineApp();
app.use(stagehand, { name: "stagehand" });

export default app;
