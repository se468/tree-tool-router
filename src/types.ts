import type { LLMAdapter } from "./adapters/types.js";

export type ToolSchema = Record<string, unknown>;

export interface ToolDefinition {
  description: string;
  schema?: ToolSchema;
}

export type ToolTree = {
  [key: string]: ToolTree | string[];
};

export interface ToolRouterConfig {
  confidenceThreshold?: number;
  samples?: number;
  allowNoTool?: boolean;
  llm: LLMAdapter;
  tree: ToolTree;
  tools: Record<string, ToolDefinition>;
}

export interface RouteInput {
  request: string;
}

export interface RouteTrace {
  path: string[];
  options: string[];
  choice: string;
  confidence: number;
  votes: Record<string, number>;
  reason?: string;
}

export type RouteResult =
  | {
      type: "tool";
      toolName: string;
      confidence: number;
      trace: RouteTrace[];
    }
  | {
      type: "no_tool_available";
      reason: string;
      confidence: number;
      trace: RouteTrace[];
    }
  | {
      type: "needs_clarification";
      question: string;
      confidence: number;
      trace: RouteTrace[];
    };

export interface RouterDecision {
  choice: string;
  confidence: number;
  reason?: string;
  question?: string;
}

export interface ToolRouter {
  route(input: RouteInput): Promise<RouteResult>;
}
