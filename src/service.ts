/**
 * Transfer market logic for x402-transfer-market.
 *
 * The unit of trade is a **booking token**: a signed, transferable claim on a
 * held reservation (a table, a seat, a slot). A token is owned by a wallet on
 * either rail — an EVM address or a Solana pubkey — and carries a secret
 * `holderKey` that proves possession.
 *
 * Three moves, each returning its artifact in the paid response:
 *   1. mint   (free)          → a booking token + its holderKey
 *   2. list   ($0.005)        → a signed listing of that token, offered at an ask
 *   3. buy    (listing price) → the SAME token, reassigned to the buyer's wallet,
 *                               re-signed, plus a signed payout instruction for
 *                               the seller
 *
 * Nothing is delivered later: `POST /buy/:id` hands back the reassigned token in
 * the 200 body, with a fresh holderKey only the buyer sees.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { resignInPlace, signArtifact, type Signed } from "./sign.js";
import { loadStore, saveStore } from "./store.js";
import { requireWallet, sameWallet, walletRef, type Rail } from "./wallet.js";

export const LIST_FEE = "$0.005";
export const MIN_ASK = 0.01;
export const MAX_ASK = Number(process.env.MAX_ASK || "5.00");

/**
 * Quoted by `POST /buy/:listingId` when the listing cannot be priced — an id
 * that is unknown or a listing that is no longer open. The paywall answers with
 * a 402 challenge before it looks anything up (see server.ts), so it needs a
 * price it can quote without a listing in hand. This is the same default ask
 * `parseAsk()` applies to a listing created without one.
 */
export const DEFAULT_ASK = "$0.25";

export interface WalletRef {
  rail: Rail;
  address: string;
}

export type BookingKind = "table" | "seat" | "slot";

export interface Booking {
  kind: BookingKind;
  venue: string;
  /** ISO timestamp the reservation is held for. */
  startsAt: string;
  party: number;
  reference: string;
  facePrice: string;
}

export interface BookingToken {
  tokenId: string;
  document: "x402-transfer-market/booking-token";
  booking: Booking;
  holder: WalletRef;
  /** Increments on every reassignment — replay protection for transfers. */
  transferCount: number;
  issuedAt: string;
  expiresAt: string;
  status: "held" | "listed" | "transferred" | "expired";
}

export interface Listing {
  listingId: string;
  document: "x402-transfer-market/listing";
  tokenId: string;
  booking: Booking;
  seller: WalletRef;
  /** Seller's payout wallet — may differ from the holder, and may be on the other rail. */
  payoutTo: WalletRef;
  ask: string;
  listingFee: string;
  listedAt: string;
  expiresAt: string;
  status: "open" | "sold" | "expired";
}

export interface TransferReceipt {
  transferId: string;
  document: "x402-transfer-market/transfer";
  listingId: string;
  tokenId: string;
  from: WalletRef;
  to: WalletRef;
  pricePaid: string;
  transferredAt: string;
  /** What the operator owes the seller, and to which wallet on which rail. */
  payout: { to: WalletRef; amount: string; status: "owed" };
}

interface StoredToken extends Signed<BookingToken> {
  /** Never returned in listings or public lookups. */
  holderKey: string;
}

type TokenStore = Record<string, StoredToken>;
type ListingStore = Record<string, Signed<Listing>>;
type TransferStore = Record<string, Signed<TransferReceipt>>;

let tokens: TokenStore = loadStore<TokenStore>("tokens", {});
let listings: ListingStore = loadStore<ListingStore>("listings", {});
let transfers: TransferStore = loadStore<TransferStore>("transfers", {});

function persist(): void {
  saveStore("tokens", tokens);
  saveStore("listings", listings);
  saveStore("transfers", transfers);
}

export class MarketError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export function money(n: number): string {
  return `$${n.toFixed(n < 1 ? 3 : 2)}`;
}

export function parseAsk(raw: unknown): number {
  const n =
    typeof raw === "number"
      ? raw
      : typeof raw === "string"
        ? Number(raw.replace(/^\$/, ""))
        : NaN;
  const ask = Number.isFinite(n) && n > 0 ? n : 0.25;
  return Math.min(Math.max(ask, MIN_ASK), MAX_ASK);
}

function newHolderKey(): string {
  return `hk_${randomBytes(16).toString("hex")}`;
}

const KINDS: BookingKind[] = ["table", "seat", "slot"];

function readBooking(body: Record<string, unknown>): Booking {
  const raw = (body.booking || {}) as Partial<Booking>;
  const kind = KINDS.includes(raw.kind as BookingKind) ? (raw.kind as BookingKind) : "table";
  const startsAt =
    typeof raw.startsAt === "string" && !Number.isNaN(Date.parse(raw.startsAt))
      ? new Date(raw.startsAt).toISOString()
      : new Date(Date.now() + 3 * 86_400_000).toISOString();
  return {
    kind,
    venue: typeof raw.venue === "string" ? raw.venue.slice(0, 120) : "Unnamed venue",
    startsAt,
    party: Math.min(Math.max(Math.trunc(Number(raw.party) || 2), 1), 40),
    reference: typeof raw.reference === "string" ? raw.reference.slice(0, 64) : `REF-${randomBytes(3).toString("hex").toUpperCase()}`,
    facePrice: typeof raw.facePrice === "string" ? raw.facePrice : money(parseAsk(raw.facePrice)),
  };
}

/** Mint a booking token held by a wallet on either rail. Free. */
export function mintToken(body: Record<string, unknown>): StoredToken {
  const holder = requireWallet(body.holder, "holder");
  const booking = readBooking(body);
  const token: BookingToken = {
    tokenId: `bkt_${randomUUID()}`,
    document: "x402-transfer-market/booking-token",
    booking,
    holder: walletRef(holder),
    transferCount: 0,
    issuedAt: new Date().toISOString(),
    expiresAt: booking.startsAt,
    status: "held",
  };
  const stored: StoredToken = { ...signArtifact(token), holderKey: newHolderKey() };
  tokens[token.tokenId] = stored;
  persist();
  return stored;
}

function requireToken(tokenId: string): StoredToken {
  const token = tokens[tokenId];
  if (!token) throw new MarketError(404, "TOKEN_NOT_FOUND", `No booking token ${tokenId}`);
  if (token.status !== "expired" && new Date(token.expiresAt).getTime() < Date.now()) {
    token.status = "expired";
    // holderKey is a server-side secret and was never part of the signed token.
    resignInPlace(token, "holderKey");
    persist();
  }
  return token;
}

/** Public view of a token — the holderKey never leaves the server. */
export function publicToken(token: StoredToken): Signed<BookingToken> {
  const { holderKey: _secret, ...rest } = token;
  return rest;
}

/**
 * Create a signed listing. Paid ($0.005 listing fee) — the listing itself is
 * the artifact returned in the 200 body.
 */
export function createListing(body: Record<string, unknown>): Signed<Listing> {
  const token = requireToken(String(body.tokenId ?? ""));
  if (typeof body.holderKey !== "string" || body.holderKey !== token.holderKey) {
    throw new MarketError(403, "NOT_HOLDER", "holderKey does not match the current holder of this token");
  }
  if (token.status === "expired") {
    throw new MarketError(410, "TOKEN_EXPIRED", `Booking token ${token.tokenId} expired at ${token.expiresAt}`);
  }
  if (token.status === "listed") {
    throw new MarketError(409, "ALREADY_LISTED", `Booking token ${token.tokenId} is already listed`);
  }

  const payoutTo = body.payoutTo === undefined ? null : requireWallet(body.payoutTo, "payoutTo");
  const ask = parseAsk(body.ask);
  const listing: Listing = {
    listingId: `lst_${randomUUID()}`,
    document: "x402-transfer-market/listing",
    tokenId: token.tokenId,
    booking: token.booking,
    seller: token.holder,
    payoutTo: payoutTo ? walletRef(payoutTo) : token.holder,
    ask: money(ask),
    listingFee: LIST_FEE,
    listedAt: new Date().toISOString(),
    expiresAt: token.expiresAt,
    status: "open",
  };
  token.status = "listed";
  resignInPlace(token, "holderKey"); // token status moved — re-sign it
  const signed = signArtifact(listing);
  listings[listing.listingId] = signed;
  persist();
  return signed;
}

export function getListing(listingId: string): Signed<Listing> | undefined {
  const listing = listings[listingId];
  if (!listing) return undefined;
  if (listing.status === "open" && new Date(listing.expiresAt).getTime() < Date.now()) {
    listing.status = "expired";
    resignInPlace(listing);
    persist();
  }
  return listing;
}

export function openListings(): Signed<Listing>[] {
  return Object.values(listings).filter((l) => getListing(l.listingId)?.status === "open");
}

/**
 * Buy a listing. The x402 payment has already settled, so this returns the
 * reassigned booking token — with a fresh holderKey for the buyer — plus the
 * signed transfer receipt, all in the 200 body.
 */
export function buyListing(
  listingId: string,
  buyerInput: unknown,
): {
  token: Signed<BookingToken> & { holderKey: string };
  transfer: Signed<TransferReceipt>;
  listing: Signed<Listing>;
} {
  const buyer = requireWallet(buyerInput, "buyer");
  const listing = getListing(listingId);
  if (!listing) throw new MarketError(404, "LISTING_NOT_FOUND", `No listing ${listingId}`);
  if (listing.status === "sold") throw new MarketError(409, "ALREADY_SOLD", `Listing ${listingId} is already sold`);
  if (listing.status === "expired") {
    throw new MarketError(410, "LISTING_EXPIRED", `Listing ${listingId} expired at ${listing.expiresAt}`);
  }
  if (sameWallet(listing.seller.address, buyer.address)) {
    throw new MarketError(400, "SELF_PURCHASE", "Buyer wallet is the current holder of this token");
  }

  const token = requireToken(listing.tokenId);
  const from = token.holder;

  // Reassign: same tokenId, new holder, bumped transferCount, re-signed.
  const reassigned: BookingToken = {
    ...publicToken(token),
    holder: walletRef(buyer),
    transferCount: token.transferCount + 1,
    status: "held",
  } as BookingToken;
  delete (reassigned as Partial<Signed<BookingToken>>).signature;
  delete (reassigned as Partial<Signed<BookingToken>>).algorithm;

  const signedToken = signArtifact(reassigned);
  const stored: StoredToken = { ...signedToken, holderKey: newHolderKey() };
  tokens[token.tokenId] = stored;

  listing.status = "sold";
  resignInPlace(listing); // the stored listing changed — re-sign it

  const receipt: TransferReceipt = {
    transferId: `trf_${randomUUID()}`,
    document: "x402-transfer-market/transfer",
    listingId: listing.listingId,
    tokenId: token.tokenId,
    from,
    to: walletRef(buyer),
    pricePaid: listing.ask,
    transferredAt: new Date().toISOString(),
    payout: { to: listing.payoutTo, amount: listing.ask, status: "owed" },
  };
  const signedReceipt = signArtifact(receipt);
  transfers[receipt.transferId] = signedReceipt;
  persist();

  return {
    token: { ...signedToken, holderKey: stored.holderKey },
    transfer: signedReceipt,
    listing,
  };
}

/** Tokens currently held by one wallet, on whichever rail it lives. */
export function holdingsFor(walletInput: unknown): Signed<BookingToken>[] {
  const wallet = requireWallet(walletInput, "wallet");
  return Object.values(tokens)
    .filter((t) => sameWallet(t.holder.address, wallet.address))
    .map(publicToken);
}

export function getTransfer(id: string): Signed<TransferReceipt> | undefined {
  return transfers[id];
}

export function marketStats(): {
  tokens: number;
  openListings: number;
  transfers: number;
  volume: string;
  holdersByRail: Record<Rail, number>;
} {
  const volume = Object.values(transfers).reduce((sum, t) => sum + Number(t.pricePaid.replace("$", "")), 0);
  const holdersByRail: Record<Rail, number> = { evm: 0, solana: 0 };
  for (const token of Object.values(tokens)) holdersByRail[token.holder.rail]++;
  return {
    tokens: Object.keys(tokens).length,
    openListings: openListings().length,
    transfers: Object.keys(transfers).length,
    volume: money(volume),
    holdersByRail,
  };
}
