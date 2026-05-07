import "dotenv/config";

import compression from "compression";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildHealthPayload,
  buildRuntimeConfig,
  handleRespond,
  handleTranscribe
} from "./lib/matrix-api.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "public");
const avatarPath = path.join(publicDir, "AI-head.png");

const PORT = Number(process.env.PORT || 3000);
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
  res.json(buildHealthPayload());
});

app.get("/api/health", (_req, res) => {
  res.json(buildHealthPayload());
});

app.get("/runtime-config.js", (_req, res) => {
  res
    .type("application/javascript")
    .send(`window.MATRIX_RUNTIME = ${JSON.stringify(buildRuntimeConfig())};`);
});

app.get("/AI-head.png", (_req, res) => {
  res.sendFile(avatarPath);
});

app.post("/api/matrix/respond", handleRespond);
app.post("/api/matrix/transcribe", handleTranscribe);

app.use(express.static(publicDir, { extensions: ["html"] }));

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Matrix online at http://localhost:${PORT}`);
  });
}

export default app;
