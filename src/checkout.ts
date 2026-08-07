/**
 * Solana checkout endpoint for the browser payment modal.
 *
 * Why this exists: on the **EVM** rail a browser wallet signs EIP-3009 typed
 * data entirely client-side, so nothing server-side is needed. On the **Solana**
 * rail, Phantom only signs *serialized transactions* — something has to build
 * the SPL `transferChecked` first. `handleCheckout` from the drop-in modal's
 * server module does exactly that:
 *
 *   ?action=prepare → build the partially-signed v0 transaction the buyer signs
 *   ?action=encode  → wrap the signed transaction into the X-PAYMENT envelope
 *
 * The fee payer is the facilitator's sponsor account (`accept.extra.feePayer`,
 * which our 402 challenge already carries), so the buyer needs only USDC and
 * never SOL for gas.
 *
 * This is a BROWSER CHECKOUT helper only. Payment verification and settlement
 * for BOTH rails happen in payments.ts via the x402 facilitator
 * (`useFacilitator` from x402/verify) — this module is never in that path.
 *
 * Mounted at /api/x402-checkout — the path the modal posts to by default.
 */
import type { RequestHandler } from "express";
import { handleCheckout } from "@three-ws/x402-payment-modal/server";

export function solanaCheckout(): RequestHandler {
  const options = {
    rpcUrl: process.env.SOLANA_RPC_URL,
    devnetRpcUrl: process.env.SOLANA_DEVNET_RPC_URL,
  };
  return async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "content-type, x-idempotency-key");
    if (req.method === "OPTIONS") return void res.status(204).end();
    if (req.method !== "POST") {
      return void res.status(405).json({ error: "method_not_allowed", error_description: "use POST" });
    }
    const action = typeof req.query.action === "string" ? req.query.action : "";
    const body = req.body && typeof req.body === "object" ? (req.body as Record<string, unknown>) : {};
    const { status, body: out } = await handleCheckout({ action, body, options });
    res.status(status).json(out);
  };
}
