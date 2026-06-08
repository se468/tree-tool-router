import type {
  RouteInput,
  RouteResult,
  RouteTrace,
  RouterDecision,
  ToolRouter,
  ToolRouterConfig,
  ToolTree
} from "./types.js";

const NO_TOOL = "no_tool_available";
const NEEDS_CLARIFICATION = "needs_clarification";

export function createToolRouter(config: ToolRouterConfig): ToolRouter {
  const confidenceThreshold = config.confidenceThreshold ?? 0.8;
  const samples = Math.max(1, Math.floor(config.samples ?? 1));
  const allowNoTool = config.allowNoTool ?? true;

  return {
    async route(input: RouteInput): Promise<RouteResult> {
      const trace: RouteTrace[] = [];
      let node: ToolTree | string[] = config.tree;
      const path: string[] = [];

      while (true) {
        const options = getOptions(node);

        if (options.length === 0) {
          return noTool("No child options are available at the current path.", 1, trace);
        }

        const step = await choose({
          request: input.request,
          path,
          options,
          node,
          config,
          samples
        });

        trace.push({
          path: [...path],
          options,
          choice: step.choice,
          confidence: step.confidence,
          votes: step.votes,
          reason: step.reason
        });

        if (step.choice === NEEDS_CLARIFICATION) {
          return {
            type: "needs_clarification",
            question: step.question ?? "Can you clarify which tool or operation you need?",
            confidence: step.confidence,
            trace
          };
        }

        if (step.choice === NO_TOOL) {
          return noTool(step.reason ?? "No available option matches the request.", step.confidence, trace);
        }

        if (step.confidence < confidenceThreshold) {
          if (allowNoTool) {
            return noTool(
              `Best choice "${step.choice}" was below confidence threshold ${confidenceThreshold}.`,
              step.confidence,
              trace
            );
          }

          return {
            type: "needs_clarification",
            question: `Should this request use "${step.choice}", or something else?`,
            confidence: step.confidence,
            trace
          };
        }

        if (!options.includes(step.choice)) {
          return noTool(`LLM chose an unavailable option: ${step.choice}`, step.confidence, trace);
        }

        if (Array.isArray(node)) {
          return {
            type: "tool",
            toolName: step.choice,
            confidence: step.confidence,
            trace
          };
        }

        const next: ToolTree | string[] = node[step.choice];
        path.push(step.choice);
        node = next;
      }
    }
  };
}

function getOptions(node: ToolTree | string[]): string[] {
  return Array.isArray(node) ? node : Object.keys(node);
}

async function choose(input: {
  request: string;
  path: string[];
  options: string[];
  node: ToolTree | string[];
  config: ToolRouterConfig;
  samples: number;
}): Promise<RouterDecision & { votes: Record<string, number> }> {
  const decisions: RouterDecision[] = [];

  for (let i = 0; i < input.samples; i += 1) {
    const decision = await input.config.llm.completeJSON<RouterDecision>({
      system:
        "You are a precise tool router. Choose exactly one available option, no_tool_available, or needs_clarification. Return JSON only.",
      prompt: buildPrompt(input),
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

    decisions.push(normalizeDecision(decision));
  }

  return aggregate(decisions);
}

function buildPrompt(input: {
  request: string;
  path: string[];
  options: string[];
  node: ToolTree | string[];
  config: ToolRouterConfig;
}): string {
  const currentPath = input.path.length > 0 ? input.path.join(" -> ") : "(root)";
  const optionLines = input.options.map((option) => {
    const description = describeOption(option, input.node, input.config);
    return description ? `- ${option}: ${description}` : `- ${option}`;
  });

  return [
    `User request: ${input.request}`,
    `Current path: ${currentPath}`,
    "Available child options:",
    ...optionLines,
    "",
    "Choose one available child option.",
    `You may choose ${NO_TOOL} if none apply.`,
    `You may choose ${NEEDS_CLARIFICATION} if the request is ambiguous.`,
    "Return JSON with: choice, confidence, reason, and optional question."
  ].join("\n");
}

function describeOption(option: string, node: ToolTree | string[], config: ToolRouterConfig): string | undefined {
  if (Array.isArray(node)) {
    return config.tools[option]?.description;
  }

  const child = node[option];
  if (Array.isArray(child) && child.length === 1) {
    return config.tools[child[0]]?.description;
  }

  if (Array.isArray(child)) {
    return `${child.length} tool options`;
  }

  return `${Object.keys(child).length} child options`;
}

function normalizeDecision(decision: RouterDecision): RouterDecision {
  return {
    choice: String(decision.choice ?? NO_TOOL),
    confidence: clamp(Number(decision.confidence ?? 0)),
    reason: decision.reason,
    question: decision.question
  };
}

function aggregate(decisions: RouterDecision[]): RouterDecision & { votes: Record<string, number> } {
  const votes: Record<string, number> = {};
  const confidenceTotals: Record<string, number> = {};

  for (const decision of decisions) {
    votes[decision.choice] = (votes[decision.choice] ?? 0) + 1;
    confidenceTotals[decision.choice] = (confidenceTotals[decision.choice] ?? 0) + decision.confidence;
  }

  const winner = Object.entries(votes).sort(([aChoice, aVotes], [bChoice, bVotes]) => {
    if (bVotes !== aVotes) return bVotes - aVotes;
    return (confidenceTotals[bChoice] ?? 0) - (confidenceTotals[aChoice] ?? 0);
  })[0]?.[0] ?? NO_TOOL;

  const winnerDecisions = decisions.filter((decision) => decision.choice === winner);
  const averageConfidence =
    winnerDecisions.reduce((total, decision) => total + decision.confidence, 0) / winnerDecisions.length;
  const voteShare = (votes[winner] ?? 0) / decisions.length;
  const representative = winnerDecisions[0];

  return {
    choice: winner,
    confidence: clamp(averageConfidence * voteShare),
    reason: representative?.reason,
    question: representative?.question,
    votes
  };
}

function noTool(reason: string, confidence: number, trace: RouteTrace[]): RouteResult {
  return {
    type: "no_tool_available",
    reason,
    confidence,
    trace
  };
}

function clamp(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
