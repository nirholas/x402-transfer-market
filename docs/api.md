# API reference — x402-transfer-market

Base URL: `http://localhost:4023` in development.

All paid routes speak **x402** and offer **two rails** — USDC on Base (EVM) and
USDC on Solana. The 402 challenge lists both; your client picks one. The
purchased artifact is always in the `200` body.

| Route | Price | Returns |
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

Every artifact is signed: `signature` is an HMAC-SHA256 (hex) over the
canonical JSON of the artifact minus `signature`/`algorithm`, keyed by
`SIGNING_SECRET`. `POST /verify` re-checks it for free.

---

## POST /list

**Price**: $0.005 — USDC on Base or Solana  
**Returns**: Signed listing of a transferable booking token

List a booking token you hold. Returns the signed listing.

### Body parameters

| Name | Type | Default | Description |
|---|---|---|---|
| `tokenId` | string | — | **Required.** The booking token to list |
| `holderKey` | string | — | **Required.** Secret proving you hold the token |
| `ask` | string\|number | `$0.25` | Asking price, clamped to `[0.01, MAX_ASK]` |
| `payoutTo` | string | the holder | Where the seller wants to be paid: EVM address or Solana pubkey |

### Example request

```bash
# unpaid → 402 with both rails
curl -s -i -X POST http://localhost:4023/list -H 'content-type: application/json' \
  -d '{"tokenId":"bkt_YOUR_ID","holderKey":"hk_YOUR_KEY","ask":"$0.75"}'

# paid (EVM rail)
PRIVATE_KEY=0x... npm run client
```

### Example response (`201`)

```json
{
  "listingId": "lst_0c81b7de-2f44-4c9a-b1e3-8a0d5f6e2c11",
  "document": "x402-transfer-market/listing",
  "tokenId": "bkt_5f3a91c2-77de-4a1b-8c0e-1d2f3a4b5c6d",
  "booking": {
    "kind": "table",
    "venue": "Osteria Fiorentina",
    "startsAt": "2026-02-14T19:30:00.000Z",
    "party": 2,
    "reference": "REF-9A3C71",
    "facePrice": "$0.400"
  },
  "seller": {
    "rail": "evm",
    "address": "0x40252cfdf8b20ed757d61ff157719f33ec332402"
  },
  "payoutTo": {
    "rail": "solana",
    "address": "WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW"
  },
  "ask": "$0.750",
  "listingFee": "$0.005",
  "listedAt": "2026-01-11T10:00:00.000Z",
  "expiresAt": "2026-02-14T19:30:00.000Z",
  "status": "open",
  "signature": "4d02…hex hmac…",
  "algorithm": "HMAC-SHA256",
  "payment": {
    "rail": "evm",
    "network": "base-sepolia",
    "transaction": "0xabc…",
    "payer": "0xPayer…",
    "amount": "5000"
  }
}
```

### Unpaid (`402`)

```json
{
  "x402Version": 1,
  "error": "X-PAYMENT header is required",
  "accepts": [
    {
      "scheme": "exact",
      "network": "base-sepolia",
      "maxAmountRequired": "5000",
      "resource": "http://localhost:4023/list",
      "description": "List a booking token you hold. Returns the signed listing.",
      "mimeType": "application/json",
      "payTo": "0x40252CFDF8B20Ed757D61ff157719F33Ec332402",
      "maxTimeoutSeconds": 120,
      "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      "extra": {
        "name": "USDC",
        "version": "2"
      }
    },
    {
      "scheme": "exact",
      "network": "solana-devnet",
      "maxAmountRequired": "5000",
      "resource": "http://localhost:4023/list",
      "description": "List a booking token you hold. Returns the signed listing.",
      "mimeType": "application/json",
      "payTo": "WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW",
      "maxTimeoutSeconds": 120,
      "asset": "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
      "extra": {
        "feePayer": "CKPKJWNdJEqa81x7CkZ14BVPiY6y16Sxs7owznqtWYp5"
      }
    }
  ]
}
```

### Errors

| Status | Code | Meaning |
|---|---|---|
| 403 | `NOT_HOLDER` | holderKey does not match the current holder |
| 404 | `TOKEN_NOT_FOUND` | Unknown tokenId |
| 409 | `ALREADY_LISTED` | Token is already on the market |
| 410 | `TOKEN_EXPIRED` | The reservation start time has passed |

---

## POST /buy/:listingId

**Price**: $0.750 (the listing's own ask) — USDC on Base or Solana  
**Returns**: Booking token reassigned to the buyer wallet, signed

Buy a listing. Returns the booking token reassigned to the buyer's wallet, re-signed, with a fresh holderKey and a signed transfer receipt.

### Path parameters

| Name | Description |
|---|---|
| `listingId` | The `listingId` from `POST /list` or `GET /listings` |

### Body parameters

| Name | Type | Default | Description |
|---|---|---|---|
| `buyer` | string | — | **Required.** New holder: EVM address or Solana pubkey |

### Example request

```bash
# unpaid → 402 quoting this listing's ask on both rails
curl -s -i -X POST http://localhost:4023/buy/lst_YOUR_ID -H 'content-type: application/json' \
  -d '{"buyer":"WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW"}'

# paid (EVM rail)
PRIVATE_KEY=0x... npm run client
```

### Example response (`200`)

```json
{
  "token": {
    "tokenId": "bkt_5f3a91c2-77de-4a1b-8c0e-1d2f3a4b5c6d",
    "document": "x402-transfer-market/booking-token",
    "booking": {
      "kind": "table",
      "venue": "Osteria Fiorentina",
      "startsAt": "2026-02-14T19:30:00.000Z",
      "party": 2,
      "reference": "REF-9A3C71",
      "facePrice": "$0.400"
    },
    "holder": {
      "rail": "solana",
      "address": "WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW"
    },
    "transferCount": 1,
    "issuedAt": "2026-01-10T09:00:00.000Z",
    "expiresAt": "2026-02-14T19:30:00.000Z",
    "status": "held",
    "signature": "c7b3…hex hmac…",
    "algorithm": "HMAC-SHA256",
    "holderKey": "hk_9d4e17a0c62b3f815d0a74e9b2c16f38"
  },
  "transfer": {
    "transferId": "trf_71e2c5a9-3b40-4d18-9f2a-6c8b0d1e4f75",
    "document": "x402-transfer-market/transfer",
    "listingId": "lst_0c81b7de-2f44-4c9a-b1e3-8a0d5f6e2c11",
    "tokenId": "bkt_5f3a91c2-77de-4a1b-8c0e-1d2f3a4b5c6d",
    "from": {
      "rail": "evm",
      "address": "0x40252cfdf8b20ed757d61ff157719f33ec332402"
    },
    "to": {
      "rail": "solana",
      "address": "WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW"
    },
    "pricePaid": "$0.750",
    "transferredAt": "2026-01-12T11:00:00.000Z",
    "payout": {
      "to": {
        "rail": "solana",
        "address": "WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW"
      },
      "amount": "$0.750",
      "status": "owed"
    },
    "signature": "1b88…hex hmac…",
    "algorithm": "HMAC-SHA256"
  },
  "listing": {
    "listingId": "lst_0c81b7de-2f44-4c9a-b1e3-8a0d5f6e2c11",
    "document": "x402-transfer-market/listing",
    "tokenId": "bkt_5f3a91c2-77de-4a1b-8c0e-1d2f3a4b5c6d",
    "booking": {
      "kind": "table",
      "venue": "Osteria Fiorentina",
      "startsAt": "2026-02-14T19:30:00.000Z",
      "party": 2,
      "reference": "REF-9A3C71",
      "facePrice": "$0.400"
    },
    "seller": {
      "rail": "evm",
      "address": "0x40252cfdf8b20ed757d61ff157719f33ec332402"
    },
    "payoutTo": {
      "rail": "solana",
      "address": "WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW"
    },
    "ask": "$0.750",
    "listingFee": "$0.005",
    "listedAt": "2026-01-11T10:00:00.000Z",
    "expiresAt": "2026-02-14T19:30:00.000Z",
    "status": "sold",
    "signature": "4d02…hex hmac…",
    "algorithm": "HMAC-SHA256"
  },
  "payment": {
    "rail": "solana",
    "network": "solana-devnet",
    "transaction": "5Kq…signature…",
    "payer": "BuyerPubkey…",
    "amount": "750000"
  }
}
```

### Unpaid (`402`)

```json
{
  "x402Version": 1,
  "error": "X-PAYMENT header is required",
  "accepts": [
    {
      "scheme": "exact",
      "network": "base-sepolia",
      "maxAmountRequired": "750000",
      "resource": "http://localhost:4023/buy/:listingId",
      "description": "Buy a listing. Returns the booking token reassigned to the buyer's wallet, re-signed, with a fresh holderKey and a signed transfer receipt.",
      "mimeType": "application/json",
      "payTo": "0x40252CFDF8B20Ed757D61ff157719F33Ec332402",
      "maxTimeoutSeconds": 120,
      "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      "extra": {
        "name": "USDC",
        "version": "2"
      }
    },
    {
      "scheme": "exact",
      "network": "solana-devnet",
      "maxAmountRequired": "750000",
      "resource": "http://localhost:4023/buy/:listingId",
      "description": "Buy a listing. Returns the booking token reassigned to the buyer's wallet, re-signed, with a fresh holderKey and a signed transfer receipt.",
      "mimeType": "application/json",
      "payTo": "WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW",
      "maxTimeoutSeconds": 120,
      "asset": "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
      "extra": {
        "feePayer": "CKPKJWNdJEqa81x7CkZ14BVPiY6y16Sxs7owznqtWYp5"
      }
    }
  ]
}
```

### Errors

| Status | Code | Meaning |
|---|---|---|
| 400 | `SELF_PURCHASE` | Buyer wallet already holds the token |
| 400 | `INVALID_WALLET` | Not an EVM address or Solana pubkey |
| 404 | `LISTING_NOT_FOUND` | Unknown listingId — not charged |
| 409 | `ALREADY_SOLD` | Listing already bought — not charged |
| 410 | `LISTING_EXPIRED` | Listing expired — not charged |

---

## POST /bookings

**Price**: free  
**Returns**: Signed booking token + its secret holderKey

Mint a booking token held by a wallet on either rail. Free — this is the market's inventory.

### Body parameters

| Name | Type | Default | Description |
|---|---|---|---|
| `holder` | string | — | **Required.** EVM address or Solana pubkey |
| `booking.kind` | `table`\|`seat`\|`slot` | `table` | What kind of reservation |
| `booking.venue` | string | `Unnamed venue` | Venue name, ≤120 chars |
| `booking.startsAt` | ISO date-time | now + 3 days | When the reservation is held for; also the token's expiry |
| `booking.party` | integer | 2 | Party size, clamped to `[1, 40]` |
| `booking.reference` | string | generated | Venue-side reference, ≤64 chars |

### Example request

```bash
curl -s -X POST http://localhost:4023/bookings -H 'content-type: application/json' \
  -d '{"holder":"0x40252CFDF8B20Ed757D61ff157719F33Ec332402","booking":{"kind":"table","venue":"Osteria Fiorentina","party":2}}'
```

### Example response (`201`)

```json
{
  "tokenId": "bkt_5f3a91c2-77de-4a1b-8c0e-1d2f3a4b5c6d",
  "document": "x402-transfer-market/booking-token",
  "booking": {
    "kind": "table",
    "venue": "Osteria Fiorentina",
    "startsAt": "2026-02-14T19:30:00.000Z",
    "party": 2,
    "reference": "REF-9A3C71",
    "facePrice": "$0.400"
  },
  "holder": {
    "rail": "evm",
    "address": "0x40252cfdf8b20ed757d61ff157719f33ec332402"
  },
  "transferCount": 0,
  "issuedAt": "2026-01-10T09:00:00.000Z",
  "expiresAt": "2026-02-14T19:30:00.000Z",
  "status": "held",
  "signature": "a91f…hex hmac…",
  "algorithm": "HMAC-SHA256",
  "holderKey": "hk_2f7c9e04b1a3d85f6c0e17b249a3d5e8"
}
```

### Errors

| Status | Code | Meaning |
|---|---|---|
| 400 | `INVALID_WALLET` | Not an EVM address or Solana pubkey |

---

## GET /listings

**Price**: free  
**Returns**: Open signed listings

Browse every open listing on the market.

### Example request

```bash
curl -s http://localhost:4023/listings
```

### Example response (`200`)

```json
{
  "listings": [
    {
      "listingId": "lst_0c81b7de-2f44-4c9a-b1e3-8a0d5f6e2c11",
      "document": "x402-transfer-market/listing",
      "tokenId": "bkt_5f3a91c2-77de-4a1b-8c0e-1d2f3a4b5c6d",
      "booking": {
        "kind": "table",
        "venue": "Osteria Fiorentina",
        "startsAt": "2026-02-14T19:30:00.000Z",
        "party": 2,
        "reference": "REF-9A3C71",
        "facePrice": "$0.400"
      },
      "seller": {
        "rail": "evm",
        "address": "0x40252cfdf8b20ed757d61ff157719f33ec332402"
      },
      "payoutTo": {
        "rail": "solana",
        "address": "WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW"
      },
      "ask": "$0.750",
      "listingFee": "$0.005",
      "listedAt": "2026-01-11T10:00:00.000Z",
      "expiresAt": "2026-02-14T19:30:00.000Z",
      "status": "open",
      "signature": "4d02…hex hmac…",
      "algorithm": "HMAC-SHA256",
      "payment": {
        "rail": "evm",
        "network": "base-sepolia",
        "transaction": "0xabc…",
        "payer": "0xPayer…",
        "amount": "5000"
      }
    }
  ]
}
```

---

## GET /listings/:id

**Price**: free  
**Returns**: Signed listing

One listing, including whether it is still open.

### Path parameters

| Name | Description |
|---|---|
| `id` | The listingId |

### Example request

```bash
curl -s http://localhost:4023/listings/lst_YOUR_ID
```

### Example response (`200`)

```json
{
  "listingId": "lst_0c81b7de-2f44-4c9a-b1e3-8a0d5f6e2c11",
  "document": "x402-transfer-market/listing",
  "tokenId": "bkt_5f3a91c2-77de-4a1b-8c0e-1d2f3a4b5c6d",
  "booking": {
    "kind": "table",
    "venue": "Osteria Fiorentina",
    "startsAt": "2026-02-14T19:30:00.000Z",
    "party": 2,
    "reference": "REF-9A3C71",
    "facePrice": "$0.400"
  },
  "seller": {
    "rail": "evm",
    "address": "0x40252cfdf8b20ed757d61ff157719f33ec332402"
  },
  "payoutTo": {
    "rail": "solana",
    "address": "WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW"
  },
  "ask": "$0.750",
  "listingFee": "$0.005",
  "listedAt": "2026-01-11T10:00:00.000Z",
  "expiresAt": "2026-02-14T19:30:00.000Z",
  "status": "open",
  "signature": "4d02…hex hmac…",
  "algorithm": "HMAC-SHA256",
  "payment": {
    "rail": "evm",
    "network": "base-sepolia",
    "transaction": "0xabc…",
    "payer": "0xPayer…",
    "amount": "5000"
  }
}
```

### Errors

| Status | Code | Meaning |
|---|---|---|
| 404 | `LISTING_NOT_FOUND` | Unknown listingId |

---

## GET /holdings/:wallet

**Price**: free  
**Returns**: Signed booking tokens (holderKey redacted)

Every booking token currently held by one wallet, on whichever rail it lives.

### Path parameters

| Name | Description |
|---|---|
| `wallet` | EVM address or Solana pubkey |

### Example request

```bash
curl -s http://localhost:4023/holdings/WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW
```

### Example response (`200`)

```json
{
  "wallet": "WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW",
  "tokens": [
    {
      "tokenId": "bkt_5f3a91c2-77de-4a1b-8c0e-1d2f3a4b5c6d",
      "document": "x402-transfer-market/booking-token",
      "booking": {
        "kind": "table",
        "venue": "Osteria Fiorentina",
        "startsAt": "2026-02-14T19:30:00.000Z",
        "party": 2,
        "reference": "REF-9A3C71",
        "facePrice": "$0.400"
      },
      "holder": {
        "rail": "solana",
        "address": "WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW"
      },
      "transferCount": 1,
      "issuedAt": "2026-01-10T09:00:00.000Z",
      "expiresAt": "2026-02-14T19:30:00.000Z",
      "status": "held",
      "signature": "c7b3…hex hmac…",
      "algorithm": "HMAC-SHA256"
    }
  ]
}
```

### Errors

| Status | Code | Meaning |
|---|---|---|
| 400 | `INVALID_WALLET` | Not an EVM address or Solana pubkey |

---

## GET /transfers/:id

**Price**: free  
**Returns**: Signed transfer receipt

A signed transfer receipt, including the seller payout it recorded.

### Path parameters

| Name | Description |
|---|---|
| `id` | The transferId |

### Example request

```bash
curl -s http://localhost:4023/transfers/trf_YOUR_ID
```

### Example response (`200`)

```json
{
  "transferId": "trf_71e2c5a9-3b40-4d18-9f2a-6c8b0d1e4f75",
  "document": "x402-transfer-market/transfer",
  "listingId": "lst_0c81b7de-2f44-4c9a-b1e3-8a0d5f6e2c11",
  "tokenId": "bkt_5f3a91c2-77de-4a1b-8c0e-1d2f3a4b5c6d",
  "from": {
    "rail": "evm",
    "address": "0x40252cfdf8b20ed757d61ff157719f33ec332402"
  },
  "to": {
    "rail": "solana",
    "address": "WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW"
  },
  "pricePaid": "$0.750",
  "transferredAt": "2026-01-12T11:00:00.000Z",
  "payout": {
    "to": {
      "rail": "solana",
      "address": "WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW"
    },
    "amount": "$0.750",
    "status": "owed"
  },
  "signature": "1b88…hex hmac…",
  "algorithm": "HMAC-SHA256"
}
```

### Errors

| Status | Code | Meaning |
|---|---|---|
| 404 | `TRANSFER_NOT_FOUND` | Unknown transferId |

---

## GET /stats

**Price**: free  
**Returns**: Aggregate market counters

Tokens minted, listings open, transfers done, volume, and holders split by rail.

### Example request

```bash
curl -s http://localhost:4023/stats
```

### Example response (`200`)

```json
{
  "tokens": 8,
  "openListings": 3,
  "transfers": 4,
  "volume": "$2.85",
  "holdersByRail": {
    "evm": 5,
    "solana": 3
  }
}
```

---

## POST /verify

**Price**: free  
**Returns**: `{ valid: true | false }`

Verify the HMAC-SHA256 signature of any token, listing or transfer receipt.

### Example request

```bash
curl -s -X POST http://localhost:4023/verify -H 'content-type: application/json' -d @transfer.json
```

### Example response (`200`)

```json
{
  "valid": true
}
```

---

## GET /health

**Price**: free  
**Returns**: `{ ok: true }`

Liveness probe.

### Example request

```bash
curl -s http://localhost:4023/health
```

### Example response (`200`)

```json
{
  "ok": true,
  "service": "x402-transfer-market"
}
```


---

## Payment headers

| Header | Direction | Meaning |
|---|---|---|
| `X-PAYMENT` | request | Base64 x402 payload. EVM: signed EIP-3009 authorization. Solana: signed serialized transaction. |
| `X-PAYMENT-RESPONSE` | response | Base64 `{ success, rail, network, transaction, payer }` settlement receipt. |

## Global error shape

```json
{ "error": "CODE", "message": "human readable explanation" }
```
