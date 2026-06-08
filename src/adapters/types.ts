export interface LLMAdapter {
  completeJSON<T>(input: {
    system: string;
    prompt: string;
    schema?: unknown;
  }): Promise<T>;
}
