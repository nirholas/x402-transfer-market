import "dotenv/config";
import express from "express";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { solanaCheckout } from "./checkout.js";
import { paywall, payToBanner, withSettlement } from "./payments.js";
import { ROUTE_SCHEMAS } from "./schemas.js";
import {
  buyListing,
  createListing,
  DEFAULT_ASK,
  getListing,
  getTransfer,
  holdingsFor,
  LIST_FEE,
  MarketError,
  marketStats,
  mintToken,
  openListings,
} from "./service.js";
import { verify } from "./sign.js";
import { WalletError } from "./wallet.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT || 4023);

const app = express();
app.use(express.json({ limit: "64kb" }));

// ---- x402 paywall ----------------------------------------------------------
// POST /list        → flat listing fee
// POST /buy/:id     → the listing's own ask, so the 402 quotes the real price
//                     of the booking being bought.
//
// The challenge comes first, always. An unpaid request gets 402 and the full
// `accepts` array before the listing id is resolved or the buyer wallet is
// parsed, so a discovery probe (or any agent) can read this route's payment
// terms without holding a live listing id. A closed or unknown listing, or a
// malformed buyer, is the handler's business — after payment. Browse the free
// `GET /listings` / `GET /listings/:id` before paying.
app.use(
  paywall({
    "POST /list": {
      price: LIST_FEE,
      description: "List a transferable booking token on the market",
      outputSchema: ROUTE_SCHEMAS["POST /list"],
    },
    "POST /buy/:listingId": (req) => {
      const listing = getListing(req.path.split("/")[2] || "");
      const open = listing?.status === "open" ? listing : undefined;
      return {
        price: open?.ask ?? DEFAULT_ASK,
        description: open
          ? `Buy booking ${open.booking.reference} at ${open.booking.venue} (${open.booking.kind}, party of ${open.booking.party})`
          : "Buy a listed booking token",
        outputSchema: ROUTE_SCHEMAS["POST /buy/:listingId"],
      };
    },
  }),
);

// ---- Solana checkout helper for the browser modal --------------------------
app.use("/api/x402-checkout", solanaCheckout());

// ---- Free routes ------------------------------------------------------------
app.get("/health", (_req, res) => res.json({ ok: true, service: "x402-transfer-market" }));
app.get("/stats", (_req, res) => res.json(marketStats()));

app.post("/bookings", (req, res) => {
  try {
    const token = mintToken(req.body ?? {});
    // The holderKey is returned once, to the minter only.
    res.status(201).json(token);
  } catch (err) {
    return fail(res, err);
  }
});

app.get("/listings", (_req, res) => res.json({ listings: openListings() }));

app.get("/listings/:id", (req, res) => {
  const listing = getListing(req.params.id);
  if (!listing) return res.status(404).json({ error: "LISTING_NOT_FOUND", message: `No listing ${req.params.id}` });
  res.json(listing);
});

app.get("/holdings/:wallet", (req, res) => {
  try {
    res.json({ wallet: req.params.wallet, tokens: holdingsFor(req.params.wallet) });
  } catch (err) {
    return fail(res, err);
  }
});

app.get("/transfers/:id", (req, res) => {
  const transfer = getTransfer(req.params.id);
  if (!transfer) return res.status(404).json({ error: "TRANSFER_NOT_FOUND", message: `No transfer ${req.params.id}` });
  res.json(transfer);
});

app.post("/verify", (req, res) => {
  const artifact = req.body;
  if (!artifact || typeof artifact !== "object" || Array.isArray(artifact)) {
    return res.status(400).json({ error: "BAD_REQUEST", message: "POST a signed artifact as the JSON body" });
  }
  res.json({ valid: verify(artifact as Record<string, unknown>) });
});

// ---- Paid routes ------------------------------------------------------------
app.post("/list", (req, res) => {
  try {
    const listing = createListing(req.body ?? {});
    res.status(201).json(withSettlement(listing, req));
  } catch (err) {
    return fail(res, err);
  }
});

app.post("/buy/:listingId", (req, res) => {
  try {
    const result = buyListing(req.params.listingId, req.body?.buyer);
    res.json(withSettlement(result, req));
  } catch (err) {
    return fail(res, err);
  }
});

function fail(res: express.Response, err: unknown): void {
  if (err instanceof WalletError || err instanceof MarketError) {
    res.status(err.statusCode).json({ error: err.code, message: err.message });
    return;
  }
  throw err;
}

// ---- Static (demo page + /.well-known/x402) ---------------------------------
app.get("/.well-known/x402", (_req, res) => {
  res.type("application/json").send(readFileSync(path.join(ROOT, "public/.well-known/x402"), "utf8"));
});
app.get("/skill.md", (_req, res) => {
  res.type("text/markdown").send(readFileSync(path.join(ROOT, "skill.md"), "utf8"));
});
app.use(express.static(path.join(ROOT, "public")));

app.listen(PORT, () => {
  console.log(`x402-transfer-market listening on http://localhost:${PORT}`);
  console.log("  Pay in USDC on Base or Solana — your client picks the rail.");
  for (const line of payToBanner()) console.log(line);
  console.log("  Paid routes:");
  console.log(`    POST /list                 ${LIST_FEE} listing fee -> signed listing`);
  console.log("    POST /buy/:listingId       the listing's ask -> reassigned booking token");
  console.log("  Free routes:");
  console.log("    POST /bookings             mint a booking token (+ holderKey)");
  console.log("    GET  /listings             browse open listings");
  console.log("    GET  /holdings/:wallet     tokens held by an EVM address or Solana pubkey");
  console.log("    GET  /transfers/:id        signed transfer receipt");
  console.log("    POST /verify               verify any signed artifact");
  console.log("    GET  /                     human checkout demo (payment modal)");
  console.log("    GET  /.well-known/x402     discovery manifest");
});
