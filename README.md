# ToolRouter

A hierarchical tool router for LLM agents with too many tools.

Instead of dumping every tool into one giant prompt, ToolRouter narrows the search space step-by-step and allows the agent to safely say `no_tool_available`.

Quickstart guide: https://se468.github.io/tree-tool-router/

## Why ToolRouter?

LLM agents often fail tool selection when every available tool is passed in one flat prompt. Large tool lists create context bloat, make similar tools harder to distinguish, increase latency and cost, and can push the model toward bad tool calls when the correct answer is "do nothing."

ToolRouter organizes tools into a decision tree that you define. The router asks the model for one constrained choice at a time:

```txt
category -> subcategory -> ... -> specific tool
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

## Tool Tree Schema

Tools are defined in two parts:

- `tree`: the routing hierarchy
- `tools`: metadata for each leaf tool

The tree shape is not fixed. Use whatever hierarchy makes your tool set easier to route. Common shapes include:

```txt
category
`-- task
    `-- variant
        `-- tool
```

```txt
service
`-- resource
    `-- action
        `-- tool
```

```txt
team
`-- workflow
    `-- risk_level
        `-- tool
```

For example, this `tree`:

```ts
const tree = {
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
```

Represents this routing structure:

```txt
root
|-- research
|   |-- read
|   |   |-- single
|   |   |   `-- getPaper
|   |   `-- bulk
|   |       `-- searchPapers
|   `-- summarize
|       |-- single
|       |   `-- summarizePaper
|       `-- bulk
|           `-- summarizePaperSet
`-- calendar
    |-- read
    |   |-- single
    |   |   `-- getEvent
    |   `-- bulk
    |       `-- listEvents
    `-- update
        |-- single
        |   `-- rescheduleEvent
        `-- bulk
            `-- rescheduleEvents
```

Each leaf tool is described separately:

```ts
const tools = {
  searchPapers: {
    description: "Search research papers by topic",
    schema: { query: "string" }
  },
  summarizePaperSet: {
    description: "Summarize multiple research papers",
    schema: { paperIds: "string[]" }
  }
};
```

At runtime, ToolRouter does not care what the levels are called. It simply asks one constrained question per level. For the request:

```txt
Summarize recent papers about battery recycling
```

The final path might be:

```txt
research -> summarize -> bulk -> summarizePaperSet
```

If none of the child options are plausible, the path ends in:

```txt
no_tool_available
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

ToolRouter traverses your tree level by level. At each node it asks the LLM to choose one available child option, `no_tool_available`, or `needs_clarification`.

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
npm run eval:compare:real
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

For a larger stress fixture, `evals/large-toolset.json` contains 156 tools, including similar subscription billing actions such as account credits, captured payment refunds, promo discounts, and subscription rate adjustments. It also includes unsupported requests that should return `no_tool_available`.

Current smoke-test results:

| Eval | Adapter | Tools | Accuracy | Unsupported Request |
| --- | --- | ---: | ---: | --- |
| `npm run eval` | Mock adapter | 8 | 3/3 | Passed |
| `npm run eval:real` | `gpt-4.1-mini` | 8 | 3/3 | Passed |
| `npm run eval:large:real` | `gpt-4.1-mini` | 156 | 17/17 | Passed |

`npm run eval:compare:real` compares a flat prompt baseline against ToolRouter on the 156-tool fixture. It reports accuracy, false tool calls, LLM calls, estimated prompt tokens, and latency.

Example comparison run with `gpt-4.1-mini` on the 156-tool fixture:

| Approach | Accuracy | False Tool Calls | LLM Calls | Est. Prompt Tokens | Total Latency |
| --- | ---: | ---: | ---: | ---: | ---: |
| Flat prompt | 15/17 | 0 | 17 | 273,126 | 47.4s |
| ToolRouter | 17/17 | 0 | 45 | 65,805 | 76.6s |

In this run, the flat baseline failed two near-neighbor cases: `code-test-bulk`, where it selected `TestCodeSemantic` instead of `TestCodeBulk`, and `communications-draft-bulk`, where it selected `DraftCommunicationsSingle` instead of `DraftCommunicationsBulk`. The added billing cases passed in this run, but they exercise the same real-world pressure pattern: many similar actions whose differences matter. These are smoke-test numbers, not a benchmark. Model behavior and latency can vary between runs. The important signal is that the flat baseline sees every tool at once, while ToolRouter trades more LLM calls for a smaller prompt at each decision step and an auditable route path.

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
