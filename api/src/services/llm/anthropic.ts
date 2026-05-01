import Anthropic from "@anthropic-ai/sdk";
import { config, isAnthropicConfigured } from "../../config.js";
import type {
  LLMClient,
  LLMCompletionRequest,
  LLMCompletionResponse,
} from "./client.js";

class AnthropicClient implements LLMClient {
  private sdk: Anthropic;
  constructor(apiKey: string) {
    this.sdk = new Anthropic({ apiKey });
  }

  async complete(req: LLMCompletionRequest): Promise<LLMCompletionResponse> {
    const response = await this.sdk.messages.create({
      model: req.model,
      max_tokens: req.max_tokens ?? 1500,
      temperature: req.temperature ?? 0.8,
      system: req.system,
      messages: req.messages.map((m) => ({
        role: m.role === "system" ? "user" : m.role,
        content: m.content,
      })),
    });
    const text = response.content
      .filter((block): block is { type: "text"; text: string } => block.type === "text")
      .map((b) => b.text)
      .join("\n");
    return {
      text,
      stop_reason: response.stop_reason ?? null,
      usage: {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
      },
    };
  }
}

/**
 * Echo client: deterministic, no-network fallback used when ANTHROPIC_API_KEY
 * is not configured. Lets the full UX flow be exercised without calling the
 * real LLM. The returned text deliberately follows the content rules (no
 * em-dashes, no broetry) so validators pass.
 */
class EchoClient implements LLMClient {
  async complete(req: LLMCompletionRequest): Promise<LLMCompletionResponse> {
    const lastUser = [...req.messages].reverse().find((m) => m.role === "user");
    const seed = lastUser?.content ?? "";
    const text = `Here is a draft you can sharpen.

I have been thinking about ${truncate(seed, 80) || "what it actually takes to lead well"}. Most of us treat this as a tactical problem. It is not. It is a clarity problem. The teams that move fastest are not the ones with the most resources. They are the ones who can articulate what success looks like in a sentence anyone can repeat.

If you are stuck this week, do not ask what to do next. Ask what you are actually trying to win. The answer is usually two layers above where you have been spending your time.`;
    return {
      text,
      stop_reason: "end_turn",
      usage: { input_tokens: 0, output_tokens: 0 },
    };
  }
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n).trimEnd();
}

let cached: LLMClient | null = null;

export function getLLMClient(): LLMClient {
  if (cached) return cached;
  if (isAnthropicConfigured()) {
    cached = new AnthropicClient(config.anthropic.apiKey);
  } else {
    console.warn(
      "[llm] ANTHROPIC_API_KEY not set, using EchoClient. Generations will be deterministic stubs.",
    );
    cached = new EchoClient();
  }
  return cached;
}
