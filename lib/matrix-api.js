import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

loadDotEnv();

const DEFAULT_MODEL = "meta/llama-4-maverick-17b-128e-instruct";
const DEFAULT_ASR_MODEL = "microsoft/phi-4-multimodal-instruct";
const DEFAULT_NVIDIA_BASE_URL = "https://integrate.api.nvidia.com";

const MODEL = getEnv("NVIDIA_MODEL", DEFAULT_MODEL);
const ASR_MODEL = getEnv("NVIDIA_ASR_MODEL", DEFAULT_ASR_MODEL);
const NVIDIA_API_KEY = getEnv("NVIDIA_API_KEY");
const NVIDIA_BASE_URL = normalizeBaseUrl(getEnv("NVIDIA_BASE_URL", DEFAULT_NVIDIA_BASE_URL));
const NVIDIA_INVOKE_URL = resolveChatInvokeUrl();
const NVIDIA_ASR_INVOKE_URL = resolveAsrInvokeUrl();
const MATRIX_MAX_TOKENS = parseIntegerEnv("MATRIX_MAX_TOKENS", 512, 1, 4096);
const MATRIX_TEMPERATURE = parseNumberEnv("MATRIX_TEMPERATURE", 0.7, 0, 2);
const MATRIX_TOP_P = parseNumberEnv("MATRIX_TOP_P", 0.95, 0, 1);
const MATRIX_MAX_BODY_BYTES = parseIntegerEnv("MATRIX_MAX_BODY_BYTES", 4 * 1024 * 1024, 1024, 10 * 1024 * 1024);
const NVIDIA_REQUEST_TIMEOUT_MS = parseIntegerEnv("NVIDIA_REQUEST_TIMEOUT_MS", 45_000, 1_000, 180_000);
const NVIDIA_POLL_INTERVAL_MS = parseIntegerEnv("NVIDIA_POLL_INTERVAL_MS", 1_500, 250, 10_000);
const NVIDIA_MAX_POLL_ATTEMPTS = parseIntegerEnv("NVIDIA_MAX_POLL_ATTEMPTS", 24, 1, 120);

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
    providerConfigured: Boolean(NVIDIA_API_KEY),
    runtimeConfigVersion: 2
  };
}

export function buildRuntimeConfigScript() {
  return `window.MATRIX_RUNTIME = ${JSON.stringify(buildRuntimeConfig())};`;
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
  const body = await readJsonBodyOrRespond(req, res);

  if (!body) {
    return;
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  const history = Array.isArray(body.history) ? body.history : [];

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
    const payload = await postJsonToNvidia(
      NVIDIA_INVOKE_URL,
      {
        model: MODEL,
        messages: buildConversationMessages(history, message),
        max_tokens: MATRIX_MAX_TOKENS,
        temperature: MATRIX_TEMPERATURE,
        top_p: MATRIX_TOP_P,
        frequency_penalty: 0,
        presence_penalty: 0,
        stream: false
      },
      "Matrix response"
    );
    const normalizedPayload = unwrapNvidiaPayload(payload);
    const outputText = extractAssistantText(normalizedPayload);

    res.json({
      text: outputText || "Processing complete.",
      mode: "assistant",
      responseId: normalizedPayload.id || payload?.requestId || null,
      sources: [],
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("Matrix response error", getSafeErrorForLogs(error));
    res.status(resolveHttpStatus(error)).json({
      error: "Matrix could not complete the request.",
      text: buildFailureReply(message),
      mode: "degraded",
      sources: [],
      ...developmentDetail(error)
    });
  }
}

export async function handleTranscribe(req, res) {
  const body = await readJsonBodyOrRespond(req, res);

  if (!body) {
    return;
  }

  const audioDataUrl = typeof body.audioDataUrl === "string" ? body.audioDataUrl.trim() : "";

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
    const payload = await postJsonToNvidia(
      NVIDIA_ASR_INVOKE_URL,
      {
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
      },
      "Matrix transcription"
    );
    const normalizedPayload = unwrapNvidiaPayload(payload);
    const text = extractAssistantText(normalizedPayload).trim();

    res.json({
      text,
      model: ASR_MODEL,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("Matrix transcription error", getSafeErrorForLogs(error));
    res.status(resolveHttpStatus(error)).json({
      error: "Matrix could not transcribe the audio.",
      ...developmentDetail(error)
    });
  }
}

function buildConversationMessages(history, message) {
  return [
    {
      role: "user",
      content: `Operating contract:\n${MATRIX_SYSTEM_PROMPT}`
    },
    {
      role: "assistant",
      content: "Matrix Omega Ultra runtime initialized. I will follow the operating contract."
    },
    ...historyToInput(history, message),
    {
      role: "user",
      content: message
    }
  ];
}

async function postJsonToNvidia(url, body, label) {
  const response = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${NVIDIA_API_KEY}`,
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    },
    label
  );

  return parseNvidiaResponse(response, label);
}

async function parseNvidiaResponse(response, label) {
  if (response.status === 202) {
    const payload = await readResponsePayload(response);
    const requestId = extractRequestId(payload, response);

    if (!requestId) {
      throw providerError(`${label} is pending but NVIDIA did not return a request id.`, 502);
    }

    return pollNvidiaResponse(requestId, label);
  }

  if (!response.ok) {
    await throwNvidiaHttpError(response, label);
  }

  return readResponsePayload(response);
}

async function pollNvidiaResponse(requestId, label) {
  const statusUrl = buildNvidiaStatusUrl(requestId);

  for (let attempt = 0; attempt < NVIDIA_MAX_POLL_ATTEMPTS; attempt += 1) {
    await sleep(NVIDIA_POLL_INTERVAL_MS);

    const response = await fetchWithTimeout(
      statusUrl,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${NVIDIA_API_KEY}`,
          Accept: "application/json"
        }
      },
      `${label} status`
    );

    if (response.status === 202 || response.status === 204) {
      continue;
    }

    if (!response.ok) {
      await throwNvidiaHttpError(response, `${label} status`);
    }

    const payload = await readResponsePayload(response);
    const status = typeof payload?.status === "string" ? payload.status.toLowerCase() : "";

    if (["pending", "queued", "running", "in_progress", "processing"].includes(status)) {
      continue;
    }

    if (["failed", "error", "errored", "cancelled", "canceled"].includes(status)) {
      throw providerError(extractProviderMessage(payload) || `${label} failed while polling.`, 502);
    }

    return payload;
  }

  throw providerError(`${label} timed out while waiting for NVIDIA to finish processing.`, 504);
}

async function fetchWithTimeout(url, options, label) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), NVIDIA_REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw providerError(`${label} timed out after ${NVIDIA_REQUEST_TIMEOUT_MS} ms.`, 504);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function throwNvidiaHttpError(response, label) {
  const payload = await readResponsePayload(response);
  const message =
    extractProviderMessage(payload) ||
    `${label} failed with NVIDIA API HTTP ${response.status}.`;
  throw providerError(`${label} failed with NVIDIA API HTTP ${response.status}: ${message}`, 502);
}

async function readResponsePayload(response) {
  const text = await response.text();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch (_error) {
    return { text };
  }
}

async function readJsonBodyOrRespond(req, res) {
  try {
    return await readJsonBody(req);
  } catch (error) {
    const status = error?.statusCode || 400;
    res.status(status).json({
      error: status === 413 ? "Request body is too large." : "Invalid JSON request body."
    });
    return null;
  }
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
    return req.body;
  }

  if (typeof req.body === "string") {
    return parseJsonBody(req.body);
  }

  if (Buffer.isBuffer(req.body)) {
    return parseJsonBody(req.body.toString("utf8"));
  }

  if (!req || typeof req[Symbol.asyncIterator] !== "function") {
    return {};
  }

  let rawBody = "";

  for await (const chunk of req) {
    rawBody += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);

    if (rawBody.length > MATRIX_MAX_BODY_BYTES) {
      const error = new Error("Request body is too large.");
      error.statusCode = 413;
      throw error;
    }
  }

  return parseJsonBody(rawBody);
}

function parseJsonBody(rawBody) {
  const trimmed = rawBody.trim();

  if (!trimmed) {
    return {};
  }

  return JSON.parse(trimmed);
}

function resolveChatInvokeUrl() {
  return getEnv("NVIDIA_INVOKE_URL") || buildNvidiaInvokeUrl(MODEL);
}

function resolveAsrInvokeUrl() {
  return getEnv("NVIDIA_ASR_INVOKE_URL") || buildNvidiaInvokeUrl(ASR_MODEL);
}

function buildNvidiaInvokeUrl(model) {
  return `${NVIDIA_BASE_URL}/v1/${model.replace(/^\/+/, "")}`;
}

function buildNvidiaStatusUrl(requestId) {
  const encodedRequestId = encodeURIComponent(requestId);
  const override = getEnv("NVIDIA_STATUS_URL");

  if (!override) {
    return `${NVIDIA_BASE_URL}/v1/status/${encodedRequestId}`;
  }

  if (override.includes("{requestId}")) {
    return override.replace("{requestId}", encodedRequestId);
  }

  return `${override.replace(/\/+$/, "")}/${encodedRequestId}`;
}

function normalizeBaseUrl(value) {
  return value.replace(/\/+$/, "").replace(/\/v1$/i, "");
}

function normalizeAudioDataUrl(audioDataUrl) {
  if (audioDataUrl.startsWith("data:audio/wav;base64,")) {
    return audioDataUrl;
  }

  if (audioDataUrl.startsWith("data:audio/x-wav;base64,")) {
    return audioDataUrl.replace("data:audio/x-wav;base64,", "data:audio/wav;base64,");
  }

  if (
    audioDataUrl.startsWith("data:audio/mpeg;base64,") ||
    audioDataUrl.startsWith("data:audio/mp3;base64,")
  ) {
    return audioDataUrl.replace("data:audio/mp3;base64,", "data:audio/mpeg;base64,");
  }

  return "";
}

function historyToInput(history, currentMessage) {
  const normalizedCurrent = currentMessage.trim();
  const entries = history
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

  while (
    entries.length &&
    entries[entries.length - 1].role === "user" &&
    entries[entries.length - 1].content === normalizedCurrent
  ) {
    entries.pop();
  }

  return entries;
}

function unwrapNvidiaPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return payload;
  }

  if (payload.choices) {
    return payload;
  }

  for (const key of ["response", "result", "data", "output"]) {
    const value = payload[key];

    if (value && typeof value === "object" && value.choices) {
      return value;
    }
  }

  return payload;
}

function extractAssistantText(payload) {
  const choice = payload?.choices?.[0];
  const content = choice?.message?.content ?? choice?.delta?.content ?? choice?.text;
  const directText =
    payload?.output_text ??
    payload?.text ??
    payload?.response?.text ??
    payload?.result?.text;

  if (typeof directText === "string") {
    return directText.trim();
  }

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

        if (typeof item?.content === "string") {
          return item.content;
        }

        return "";
      })
      .join("\n")
      .trim();
  }

  return "";
}

function extractRequestId(payload, response) {
  return (
    payload?.requestId ||
    payload?.request_id ||
    payload?.id ||
    response.headers.get("nvcf-reqid") ||
    response.headers.get("x-request-id") ||
    ""
  );
}

function extractProviderMessage(payload) {
  if (typeof payload === "string") {
    return payload;
  }

  if (typeof payload?.error === "string") {
    return payload.error;
  }

  if (typeof payload?.detail === "string") {
    return payload.detail;
  }

  if (typeof payload?.message === "string") {
    return payload.message;
  }

  if (typeof payload?.text === "string") {
    return payload.text;
  }

  if (typeof payload?.error?.message === "string") {
    return payload.error.message;
  }

  return "";
}

function providerError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function resolveHttpStatus(error) {
  if (error?.statusCode && Number.isInteger(error.statusCode)) {
    return error.statusCode;
  }

  return 500;
}

function developmentDetail(error) {
  if (process.env.NODE_ENV === "production") {
    return {};
  }

  return {
    detail: error instanceof Error ? error.message : "Unknown provider fault."
  };
}

function getSafeErrorForLogs(error) {
  if (!(error instanceof Error)) {
    return error;
  }

  return {
    name: error.name,
    message: error.message,
    statusCode: error.statusCode
  };
}

function getEnv(name, fallback = "") {
  const value = process.env[name];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function loadDotEnv() {
  const currentFile = fileURLToPath(import.meta.url);
  const envPath = path.resolve(path.dirname(currentFile), "..", ".env");

  if (!fs.existsSync(envPath)) {
    return;
  }

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const match = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);

    if (!match || process.env[match[1]] !== undefined) {
      continue;
    }

    process.env[match[1]] = normalizeEnvValue(match[2]);
  }
}

function normalizeEnvValue(value) {
  const trimmed = value.trim();
  const quote = trimmed[0];

  if ((quote === "\"" || quote === "'") && trimmed.endsWith(quote)) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function parseIntegerEnv(name, fallback, min, max) {
  const parsed = Number.parseInt(process.env[name] || "", 10);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, parsed));
}

function parseNumberEnv(name, fallback, min, max) {
  const parsed = Number(process.env[name]);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, parsed));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
