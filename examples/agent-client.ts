/**
 * Full x402 flow for the transfer market:
 *   1. mint a booking token (free)          — the seller's inventory
 *   2. list it for $0.005 (paid)            — signed listing in the response
 *   3. buy it at the listing's ask (paid)   — token reassigned to the buyer
 *
 * Step 3 is the point of the whole thing: the reassigned, re-signed booking
 * token comes back in the 200 body, with a fresh holderKey only the buyer sees.
 *
 * Usage:
 *   PRIVATE_KEY=0x... BASE_URL=http://localhost:4023 npx tsx examples/agent-client.ts
 */
import { privateKeyToAccount } from "viem/accounts";
import { decodeXPaymentResponse, wrapFetchWithPayment } from "x402-fetch";

const BASE_URL = process.env.BASE_URL || "http://localhost:4023";
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const ASK = process.env.ASK || "$0.30";
/** Buyer wallet — an EVM address or a Solana pubkey, both accepted. */
const BUYER = process.env.BUYER || "WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW";
/** Where the seller wants to be paid — may be on the other rail. */
const PAYOUT_TO = process.env.PAYOUT_TO;

function receipt(res: Response): void {
  const header = res.headers.get("x-payment-response");
  if (header) console.log("  X-PAYMENT-RESPONSE:", decodeXPaymentResponse(header));
}

async function main() {
  if (!PRIVATE_KEY) {
    console.error("Set PRIVATE_KEY to a funded base-sepolia key (USDC + a little ETH).");
    process.exit(1);
  }
  const account = privateKeyToAccount(PRIVATE_KEY as `0x${string}`);
  const payFetch = wrapFetchWithPayment(fetch, account, 5_000_000n); // allow up to $5

  // 1. Mint a booking token held by the seller (this EVM account). Free.
  const token = await (
    await fetch(`${BASE_URL}/bookings`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        holder: account.address,
        booking: {
          kind: "table",
          venue: "Osteria Fiorentina",
          party: 2,
          startsAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
        },
      }),
    })
  ).json();
  console.log("Minted booking token:", token.tokenId, "held by", token.holder);

  // 2. List it — $0.005. The signed listing is the purchased artifact.
  const listRes = await payFetch(`${BASE_URL}/list`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      tokenId: token.tokenId,
      holderKey: token.holderKey,
      ask: ASK,
      // The seller may be paid on the other rail — set PAYOUT_TO to a Solana
      // pubkey to see a cross-rail payout recorded in the transfer receipt.
      payoutTo: PAYOUT_TO,
    }),
  });
  if (!listRes.ok) {
    console.error("Listing failed:", listRes.status, await listRes.text());
    process.exit(1);
  }
  const listing = await listRes.json();
  console.log("\nSigned listing (the purchased artifact):\n", JSON.stringify(listing, null, 2));
  receipt(listRes);

  // 3. Buy it — priced at the listing's own ask, on either rail.
  const buyRes = await payFetch(`${BASE_URL}/buy/${listing.listingId}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ buyer: BUYER }),
  });
  if (!buyRes.ok) {
    console.error("Purchase failed:", buyRes.status, await buyRes.text());
    process.exit(1);
  }
  const bought = await buyRes.json();
  console.log("\nReassigned booking token (the purchased artifact):\n", JSON.stringify(bought.token, null, 2));
  console.log("\nSigned transfer receipt:\n", JSON.stringify(bought.transfer, null, 2));
  receipt(buyRes);

  // 4. Confirm the move and verify the signature — both free.
  const holdings = await (await fetch(`${BASE_URL}/holdings/${BUYER}`)).json();
  console.log(`\n${BUYER} now holds ${holdings.tokens.length} token(s).`);

  const verified = await (
    await fetch(`${BASE_URL}/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(bought.transfer),
    })
  ).json();
  console.log("Transfer receipt signature valid:", verified.valid);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/* ---------------------------------------------------------------------------
 * Paying on the Solana rail instead
 * ---------------------------------------------------------------------------
 * Every paid route here answers with a DUAL-RAIL 402: `accepts` holds one
 * base-sepolia entry and one solana-devnet entry. `wrapFetchWithPayment` above
 * picks the EVM one. To pay from a Solana wallet, pick the other entry and
 * build the `X-PAYMENT` envelope yourself:
 *
 *   import {
 *     prepareSolanaCheckout,
 *     encodeX402Payment,
 *   } from "@three-ws/x402-payment-modal/server";
 *
 *   const res = await fetch(url, { method: "POST" });          // 402
 *   const { accepts } = await res.json();
 *   const accept = accepts.find((a) => a.network.startsWith("solana"));
 *
 *   // 1. server-side helper builds the SPL transferChecked the buyer signs.
 *   //    accept.extra.feePayer sponsors the SOL fee, so you need only USDC.
 *   const { tx_base64 } = await prepareSolanaCheckout({
 *     accept, buyer: myPubkey, rpcUrl: process.env.SOLANA_RPC_URL,
 *   });
 *
 *   // 2. sign tx_base64 with your keypair / Phantom.
 *   const signedTxBase64 = await signWithWallet(tx_base64);
 *
 *   // 3. wrap it into the x402 envelope and retry.
 *   const { x_payment } = encodeX402Payment({
 *     accept, signedTxBase64, resourceUrl: url,
 *   });
 *   const paid = await fetch(url, { method: "POST", headers: { "X-PAYMENT": x_payment } });
 *
 * In a browser the drop-in modal does all three steps for you:
 *   <script type="module" src="https://unpkg.com/@three-ws/x402-payment-modal"></script>
 *
 * The raw dual-rail 402 body, for reference:
 *
 *   $ curl -s -i -X POST http://localhost:4023/buy/lst_…
 *   HTTP/1.1 402 Payment Required
 *   {
 *     "x402Version": 1,
 *     "error": "X-PAYMENT header is required",
 *     "accepts": [
 *       { "scheme": "exact", "network": "base-sepolia",  "asset": "0x036CbD…dCF7e",
 *         "payTo": "0x40252CFDF8B20Ed757D61ff157719F33Ec332402", "maxAmountRequired": "5000" },
 *       { "scheme": "exact", "network": "solana-devnet", "asset": "4zMMC9…ncDU",
 *         "payTo": "WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW", "maxAmountRequired": "5000",
 *         "extra": { "feePayer": "2wKupLR9q6wXYppw8Gr2NvWxKBUqm4PPJKkQfoxHDBg4" } }
 *     ]
 *   }
 * ------------------------------------------------------------------------- */
