---
name: booking-transfers
description: Mint, list, buy and track transferable booking tokens between wallets over x402, with signed listings and receipts. Use when an agent needs to resell or acquire a held booking.
---

# x402-transfer-market booking resale

The unit of trade is a booking token: a signed claim on a reservation held by an EVM or Solana wallet. A `holderKey` proves ownership and is shown once.

## Run the server

The repo is a self-hosted Express service. It is not published to npm, so run it from a clone.

```bash
git clone https://github.com/nirholas/x402-transfer-market && cd x402-transfer-market
npm install
cp .env.example .env   # optional: the defaults run out of the box
npm run dev            # listens on http://localhost:4023 (override with PORT)
```

Set `PAY_TO_ADDRESS` (Base) and `SOLANA_PAY_TO_ADDRESS` (Solana) in `.env` to receive payments yourself.
`SIGNING_SECRET` signs tokens and receipts, `MAX_ASK` caps listing prices, `DATA_DIR` holds state.
`GET http://localhost:4023/.well-known/x402` lists every route with its price, and `GET /health` is the liveness probe.

## Routes

| Route | Price | Purpose |
|---|---|---|
| `POST /bookings` | free | Mint a token. Body `{holder, booking: {kind, venue, startsAt, party}}`. Returns the token and a one-time `holderKey` |
| `POST /list` | $0.005 | Body `{tokenId, holderKey, ask, payoutTo?}`. 403 `NOT_HOLDER` if the key does not match |
| `POST /buy/:listingId` | the listing's ask | Body `{buyer}`. Returns the reassigned token, a fresh `holderKey` and a signed receipt |
| `GET /listings`, `GET /listings/:id`, `GET /holdings/:wallet`, `GET /transfers/:id`, `GET /stats` | free | Read the market |
| `POST /verify`, `GET /health` | free | Verify a signed record, liveness |

Check that a listing is still `open` with the free `GET /listings/:id` before paying for it.

The full request and response schemas are in `skill.md` at the repo root (the running server also serves it at `GET /skill.md`).

## Paying

Paid routes answer an unpaid request with HTTP 402 and an `accepts` array with one entry per rail (USDC on Base and USDC on Solana). A client picks an entry, signs, and retries with the `X-PAYMENT` header. The 200 body carries the artifact and an `X-PAYMENT-RESPONSE` header carries the settlement receipt. Any x402 client works (`x402-fetch` with `viem` on the EVM rail). Each paid call spends real USDC on whichever network the server is configured for (`NETWORK`, `SOLANA_NETWORK`), so show the user the route, price and network and get a yes before paying.

## Worked example

```bash
curl -s -X POST http://localhost:4023/bookings -H 'content-type: application/json' \
  -d '{"holder":"0x40252CFDF8B20Ed757D61ff157719F33Ec332402","booking":{"kind":"table","venue":"Osteria Fiorentina","startsAt":"2026-02-14T19:30:00.000Z","party":2}}'
curl -s http://localhost:4023/listings
```

Store the returned `holderKey`. After the user approves the $0.005, pay `POST /list` with `tokenId`, `holderKey` and `ask`. A buyer then pays `POST /buy/<listingId>` with `{buyer}` for the ask.
