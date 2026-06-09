import type { DecisionAdapter, DecisionInput, RouterDecision } from "../../src/index.js";

export type PathByRequest = Record<string, string[]>;

export function createPathClassifier(paths: PathByRequest): DecisionAdapter {
  return {
    async decide(input) {
      return classifyPath(input, paths);
    }
  };
}

function classifyPath(input: DecisionInput, paths: PathByRequest): RouterDecision {
  const path = paths[input.request];

  if (!path) {
    return {
      choice: "no_tool_available",
      confidence: 1,
      reason: "No classifier path is configured for this request."
    };
  }

  const next = path[input.path.length];

  if (!next) {
    return {
      choice: "no_tool_available",
      confidence: 1,
      reason: "Configured classifier path ended before a tool was reached."
    };
  }

  return {
    choice: next,
    confidence: 1,
    reason: "Matched deterministic classifier path."
  };
}
