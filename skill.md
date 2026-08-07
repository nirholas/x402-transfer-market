# x402-transfer-market — agent skill

A secondary market for held bookings. The unit of trade is a **booking token**: a signed, transferable claim on a reservation (a table, a seat, a slot), owned by a wallet on either rail — an EVM address *or* a Solana pubkey. Minting a token is free. Listing one costs a $0.005 fee and returns the **signed listing** in the response. Buying costs the listing's own ask and returns the **same token reassigned to the buyer's wallet**, re-signed, with a fresh `holderKey` only the buyer sees, plus a signed transfer receipt naming the seller's payout. Nothing is delivered later.

**Base URL**: `{BASE_URL}` (self-hosted; e.g. `http://localhost:4023`)

## Endpoints

### POST /list — $0.005
List a booking token you hold. Returns the signed listing.

Request body:
```json
{
  "tokenId": "bkt_5f3a91c2-77de-4a1b-8c0e-1d2f3a4b5c6d",
  "holderKey": "hk_2f7c9e04b1a3d85f6c0e17b249a3d5e8",
  "ask": "$0.75",
  "payoutTo": "WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW"
}
```

`holderKey` must match the token's current holder — that is what proves you may sell it. `payoutTo` may be on the *other* rail from the holder; omit it to be paid at the holding wallet.

Response `201`:
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

### POST /buy/:listingId — $0.750 (the listing's own ask)
Buy a listing. Returns the booking token reassigned to the buyer's wallet, re-signed, with a fresh holderKey and a signed transfer receipt.

Request body:
```json
{
  "buyer": "WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW"
}
```

`buyer` is required and accepts an EVM address or a Solana pubkey — it becomes the token's new `holder`.

Response `200`:
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

Unknown, sold or expired listings resolve to **no charge** — you get a free 404/409/410 instead of paying for a failure.

### POST /bookings — free
Mint a booking token held by a wallet on either rail. Free — this is the market's inventory.

Request body:
```json
{
  "holder": "0x40252CFDF8B20Ed757D61ff157719F33Ec332402",
  "booking": {
    "kind": "table",
    "venue": "Osteria Fiorentina",
    "startsAt": "2026-02-14T19:30:00.000Z",
    "party": 2
  }
}
```

`holder` is required and accepts an EVM address or a Solana pubkey. The returned `holderKey` is shown once — keep it, it is what lets you list the token.

Response `201`:
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

### GET /listings — free
Browse every open listing on the market.

Response `200`:
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

### GET /listings/:id — free
One listing, including whether it is still open.

Response `200`:
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

### GET /holdings/:wallet — free
Every booking token currently held by one wallet, on whichever rail it lives.

Response `200`:
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

### GET /transfers/:id — free
A signed transfer receipt, including the seller payout it recorded.

Response `200`:
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

### GET /stats — free
Tokens minted, listings open, transfers done, volume, and holders split by rail.

Response `200`:
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

### POST /verify — free
Verify the HMAC-SHA256 signature of any token, listing or transfer receipt.

Request body:
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

Response `200`:
```json
{
  "valid": true
}
```

### GET /health — free
Liveness probe.

Response `200`:
```json
{
  "ok": true,
  "service": "x402-transfer-market"
}
```

## Payment — dual rail

**Pay in USDC on Base or Solana — your client picks the rail.**

Every paid route answers an unpaid request with `402` and an `accepts` array
holding both rails:

```json
{
  "x402Version": 1,
  "accepts": [
    { "scheme": "exact", "network": "base-sepolia", "asset": "USDC (0x036CbD53842c5426634e7929541eC2318f3dCF7e)",
      "payTo": "0x40252CFDF8B20Ed757D61ff157719F33Ec332402", "maxAmountRequired": "<base units, 6 decimals>" },
    { "scheme": "exact", "network": "solana-devnet", "asset": "USDC (4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU)",
      "payTo": "WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW", "maxAmountRequired": "<base units, 6 decimals>",
      "extra": { "feePayer": "<facilitator sponsor>" } }
  ]
}
```

- Protocol: **x402** (HTTP 402). Asset **USDC** on both rails.
- EVM networks: `base-sepolia` (default) or `base` (`NETWORK=base`).
- Solana networks: `solana-devnet` (default) or `solana` (`SOLANA_NETWORK=mainnet-beta`).
- Facilitator: `https://x402.org/facilitator` — verifies and settles **both** rails (override with `FACILITATOR_URL`).
- Pay via `x402-fetch` (EVM), a Solana x402 client, or any x402-capable client: call the route, read `402`, pick an entry from `accepts`, sign, retry with the `X-PAYMENT` header. You get the artifact in the `200` body plus an `X-PAYMENT-RESPONSE` header carrying the settlement receipt (`{ rail, network, transaction, payer }`).

## Error codes

| Status | Code | Meaning |
|---|---|---|
| 402 | — | Payment required — dual-rail x402 challenge with `accepts[]` |
| 400 | `INVALID_WALLET` | A wallet field is neither an EVM address nor a Solana pubkey |
| 400 | `SELF_PURCHASE` | Buyer wallet already holds the token |
| 403 | `NOT_HOLDER` | `holderKey` does not match the current holder |
| 404 | `TOKEN_NOT_FOUND` | Unknown tokenId |
| 404 | `LISTING_NOT_FOUND` | Unknown listingId (not charged) |
| 404 | `TRANSFER_NOT_FOUND` | Unknown transferId |
| 409 | `ALREADY_LISTED` | Token is already on the market |
| 409 | `ALREADY_SOLD` | Listing has already been bought (not charged) |
| 410 | `TOKEN_EXPIRED` | The reservation start time has passed |
| 410 | `LISTING_EXPIRED` | Listing expired with its booking (not charged) |
| 400 | `BAD_REQUEST` | Malformed body |

## Discovery

Machine-readable manifest: `{BASE_URL}/.well-known/x402` (lists both networks per resource).

## Contact

nichxbt@gmail.com
