# Tutorial — x402-transfer-market

A complete walkthrough: install, run the server, trigger a real 402, pay it on
either rail, and read the artifact you bought.

## 1. Install

```bash
git clone https://github.com/nirholas/x402-transfer-market
cd x402-transfer-market
npm install
```

Node 18 or newer.

## 2. Configure

```bash
cp .env.example .env
```

Everything already has a working default, so you can skip straight to step 3.
The variables that matter:

| Variable | Default | What it does |
|---|---|---|
| `PAY_TO_ADDRESS` | `0x40252CFDF8B20Ed757D61ff157719F33Ec332402` | EVM address paid on the Base rail |
| `SOLANA_PAY_TO_ADDRESS` | `WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW` | Solana pubkey paid on the Solana rail |
| `NETWORK` | `base-sepolia` | `base` for EVM mainnet |
| `SOLANA_NETWORK` | `devnet` | `mainnet-beta` for Solana mainnet |
| `FACILITATOR_URL` | `https://x402.org/facilitator` | Verifies + settles both rails |
| `SIGNING_SECRET` | `dev-secret-change-me` | HMAC key for signed artifacts — change it |
| `PORT` | `4023` | HTTP port |

> The two `payTo` values above are the suite's own public receive addresses.
> **Set your own** if you want to be paid.

## 3. Run the server

```bash
npm run dev
```

The banner prints both rails:

```
x402-transfer-market listening on http://localhost:4023
  Pay in USDC on Base or Solana — your client picks the rail.
  rail 1  EVM     network=base-sepolia  payTo=0x40252CFDF8B20Ed757D61ff157719F33Ec332402
  rail 2  Solana  network=solana-devnet  payTo=WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW
  facilitator=https://x402.org/facilitator
```

## 4. Your first 402

Mint a token and list it first — minting is free, listing costs $0.005:

```bash
TOKEN=$(curl -s -X POST http://localhost:4023/bookings \
  -H 'content-type: application/json' \
  -d '{"holder":"0x40252CFDF8B20Ed757D61ff157719F33Ec332402","booking":{"kind":"table","venue":"Osteria Fiorentina","party":2}}')
echo "$TOKEN" | jq '.tokenId, .holderKey'
```

Now call the paid listing route with no payment:

```bash
curl -s -i -X POST http://localhost:4023/list \
  -H 'content-type: application/json' \
  -d '{"tokenId":"bkt_YOUR_ID","holderKey":"hk_YOUR_KEY","ask":"$0.75"}'
```

You get `HTTP/1.1 402 Payment Required` and a body whose `accepts` array holds
**two** entries — one per rail. `maxAmountRequired` is in USDC base units
(6 decimals), so `1000` = $0.001.

## 5. Pay it

### EVM rail (`x402-fetch`)

```bash
PRIVATE_KEY=0xYourFundedBaseSepoliaKey npm run client
```

`x402-fetch` reads the 402, picks the `base-sepolia` entry, signs an EIP-3009
`transferWithAuthorization` for exactly `maxAmountRequired`, and retries with
the `X-PAYMENT` header. Get testnet USDC from the
[Circle faucet](https://faucet.circle.com/).

### Solana rail

Point any x402 Solana client at the same URL — it picks the `solana-devnet`
entry instead. Browser wallets (Phantom) go through the drop-in
[`@three-ws/x402-payment-modal`](https://www.npmjs.com/package/@three-ws/x402-payment-modal),
which reads the same 402 and handles the prepare/sign/encode round trip.
Nothing on the server changes: the facilitator verifies and settles both.

## 6. Read the artifact

The `200` body **is** the thing you bought — signed listing of a transferable booking token.
No callbacks, no polling for a later delivery.

The response also carries `X-PAYMENT-RESPONSE`, a base64 JSON receipt:

```json
{ "success": true, "rail": "evm", "network": "base-sepolia", "transaction": "0x…", "payer": "0x…" }
```

Every artifact is signed with HMAC-SHA256 over its canonical JSON. Check one:

```bash
curl -s -X POST http://localhost:4023/verify \
  -H 'content-type: application/json' -d @artifact.json
# {"valid":true}
```

## 7. Going to mainnet

```bash
NETWORK=base \
SOLANA_NETWORK=mainnet-beta \
PAY_TO_ADDRESS=0xYourRealAddress \
SOLANA_PAY_TO_ADDRESS=YourRealSolanaPubkey \
FACILITATOR_URL=https://your-mainnet-facilitator \
SIGNING_SECRET=$(openssl rand -hex 32) \
npm run build && npm start
```

Mainnet USDC is real money: use a mainnet-capable facilitator (Coinbase CDP's,
for example), set a real `SIGNING_SECRET`, and put the service behind TLS so the
`resource` URL in the 402 challenge matches what clients actually call.

## 8. Wallet identity on both rails

Every wallet field — `holder`, `payoutTo`, `buyer` — accepts **either** rail:

| Input | Parsed as |
|---|---|
| `0x40252CFDF8B20Ed757D61ff157719F33Ec332402` | `{ rail: "evm", address: "0x40252c…2402" }` |
| `WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW` | `{ rail: "solana", address: "Wwwu…T3WwW" }` |

EVM addresses are normalized to lowercase; Solana pubkeys are base58-decoded and
must be exactly 32 bytes. Anything else gets `400 INVALID_WALLET`.

Cross-rail trades are the normal case: a Base seller can sell to a Solana buyer,
and nominate a Solana `payoutTo` even though the token was held by an EVM
address.

```bash
curl -s http://localhost:4023/holdings/WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW | jq
```

## 9. Possession vs. ownership

`holder` is the public owner; `holderKey` is the secret that proves possession.
It is returned exactly twice in a token's life — when it is minted, and when it
is bought — and never appears in `GET /listings`, `GET /holdings/:wallet` or any
other public view. Listing a token requires the current `holderKey`, so a stale
key from a previous owner cannot re-list a token that has moved on.

## 10. The browser market demo

`public/index.html` (served at `/`) mints, lists and buys through the drop-in
payment modal. The 402 already carries both rails, so the modal offers an EVM
wallet and Phantom; `/api/x402-checkout` is the only server-side piece the
Solana path needs.


## Next

- [API reference](api.md) — every route, schema and error
- [For AI agents](agents.md) — discovery, MCP, listing
- [skill.md](https://github.com/nirholas/x402-transfer-market/blob/main/skill.md) — the agent-facing contract
