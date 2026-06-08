# ToolRouter

A hierarchical tool router for LLM agents with too many tools.

Instead of dumping every tool into one giant prompt, ToolRouter narrows the search space step-by-step and allows the agent to safely say `no_tool_available`.

Quickstart guide: https://se468.github.io/tree-tool-router/

## Why ToolRouter?

LLM agents often fail tool selection when every available tool is passed in one flat prompt. Large tool lists create context bloat, make similar tools harder to distinguish, increase latency and cost, and can push the model toward bad tool calls when the correct answer is "do nothing."

ToolRouter organizes tools into a decision tree. The router asks the model for one constrained choice at a time:

```txt
domain -> operation -> mode -> specific tool
```

At every step, the model sees only the user request, the current path, and the child options available from that node. If none fit, `no_tool_available` is a first-class result rather than an error.

## Key Features

- Tool tree schema for organizing large tool sets
- Step-by-step routing through constrained choices
- `no_tool_available` as a first-class result
- Confidence threshold for safer routing
- Multi-sample voting to reduce one-off model mistakes
- Provider-agnostic LLM adapter interface
- Routing trace output for debugging and evals
- No hosted backend, database, or framework dependency

## Install

```bash
npm install toolrouter
```

For local development in this repo:

```bash
npm install
npm run build
npm test
```

## Quickstart

```ts
import { createToolRouter } from "toolrouter";

const router = createToolRouter({
  confidenceThreshold: 0.82,
  samples: 3,
  allowNoTool: true,
  llm: myAdapter,
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
    searchPapers: {
      description: "Search research papers by topic",
      schema: { query: "string" }
    },
    summarizePaperSet: {
      description: "Summarize multiple research papers",
      schema: { paperIds: "string[]" }
    }
  }
});

const result = await router.route({
  request: "Summarize recent papers about battery recycling"
});

if (result.type === "tool") {
  console.log(result.toolName, result.confidence, result.pathString);
}

if (result.type === "no_tool_available") {
  console.log(result.reason, result.pathString);
}
```

## LLM Adapter

ToolRouter works with any LLM provider that can return JSON. Implement one method:

```ts
export interface LLMAdapter {
  completeJSON<T>(input: {
    system: string;
    prompt: string;
    schema?: unknown;
  }): Promise<T>;
}
```

The library does not ship provider-specific clients. Bring your own OpenAI, Anthropic, local model, gateway, or mocked adapter.

## Routing Behavior

ToolRouter traverses the tree level by level. At each node it asks the LLM to choose one available child option, `no_tool_available`, or `needs_clarification`.

The prompt for each routing step includes only:

- User request
- Current path
- Available child options
- Short descriptions when available

The full tool list is not included at every step. Leaf nodes choose the final tool.

If the winning choice falls below `confidenceThreshold`, the router returns `no_tool_available` when `allowNoTool` is enabled. Otherwise, it returns `needs_clarification`.

When `samples` is greater than 1, ToolRouter repeats the same decision and aggregates votes. The winning option's confidence is based on both model confidence and vote share.

Every result includes a human-readable `pathString`, a structured `path`, and a full `trace` so you can inspect routing decisions and tune your tree.

## Use Cases

- MCP servers with many tools
- Internal enterprise agents with broad permissions
- Research, scheduling, and document operations
- Agents that need safe tool refusal
- Tool gateways that want auditable routing traces

## Examples

```bash
npm run example:basic
npm run example:no-tool
```

The examples use mocked LLM adapters, so they run without API keys.

## Evals

```bash
npm run eval
npm run eval:large:real
```

`evals/run-eval.ts` runs a small sample dataset with a mocked adapter. This is useful for checking that routing logic, traces, and result grading still work during development.

To smoke test a real model, use any OpenAI-compatible chat completions endpoint:

```bash
TOOLROUTER_MODEL=gpt-4.1-mini TOOLROUTER_API_KEY=... npm run eval:real
```

You can also put values in `.env`. `TOOLROUTER_API_KEY` and `OPENAI_API_KEY` are both supported. If `TOOLROUTER_MODEL` is not set, the script defaults to `gpt-4.1-mini`.

For local or gateway models, set `TOOLROUTER_BASE_URL`:

```bash
TOOLROUTER_BASE_URL=http://localhost:11434/v1 TOOLROUTER_MODEL=llama3.1 npm run eval:real
```

Real eval settings:

- `TOOLROUTER_MODEL`: optional model name, defaults to `gpt-4.1-mini`
- `TOOLROUTER_API_KEY`: optional for local servers, required by most hosted providers
- `TOOLROUTER_BASE_URL`: optional, defaults to `https://api.openai.com/v1`

Expand `evals/sample-dataset.json` for meaningful measurements.

For a larger stress fixture, `evals/large-toolset.json` contains 144 tools and includes an unsupported request that should return `no_tool_available`.

| Approach | Accuracy | Token Usage | Latency | False Tool Call Rate |
| --- | ---: | ---: | ---: | ---: |
| Flat prompt | TODO | TODO | TODO | TODO |
| ToolRouter | TODO | TODO | TODO | TODO |

## API

```ts
type RouteResult =
  | {
      type: "tool";
      toolName: string;
      confidence: number;
      path: string[];
      pathString: string;
      trace: RouteTrace[];
    }
  | {
      type: "no_tool_available";
      reason: string;
      confidence: number;
      path: string[];
      pathString: string;
      trace: RouteTrace[];
    }
  | {
      type: "needs_clarification";
      question: string;
      confidence: number;
      path: string[];
      pathString: string;
      trace: RouteTrace[];
    };
```

Example route path:

```ts
result.path
// ["research", "compare", "bulk", "CompareResearchBulk"]

result.pathString
// "research -> compare -> bulk -> CompareResearchBulk"
```

## Design Notes

ToolRouter is intentionally small. It is a routing primitive, not an agent framework. It does not execute tools, store state, manage credentials, or host a backend. Your agent remains responsible for calling the selected tool after routing succeeds.

## License

MIT
