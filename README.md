# x402-transfer-market

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![x402](https://img.shields.io/badge/payments-x402-0052ff.svg)](https://x402.org)
[![USDC on Base + Solana](https://img.shields.io/badge/USDC-Base%20%2B%20Solana-0052ff.svg)](https://x402.org)

**resell held bookings between wallets** — A booking token is a signed, transferable claim on a held reservation. List one for a $0.005 fee, and a buyer pays the ask to receive the same token reassigned to their wallet — signed, in the 200 body. Holders live on either rail: an EVM address or a Solana pubkey.

## Why x402 for this

Resale markets usually need accounts, escrow and a settlement window, because the platform has to hold the buyer's money while it decides whether the transfer worked. With x402 the payment settles in the same request that performs the transfer, so the reassigned token *is* the payment response. And because the price quoted in the 402 is the listing's own ask, an agent can shop listings and buy one without ever opening an account.

## Pay in USDC on Base **or** Solana — your client picks the rail

Every paid route answers an unpaid request with a 402 whose `accepts` array
carries both rails:

| Rail | Networks | Asset | payTo |
|---|---|---|---|
| EVM | `base-sepolia` (default) · `base` | USDC | `0x40252CFDF8B20Ed757D61ff157719F33Ec332402` |
| Solana | `solana-devnet` (default) · `solana` | USDC | `WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW` |

Both are verified and settled through the same facilitator
(`https://x402.org/facilitator`). On Solana, `extra.feePayer` is the
facilitator's sponsor account, so a payer needs only USDC — never SOL for gas.

## Quickstart

```bash
git clone https://github.com/nirholas/x402-transfer-market && cd x402-transfer-market
npm install
cp .env.example .env       # optional — every value has a working default
npm run dev

# in another terminal, the full paid flow on the EVM rail:
PRIVATE_KEY=0xYourFundedBaseSepoliaKey npm run client
```

Open <http://localhost:4023/> for the browser market demo (EVM wallet or Phantom).


## API

| Route | Price | What you get back |
|---|---|---|
| `POST /list` | $0.005 | Signed listing of a transferable booking token |
| `POST /buy/:listingId` | $0.750 (the listing's own ask) | Booking token reassigned to the buyer wallet, signed |
| `POST /bookings` | free | Signed booking token + its secret holderKey |
| `GET /listings` | free | Open signed listings |
| `GET /listings/:id` | free | Signed listing |
| `GET /holdings/:wallet` | free | Signed booking tokens (holderKey redacted) |
| `GET /transfers/:id` | free | Signed transfer receipt |
| `GET /stats` | free | Aggregate market counters |
| `POST /verify` | free | `{ valid: true | false }` |
| `GET /health` | free | `{ ok: true }` |
| `GET /.well-known/x402` | free | Machine-readable discovery manifest |

`POST /bookings` mints a demo booking token so the market has inventory to trade — in a real deployment those tokens come from whatever system holds the actual reservation.

**Seller payouts.** The buyer's USDC settles to the service's `payTo`. The signed transfer receipt records what the operator owes the seller (`payout.to`, `payout.amount`, `status: "owed"`) on whichever rail the seller nominated — an auditable obligation, not a silent balance.

## How x402 works here

1. Call a paid route with no payment → **402** with `accepts[]` quoting the exact price on **both** rails.
2. Your client picks a rail and signs: EIP-3009 `transferWithAuthorization` (EVM) or a serialized SPL transfer (Solana).
3. Retry with the `X-PAYMENT` header. The facilitator verifies and settles.
4. The server returns **the artifact in the 200 body**, plus `X-PAYMENT-RESPONSE` carrying `{ rail, network, transaction, payer }`.

Mainnet: `NETWORK=base`, `SOLANA_NETWORK=mainnet-beta`, and a mainnet-capable `FACILITATOR_URL`.

## Real backend / API keys

Fully self-contained — **no external APIs and no API keys**. State is file-based (`data/tokens.json`, `data/listings.json`, `data/transfers.json`).
Artifacts are signed with HMAC-SHA256 using `SIGNING_SECRET`; the dev default
(`dev-secret-change-me`) is public, so set your own in production.

## Human checkout

`public/index.html` is a working browser demo built on the drop-in
[`@three-ws/x402-payment-modal`](https://www.npmjs.com/package/@three-ws/x402-payment-modal)
(loaded from the CDN — it is a proprietary package and is never vendored here).
Open `http://localhost:4023/` after `npm run dev`. Because the 402 already
carries both rails, the modal offers an EVM wallet **and** Phantom with no extra
wiring. It also brings **SIWX re-entry** (sign in once with your wallet, come
back without re-approving) and **spending caps** (a per-session ceiling the user
sets, so an agent or a page cannot drain a wallet a cent at a time).

## For AI agents

- **skill.md**: [skill.md](skill.md) — agent-facing endpoints, prices, schemas, error codes.
- **Discovery manifest**: [`/.well-known/x402`](public/.well-known/x402), served live by the app, listing **both networks per resource** — indexable by [x402scan.com](https://x402scan.com), the x402 Bazaar, and [agentic.market](https://agentic.market). List your deployment there so paying agents can find it.
- **MCP**: [examples/mcp-tool.md](examples/mcp-tool.md) — wrap these routes as MCP tools for Claude.
- **Raw flow**: [examples/curl.md](examples/curl.md) — the 402 → pay → 200 walkthrough by hand.

## Docs

Full docs on GitHub Pages: **https://nirholas.github.io/x402-transfer-market/** — [tutorial](docs/tutorial.md) · [API reference](docs/api.md) · [for agents](docs/agents.md)

Part of the [x402 Suite](https://github.com/nirholas/x402-suite).

## Support

nichxbt@gmail.com

## License

[Apache-2.0](LICENSE)
