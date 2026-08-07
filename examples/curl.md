# Raw 402 → pay → 200 walkthrough (curl)

Start the server:

```bash
npm run dev
```

## 1. Mint a booking token (free)

The market needs inventory. Minting is free and returns the token plus its
secret `holderKey`.

```bash
curl -s -X POST http://localhost:4023/bookings \
  -H 'content-type: application/json' \
  -d '{"holder":"0x40252CFDF8B20Ed757D61ff157719F33Ec332402",
       "booking":{"kind":"table","venue":"Osteria Fiorentina","party":2,"startsAt":"2026-02-14T19:30:00Z"}}' | jq
```

Keep `tokenId` and `holderKey`.

## 2. List it — $0.005 → dual-rail 402

```bash
curl -s -i -X POST http://localhost:4023/list \
  -H 'content-type: application/json' \
  -d '{"tokenId":"bkt_YOUR_ID","holderKey":"hk_YOUR_KEY","ask":"$0.75",
       "payoutTo":"WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW"}'
```

```json
{
  "x402Version": 1,
  "error": "X-PAYMENT header is required",
  "accepts": [
    { "scheme": "exact", "network": "base-sepolia", "maxAmountRequired": "5000",
      "payTo": "0x40252CFDF8B20Ed757D61ff157719F33Ec332402",
      "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      "extra": { "name": "USDC", "version": "2" } },
    { "scheme": "exact", "network": "solana-devnet", "maxAmountRequired": "5000",
      "payTo": "WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW",
      "asset": "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
      "extra": { "feePayer": "CKPKJWNdJEqa81x7CkZ14BVPiY6y16Sxs7owznqtWYp5" } }
  ]
}
```

`maxAmountRequired` is in USDC base units (6 decimals): `5000` = $0.005.

## 3. Browse and buy

```bash
curl -s http://localhost:4023/listings | jq '.listings[] | {listingId, ask, booking}'

# unpaid buy → 402 quoting THIS listing's ask ($0.75 → 750000 base units)
curl -s -i -X POST http://localhost:4023/buy/lst_YOUR_ID \
  -H 'content-type: application/json' \
  -d '{"buyer":"WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW"}'
```

Building the `X-PAYMENT` header by hand means signing an EIP-3009
`transferWithAuthorization` (EVM) or a serialized SPL transfer (Solana) — use a
client instead:

```bash
PRIVATE_KEY=0x... npm run client
```

Or open `http://localhost:4023/` and buy in the browser with an EVM wallet or
Phantom.

The `200` body carries the **reassigned token** (new `holder`, bumped
`transferCount`, fresh `holderKey`) and the signed transfer receipt. That is the
artifact you bought.

## 4. Confirm the transfer (free)

```bash
curl -s http://localhost:4023/holdings/WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW | jq
curl -s http://localhost:4023/transfers/trf_YOUR_ID | jq '.payout'
curl -s -X POST http://localhost:4023/verify \
  -H 'content-type: application/json' -d @transfer.json | jq
```
