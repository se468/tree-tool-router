import fixture from "./large-toolset.json" with { type: "json" };
import { createOpenAICompatibleAdapter } from "./adapters/openai-compatible.js";
import { loadDotEnv } from "./env.js";
import {
  createMeteredAdapter,
  runEvalWithConfig,
  runFlatEvalWithConfig,
  type EvalCase,
  type EvalSummary
} from "./shared.js";
import type { ToolRouterConfig } from "../src/index.js";

interface LargeToolsetFixture {
  name: string;
  toolCount: number;
  tree: ToolRouterConfig["tree"];
  tools: ToolRouterConfig["tools"];
  evalCases: EvalCase[];
}

loadDotEnv();

const model = process.env.TOOLROUTER_MODEL ?? "gpt-4.1-mini";
const apiKey = process.env.TOOLROUTER_API_KEY ?? process.env.OPENAI_API_KEY;
const largeFixture = fixture as LargeToolsetFixture;

if (!apiKey && !process.env.TOOLROUTER_BASE_URL) {
  throw new Error("Missing TOOLROUTER_API_KEY or OPENAI_API_KEY.");
}

const baseAdapter = createOpenAICompatibleAdapter({
  model,
  apiKey,
  baseUrl: process.env.TOOLROUTER_BASE_URL
});

const flat = createMeteredAdapter(baseAdapter);
const toolRouter = createMeteredAdapter(baseAdapter);

const flatSummary = withStats(
  await runFlatEvalWithConfig(largeFixture.evalCases, largeFixture.tools, flat.adapter),
  flat.stats
);
const toolRouterSummary = withStats(
  await runEvalWithConfig(largeFixture.evalCases, largeFixture.tree, largeFixture.tools, toolRouter.adapter, 1),
  toolRouter.stats
);

console.log("Flat prompt results");
console.table(flatSummary.results);

console.log("ToolRouter results");
console.table(toolRouterSummary.results);

console.log("Comparison");
console.table([
  summarize("Flat prompt", flatSummary, largeFixture.evalCases.length),
  summarize("ToolRouter", toolRouterSummary, largeFixture.evalCases.length)
]);

console.log(`Fixture: ${largeFixture.name}`);
console.log(`Tools: ${largeFixture.toolCount}`);
console.log(`Model: ${model}`);

function withStats(summary: EvalSummary, stats: NonNullable<EvalSummary["stats"]>) {
  return { ...summary, stats };
}

function summarize(name: string, summary: EvalSummary, total: number) {
  const totalLatencyMs = summary.results.reduce((sum, result) => sum + result.latencyMs, 0);

  return {
    approach: name,
    accuracy: `${summary.passed}/${total}`,
    falseToolCalls: summary.falseToolCalls,
    llmCalls: summary.stats?.calls ?? 0,
    estimatedTokens: summary.stats?.estimatedTokens ?? 0,
    totalLatencyMs
  };
}
