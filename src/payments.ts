/**
 * Dual-rail x402 paywall — USDC on Base (EVM) *and* USDC on Solana (SVM).
 *
 * Every paid route answers an unpaid request with a 402 whose `accepts` array
 * lists BOTH rails. The client picks whichever wallet it has:
 *
 *   accepts[0] → { network: "base-sepolia" | "base",   payTo: <EVM address>  }
 *   accepts[1] → { network: "solana-devnet" | "solana", payTo: <Solana pubkey> }
 *
 * When the client retries with an `X-PAYMENT` header we decode the envelope,
 * match it back to the rail it was built for, then verify + settle it through
 * **that rail's facilitator**. Facilitators are not interchangeable: the
 * reference x402.org one settles Base, while Solana settlement is handled by a
 * Solana-capable facilitator (PayAI by default), so each rail gets its own
 * client. The settlement receipt goes out as `X-PAYMENT-RESPONSE` and the
 * request proceeds to the handler, which returns the artifact in the 200 body.
 *
 * If a rail cannot be configured (unknown network, no USDC mint for it) that
 * rail is omitted from `accepts` and logged — the service still serves the
 * other rail rather than crashing.
 */
import type { NextFunction, Request, RequestHandler, Response } from "express";
import {
  findMatchingPaymentRequirements,
  processPriceToAtomicAmount,
  safeBase64Decode,
  safeBase64Encode,
  toJsonSafe,
} from "x402/shared";
import { PaymentPayloadSchema, type Network, type PaymentRequirements } from "x402/types";
import { useFacilitator } from "x402/verify";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Suite default receive addresses. Public — safe to commit. */
export const DEFAULT_EVM_PAY_TO = "0x40252CFDF8B20Ed757D61ff157719F33Ec332402";
export const DEFAULT_SOLANA_PAY_TO = "WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW";

/**
 * Facilitator sponsor that pays the SOL network fee, read from the Solana
 * facilitator's /supported endpoint at runtime. This constant is the fallback
 * for when that call fails — it is PayAI's sponsor account.
 */
const FALLBACK_SOLANA_FEE_PAYER = "2wKupLR9q6wXYppw8Gr2NvWxKBUqm4PPJKkQfoxHDBg4";

export const EVM_NETWORK: Network = process.env.NETWORK === "base" ? "base" : "base-sepolia";

export const SOLANA_NETWORK: Network =
  process.env.SOLANA_NETWORK === "mainnet-beta" || process.env.SOLANA_NETWORK === "solana"
    ? "solana"
    : "solana-devnet";

/** EVM rail facilitator. The x402.org reference facilitator settles Base. */
export const FACILITATOR_URL = (process.env.FACILITATOR_URL ||
  "https://x402.org/facilitator") as `${string}://${string}`;

/**
 * Solana rail facilitator — a *different* service. x402.org's facilitator does
 * not settle Solana, so the Solana rail defaults to PayAI's, which does.
 */
export const SOLANA_FACILITATOR_URL = (process.env.SOLANA_FACILITATOR_URL ||
  "https://facilitator.payai.network") as `${string}://${string}`;

export const EVM_PAY_TO = process.env.PAY_TO_ADDRESS || DEFAULT_EVM_PAY_TO;
export const SOLANA_PAY_TO = process.env.SOLANA_PAY_TO_ADDRESS || DEFAULT_SOLANA_PAY_TO;

export const USING_DEFAULT_PAY_TO =
  !process.env.PAY_TO_ADDRESS || !process.env.SOLANA_PAY_TO_ADDRESS;

const evmFacilitator = useFacilitator({ url: FACILITATOR_URL });
const svmFacilitator = useFacilitator({ url: SOLANA_FACILITATOR_URL });

const isSolana = (network: string): boolean => network.startsWith("solana");

/** The facilitator that can actually settle the rail this requirement is on. */
function facilitatorFor(network: string) {
  return isSolana(network) ? svmFacilitator : evmFacilitator;
}

// ---------------------------------------------------------------------------
// Solana fee payer discovery (cached, with a static fallback)
// ---------------------------------------------------------------------------

let feePayerPromise: Promise<string> | undefined;

/**
 * The Solana `exact` scheme needs `extra.feePayer` — the *Solana* facilitator's
 * sponsor account, which differs per facilitator. We ask its /supported
 * endpoint once and cache the answer; SOLANA_FEE_PAYER overrides it, and a
 * known-good constant is the fallback so the Solana rail is still advertised
 * when that call fails.
 */
async function getSolanaFeePayer(): Promise<string> {
  if (process.env.SOLANA_FEE_PAYER) return process.env.SOLANA_FEE_PAYER;
  if (!feePayerPromise) {
    feePayerPromise = (async () => {
      try {
        const supported = await svmFacilitator.supported();
        for (const kind of supported.kinds as Array<Record<string, any>>) {
          const network = String(kind.network || "");
          const wantsMainnet = SOLANA_NETWORK === "solana";
          const isMainnet = network === "solana" || network.startsWith("solana:");
          const isDevnet = network === "solana-devnet";
          if ((wantsMainnet ? isMainnet : isDevnet) && kind.extra?.feePayer) {
            return String(kind.extra.feePayer);
          }
        }
      } catch {
        /* fall through to the constant */
      }
      return FALLBACK_SOLANA_FEE_PAYER;
    })();
  }
  return feePayerPromise;
}

// ---------------------------------------------------------------------------
// Route pricing
// ---------------------------------------------------------------------------

export interface PriceSpec {
  /** Dollar string, e.g. "$0.005". */
  price: string;
  description: string;
  mimeType?: string;
  outputSchema?: Record<string, unknown>;
}

/**
 * A route entry is either a fixed price or a resolver. A resolver returning
 * `null` means "don't charge for this request" — used so unknown ids get a free
 * 404 instead of a paid one.
 */
export type RouteEntry = PriceSpec | ((req: Request) => PriceSpec | null);

export type RoutePrices = Record<string, RouteEntry>;

interface CompiledRoute {
  method: string;
  pattern: RegExp;
  entry: RouteEntry;
}

/** "POST /execute/:id" → { method: "POST", pattern: /^\/execute\/[^/]+$/ } */
function compile(key: string): { method: string; pattern: RegExp } {
  const [rawMethod, rawPath] = key.includes(" ") ? key.split(/\s+/, 2) : ["*", key];
  const source = rawPath
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/:[A-Za-z0-9_]+/g, "[^/]+")
    .replace(/\*/g, ".*");
  return { method: rawMethod.toUpperCase(), pattern: new RegExp(`^${source}/?$`) };
}

// ---------------------------------------------------------------------------
// 402 challenge construction
// ---------------------------------------------------------------------------

function resourceUrl(req: Request): string {
  const host = req.get("host") || `localhost:${process.env.PORT || 4021}`;
  const proto = (req.get("x-forwarded-proto") || req.protocol || "http").split(",")[0];
  return `${proto}://${host}${req.originalUrl.split("?")[0]}`;
}

function buildRail(
  network: Network,
  payTo: string,
  spec: PriceSpec,
  resource: string,
  extra: Record<string, unknown> | undefined,
): PaymentRequirements | null {
  const priced = processPriceToAtomicAmount(spec.price, network);
  if ("error" in priced) {
    console.warn(`[x402] omitting ${network} rail: ${priced.error}`);
    return null;
  }
  // EIP-712 domain only matters on the EVM rail; Solana carries `feePayer`.
  const eip712 = isSolana(network) ? undefined : (priced.asset as any).eip712;
  return {
    scheme: "exact",
    network,
    maxAmountRequired: priced.maxAmountRequired,
    resource: resource as `${string}://${string}`,
    description: spec.description,
    mimeType: spec.mimeType || "application/json",
    payTo,
    maxTimeoutSeconds: 120,
    asset: priced.asset.address as string,
    outputSchema: spec.outputSchema as Record<string, any> | undefined,
    extra: { ...eip712, ...(extra || {}) },
  };
}

/** Both rails for one route, ready to drop into a 402 `accepts` array. */
export async function buildAccepts(spec: PriceSpec, resource: string): Promise<PaymentRequirements[]> {
  const evm = buildRail(EVM_NETWORK, EVM_PAY_TO, spec, resource, undefined);
  const svm = buildRail(SOLANA_NETWORK, SOLANA_PAY_TO, spec, resource, {
    feePayer: await getSolanaFeePayer(),
  });
  return [evm, svm].filter((r): r is PaymentRequirements => r !== null);
}

function challenge(res: Response, accepts: PaymentRequirements[], error: string, status = 402): void {
  res.status(status).json({ x402Version: 1, error, accepts });
}

// ---------------------------------------------------------------------------
// The middleware
// ---------------------------------------------------------------------------

/**
 * Dual-rail paywall. Mount once, before the routes:
 *
 *   app.use(paywall({ "POST /cases": { price: "$0.01", description: "…" } }));
 */
export function paywall(routes: RoutePrices): RequestHandler {
  const compiled: CompiledRoute[] = Object.entries(routes).map(([key, entry]) => {
    const { method, pattern } = compile(key);
    return { method, pattern, entry };
  });

  return async (req: Request, res: Response, next: NextFunction) => {
    const match = compiled.find(
      (r) => (r.method === "*" || r.method === req.method.toUpperCase()) && r.pattern.test(req.path),
    );
    if (!match) return next();

    const spec = typeof match.entry === "function" ? match.entry(req) : match.entry;
    if (!spec) return next(); // resolver declined to charge

    const resource = resourceUrl(req);
    const accepts = await buildAccepts(spec, resource);
    if (accepts.length === 0) {
      return res.status(500).json({
        error: "NO_PAYMENT_RAIL",
        message: "No payment rail could be configured for this route.",
      });
    }

    // Browsers (and the drop-in checkout modal) need to read the receipt.
    res.setHeader("Access-Control-Expose-Headers", "X-PAYMENT-RESPONSE");

    const header = req.header("X-PAYMENT");
    if (!header) return challenge(res, accepts, "X-PAYMENT header is required");

    // 1. Decode the envelope.
    let payload;
    try {
      payload = PaymentPayloadSchema.parse(JSON.parse(safeBase64Decode(header)));
    } catch {
      return challenge(res, accepts, "Malformed X-PAYMENT header (expected base64 x402 payload)");
    }

    // 2. Match it to the rail it was built for.
    const selected = findMatchingPaymentRequirements(accepts, payload);
    if (!selected) {
      return challenge(res, accepts, `No accepted rail matches network "${payload.network}"`);
    }

    // 3. Verify, then settle — through the facilitator for *that* rail.
    const facilitator = facilitatorFor(selected.network);
    try {
      const verification = await facilitator.verify(payload, selected);
      if (!verification.isValid) {
        return challenge(res, accepts, verification.invalidReason || "Payment verification failed");
      }
      const receipt = await facilitator.settle(payload, selected);
      if (!receipt.success) {
        return challenge(res, accepts, receipt.errorReason || "Payment settlement failed");
      }
      res.setHeader(
        "X-PAYMENT-RESPONSE",
        safeBase64Encode(
          JSON.stringify(
            toJsonSafe({
              success: true,
              rail: isSolana(selected.network) ? "solana" : "evm",
              network: selected.network,
              transaction: receipt.transaction,
              payer: (receipt as { payer?: string }).payer ?? null,
            }),
          ),
        ),
      );
      (req as Request & { x402?: unknown }).x402 = {
        rail: isSolana(selected.network) ? "solana" : "evm",
        network: selected.network,
        transaction: receipt.transaction,
        payer: (receipt as { payer?: string }).payer ?? null,
        amount: selected.maxAmountRequired,
      };
      return next();
    } catch (err) {
      const which = isSolana(selected.network) ? SOLANA_FACILITATOR_URL : FACILITATOR_URL;
      return challenge(res, accepts, `Facilitator error (${which}): ${(err as Error).message}`);
    }
  };
}

/** Settlement details attached to the request after a successful payment. */
export interface PaymentContext {
  rail: "evm" | "solana";
  network: string;
  transaction: string;
  payer: string | null;
  amount: string;
}

export function paymentOf(req: Request): PaymentContext | undefined {
  return (req as Request & { x402?: PaymentContext }).x402;
}

/**
 * Echo the settlement receipt into a paid response alongside the artifact.
 *
 * It goes under `settlement` — a key `verify()` in sign.ts deliberately
 * excludes — so the response body can be handed straight to `POST /verify`
 * and still check out. The receipt is added *after* signing; it is a
 * convenience copy of the `X-PAYMENT-RESPONSE` header, not signed content.
 */
export function withSettlement<T extends object>(
  artifact: T,
  req: Request,
): T & { settlement: PaymentContext | null } {
  return { ...artifact, settlement: paymentOf(req) ?? null };
}

/** One-line summary for the startup banner. */
export function payToBanner(): string[] {
  const lines = [
    `  rail 1  EVM     network=${EVM_NETWORK}  payTo=${EVM_PAY_TO}`,
    `                  facilitator=${FACILITATOR_URL}`,
    `  rail 2  Solana  network=${SOLANA_NETWORK}  payTo=${SOLANA_PAY_TO}`,
    `                  facilitator=${SOLANA_FACILITATOR_URL}`,
  ];
  if (USING_DEFAULT_PAY_TO) {
    lines.push(
      "  note: using suite default payTo — set PAY_TO_ADDRESS/SOLANA_PAY_TO_ADDRESS to receive funds yourself",
    );
  }
  return lines;
}
