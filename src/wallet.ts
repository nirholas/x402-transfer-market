/**
 * Dual-rail wallet identity.
 *
 * Payments arrive on two rails, so ownership has to be expressible on two
 * rails too: an artifact issued here can belong to an **EVM address**
 * (`0x…`, 20 bytes) or a **Solana pubkey** (base58, 32 bytes). Everything that
 * records an owner stores the normalized form plus its rail, so a voucher, a
 * booking token or an attestation can be checked against whichever wallet the
 * holder actually has.
 *
 * No dependencies — base58 is decoded here so this stays a plain string check.
 */

export type Rail = "evm" | "solana";

export interface Wallet {
  /** Which rail this identity lives on. */
  rail: Rail;
  /** Normalized form: lowercased hex for EVM, base58 verbatim for Solana. */
  address: string;
  /** Exactly what the caller supplied (EVM checksum casing is preserved here). */
  raw: string;
}

const EVM_RE = /^0x[0-9a-fA-F]{40}$/;
const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/** Decodes base58 and returns the byte length, or -1 if the string is invalid. */
function base58ByteLength(input: string): number {
  if (input.length === 0) return -1;
  const bytes: number[] = [];
  for (const char of input) {
    let carry = BASE58_ALPHABET.indexOf(char);
    if (carry < 0) return -1;
    for (let i = 0; i < bytes.length; i++) {
      carry += bytes[i] * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  // Leading '1's are leading zero bytes.
  let leadingZeros = 0;
  for (const char of input) {
    if (char !== "1") break;
    leadingZeros++;
  }
  return bytes.length + leadingZeros;
}

/** Returns a normalized Wallet, or null if the string is neither rail's format. */
export function parseWallet(input: unknown): Wallet | null {
  if (typeof input !== "string") return null;
  const raw = input.trim();
  if (raw.length === 0) return null;
  if (EVM_RE.test(raw)) return { rail: "evm", address: raw.toLowerCase(), raw };
  if (raw.length >= 32 && raw.length <= 44 && base58ByteLength(raw) === 32) {
    return { rail: "solana", address: raw, raw };
  }
  return null;
}

/** parseWallet, but throws a caller-friendly message instead of returning null. */
export function requireWallet(input: unknown, field = "wallet"): Wallet {
  const wallet = parseWallet(input);
  if (!wallet) {
    throw new WalletError(
      `${field} must be an EVM address (0x… 40 hex chars) or a Solana pubkey (base58, 32 bytes)`,
    );
  }
  return wallet;
}

export class WalletError extends Error {
  readonly statusCode = 400;
  readonly code = "INVALID_WALLET";
}

/** True when two wallet strings denote the same identity on the same rail. */
export function sameWallet(a: unknown, b: unknown): boolean {
  const left = parseWallet(a);
  const right = parseWallet(b);
  if (!left || !right) return false;
  return left.rail === right.rail && left.address === right.address;
}

/** Compact serializable form embedded in signed artifacts. */
export function walletRef(wallet: Wallet): { rail: Rail; address: string } {
  return { rail: wallet.rail, address: wallet.address };
}

/** Shortened display form, e.g. `0x4025…2402` / `Wwwu…T3WwW`. */
export function shortWallet(address: string): string {
  return address.length <= 12 ? address : `${address.slice(0, 6)}…${address.slice(-4)}`;
}
