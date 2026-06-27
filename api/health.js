import { buildHealthPayload } from "../lib/matrix-api.js";

export default function handler(_req, res) {
  res.status(200).json(buildHealthPayload());
}
