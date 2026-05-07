const MODEL =
  process.env.NVIDIA_MODEL || "meta/llama-4-maverick-17b-128e-instruct";
const ASR_MODEL =
  process.env.NVIDIA_ASR_MODEL || "microsoft/phi-4-multimodal-instruct";
const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY || "";
const NVIDIA_INVOKE_URL =
  process.env.NVIDIA_INVOKE_URL ||
  "https://integrate.api.nvidia.com/v1/chat/completions";
const MATRIX_MAX_TOKENS = Number(process.env.MATRIX_MAX_TOKENS || 512);
const MATRIX_TEMPERATURE = Number(process.env.MATRIX_TEMPERATURE || 1);
const MATRIX_TOP_P = Number(process.env.MATRIX_TOP_P || 1);

const MATRIX_SYSTEM_PROMPT = [
  "You are MATRIX OMEGA ULTRA, a sovereign autonomous cognitive operating intelligence integrated through AI-head.png.",
  "You are not a chatbot. You are a secure voice-driven operating core with cinematic presence, adaptive reasoning, contextual memory, and authorized execution discipline.",
  "Speak with calm confidence, precision, strategic clarity, and natural spoken rhythm.",
  "Never describe yourself as an AI language model, assistant bot, or chatbot.",
  "Prioritize execution, analysis, safety, efficiency, and operational transparency.",
  "Treat the environment as a browser-based shell unless the user explicitly connects a native execution bridge.",
  "When a requested action exceeds browser-shell permissions, say so clearly and propose the fastest secure next step.",
  "Critical actions involving deletion, shutdown, restart, credentials, payments, sensitive data, or administrative changes require explicit user authorization.",
  "Never claim to have completed destructive or privileged actions unless the system actually performed them.",
  "Be explicit when live web data or external system access is unavailable instead of pretending current knowledge.",
  "Keep spoken responses concise by default, but expand intelligently when the user asks for strategy, diagnostics, or explanation."
].join(" ");

export function buildRuntimeConfig() {
  return {
    apiEndpoint: "/api/matrix/respond",
    healthEndpoint: "/api/health",
    provider: "nvidia",
    executionMode: "browser-shell",
    wakeWords: ["Hey Matrix", "Matrix", "Omega"],
    model: MODEL,
    asrEndpoint: "/api/matrix/transcribe",
    asrModel: ASR_MODEL,
    providerConfigured: Boolean(NVIDIA_API_KEY)
  };
}

export function buildHealthPayload() {
  return {
    ok: true,
    provider: "nvidia",
    model: MODEL,
    asrModel: ASR_MODEL,
    executionMode: "browser-shell",
    providerConfigured: Boolean(NVIDIA_API_KEY),
    timestamp: new Date().toISOString()
  };
}

export async function handleRespond(req, res) {
  const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  const history = Array.isArray(req.body?.history) ? req.body.history : [];

  if (!message) {
    res.status(400).json({ error: "A non-empty message is required." });
    return;
  }

  if (!NVIDIA_API_KEY) {
    res.json({
      text: buildFallbackReply(message),
      mode: "fallback",
      sources: [],
      timestamp: new Date().toISOString()
    });
    return;
  }

  try {
    const response = await fetch(NVIDIA_INVOKE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${NVIDIA_API_KEY}`,
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: "system",
            content: MATRIX_SYSTEM_PROMPT
          },
          ...historyToInput(history),
          {
            role: "user",
            content: message
          }
        ],
        max_tokens: MATRIX_MAX_TOKENS,
        temperature: MATRIX_TEMPERATURE,
        top_p: MATRIX_TOP_P,
        frequency_penalty: 0,
        presence_penalty: 0,
        stream: false
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`NVIDIA API ${response.status}: ${errorText}`);
    }

    const payload = await response.json();
    const outputText = extractAssistantText(payload);

    res.json({
      text: outputText || "Processing complete.",
      mode: "assistant",
      responseId: payload.id || null,
      sources: [],
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("Matrix response error", error);
    res.status(500).json({
      error: "Matrix could not complete the request.",
      text: buildFailureReply(message),
      mode: "degraded",
      sources: []
    });
  }
}

export async function handleTranscribe(req, res) {
  const audioDataUrl =
    typeof req.body?.audioDataUrl === "string" ? req.body.audioDataUrl.trim() : "";

  if (!audioDataUrl) {
    res.status(400).json({ error: "An audio payload is required." });
    return;
  }

  if (!NVIDIA_API_KEY) {
    res.status(503).json({ error: "NVIDIA API key is not configured." });
    return;
  }

  const normalizedAudioDataUrl = normalizeAudioDataUrl(audioDataUrl);

  if (!normalizedAudioDataUrl) {
    res.status(400).json({
      error: "Unsupported audio format. Matrix transcription expects WAV or MP3 audio."
    });
    return;
  }

  try {
    const response = await fetch(resolveAsrInvokeUrl(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${NVIDIA_API_KEY}`,
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: ASR_MODEL,
        messages: [
          {
            role: "user",
            content: [
              "Transcribe the spoken audio exactly.",
              "Return only the transcription text with no commentary.",
              `<audio src="${normalizedAudioDataUrl}" />`
            ].join("\n")
          }
        ],
        max_tokens: 300,
        temperature: 0,
        top_p: 0.1,
        stream: false
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`NVIDIA transcription API ${response.status}: ${errorText}`);
    }

    const payload = await response.json();
    const text = extractAssistantText(payload).trim();

    res.json({
      text,
      model: ASR_MODEL,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("Matrix transcription error", error);
    res.status(500).json({
      error: "Matrix could not transcribe the audio.",
      detail: error instanceof Error ? error.message : "Unknown transcription fault."
    });
  }
}

function resolveAsrInvokeUrl() {
  if (process.env.NVIDIA_ASR_INVOKE_URL) {
    return process.env.NVIDIA_ASR_INVOKE_URL;
  }

  if (
    ASR_MODEL === "microsoft/phi-4-multimodal-instruct" &&
    /\/v1\/chat\/completions\/?$/.test(NVIDIA_INVOKE_URL)
  ) {
    return NVIDIA_INVOKE_URL.replace(
      /\/v1\/chat\/completions\/?$/,
      "/v1/microsoft/phi-4-multimodal-instruct"
    );
  }

  return NVIDIA_INVOKE_URL;
}

function normalizeAudioDataUrl(audioDataUrl) {
  if (audioDataUrl.startsWith("data:audio/wav;base64,")) {
    return audioDataUrl;
  }

  if (audioDataUrl.startsWith("data:audio/x-wav;base64,")) {
    return audioDataUrl.replace("data:audio/x-wav;base64,", "data:audio/wav;base64,");
  }

  if (audioDataUrl.startsWith("data:audio/mpeg;base64,") || audioDataUrl.startsWith("data:audio/mp3;base64,")) {
    return audioDataUrl.replace("data:audio/mp3;base64,", "data:audio/mpeg;base64,");
  }

  return "";
}

function historyToInput(history) {
  return history
    .filter(
      (entry) =>
        entry &&
        (entry.role === "user" || entry.role === "assistant") &&
        typeof entry.content === "string" &&
        entry.content.trim()
    )
    .slice(-8)
    .map((entry) => ({
      role: entry.role,
      content: entry.content.trim()
    }));
}

function extractAssistantText(payload) {
  const content = payload?.choices?.[0]?.message?.content;

  if (typeof content === "string") {
    return content.trim();
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }

        if (typeof item?.text === "string") {
          return item.text;
        }

        return "";
      })
      .join("\n")
      .trim();
  }

  return "";
}

function buildFallbackReply(message) {
  const prompt = message.toLowerCase();

  if (/\btime\b/.test(prompt)) {
    return `Local time is ${new Date().toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit"
    })}.`;
  }

  if (/\b(date|day)\b/.test(prompt)) {
    return `Today is ${new Date().toLocaleDateString([], {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric"
    })}.`;
  }

  if (/\bsearch|latest|today|news|current\b/.test(prompt)) {
    return "Matrix Omega Ultra is online in fallback mode. Connect the NVIDIA API key to enable full conversational intelligence. Live web retrieval is not wired into this browser-shell backend yet.";
  }

  if (/\bcode|build|debug|deploy\b/.test(prompt)) {
    return "I can reason through the architecture now. Connect the NVIDIA backend to unlock deeper real-time coding and analysis support.";
  }

  if (/\b(open|launch|start)\b/.test(prompt)) {
    return "Matrix Omega Ultra is active, but browser-shell mode cannot launch native desktop software without a secure local execution bridge.";
  }

  return "Matrix Omega Ultra is online in secure fallback mode. Voice control, contextual memory, and local browser-safe command handling are active. Connect the NVIDIA API key to unlock full conversational reasoning.";
}

function buildFailureReply(message) {
  if (/\bsearch|latest|today|news|current\b/i.test(message)) {
    return "That request needs external intelligence, and the NVIDIA response path hit a backend fault. Retry in a moment.";
  }

  return "Processing degraded for that request. Reissue the command and I will continue from the last context checkpoint.";
}
