import {
  Archetype,
  BattleConfig,
  Doctrine,
  MapDef,
  Orders,
  Personality,
  Stats,
  Team,
  Terrain,
  UnitDef,
} from "./types";

export const ARCHETYPE_STATS: Record<Archetype, Stats> = {
  knight: { hp: 34, atk: 8, def: 6, spd: 3, mov: 3, rangeMin: 1, rangeMax: 1 },
  fighter: { hp: 28, atk: 10, def: 3, spd: 6, mov: 4, rangeMin: 1, rangeMax: 1 },
  archer: { hp: 20, atk: 8, def: 2, spd: 7, mov: 4, rangeMin: 2, rangeMax: 3 },
  mage: { hp: 18, atk: 11, def: 1, spd: 5, mov: 3, rangeMin: 1, rangeMax: 2 },
  healer: { hp: 20, atk: 7, def: 2, spd: 4, mov: 4, rangeMin: 1, rangeMax: 2 },
};

export const ARCHETYPE_PERSONALITY: Record<Archetype, Personality> = {
  knight: { aggression: 45, courage: 85, discipline: 80, intelligence: 60, loyalty: 85 },
  fighter: { aggression: 85, courage: 80, discipline: 40, intelligence: 45, loyalty: 70 },
  archer: { aggression: 55, courage: 45, discipline: 70, intelligence: 70, loyalty: 65 },
  mage: { aggression: 65, courage: 40, discipline: 65, intelligence: 85, loyalty: 60 },
  healer: { aggression: 20, courage: 50, discipline: 85, intelligence: 75, loyalty: 95 },
};

export const ARCHETYPE_LABEL: Record<Archetype, string> = {
  knight: "Knight",
  fighter: "Fighter",
  archer: "Archer",
  mage: "Mage",
  healer: "Healer",
};

export const DEFAULT_ORDERS: Orders = {
  stance: "advance",
  targetPref: "nearest",
  protect: null,
  avoidArmored: false,
  noPursue: false,
  retreatHpPct: 0,
};

export const DEFAULT_DOCTRINE: Doctrine = { aggression: "balanced", objective: "advance" };

const NAMES: Record<Team, Record<Archetype, string>> = {
  blue: { knight: "Rook", fighter: "Brakka", archer: "Lys", mage: "Vael", healer: "Mina" },
  red: { knight: "Garrick", fighter: "Tusk", archer: "Wren", mage: "Ione", healer: "Selu" },
};

let counter = 0;
export function makeUnit(team: Team, archetype: Archetype, x: number, y: number, name?: string): UnitDef {
  counter++;
  return {
    id: `${team[0]}${archetype[0]}${counter}`,
    name: name ?? NAMES[team][archetype],
    team,
    archetype,
    stats: { ...ARCHETYPE_STATS[archetype] },
    personality: { ...ARCHETYPE_PERSONALITY[archetype] },
    orders: { ...DEFAULT_ORDERS },
    x,
    y,
  };
}

/**
 * 16 wide × 12 tall (landscape). Red (enemy) holds the far bank (rows 0–1), blue (you) the near bank
 * (rows 10–11) — the player's army is always on the NEAR side of the camera, FE-style. A river with three crossings,
 * forests on the flanks, hills near the fords, two wall stubs.
 */
export function defaultMap(): MapDef {
  const width = 16,
    height = 12;
  const rows: string[] = [
    "..ff.......ff...",
    ".........f......",
    "....#.....hh....",
    "....#.....hh..f.",
    ".f..............",
    "~~~.~~~~~.~~~~.~",
    "~~~.~~~~~.~~~~.~",
    "..............f.",
    "..hh......#.....",
    "..hh......#..f..",
    ".........f......",
    "..ff.......ff...",
  ];
  const map: Record<string, Terrain> = { ".": "ground", f: "forest", h: "hill", "~": "water", "#": "wall", o: "objective" };
  const tiles: Terrain[] = [];
  for (const r of rows) for (const ch of r) tiles.push(map[ch]);
  if (tiles.length !== width * height) throw new Error("bad default map");
  return { width, height, tiles };
}

export function emptyMap(width = 16, height = 12): MapDef {
  return { width, height, tiles: Array(width * height).fill("ground") };
}

export function defaultConfig(): BattleConfig {
  counter = 0;
  const units: UnitDef[] = [
    makeUnit("blue", "knight", 7, 10),
    makeUnit("blue", "fighter", 8, 10),
    makeUnit("blue", "archer", 6, 11),
    makeUnit("blue", "mage", 9, 11),
    makeUnit("blue", "healer", 8, 11),
    makeUnit("red", "knight", 8, 1),
    makeUnit("red", "fighter", 7, 1),
    makeUnit("red", "archer", 9, 0),
    makeUnit("red", "mage", 6, 0),
    makeUnit("red", "healer", 7, 0),
  ];
  return {
    map: defaultMap(),
    units,
    doctrine: { red: { ...DEFAULT_DOCTRINE }, blue: { ...DEFAULT_DOCTRINE } },
    maxTurns: 30,
    firstTeam: "blue",
  };
}

// ---- share codes: config <-> URL-safe base64 JSON ----

export function encodeConfig(c: BattleConfig): string {
  const json = JSON.stringify({
    m: { w: c.map.width, h: c.map.height, t: c.map.tiles.map((t) => "gfwvho"["ground,forest,wall,water,hill,objective".split(",").indexOf(t)]).join("") },
    u: c.units,
    d: c.doctrine,
    x: c.maxTurns,
    f: c.firstTeam ?? "red",
  });
  const b64 = typeof btoa === "function" ? btoa(unescape(encodeURIComponent(json))) : Buffer.from(json, "utf8").toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeConfig(code: string): BattleConfig {
  const b64 = code.replace(/-/g, "+").replace(/_/g, "/");
  const json = typeof atob === "function" ? decodeURIComponent(escape(atob(b64))) : Buffer.from(b64, "base64").toString("utf8");
  const raw = JSON.parse(json);
  const keys: Terrain[] = ["ground", "forest", "wall", "water", "hill", "objective"];
  const tiles = (raw.m.t as string).split("").map((ch: string) => keys["gfwvho".indexOf(ch)]);
  return { map: { width: raw.m.w, height: raw.m.h, tiles }, units: raw.u, doctrine: raw.d, maxTurns: raw.x, firstTeam: raw.f ?? "red" };
}
