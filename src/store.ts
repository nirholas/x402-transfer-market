/**
 * File-based persistence. One JSON file per collection under DATA_DIR
 * (default ./data). No database by design — state survives restarts and is
 * trivially inspectable.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DATA_DIR = process.env.DATA_DIR || "data";

function fileFor(name: string): string {
  return join(DATA_DIR, `${name}.json`);
}

export function loadStore<T>(name: string, fallback: T): T {
  const file = fileFor(name);
  if (!existsSync(file)) return fallback;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

export function saveStore(name: string, value: unknown): void {
  mkdirSync(DATA_DIR, { recursive: true });
  const file = fileFor(name);
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2));
  renameSync(tmp, file);
}
