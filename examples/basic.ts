import { createToolRouter, type LLMAdapter } from "../src/index.js";

const mockAdapter: LLMAdapter = {
  async completeJSON<T>({ prompt }: { system: string; prompt: string; schema?: unknown }) {
    if (prompt.includes("research") && prompt.includes("calendar")) {
      return { choice: "research", confidence: 0.95, reason: "The request is about research papers." } as T;
    }

    if (prompt.includes("read") && prompt.includes("summarize")) {
      return { choice: "summarize", confidence: 0.93, reason: "The user asked for a summary." } as T;
    }

    if (prompt.includes("single") && prompt.includes("bulk")) {
      return { choice: "bulk", confidence: 0.9, reason: "The request asks about multiple papers." } as T;
    }

    return { choice: "summarizePaperSet", confidence: 0.91, reason: "Summarizing a paper set matches best." } as T;
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
    getPaper: {
      description: "Get one research paper by ID",
      schema: { paperId: "string" }
    },
    searchPapers: {
      description: "Search research papers by topic",
      schema: { query: "string" }
    },
    summarizePaper: {
      description: "Summarize one research paper",
      schema: { paperId: "string" }
    },
    summarizePaperSet: {
      description: "Summarize multiple research papers",
      schema: { paperIds: "string[]" }
    },
    getEvent: {
      description: "Get one calendar event",
      schema: { eventId: "string" }
    },
    listEvents: {
      description: "List calendar events",
      schema: { dateRange: "string" }
    },
    rescheduleEvent: {
      description: "Move one calendar event",
      schema: { eventId: "string", startsAt: "string" }
    },
    rescheduleEvents: {
      description: "Move multiple calendar events",
      schema: { query: "string", startsAt: "string" }
    }
  }
});

const result = await router.route({
  request: "Summarize recent papers about battery recycling"
});

console.log(JSON.stringify(result, null, 2));
