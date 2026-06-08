import dataset from "./sample-dataset.json" with { type: "json" };
import { createOpenAICompatibleAdapter } from "./adapters/openai-compatible.js";
import { runEval, type EvalCase } from "./shared.js";

const model = process.env.TOOLROUTER_MODEL;

if (!model) {
  throw new Error(
    [
      "Missing TOOLROUTER_MODEL.",
      "Example:",
      "TOOLROUTER_MODEL=gpt-4.1-mini TOOLROUTER_API_KEY=... npm run eval:real",
      "For local OpenAI-compatible servers, also set TOOLROUTER_BASE_URL."
    ].join("\n")
  );
}

const adapter = createOpenAICompatibleAdapter({
  model,
  apiKey: process.env.TOOLROUTER_API_KEY,
  baseUrl: process.env.TOOLROUTER_BASE_URL
});

const { results, passed, accuracy } = await runEval(dataset as EvalCase[], adapter, 1);

console.table(results);
console.log(`Model: ${model}`);
console.log(`Accuracy: ${(accuracy * 100).toFixed(1)}% (${passed}/${results.length})`);
