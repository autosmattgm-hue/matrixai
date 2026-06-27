import fs from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildHealthPayload,
  buildRuntimeConfigScript,
  handleRespond,
  handleTranscribe
} from "./lib/matrix-api.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "public");
const cliPort = process.argv.find((arg) => arg.startsWith("--port="))?.split("=")[1];
const PORT = Number(process.env.PORT || cliPort || 3000);

const rateLimiter = createRateLimiter({ windowMs: 60_000, max: 30 });

const server = createServer(async (req, nativeRes) => {
  const res = new ResponseAdapter(nativeRes, req.method === "HEAD");

  try {
    applySecurityHeaders(nativeRes);
    await routeRequest(req, res);
  } catch (error) {
    console.error("Unhandled server error", error);

    if (!nativeRes.headersSent) {
      res.status(500).json({ error: "Internal server error." });
      return;
    }

    nativeRes.end();
  }
});

if (!process.env.VERCEL) {
  listenWithPortFallback(server, PORT);
}

export default server;

function listenWithPortFallback(activeServer, port, attemptsRemaining = 20) {
  const handleError = (error) => {
    activeServer.removeListener("listening", handleListening);

    if (error?.code === "EADDRINUSE" && attemptsRemaining > 0) {
      activeServer.close(() => {
        listenWithPortFallback(activeServer, port + 1, attemptsRemaining - 1);
      });
      return;
    }

    throw error;
  };

  const handleListening = () => {
    activeServer.removeListener("error", handleError);
    console.log(`Matrix online at http://localhost:${port}`);
  };

  activeServer.once("error", handleError);
  activeServer.once("listening", handleListening);
  activeServer.listen(port);
}

async function routeRequest(req, res) {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const pathname = decodeURIComponent(url.pathname);

  if (pathname.startsWith("/api/") && !rateLimiter(req, res)) {
    return;
  }

  if ((pathname === "/health" || pathname === "/api/health") && allows(req, res, ["GET", "HEAD"])) {
    res.status(200).json(buildHealthPayload());
    return;
  }

  if (pathname === "/runtime-config.js" && allows(req, res, ["GET", "HEAD"])) {
    res
      .status(200)
      .setHeader("Cache-Control", "no-store, max-age=0")
      .type("application/javascript; charset=utf-8")
      .send(buildRuntimeConfigScript());
    return;
  }

  if (pathname === "/api/matrix/respond" && allows(req, res, ["POST"])) {
    await handleRespond(req, res);
    return;
  }

  if (pathname === "/api/matrix/transcribe" && allows(req, res, ["POST"])) {
    await handleTranscribe(req, res);
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.status(405).setHeader("Allow", "GET, HEAD").json({ error: "Method not allowed." });
    return;
  }

  await serveStatic(pathname, res);
}

async function serveStatic(pathname, res) {
  const filePath = resolvePublicPath(pathname);

  if (!filePath) {
    res.status(403).send("Forbidden");
    return;
  }

  const resolvedFile = await resolveExistingFile(filePath);

  if (!resolvedFile) {
    res.status(404).send("Not found");
    return;
  }

  const stat = await fs.promises.stat(resolvedFile);
  res.status(200);
  res.type(contentTypeFor(resolvedFile));
  res.setHeader("Content-Length", String(stat.size));
  res.setHeader("Cache-Control", cacheControlFor(resolvedFile));
  res.stream(resolvedFile);
}

function resolvePublicPath(pathname) {
  const normalizedPath = pathname === "/" ? "/index.html" : pathname;
  const relativePath = normalizedPath.replace(/^\/+/, "");
  const filePath = path.resolve(publicDir, relativePath);
  const relativeToPublic = path.relative(publicDir, filePath);

  if (relativeToPublic.startsWith("..") || path.isAbsolute(relativeToPublic)) {
    return "";
  }

  return filePath;
}

async function resolveExistingFile(filePath) {
  if (await isFile(filePath)) {
    return filePath;
  }

  if (!path.extname(filePath) && await isFile(`${filePath}.html`)) {
    return `${filePath}.html`;
  }

  return "";
}

async function isFile(filePath) {
  try {
    const stat = await fs.promises.stat(filePath);
    return stat.isFile();
  } catch (_error) {
    return false;
  }
}

function allows(req, res, methods) {
  if (methods.includes(req.method)) {
    return true;
  }

  res.setHeader("Allow", methods.join(", "));
  res.status(405).json({ error: "Method not allowed." });
  return false;
}

function contentTypeFor(filePath) {
  const extension = path.extname(filePath).toLowerCase();

  return (
    {
      ".css": "text/css; charset=utf-8",
      ".html": "text/html; charset=utf-8",
      ".ico": "image/x-icon",
      ".js": "application/javascript; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".png": "image/png",
      ".svg": "image/svg+xml; charset=utf-8",
      ".txt": "text/plain; charset=utf-8",
      ".webmanifest": "application/manifest+json; charset=utf-8"
    }[extension] || "application/octet-stream"
  );
}

function cacheControlFor(filePath) {
  const extension = path.extname(filePath).toLowerCase();

  if ([".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico"].includes(extension)) {
    return "public, max-age=86400";
  }

  return "no-cache";
}

function applySecurityHeaders(res) {
  const contentSecurityPolicy = [
    "default-src 'self'",
    "script-src 'self' https://cdn.tailwindcss.com https://cdnjs.cloudflare.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data:",
    "font-src 'self' https://fonts.gstatic.com",
    "connect-src 'self'",
    "media-src 'self' blob:",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'"
  ].join("; ");

  res.setHeader("Content-Security-Policy", contentSecurityPolicy);
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader("Origin-Agent-Cluster", "?1");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-Permitted-Cross-Domain-Policies", "none");
  res.setHeader("Permissions-Policy", "camera=(self), microphone=(self), geolocation=()");
}

function createRateLimiter({ windowMs, max }) {
  const buckets = new Map();

  return (req, res) => {
    const now = Date.now();
    const key = req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "anonymous";
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      writeRateLimitHeaders(res, max, max - 1, now + windowMs);
      return true;
    }

    bucket.count += 1;
    writeRateLimitHeaders(res, max, Math.max(0, max - bucket.count), bucket.resetAt);

    if (bucket.count > max) {
      res
        .status(429)
        .setHeader("Retry-After", String(Math.ceil((bucket.resetAt - now) / 1000)))
        .json({ error: "Too many API requests. Please retry shortly." });
      return false;
    }

    return true;
  };
}

function writeRateLimitHeaders(res, limit, remaining, resetAt) {
  res.setHeader("RateLimit-Limit", String(limit));
  res.setHeader("RateLimit-Remaining", String(remaining));
  res.setHeader("RateLimit-Reset", String(Math.ceil(resetAt / 1000)));
}

class ResponseAdapter {
  constructor(nativeRes, headOnly = false) {
    this.nativeRes = nativeRes;
    this.headOnly = headOnly;
    this.statusCode = 200;
  }

  status(statusCode) {
    this.statusCode = statusCode;
    this.nativeRes.statusCode = statusCode;
    return this;
  }

  setHeader(name, value) {
    this.nativeRes.setHeader(name, value);
    return this;
  }

  type(contentType) {
    this.setHeader("Content-Type", contentType);
    return this;
  }

  json(payload) {
    const body = JSON.stringify(payload);
    this.type("application/json; charset=utf-8");
    this.setHeader("Content-Length", String(Buffer.byteLength(body)));
    this.end(body);
  }

  send(body = "") {
    const payload = Buffer.isBuffer(body) ? body : Buffer.from(String(body));

    if (!this.nativeRes.hasHeader("Content-Type")) {
      this.type("text/plain; charset=utf-8");
    }

    this.setHeader("Content-Length", String(payload.byteLength));
    this.end(payload);
  }

  stream(filePath) {
    if (this.headOnly) {
      this.nativeRes.end();
      return;
    }

    fs.createReadStream(filePath)
      .on("error", () => {
        if (!this.nativeRes.headersSent) {
          this.status(500).send("Internal server error");
          return;
        }

        this.nativeRes.end();
      })
      .pipe(this.nativeRes);
  }

  end(body) {
    if (this.headOnly) {
      this.nativeRes.end();
      return;
    }

    this.nativeRes.end(body);
  }
}
