import {
  createToolRouter,
  type DecisionAdapter,
  type LLMAdapter,
  type RouteResult,
  type ToolRouterConfig
} from "../src/index.js";

export interface EvalCase {
  id: string;
  request: string;
  expectedType: RouteResult["type"];
  expectedToolName?: string;
}

export interface EvalStats {
  calls: number;
  promptChars: number;
  estimatedTokens: number;
}

export interface EvalSummary {
  results: Array<{
    id: string;
    passed: boolean;
    expected: string;
    actual: string;
    confidence: number;
    path: string;
    latencyMs: number;
  }>;
  passed: number;
  accuracy: number;
  falseToolCalls: number;
  stats?: EvalStats;
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
  adapter: LLMAdapter | DecisionAdapter,
  samples = 3
) {
  return createToolRouter({
    confidenceThreshold: 0.82,
    samples,
    allowNoTool: true,
    ...toRouterAdapterConfig(adapter),
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
  adapter: LLMAdapter | DecisionAdapter,
  samples = 3
) : Promise<EvalSummary> {
  const router = createEvalRouterWithConfig(treeConfig, toolConfig, adapter, samples);
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
      path: result.pathString,
      latencyMs
    });
  }

  const passed = results.filter((result) => result.passed).length;
  const falseToolCalls = results.filter((result, index) => {
    const testCase = cases[index];
    return testCase.expectedType === "no_tool_available" && result.actual !== "no_tool_available";
  }).length;
  const accuracy = passed / results.length;

  return { results, passed, accuracy, falseToolCalls };
}

function toRouterAdapterConfig(adapter: LLMAdapter | DecisionAdapter) {
  return "decide" in adapter ? { decider: adapter } : { llm: adapter };
}

export async function runFlatEvalWithConfig(
  cases: EvalCase[],
  toolConfig: ToolRouterConfig["tools"],
  llm: LLMAdapter,
  confidenceThreshold = 0.82
): Promise<EvalSummary> {
  const results = [];

  for (const testCase of cases) {
    const startedAt = performance.now();
    const decision = await llm.completeJSON<{
      choice: string;
      confidence: number;
      reason?: string;
      question?: string;
    }>({
      system:
        "You are a flat tool selector. Choose exactly one available tool, no_tool_available, or needs_clarification. Return JSON only.",
      prompt: buildFlatPrompt(testCase.request, toolConfig),
      schema: {
        type: "object",
        properties: {
          choice: { type: "string" },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          reason: { type: "string" },
          question: { type: "string" }
        },
        required: ["choice", "confidence"]
      }
    });
    const latencyMs = Math.round(performance.now() - startedAt);
    const confidence = clamp(Number(decision.confidence ?? 0));
    const choice = String(decision.choice ?? "no_tool_available");
    const actual = confidence < confidenceThreshold ? "no_tool_available" : choice;
    const passed =
      actual === testCase.expectedType ||
      (testCase.expectedType === "tool" && actual === testCase.expectedToolName);

    results.push({
      id: testCase.id,
      passed,
      expected: testCase.expectedToolName ?? testCase.expectedType,
      actual,
      confidence,
      path: actual,
      latencyMs
    });
  }

  const passed = results.filter((result) => result.passed).length;
  const falseToolCalls = results.filter((result, index) => {
    const testCase = cases[index];
    return testCase.expectedType === "no_tool_available" && result.actual !== "no_tool_available";
  }).length;
  const accuracy = passed / results.length;

  return { results, passed, accuracy, falseToolCalls };
}

export function createMeteredAdapter(adapter: LLMAdapter) {
  const stats: EvalStats = {
    calls: 0,
    promptChars: 0,
    estimatedTokens: 0
  };

  const metered: LLMAdapter = {
    async completeJSON<T>(input: { system: string; prompt: string; schema?: unknown }) {
      stats.calls += 1;
      stats.promptChars += input.system.length + input.prompt.length;
      stats.estimatedTokens = Math.ceil(stats.promptChars / 4);
      return adapter.completeJSON<T>(input);
    }
  };

  return { adapter: metered, stats };
}

export function createMeteredDecider(adapter: DecisionAdapter) {
  const stats: EvalStats = {
    calls: 0,
    promptChars: 0,
    estimatedTokens: 0
  };

  const metered: DecisionAdapter = {
    async decide(input) {
      stats.calls += 1;
      stats.promptChars +=
        input.request.length +
        input.path.join(" ").length +
        input.options.join(" ").length +
        Object.values(input.optionDescriptions).join(" ").length;
      stats.estimatedTokens = Math.ceil(stats.promptChars / 4);
      return adapter.decide(input);
    }
  };

  return { adapter: metered, stats };
}

function buildFlatPrompt(request: string, toolConfig: ToolRouterConfig["tools"]) {
  const toolLines = Object.entries(toolConfig).map(([name, tool]) => {
    const schema = tool.schema ? ` schema=${JSON.stringify(tool.schema)}` : "";
    return `- ${name}: ${tool.description}${schema}`;
  });

  return [
    `User request: ${request}`,
    "Available tools:",
    ...toolLines,
    "",
    "Choose one available tool.",
    "Choose no_tool_available if none of the tools can plausibly handle the request.",
    "Choose needs_clarification if the request is ambiguous.",
    "Return JSON with: choice, confidence, reason, and optional question."
  ].join("\n");
}

function clamp(value: number) {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
