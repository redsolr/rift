/**
 * House lineups — the ladder is never empty. Three fixed commanders with different doctrines seed the player table
 * on first use (flagged `bot`); they are matched like anyone else and their MMR moves like anyone else. Pure data.
 */
import { ARCHETYPE_PERSONALITY, DEFAULT_ORDERS } from "@/sim/presets";
import { Archetype, Doctrine, Orders } from "@/sim/types";
import { Lineup, LineupUnit } from "./lineup";

const unit = (archetype: Archetype, name: string, x: number, y: number, orders: Partial<Orders> = {}, personality: Partial<LineupUnit["personality"]> = {}): LineupUnit => ({
  archetype,
  name,
  x,
  y,
  orders: { ...DEFAULT_ORDERS, ...orders },
  personality: { ...ARCHETYPE_PERSONALITY[archetype], ...personality },
});

export interface BotDef {
  key: string;
  handle: string;
  mmr: number;
  lineup: Lineup;
}

const doctrine = (aggression: Doctrine["aggression"], objective: Doctrine["objective"]): Doctrine => ({ aggression, objective });

export const BOTS: BotDef[] = [
  {
    key: "bot-warden",
    handle: "Warden Halvard",
    mmr: 900,
    lineup: {
      units: [
        unit("knight", "Halvard", 7, 10, { stance: "hold" }),
        unit("knight", "Brand", 8, 10, { stance: "hold" }),
        unit("archer", "Tessa", 7, 11, { targetPref: "wounded" }),
        unit("archer", "Corin", 8, 11, { targetPref: "wounded" }),
        unit("healer", "Anwen", 9, 11, { stance: "hold", retreatHpPct: 40 }),
      ],
      doctrine: doctrine("defensive", "hold"),
    },
  },
  {
    key: "bot-marshal",
    handle: "Marshal Ysolde",
    mmr: 1000,
    lineup: {
      units: [
        unit("knight", "Ysolde", 7, 10),
        unit("fighter", "Grim", 8, 10, { targetPref: "weakest" }),
        unit("archer", "Pell", 6, 11, { targetPref: "ranged" }),
        unit("mage", "Ravena", 9, 11, { targetPref: "weakest" }),
        unit("healer", "Sable", 8, 11, { retreatHpPct: 35 }),
      ],
      doctrine: doctrine("balanced", "advance"),
    },
  },
  {
    key: "bot-reaver",
    handle: "Reaver Kesh",
    mmr: 1100,
    lineup: {
      units: [
        unit("fighter", "Kesh", 7, 10, { stance: "pursue", targetPref: "healers" }, { aggression: 90 }),
        unit("fighter", "Orsk", 8, 10, { stance: "pursue", targetPref: "ranged" }, { aggression: 85 }),
        unit("fighter", "Vala", 9, 10, { stance: "pursue", targetPref: "weakest" }, { aggression: 85 }),
        unit("mage", "Nym", 8, 11, { targetPref: "weakest" }),
        unit("archer", "Dree", 7, 11, { targetPref: "wounded" }),
      ],
      doctrine: doctrine("all_out", "advance"),
    },
  },
];
