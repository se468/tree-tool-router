import dataset from "./sample-dataset.json" with { type: "json" };
import { createOpenAICompatibleAdapter } from "./adapters/openai-compatible.js";
import { loadDotEnv } from "./env.js";
import { runEval, type EvalCase } from "./shared.js";

loadDotEnv();

const model = process.env.TOOLROUTER_MODEL ?? "gpt-4.1-mini";
const apiKey = process.env.TOOLROUTER_API_KEY ?? process.env.OPENAI_API_KEY;

if (!apiKey && !process.env.TOOLROUTER_BASE_URL) {
  throw new Error(
    [
      "Missing TOOLROUTER_API_KEY or OPENAI_API_KEY.",
      "Example:",
      "TOOLROUTER_API_KEY=... npm run eval:real",
      "For local OpenAI-compatible servers, set TOOLROUTER_BASE_URL and omit the key if your server allows it."
    ].join("\n")
  );
}

const adapter = createOpenAICompatibleAdapter({
  model,
  apiKey,
  baseUrl: process.env.TOOLROUTER_BASE_URL
});

const { results, passed, accuracy } = await runEval(dataset as EvalCase[], adapter, 1);

console.table(results);
console.log(`Model: ${model}`);
console.log(`Accuracy: ${(accuracy * 100).toFixed(1)}% (${passed}/${results.length})`);
