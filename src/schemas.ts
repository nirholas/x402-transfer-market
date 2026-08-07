/**
 * Per-route request/response schemas published in the x402 402 challenge.
 *
 * Generated from `openapi.json` so the discovery metadata and the runtime
 * challenge cannot drift apart: `accepts[].outputSchema.input` describes how to
 * call the route, `accepts[].outputSchema.output` describes what the paid 200
 * returns. Keys match the paywall route map in `server.ts` exactly.
 *
 * Update `openapi.json` first, then re-derive this file.
 */

/** x402 Bazaar-style schema pair carried by every accept entry. */
export type RouteSchema = {
  /** How to invoke the route: method, query params and/or JSON body fields. */
  input: Record<string, unknown>;
  /** JSON Schema of the paid 200 response body. */
  output: Record<string, unknown>;
};

export const ROUTE_SCHEMAS: Record<string, RouteSchema> = {
  "POST /list": {
    "input": {
      "type": "http",
      "method": "POST",
      "bodyType": "json",
      "bodyFields": {
        "tokenId": {
          "type": "string"
        },
        "holderKey": {
          "type": "string"
        },
        "ask": {
          "type": [
            "string",
            "number"
          ]
        },
        "payoutTo": {
          "type": "string"
        }
      },
      "bodyFieldsRequired": [
        "tokenId",
        "holderKey"
      ]
    },
    "output": {
      "type": "object",
      "properties": {
        "listingId": {
          "type": "string"
        },
        "document": {
          "const": "x402-transfer-market/listing"
        },
        "tokenId": {
          "type": "string"
        },
        "booking": {
          "type": "object",
          "properties": {
            "kind": {
              "type": "string",
              "enum": [
                "table",
                "seat",
                "slot"
              ]
            },
            "venue": {
              "type": "string"
            },
            "startsAt": {
              "type": "string",
              "format": "date-time"
            },
            "party": {
              "type": "integer"
            },
            "reference": {
              "type": "string"
            },
            "facePrice": {
              "type": "string"
            }
          }
        },
        "seller": {
          "type": "object",
          "description": "Dual-rail wallet identity",
          "properties": {
            "rail": {
              "type": "string",
              "enum": [
                "evm",
                "solana"
              ]
            },
            "address": {
              "type": "string",
              "description": "Lowercased 0x address, or base58 Solana pubkey"
            }
          }
        },
        "payoutTo": {
          "type": "object",
          "description": "Dual-rail wallet identity",
          "properties": {
            "rail": {
              "type": "string",
              "enum": [
                "evm",
                "solana"
              ]
            },
            "address": {
              "type": "string",
              "description": "Lowercased 0x address, or base58 Solana pubkey"
            }
          }
        },
        "ask": {
          "type": "string"
        },
        "listingFee": {
          "type": "string"
        },
        "listedAt": {
          "type": "string",
          "format": "date-time"
        },
        "expiresAt": {
          "type": "string",
          "format": "date-time"
        },
        "status": {
          "type": "string",
          "enum": [
            "open",
            "sold",
            "expired"
          ]
        },
        "signature": {
          "type": "string"
        },
        "algorithm": {
          "const": "HMAC-SHA256"
        }
      }
    }
  },
  "POST /buy/:listingId": {
    "input": {
      "type": "http",
      "method": "POST",
      "pathParams": {
        "listingId": {
          "type": "string",
          "description": "The `listingId` from `POST /list` or `GET /listings`"
        }
      },
      "bodyType": "json",
      "bodyFields": {
        "buyer": {
          "type": "string"
        }
      },
      "bodyFieldsRequired": [
        "buyer"
      ]
    },
    "output": {
      "type": "object",
      "properties": {
        "token": {
          "type": "object",
          "properties": {
            "tokenId": {
              "type": "string"
            },
            "document": {
              "const": "x402-transfer-market/booking-token"
            },
            "booking": {
              "type": "object",
              "properties": {
                "kind": {
                  "type": "string",
                  "enum": [
                    "table",
                    "seat",
                    "slot"
                  ]
                },
                "venue": {
                  "type": "string"
                },
                "startsAt": {
                  "type": "string",
                  "format": "date-time"
                },
                "party": {
                  "type": "integer"
                },
                "reference": {
                  "type": "string"
                },
                "facePrice": {
                  "type": "string"
                }
              }
            },
            "holder": {
              "type": "object",
              "description": "Dual-rail wallet identity",
              "properties": {
                "rail": {
                  "type": "string",
                  "enum": [
                    "evm",
                    "solana"
                  ]
                },
                "address": {
                  "type": "string",
                  "description": "Lowercased 0x address, or base58 Solana pubkey"
                }
              }
            },
            "transferCount": {
              "type": "integer",
              "description": "Bumped on every reassignment"
            },
            "issuedAt": {
              "type": "string",
              "format": "date-time"
            },
            "expiresAt": {
              "type": "string",
              "format": "date-time"
            },
            "status": {
              "type": "string",
              "enum": [
                "held",
                "listed",
                "transferred",
                "expired"
              ]
            },
            "signature": {
              "type": "string"
            },
            "algorithm": {
              "const": "HMAC-SHA256"
            },
            "holderKey": {
              "type": "string",
              "description": "Secret proving possession — returned only to the new holder"
            }
          }
        },
        "transfer": {
          "type": "object",
          "properties": {
            "transferId": {
              "type": "string"
            },
            "document": {
              "const": "x402-transfer-market/transfer"
            },
            "listingId": {
              "type": "string"
            },
            "tokenId": {
              "type": "string"
            },
            "from": {
              "type": "object",
              "description": "Dual-rail wallet identity",
              "properties": {
                "rail": {
                  "type": "string",
                  "enum": [
                    "evm",
                    "solana"
                  ]
                },
                "address": {
                  "type": "string",
                  "description": "Lowercased 0x address, or base58 Solana pubkey"
                }
              }
            },
            "to": {
              "type": "object",
              "description": "Dual-rail wallet identity",
              "properties": {
                "rail": {
                  "type": "string",
                  "enum": [
                    "evm",
                    "solana"
                  ]
                },
                "address": {
                  "type": "string",
                  "description": "Lowercased 0x address, or base58 Solana pubkey"
                }
              }
            },
            "pricePaid": {
              "type": "string"
            },
            "transferredAt": {
              "type": "string",
              "format": "date-time"
            },
            "payout": {
              "type": "object",
              "properties": {
                "to": {
                  "type": "object",
                  "description": "Dual-rail wallet identity",
                  "properties": {
                    "rail": {
                      "type": "string",
                      "enum": [
                        "evm",
                        "solana"
                      ]
                    },
                    "address": {
                      "type": "string",
                      "description": "Lowercased 0x address, or base58 Solana pubkey"
                    }
                  }
                },
                "amount": {
                  "type": "string"
                },
                "status": {
                  "const": "owed"
                }
              }
            },
            "signature": {
              "type": "string"
            },
            "algorithm": {
              "const": "HMAC-SHA256"
            }
          }
        },
        "listing": {
          "type": "object",
          "description": "The listing, now marked sold"
        }
      }
    }
  },
};
