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

/** Verifies an artifact previously produced by signArtifact(). */
export function verify(artifact: Record<string, unknown>): boolean {
  const { signature, algorithm: _algorithm, ...payload } = artifact;
  if (typeof signature !== "string" || signature.length !== 64) return false;
  const expected = Buffer.from(sign(payload), "utf8");
  const provided = Buffer.from(signature, "utf8");
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}
