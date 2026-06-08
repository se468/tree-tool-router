import dataset from "./sample-dataset.json" with { type: "json" };
import { createToolRouter, type LLMAdapter, type RouteResult } from "../src/index.js";

interface EvalCase {
  id: string;
  request: string;
  expectedType: RouteResult["type"];
  expectedToolName?: string;
}

const mockAdapter: LLMAdapter = {
  async completeJSON<T>({ prompt }: { system: string; prompt: string; schema?: unknown }) {
    const lower = prompt.toLowerCase();
    const request = lower.match(/user request: (.*)/)?.[1] ?? lower;

    if (request.includes("book me a flight")) {
      return { choice: "no_tool_available", confidence: 0.95, reason: "Travel booking tools are not available." } as T;
    }

    if (lower.includes("research") && lower.includes("calendar")) {
      return request.includes("meeting")
        ? ({ choice: "calendar", confidence: 0.92, reason: "The request is about a calendar event." } as T)
        : ({ choice: "research", confidence: 0.92, reason: "The request is about research papers." } as T);
    }

    if (lower.includes("read") && lower.includes("summarize")) {
      return request.includes("summarize")
        ? ({ choice: "summarize", confidence: 0.9, reason: "The request asks for a summary." } as T)
        : ({ choice: "read", confidence: 0.9, reason: "The request asks to check data." } as T);
    }

    if (lower.includes("read") && lower.includes("update")) {
      return request.includes("reschedule") || request.includes("move")
        ? ({ choice: "update", confidence: 0.9, reason: "The request asks to update an event." } as T)
        : ({ choice: "read", confidence: 0.9, reason: "The request asks to check an event." } as T);
    }

    if (lower.includes("single") && lower.includes("bulk")) {
      return request.includes("papers") || request.includes("recent")
        ? ({ choice: "bulk", confidence: 0.88, reason: "The request targets many items." } as T)
        : ({ choice: "single", confidence: 0.88, reason: "The request targets one item." } as T);
    }

    if (lower.includes("summarizepaperset")) {
      return { choice: "summarizePaperSet", confidence: 0.9 } as T;
    }

    if (lower.includes("getevent")) {
      return { choice: "getEvent", confidence: 0.9 } as T;
    }

    return { choice: "no_tool_available", confidence: 0.6 } as T;
  }
};

const router = createToolRouter({
  confidenceThreshold: 0.82,
  samples: 3,
  allowNoTool: true,
  llm: mockAdapter,
  tree: {
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
  },
  tools: {
    getPaper: { description: "Get one research paper by ID" },
    searchPapers: { description: "Search research papers by topic" },
    summarizePaper: { description: "Summarize one research paper" },
    summarizePaperSet: { description: "Summarize multiple research papers" },
    getEvent: { description: "Get one calendar event" },
    listEvents: { description: "List calendar events" },
    rescheduleEvent: { description: "Move one calendar event" },
    rescheduleEvents: { description: "Move multiple calendar events" }
  }
});

const cases = dataset as EvalCase[];
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

console.table(results);
console.log(`Accuracy: ${(accuracy * 100).toFixed(1)}% (${passed}/${results.length})`);
