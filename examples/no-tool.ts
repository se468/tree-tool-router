import { createToolRouter, type LLMAdapter } from "../src/index.js";

const mockAdapter: LLMAdapter = {
  async completeJSON<T>() {
    return {
      choice: "no_tool_available",
      confidence: 0.96,
      reason: "The available tools cannot book travel."
    } as T;
  }
};

const router = createToolRouter({
  confidenceThreshold: 0.82,
  samples: 2,
  allowNoTool: true,
  llm: mockAdapter,
  tree: {
    research: {
      read: {
        single: ["getPaper"],
        bulk: ["searchPapers"]
      }
    }
  },
  tools: {
    getPaper: {
      description: "Get one research paper by ID",
      schema: { paperId: "string" }
    },
    searchPapers: {
      description: "Search research papers by topic",
      schema: { query: "string" }
    }
  }
});

const result = await router.route({
  request: "Book me a flight to Berlin next Friday"
});

console.log(JSON.stringify(result, null, 2));
