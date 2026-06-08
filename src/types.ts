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

export interface RouteResultBase {
  confidence: number;
  path: string[];
  pathString: string;
  trace: RouteTrace[];
}

export type RouteResult =
  | {
      type: "tool";
      toolName: string;
    } & RouteResultBase
  | {
      type: "no_tool_available";
      reason: string;
    } & RouteResultBase
  | {
      type: "needs_clarification";
      question: string;
    } & RouteResultBase;

export interface RouterDecision {
  choice: string;
  confidence: number;
  reason?: string;
  question?: string;
}

export interface ToolRouter {
  route(input: RouteInput): Promise<RouteResult>;
}
