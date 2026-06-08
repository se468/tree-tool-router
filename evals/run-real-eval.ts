import dataset from "./sample-dataset.json" with { type: "json" };
import { existsSync, readFileSync } from "node:fs";
import { createOpenAICompatibleAdapter } from "./adapters/openai-compatible.js";
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

function loadDotEnv(path = ".env") {
  if (!existsSync(path)) return;

  const content = readFileSync(path, "utf8");

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const index = trimmed.indexOf("=");
    if (index === -1) continue;

    const key = trimmed.slice(0, index).trim();
    const rawValue = trimmed.slice(index + 1).trim();

    if (!key || process.env[key] !== undefined) continue;

    process.env[key] = unquote(rawValue);
  }
}

function unquote(value: string) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}
