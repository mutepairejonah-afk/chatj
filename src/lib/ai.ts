const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// ─── Gemini (primary — configured in .env) ────────────────────────────────────
async function geminiGenerate(prompt: string, system: string | undefined): Promise<string> {
  if (!GEMINI_API_KEY) throw new Error("No GEMINI_API_KEY set");

  // Use gemini-2.5-flash-lite — fast, free tier available, high quality
  const model = "gemini-2.5-flash-lite";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;

  const systemInstruction = system
    ? { parts: [{ text: system }] }
    : undefined;

  const body: any = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { maxOutputTokens: 600, temperature: 0.7 },
  };
  if (systemInstruction) body.systemInstruction = systemInstruction;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    throw new Error(`Gemini error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
  if (!text) throw new Error("Gemini returned an empty response");
  return text;
}

// ─── OpenRouter (fallback) ───────────────────────────────────────────────────
const FREE_MODEL = "meta-llama/llama-3.1-8b-instruct:free";

function getModel(tier: string): string {
  if (tier === "pro") return process.env.OPENROUTER_MODEL_PRO || "deepseek/deepseek-r1";
  if (tier === "premium") return process.env.OPENROUTER_MODEL_PREMIUM || "deepseek/deepseek-r1:free";
  return process.env.OPENROUTER_MODEL_FREE || FREE_MODEL;
}

async function openRouterGenerate(prompt: string, system: string | undefined, tier: string): Promise<string> {
  if (!OPENROUTER_API_KEY) throw new Error("No OPENROUTER_API_KEY set");

  const messages: { role: "system" | "user"; content: string }[] = [];
  if (system) messages.push({ role: "system", content: system });
  messages.push({ role: "user", content: prompt });

  const model = getModel(tier);
  // Use the actual app domain in production so OpenRouter analytics work correctly;
  // fall back to localhost only during local dev.
  const appUrl = process.env.APP_URL || process.env.VITE_APP_URL || "http://localhost:5000";

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "HTTP-Referer": appUrl,
      "X-Title": "ChatApp AI Assistant",
    },
    body: JSON.stringify({ model, messages, max_tokens: 600 }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    const isAvailabilityIssue = res.status === 402 || res.status === 404 || res.status === 429;
    if (isAvailabilityIssue && model !== FREE_MODEL) {
      console.warn(`[AI] Model "${model}" unavailable (${res.status}), retrying with free model`);
      return openRouterGenerate(prompt, system, "free");
    }
    throw new Error(`OpenRouter error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content?.trim() ?? "";
  if (!text) throw new Error("OpenRouter returned an empty response");
  return text;
}

// ─── Public aiGenerate — tries Gemini first, falls back to OpenRouter ─────────
export async function aiGenerate(prompt: string, systemInstruction?: string, tier: string = "free"): Promise<string> {
  // Prefer Gemini if configured — it's the primary key in .env and highly reliable
  if (GEMINI_API_KEY) {
    try {
      return await geminiGenerate(prompt, systemInstruction);
    } catch (err: any) {
      console.warn("[AI] Gemini failed, falling back to OpenRouter:", err?.message || err);
    }
  }
  if (OPENROUTER_API_KEY) {
    try {
      return await openRouterGenerate(prompt, systemInstruction, tier);
    } catch (err: any) {
      console.error("[AI] OpenRouter request failed:", err?.message || err);
      throw err;
    }
  }
  throw new Error("No AI API key configured. Set GEMINI_API_KEY or OPENROUTER_API_KEY in your environment.");
}

export async function aiTranslateText(text: string, targetLanguage: string, tier: string = "free"): Promise<string> {
  const prompt = `Translate the following message to ${targetLanguage}. Output ONLY the translated text with no preamble, quotes, or explanation:\n\n${text}`;
  return aiGenerate(prompt, undefined, tier);
}

export async function aiChatReply(
  question: string,
  recentMessages: { sender: string; text: string }[],
  tier: string = "free"
): Promise<string> {
  const system = `You are a helpful AI assistant inside a messaging app called ChatApp. 
Be concise, friendly, and helpful. Keep replies short (1–3 sentences) unless detail is needed.
You have context of the recent conversation to inform your answer.`;

  const contextStr = recentMessages.length
    ? "Recent conversation context:\n" +
      recentMessages
        .slice(-6)
        .map((m) => `${m.sender}: ${m.text}`)
        .join("\n") +
      "\n\n"
    : "";

  const prompt = `${contextStr}User question: ${question}`;
  return aiGenerate(prompt, system, tier);
}
