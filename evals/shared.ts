import { createToolRouter, type LLMAdapter, type RouteResult, type ToolRouterConfig } from "../src/index.js";

export interface EvalCase {
  id: string;
  request: string;
  expectedType: RouteResult["type"];
  expectedToolName?: string;
}

export const tree: ToolRouterConfig["tree"] = {
  research: {
    read: {
      single: ["getPaper"],
      bulk: ["searchPapers"]
    },
    summarize: {
      single: ["summarizePaper"],
      bulk: ["summarizePaperSet"]
    }
  },
  calendar: {
    read: {
      single: ["getEvent"],
      bulk: ["listEvents"]
    },
    update: {
      single: ["rescheduleEvent"],
      bulk: ["rescheduleEvents"]
    }
  }
};

export const tools: ToolRouterConfig["tools"] = {
  getPaper: { description: "Get one research paper by ID" },
  searchPapers: { description: "Search research papers by topic" },
  summarizePaper: { description: "Summarize one research paper" },
  summarizePaperSet: { description: "Summarize multiple research papers" },
  getEvent: { description: "Get one calendar event" },
  listEvents: { description: "List calendar events" },
  rescheduleEvent: { description: "Move one calendar event" },
  rescheduleEvents: { description: "Move multiple calendar events" }
};

export function createEvalRouter(llm: LLMAdapter, samples = 3) {
  return createEvalRouterWithConfig(tree, tools, llm, samples);
}

export function createEvalRouterWithConfig(
  treeConfig: ToolRouterConfig["tree"],
  toolConfig: ToolRouterConfig["tools"],
  llm: LLMAdapter,
  samples = 3
) {
  return createToolRouter({
    confidenceThreshold: 0.82,
    samples,
    allowNoTool: true,
    llm,
    tree: treeConfig,
    tools: toolConfig
  });
}

export async function runEval(cases: EvalCase[], llm: LLMAdapter, samples = 3) {
  return runEvalWithConfig(cases, tree, tools, llm, samples);
}

export async function runEvalWithConfig(
  cases: EvalCase[],
  treeConfig: ToolRouterConfig["tree"],
  toolConfig: ToolRouterConfig["tools"],
  llm: LLMAdapter,
  samples = 3
) {
  const router = createEvalRouterWithConfig(treeConfig, toolConfig, llm, samples);
  const results = [];

  for (const testCase of cases) {
    const startedAt = performance.now();
    const result = await router.route({ request: testCase.request });
    const latencyMs = Math.round(performance.now() - startedAt);
    const passed =
      result.type === testCase.expectedType &&
      (testCase.expectedType !== "tool" ||
        (result.type === "tool" && result.toolName === testCase.expectedToolName));

    results.push({
      id: testCase.id,
      passed,
      expected: testCase.expectedToolName ?? testCase.expectedType,
      actual: result.type === "tool" ? result.toolName : result.type,
      confidence: result.confidence,
      latencyMs
    });
  }

  const passed = results.filter((result) => result.passed).length;
  const accuracy = passed / results.length;

  return { results, passed, accuracy };
}
