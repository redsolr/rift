import "server-only";
import { randomBytes } from "node:crypto";
import { and, desc, eq, isNotNull, ne, or, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { ArenaMatch, ArenaPlayer, arenaMatches, arenaPlayers, db } from "@/db";
import { SIM_VERSION } from "@/sim/version";
import { BOTS } from "./bots";
import { Lineup, lineupError, normalizeLineup } from "./lineup";
import { ELO_START, MatchWinner, Side, elo, resolveMatch } from "./match";

/**
 * The arena's server side: identity (a bearer cookie per browser — no accounts until the ladder earns them),
 * matchmaking (nearest MMR with a lineup, never yourself, not the same opponent twice in a row when anyone else is
 * around), resolution (pure `resolveMatch`) and the ledger. Route handlers stay thin and call these.
 */

export const PLAYER_COOKIE = "rift_player";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
/** the smallest gap between two matches for one player — a brake, not a rate limiter */
const MATCH_COOLDOWN_MS = 2000;
const HANDLE_MAX = 20;

const ADJ = ["Ashen", "Iron", "Silent", "Crimson", "Gilded", "Hollow", "Stormborn", "Wandering", "Grim", "Bright"];
const NOUN = ["Marshal", "Warden", "Reaver", "Banneret", "Tactician", "Captain", "Vanguard", "Sentinel", "Herald", "Commander"];
const randomHandle = () => `${ADJ[Math.floor(Math.random() * ADJ.length)]} ${NOUN[Math.floor(Math.random() * NOUN.length)]}`;

export const cleanHandle = (raw: unknown): string | null => {
  const h = String(raw ?? "")
    .replace(/[^\p{L}\p{N} _'.-]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, HANDLE_MAX);
  return h.length >= 2 ? h : null;
};

/** The calling browser's player row — created (and its cookie set) on first contact. */
export async function currentPlayer(): Promise<ArenaPlayer> {
  const jar = await cookies();
  const token = jar.get(PLAYER_COOKIE)?.value;
  if (token) {
    const [p] = await db.select().from(arenaPlayers).where(eq(arenaPlayers.token, token)).limit(1);
    if (p) {
      await db.update(arenaPlayers).set({ lastSeenAt: new Date() }).where(eq(arenaPlayers.id, p.id));
      return p;
    }
  }
  const fresh = randomBytes(24).toString("base64url");
  const [p] = await db.insert(arenaPlayers).values({ token: fresh, handle: randomHandle(), mmr: ELO_START }).returning();
  jar.set(PLAYER_COOKIE, fresh, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: COOKIE_MAX_AGE });
  return p;
}

/** House bots exist from the first request on — idempotent. */
export async function ensureBots(): Promise<void> {
  await db
    .insert(arenaPlayers)
    .values(BOTS.map((b) => ({ botKey: b.key, handle: b.handle, bot: true, mmr: b.mmr, lineup: b.lineup, lineupUpdatedAt: new Date() })))
    .onConflictDoNothing({ target: arenaPlayers.botKey });
}

export interface PlayerView {
  id: string;
  handle: string;
  bot: boolean;
  mmr: number;
  wins: number;
  losses: number;
  draws: number;
  hasLineup: boolean;
}
export const playerView = (p: ArenaPlayer): PlayerView => ({ id: p.id, handle: p.handle, bot: p.bot, mmr: p.mmr, wins: p.wins, losses: p.losses, draws: p.draws, hasLineup: !!p.lineup });

export interface MatchSummary {
  id: string;
  createdAt: string;
  simVersion: string;
  seed: number;
  /** which side the viewer was, if either */
  mySide: Side | null;
  a: PlayerView & { mmrBefore: number; mmrAfter: number };
  b: PlayerView & { mmrBefore: number; mmrAfter: number };
  legs: ArenaMatch["legs"];
  winner: MatchWinner;
}

async function summarize(rows: ArenaMatch[], viewerId: string | null): Promise<MatchSummary[]> {
  const ids = [...new Set(rows.flatMap((m) => [m.playerA, m.playerB]))];
  const players = ids.length ? await db.select().from(arenaPlayers).where(or(...ids.map((id) => eq(arenaPlayers.id, id)))) : [];
  const byId = new Map(players.map((p) => [p.id, playerView(p)]));
  const unknown: PlayerView = { id: "?", handle: "Unknown", bot: false, mmr: 0, wins: 0, losses: 0, draws: 0, hasLineup: false };
  return rows.map((m) => ({
    id: m.id,
    createdAt: m.createdAt.toISOString(),
    simVersion: m.simVersion,
    seed: m.seed,
    mySide: viewerId === m.playerA ? "a" : viewerId === m.playerB ? "b" : null,
    a: { ...(byId.get(m.playerA) ?? unknown), mmrBefore: m.mmrABefore, mmrAfter: m.mmrAAfter },
    b: { ...(byId.get(m.playerB) ?? unknown), mmrBefore: m.mmrBBefore, mmrAfter: m.mmrBAfter },
    legs: m.legs,
    winner: m.winner,
  }));
}

export async function recentMatches(playerId: string, limit = 10): Promise<MatchSummary[]> {
  const rows = await db
    .select()
    .from(arenaMatches)
    .where(or(eq(arenaMatches.playerA, playerId), eq(arenaMatches.playerB, playerId)))
    .orderBy(desc(arenaMatches.createdAt))
    .limit(limit);
  return summarize(rows, playerId);
}

export type MatchDetail = MatchSummary & { lineupA: Lineup; lineupB: Lineup };

export async function matchById(id: string, viewerId: string | null): Promise<MatchDetail | null> {
  const [m] = await db.select().from(arenaMatches).where(eq(arenaMatches.id, id)).limit(1);
  if (!m) return null;
  const [s] = await summarize([m], viewerId);
  return { ...s, lineupA: m.lineupA, lineupB: m.lineupB };
}

export async function leaderboard(limit = 10): Promise<PlayerView[]> {
  const rows = await db.select().from(arenaPlayers).where(isNotNull(arenaPlayers.lineup)).orderBy(desc(arenaPlayers.mmr), desc(arenaPlayers.wins)).limit(limit);
  return rows.map(playerView);
}

export type FindMatchResult = { ok: true; match: MatchSummary } | { ok: false; error: string; status: number };

/**
 * The button. Stores the lineup as the player's standing defence, picks the nearest-MMR opponent, resolves both
 * legs, writes the ledger and moves both ratings. Always returns a match while at least one other lineup exists —
 * the house bots guarantee that.
 */
export async function findMatch(me: ArenaPlayer, rawLineup: unknown): Promise<FindMatchResult> {
  const lineup = normalizeLineup(rawLineup);
  const err = lineupError(lineup);
  if (err) return { ok: false, error: err, status: 400 };
  if (me.lastMatchAt && Date.now() - me.lastMatchAt.getTime() < MATCH_COOLDOWN_MS) return { ok: false, error: "Catch your breath — one match at a time", status: 429 };
  await ensureBots();
  await db.update(arenaPlayers).set({ lineup, lineupUpdatedAt: new Date() }).where(eq(arenaPlayers.id, me.id));

  // last opponent — avoided when anyone else is available, so the ladder does not ping-pong
  const [last] = await db
    .select({ a: arenaMatches.playerA, b: arenaMatches.playerB })
    .from(arenaMatches)
    .where(or(eq(arenaMatches.playerA, me.id), eq(arenaMatches.playerB, me.id)))
    .orderBy(desc(arenaMatches.createdAt))
    .limit(1);
  const lastOpp = last ? (last.a === me.id ? last.b : last.a) : null;

  const nearest = await db
    .select()
    .from(arenaPlayers)
    .where(and(ne(arenaPlayers.id, me.id), isNotNull(arenaPlayers.lineup)))
    .orderBy(sql`abs(${arenaPlayers.mmr} - ${me.mmr})`, desc(arenaPlayers.lastSeenAt))
    .limit(4);
  if (!nearest.length) return { ok: false, error: "Nobody to fight yet", status: 503 };
  const pool = nearest.length > 1 ? nearest.filter((p) => p.id !== lastOpp) : nearest;
  const opp = pool[Math.floor(Math.random() * Math.min(pool.length, 3))];
  const oppLineup = opp.lineup as Lineup;

  const seed = 1 + Math.floor(Math.random() * 2_000_000_000);
  const outcome = resolveMatch(lineup, oppLineup, seed);
  const rating = elo(me.mmr, opp.mmr, outcome.winner);
  const now = new Date();

  const match = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(arenaMatches)
      .values({
        simVersion: SIM_VERSION,
        seed,
        playerA: me.id,
        playerB: opp.id,
        lineupA: lineup,
        lineupB: oppLineup,
        legs: outcome.legs,
        winner: outcome.winner,
        mmrABefore: me.mmr,
        mmrAAfter: rating.a,
        mmrBBefore: opp.mmr,
        mmrBAfter: rating.b,
      })
      .returning();
    const bump = (w: MatchWinner, side: Side) => ({ wins: w === side ? 1 : 0, losses: w === "draw" || w === side ? 0 : 1, draws: w === "draw" ? 1 : 0 });
    const ma = bump(outcome.winner, "a");
    const mb = bump(outcome.winner, "b");
    await tx
      .update(arenaPlayers)
      .set({ mmr: rating.a, wins: sql`${arenaPlayers.wins} + ${ma.wins}`, losses: sql`${arenaPlayers.losses} + ${ma.losses}`, draws: sql`${arenaPlayers.draws} + ${ma.draws}`, lastMatchAt: now })
      .where(eq(arenaPlayers.id, me.id));
    await tx
      .update(arenaPlayers)
      .set({ mmr: rating.b, wins: sql`${arenaPlayers.wins} + ${mb.wins}`, losses: sql`${arenaPlayers.losses} + ${mb.losses}`, draws: sql`${arenaPlayers.draws} + ${mb.draws}` })
      .where(eq(arenaPlayers.id, opp.id));
    return row;
  });
  const [summary] = await summarize([match], me.id);
  return { ok: true, match: summary };
}
