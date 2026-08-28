type ChatMessage = {
  role: "system" | "user";
  content: string;
};

type AiTextResult =
  | { ok: true; text: string; provider: "groq" | "openai" }
  | { ok: false; status: number; code: string; provider?: "groq" | "openai" };

type GroqResponse = {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { type?: string; code?: string; message?: string };
};

type OpenAIResponse = {
  output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
  error?: { type?: string; code?: string; message?: string };
};

const AI_TIMEOUT_MS = Number(process.env.AI_TEXT_TIMEOUT_MS || 25_000);

function openAiResponseText(payload: OpenAIResponse) {
  return payload.output
    ?.flatMap((item) => item.content || [])
    .filter((content) => content.type === "output_text" && typeof content.text === "string")
    .map((content) => content.text)
    .join("\n")
    .trim();
}

function providerOrder() {
  const preferred = (process.env.AI_PROVIDER || "groq").trim().toLowerCase();
  const available = {
    groq: Boolean(process.env.GROQ_API_KEY),
    openai: Boolean(process.env.OPENAI_API_KEY)
  };
  const ordered = preferred === "openai" ? ["openai", "groq"] : ["groq", "openai"];
  return ordered.filter((provider) => available[provider as keyof typeof available]) as Array<"groq" | "openai">;
}

async function requestGroq(messages: ChatMessage[], maxTokens: number): Promise<AiTextResult> {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.GROQ_TEXT_MODEL || "openai/gpt-oss-20b",
      messages,
      temperature: 0.2,
      reasoning_effort: "low",
      include_reasoning: false,
      max_completion_tokens: maxTokens
    }),
    signal: AbortSignal.timeout(AI_TIMEOUT_MS)
  });
  const payload = await response.json().catch(() => ({})) as GroqResponse;
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      code: payload.error?.code || payload.error?.type || "groq_error",
      provider: "groq"
    };
  }
  const text = payload.choices?.[0]?.message?.content?.trim();
  return text
    ? { ok: true, text, provider: "groq" }
    : { ok: false, status: 502, code: "empty_response", provider: "groq" };
}

async function requestOpenAI(messages: ChatMessage[], maxTokens: number): Promise<AiTextResult> {
  const [system, ...input] = messages;
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.OPENAI_TEXT_MODEL || "gpt-5.4-mini",
      store: false,
      max_output_tokens: maxTokens,
      instructions: system?.content,
      input
    }),
    signal: AbortSignal.timeout(AI_TIMEOUT_MS)
  });
  const payload = await response.json().catch(() => ({})) as OpenAIResponse;
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      code: payload.error?.code || payload.error?.type || "openai_error",
      provider: "openai"
    };
  }
  const text = openAiResponseText(payload);
  return text
    ? { ok: true, text, provider: "openai" }
    : { ok: false, status: 502, code: "empty_response", provider: "openai" };
}

export function hasConfiguredAiProvider() {
  return providerOrder().length > 0;
}

export async function generateTerraqoText(messages: ChatMessage[], maxTokens = 1200): Promise<AiTextResult> {
  const providers = providerOrder();
  if (!providers.length) return { ok: false, status: 503, code: "not_configured" };

  let lastError: AiTextResult = { ok: false, status: 502, code: "provider_error" };
  for (const provider of providers) {
    try {
      const result = provider === "groq"
        ? await requestGroq(messages, maxTokens)
        : await requestOpenAI(messages, maxTokens);
      if (result.ok) return result;
      lastError = result;
    } catch (error) {
      lastError = {
        ok: false,
        status: error instanceof DOMException && error.name === "TimeoutError" ? 504 : 502,
        code: "connection_error",
        provider
      };
    }
  }
  return lastError;
}
