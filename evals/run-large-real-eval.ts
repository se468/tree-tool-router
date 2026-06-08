import fixture from "./large-toolset.json" with { type: "json" };
import { createOpenAICompatibleAdapter } from "./adapters/openai-compatible.js";
import { loadDotEnv } from "./env.js";
import { runEvalWithConfig, type EvalCase } from "./shared.js";
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

const adapter = createOpenAICompatibleAdapter({
  model,
  apiKey,
  baseUrl: process.env.TOOLROUTER_BASE_URL
});

const { results, passed, accuracy } = await runEvalWithConfig(
  largeFixture.evalCases,
  largeFixture.tree,
  largeFixture.tools,
  adapter,
  1
);

console.table(results);
console.log(`Fixture: ${largeFixture.name}`);
console.log(`Tools: ${largeFixture.toolCount}`);
console.log(`Model: ${model}`);
console.log(`Accuracy: ${(accuracy * 100).toFixed(1)}% (${passed}/${results.length})`);
