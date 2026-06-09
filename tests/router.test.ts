import assert from "node:assert/strict";
import test from "node:test";
import { createToolRouter, type DecisionAdapter, type LLMAdapter } from "../src/index.js";
import { tools, tree } from "../evals/shared.js";

test("routes through the tree to a final tool", async () => {
  const choices = ["research", "summarize", "bulk", "summarizePaperSet"];
  const llm: LLMAdapter = {
    async completeJSON<T>() {
      return { choice: choices.shift(), confidence: 0.95 } as T;
    }
  };

  const router = createToolRouter({
    confidenceThreshold: 0.8,
    samples: 1,
    allowNoTool: true,
    llm,
    tree,
    tools
  });

  const result = await router.route({ request: "Summarize recent papers about battery recycling" });

  assert.equal(result.type, "tool");
  assert.equal(result.type === "tool" ? result.toolName : undefined, "summarizePaperSet");
  assert.equal(result.trace.length, 4);
});

test("returns no_tool_available when the adapter refuses", async () => {
  const llm: LLMAdapter = {
    async completeJSON<T>() {
      return { choice: "no_tool_available", confidence: 0.96, reason: "No matching tool." } as T;
    }
  };

  const router = createToolRouter({
    confidenceThreshold: 0.8,
    samples: 1,
    allowNoTool: true,
    llm,
    tree,
    tools
  });

  const result = await router.route({ request: "Book me a flight to Berlin" });

  assert.equal(result.type, "no_tool_available");
  assert.equal(result.confidence, 0.96);
});

test("returns no_tool_available below the confidence threshold", async () => {
  const llm: LLMAdapter = {
    async completeJSON<T>() {
      return { choice: "research", confidence: 0.4 } as T;
    }
  };

  const router = createToolRouter({
    confidenceThreshold: 0.8,
    samples: 1,
    allowNoTool: true,
    llm,
    tree,
    tools
  });

  const result = await router.route({ request: "Something ambiguous" });

  assert.equal(result.type, "no_tool_available");
});

test("routes with a deterministic decider without an LLM adapter", async () => {
  const choices = ["research", "summarize", "bulk"];
  const decider: DecisionAdapter = {
    async decide() {
      return { choice: choices.shift() ?? "no_tool_available", confidence: 1 };
    }
  };

  const router = createToolRouter({
    confidenceThreshold: 0.8,
    samples: 1,
    allowNoTool: true,
    decider,
    tree,
    tools
  });

  const result = await router.route({ request: "Summarize recent papers about battery recycling" });

  assert.equal(result.type, "tool");
  assert.equal(result.type === "tool" ? result.toolName : undefined, "summarizePaperSet");
  assert.equal(result.pathString, "research -> summarize -> bulk -> summarizePaperSet");
});
