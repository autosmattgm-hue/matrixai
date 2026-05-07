import "dotenv/config";
import { handleTranscribe } from "../../lib/matrix-api.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed." });
    return;
  }

  await handleTranscribe(req, res);
}
