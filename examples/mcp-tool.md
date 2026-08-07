# Expose x402-transfer-market as an MCP tool

Give Claude (Desktop, Code, or any MCP client) direct access to this service.
The agent pays per call over x402 — on the Base rail with an EVM key, or on the
Solana rail with a Solana keypair.

## 1. A minimal MCP server

```ts
// mcp-x402-transfer-market.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { privateKeyToAccount } from "viem/accounts";
import { wrapFetchWithPayment } from "x402-fetch";

const BASE = process.env.MARKET_URL ?? "http://localhost:4023";
const payFetch = wrapFetchWithPayment(
  fetch,
  privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`),
);

const server = new McpServer({ name: "x402-transfer-market", version: "0.1.0" });

server.tool(
  "browse_listings",
  "List every open booking listing on the market. Free.",
  {},
  async () => {
    const res = await fetch(`${BASE}/listings`);
    return { content: [{ type: "text", text: JSON.stringify(await res.json(), null, 2) }] };
  },
);

server.tool(
  "list_booking",
  "Pay the $0.005 fee to list a booking token you hold. Returns the signed listing.",
  {
    tokenId: z.string(),
    holderKey: z.string().describe("Secret returned when the token was minted or bought"),
    ask: z.string().describe("Asking price, e.g. \"$0.75\""),
    payoutTo: z.string().optional().describe("Payout wallet — EVM address or Solana pubkey"),
  },
  async (args) => {
    const res = await payFetch(`${BASE}/list`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(args),
    });
    return { content: [{ type: "text", text: JSON.stringify(await res.json(), null, 2) }] };
  },
);

server.tool(
  "buy_listing",
  "Pay a listing's ask in USDC and receive the booking token reassigned to your wallet, signed.",
  { listingId: z.string(), buyer: z.string().describe("EVM address or Solana pubkey") },
  async ({ listingId, buyer }) => {
    const res = await payFetch(`${BASE}/buy/${listingId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ buyer }),
    });
    return { content: [{ type: "text", text: JSON.stringify(await res.json(), null, 2) }] };
  },
);

await server.connect(new StdioServerTransport());
```

```bash
npm i @modelcontextprotocol/sdk zod viem x402-fetch
```

## 2. Register it with Claude Desktop

`claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "x402-transfer-market": {
      "command": "npx",
      "args": ["-y", "tsx", "/absolute/path/to/mcp-x402-transfer-market.ts"],
      "env": {
        "PRIVATE_KEY": "0xYourFundedBaseSepoliaKey",
        "MARKET_URL": "http://localhost:4023"
      }
    }
  }
}
```

For Claude Code: `claude mcp add x402-transfer-market -- npx -y tsx /absolute/path/to/mcp-x402-transfer-market.ts`

## 3. Paying on Solana instead

`wrapFetchWithPayment` covers the EVM rail. For the Solana rail, swap it for an
x402 Solana client (or the browser modal's
[`/server` helpers](https://www.npmjs.com/package/@three-ws/x402-payment-modal))
and select the `solana-devnet` / `solana` entry from the 402 `accepts` array.
That entry's `extra.feePayer` comes from the Solana facilitator
(`SOLANA_FACILITATOR_URL`, PayAI by default), which is a different service from
the EVM one. The tool definitions above do not change — only the fetch wrapper does.

## 4. Spending guardrails

Give the MCP server its own funded key with a small balance. Every route here is
sub-cent to a few cents, and the price is quoted in the 402 before anything is
signed, so an agent can refuse a call whose price exceeds its budget.

Full endpoint reference: [skill.md](https://github.com/nirholas/x402-transfer-market/blob/main/skill.md).
