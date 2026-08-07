/**
 * HMAC-SHA256 signing over canonical JSON.
 *
 * Every artifact this service returns is signed so that any party holding the
 * SIGNING_SECRET can verify it offline via `verify()` or the free POST /verify
 * endpoint. Uses a dev secret by default — set SIGNING_SECRET in production.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

const SECRET = process.env.SIGNING_SECRET || "dev-secret-change-me";

/** Deterministic JSON: object keys sorted recursively, no whitespace. */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`);
  return `{${entries.join(",")}}`;
}

export function sign(payload: object): string {
  return createHmac("sha256", SECRET).update(canonicalize(payload)).digest("hex");
}

export type Signed<T> = T & { signature: string; algorithm: "HMAC-SHA256" };

/** Returns payload + { signature, algorithm }. */
export function signArtifact<T extends object>(payload: T): Signed<T> {
  return { ...payload, signature: sign(payload), algorithm: "HMAC-SHA256" };
}

/**
 * Re-sign an artifact **in place** after its mutable fields changed.
 *
 * Artifacts are stored signed, and some of their fields legitimately move
 * (a status flips to expired, a counter increments). Mutating a stored artifact
 * without re-signing leaves a record whose signature no longer matches its
 * contents — so every in-place mutation must be followed by this call.
 *
 * `signature`, `algorithm` and `settlement` are always excluded from the
 * payload; pass extra field names to omit any server-side secrets that were
 * never part of the signed document (e.g. a possession key).
 */
export function resignInPlace<T extends object>(artifact: T, ...omit: string[]): T {
  const skip = new Set(["signature", "algorithm", "settlement", ...omit]);
  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(artifact)) {
    if (!skip.has(key)) payload[key] = value;
  }
  const target = artifact as Record<string, unknown>;
  target.signature = sign(payload);
  target.algorithm = "HMAC-SHA256";
  return artifact;
}

/**
 * Verifies an artifact previously produced by signArtifact().
 *
 * `signature`, `algorithm` and `settlement` are excluded from the payload:
 * the first two are the envelope, and `settlement` is the x402 receipt the
 * server echoes into paid responses *after* signing (see payments.ts →
 * withSettlement). That echo is convenience, not part of the signed artifact,
 * so a response body can be fed straight back here and still verify.
 */
export function verify(artifact: Record<string, unknown>): boolean {
  const { signature, algorithm: _algorithm, settlement: _settlement, ...payload } = artifact;
  if (typeof signature !== "string" || signature.length !== 64) return false;
  const expected = Buffer.from(sign(payload), "utf8");
  const provided = Buffer.from(signature, "utf8");
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}
