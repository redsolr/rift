/**
 * The arena's tables — the ONLY persistent state the game has. Two tables:
 *   arena_players  — one row per browser identity (cookie token) or house bot: handle, MMR, record, current lineup
 *   arena_matches  — one row per resolved match: both lineups + seed + sim version (enough to replay), legs, Elo deltas
 */
import { boolean, index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import type { Lineup } from "@/arena/lineup";
import type { LegResult, MatchWinner } from "@/arena/match";

export const arenaPlayers = pgTable(
  "arena_players",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** the browser's bearer (cookie) — null for house bots */
    token: text("token").unique(),
    handle: text("handle").notNull(),
    bot: boolean("bot").notNull().default(false),
    /** house bots carry a stable key so seeding is idempotent */
    botKey: text("bot_key").unique(),
    mmr: integer("mmr").notNull().default(1000),
    wins: integer("wins").notNull().default(0),
    losses: integer("losses").notNull().default(0),
    draws: integer("draws").notNull().default(0),
    lineup: jsonb("lineup").$type<Lineup>(),
    lineupUpdatedAt: timestamp("lineup_updated_at", { withTimezone: true }),
    lastMatchAt: timestamp("last_match_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("arena_players_mmr_idx").on(t.mmr)],
);

export const arenaMatches = pgTable(
  "arena_matches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    simVersion: text("sim_version").notNull(),
    seed: integer("seed").notNull(),
    playerA: uuid("player_a")
      .notNull()
      .references(() => arenaPlayers.id),
    playerB: uuid("player_b")
      .notNull()
      .references(() => arenaPlayers.id),
    lineupA: jsonb("lineup_a").$type<Lineup>().notNull(),
    lineupB: jsonb("lineup_b").$type<Lineup>().notNull(),
    legs: jsonb("legs").$type<LegResult[]>().notNull(),
    winner: text("winner").$type<MatchWinner>().notNull(),
    mmrABefore: integer("mmr_a_before").notNull(),
    mmrAAfter: integer("mmr_a_after").notNull(),
    mmrBBefore: integer("mmr_b_before").notNull(),
    mmrBAfter: integer("mmr_b_after").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("arena_matches_a_idx").on(t.playerA, t.createdAt), index("arena_matches_b_idx").on(t.playerB, t.createdAt)],
);

export type ArenaPlayer = typeof arenaPlayers.$inferSelect;
export type ArenaMatch = typeof arenaMatches.$inferSelect;
