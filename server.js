import "dotenv/config";

import compression from "compression";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "public");
const avatarPath = path.join(__dirname, "AI-head.png");

const PORT = Number(process.env.PORT || 3000);
const MODEL =
  process.env.NVIDIA_MODEL || "meta/llama-4-maverick-17b-128e-instruct";
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

const app = express();

app.disable("x-powered-by");

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "https://cdn.tailwindcss.com",
          "https://cdnjs.cloudflare.com"
        ],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://fonts.googleapis.com"
        ],
        imgSrc: ["'self'", "data:"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        connectSrc: ["'self'"],
        mediaSrc: ["'self'", "blob:"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"]
      }
    },
    crossOriginEmbedderPolicy: false
  })
);
app.use(compression());
app.use(express.json({ limit: "1mb" }));

app.use(
  "/api",
  rateLimit({
    windowMs: 60_000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false
  })
);

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    provider: "nvidia",
    model: MODEL,
    executionMode: "browser-shell",
    providerConfigured: Boolean(NVIDIA_API_KEY),
    timestamp: new Date().toISOString()
  });
});

app.get("/runtime-config.js", (_req, res) => {
  res.type("application/javascript").send(
    `window.MATRIX_RUNTIME = ${JSON.stringify({
      apiEndpoint: "/api/matrix/respond",
      healthEndpoint: "/health",
      provider: "nvidia",
      executionMode: "browser-shell",
      wakeWords: ["Hey Matrix", "Matrix", "Omega", "Matrix Ultra"],
      model: MODEL,
      providerConfigured: Boolean(NVIDIA_API_KEY)
    })};`
  );
});

app.get("/AI-head.png", (_req, res) => {
  res.sendFile(avatarPath);
});

app.post("/api/matrix/respond", async (req, res) => {
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
});

app.use(express.static(publicDir, { extensions: ["html"] }));

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Matrix online at http://localhost:${PORT}`);
  });
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

export default app;
