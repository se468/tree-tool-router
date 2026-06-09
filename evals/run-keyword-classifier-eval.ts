import fixture from "./large-toolset.json" with { type: "json" };
import { createKeywordClassifier } from "./adapters/keyword-classifier.js";
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
const classifier = createKeywordClassifier({
  threshold: 0.2,
  keywords: {
    research: ["paper", "papers", "methodology", "climate"],
    calendar: ["meeting", "meetings", "week", "weeks"],
    documents: ["proposal", "claims", "file"],
    code: ["test", "tests", "parser", "files"],
    security: ["suspicious", "login", "alerts", "risk"],
    media: ["video", "videos", "caption"],
    support: ["ticket", "blocked", "escalate"],
    knowledge: ["wiki", "canonical", "onboarding"],
    infrastructure: ["deployment", "rollback", "staging"],
    communications: ["announcement", "announcements", "closures"],
    billing: ["invoice", "payment", "charge", "credit", "refund", "promo", "subscription", "rate"],
    single: ["single", "one", "file", "ticket", "account", "invoice", "payment", "deployment"],
    bulk: ["these", "three", "four", "five", "changed", "files", "papers", "invoices"],
    semantic: ["find", "unusually", "prioritize", "risk", "likely"]
  }
});

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
console.log("Adapter: keyword-classifier");
console.log(`Accuracy: ${(accuracy * 100).toFixed(1)}% (${passed}/${results.length})`);
console.log(`False tool calls: ${falseToolCalls}`);
