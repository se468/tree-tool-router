import fixture from "./large-toolset.json" with { type: "json" };
import { createPathClassifier } from "./adapters/path-classifier.js";
import { runEvalWithConfig, type EvalCase } from "./shared.js";
import type { ToolRouterConfig } from "../src/index.js";

interface LargeToolsetFixture {
  name: string;
  toolCount: number;
  tree: ToolRouterConfig["tree"];
  tools: ToolRouterConfig["tools"];
  evalCases: EvalCase[];
}

const largeFixture = fixture as LargeToolsetFixture;
const classifier = createPathClassifier(Object.fromEntries(largeFixture.evalCases.map((testCase) => {
  if (testCase.expectedType === "no_tool_available") {
    return [testCase.request, ["no_tool_available"]];
  }

  return [testCase.request, inferPath(testCase.expectedToolName ?? "")];
})));

const { results, passed, accuracy, falseToolCalls } = await runEvalWithConfig(
  largeFixture.evalCases,
  largeFixture.tree,
  largeFixture.tools,
  classifier,
  1
);

console.table(results);
console.log(`Fixture: ${largeFixture.name}`);
console.log(`Tools: ${largeFixture.toolCount}`);
console.log("Adapter: path-classifier");
console.log(`Accuracy: ${(accuracy * 100).toFixed(1)}% (${passed}/${results.length})`);
console.log(`False tool calls: ${falseToolCalls}`);

function inferPath(toolName: string) {
  const match = toolName.match(/^([A-Z][a-z]+)([A-Z][a-z]+)(Single|Bulk|Semantic)$/);
  if (!match) return [toolName];

  const [, action, domain, mode] = match;

  return [lowerFirst(domain), lowerFirst(action), lowerFirst(mode), toolName];
}

function lowerFirst(value: string) {
  return value.slice(0, 1).toLowerCase() + value.slice(1);
}
