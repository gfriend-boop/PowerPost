/**
 * Provider-agnostic LLM client. Built so swapping providers is a one-file change.
 * Today: Anthropic. Tomorrow: anything else, as long as it implements LLMClient.
 */

export type LLMRole = "system" | "user" | "assistant";

export type LLMMessage = {
  role: LLMRole;
  content: string;
};

export type LLMCompletionRequest = {
  model: string;
  system?: string;
  messages: LLMMessage[];
  max_tokens?: number;
  temperature?: number;
};

export type LLMCompletionResponse = {
  text: string;
  stop_reason: string | null;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
};

export interface LLMClient {
  complete(req: LLMCompletionRequest): Promise<LLMCompletionResponse>;
}
