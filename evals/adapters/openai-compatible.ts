import type { LLMAdapter } from "../../src/index.js";

interface OpenAICompatibleAdapterOptions {
  apiKey?: string;
  baseUrl?: string;
  model: string;
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

export function createOpenAICompatibleAdapter(options: OpenAICompatibleAdapterOptions): LLMAdapter {
  const baseUrl = (options.baseUrl ?? "https://api.openai.com/v1").replace(/\/$/, "");

  return {
    async completeJSON<T>({ system, prompt }: { system: string; prompt: string; schema?: unknown }) {
      const headers: Record<string, string> = {
        "Content-Type": "application/json"
      };

      if (options.apiKey) {
        headers.Authorization = `Bearer ${options.apiKey}`;
      }

      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: options.model,
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: system },
            { role: "user", content: prompt }
          ]
        })
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`LLM request failed: ${response.status} ${body}`);
      }

      const json = (await response.json()) as ChatCompletionResponse;
      const content = json.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error("LLM response did not include message content.");
      }

      return JSON.parse(content) as T;
    }
  };
}
