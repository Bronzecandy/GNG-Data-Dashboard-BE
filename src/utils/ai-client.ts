import OpenAI from "openai";
import dotenv from "dotenv";

let _client: OpenAI | null = null;
let _clientKey: string | null = null;

function refreshEnv(): void {
  dotenv.config({ override: true });
}

function ensureOpenAiEnv(): { apiKey: string; baseURL?: string } {
  refreshEnv();
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
  const baseURL = process.env.OPENAI_BASE_URL?.trim() || undefined;
  return { apiKey, baseURL };
}

function getClient(): OpenAI {
  const { apiKey, baseURL } = ensureOpenAiEnv();
  const fingerprint = `${apiKey}::${baseURL ?? ""}`;
  if (!_client || _clientKey !== fingerprint) {
    _client = new OpenAI({ apiKey, baseURL });
    _clientKey = fingerprint;
  }
  return _client;
}

export function getModel(): string {
  refreshEnv();
  return process.env.OPENAI_MODEL?.trim() || "gpt-5.4";
}

/** Newer GPT-5 family on Compass rejects max_tokens; use max_completion_tokens. */
function usesMaxCompletionTokens(model: string): boolean {
  return /^gpt-5/i.test(model);
}

export interface LLMResponse {
  content: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
}

export async function callLLM(
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number = 16_384,
): Promise<LLMResponse> {
  const model = getModel();
  const client = getClient();

  const request: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  };
  if (usesMaxCompletionTokens(model)) {
    (request as { max_completion_tokens?: number }).max_completion_tokens = maxTokens;
  } else {
    request.max_tokens = maxTokens;
  }

  try {
    const response = await client.chat.completions.create(request);
    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("LLM returned no content");

    return {
      content,
      model: response.model ?? model,
      inputTokens: response.usage?.prompt_tokens,
      outputTokens: response.usage?.completion_tokens,
    };
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; error?: unknown };
    const detail =
      typeof e.error === "object" && e.error
        ? ` ${JSON.stringify(e.error)}`
        : "";
    throw new Error(
      `LLM call failed (${e.status ?? "no-status"}): ${e.message ?? String(err)}${detail}`,
    );
  }
}