/**
 * Campaign prototype — the dialogue scripts (kitchen + village). Pure data: the overlay walks it, the scene reacts to
 * `effects`. Speakers are the campaign cast; `null` speaker = narration. Which script an NPC speaks lives in the zone
 * data (`world/`), not here.
 */
export type SpeakerId = "rook" | "mina" | "bram";

/** KayKit Adventurers bodies on disk (`public/models/kaykit/<name>.glb`, CC0) */
export type ModelName = "Knight" | "Mage" | "Barbarian" | "Rogue" | "Rogue_Hooded";
export const MODELS: ModelName[] = ["Knight", "Mage", "Barbarian", "Rogue", "Rogue_Hooded"];

export interface Speaker {
  id: SpeakerId;
  name: string;
  /** which portrait to use (team × archetype in `components/portraits.ts`) */
  team: "blue" | "red";
  archetype: "knight" | "fighter" | "archer" | "mage" | "healer";
  /** KayKit Adventurers model in `public/models/kaykit/<model>.glb` (CC0) — placeholder 3D body */
  model: ModelName;
}

export const SPEAKERS: Record<SpeakerId, Speaker> = {
  rook: { id: "rook", name: "Rook", team: "blue", archetype: "knight", model: "Knight" },
  mina: { id: "mina", name: "Mina", team: "blue", archetype: "healer", model: "Mage" },
  bram: { id: "bram", name: "Bram", team: "red", archetype: "fighter", model: "Barbarian" },
};

export interface Choice {
  label: string;
  next: string;
}

export interface Line {
  id: string;
  speaker: SpeakerId | null;
  text: string;
  /** next line id; omitted = end of the conversation */
  next?: string;
  /** an Atlus-style choice list shown after the text finishes; each picks the next line */
  choices?: Choice[];
  /** side effect for the scene when this line is reached */
  effect?: "to-battle";
}

/** First conversation with Mina, in the kitchen the night before the square. */
export const KITCHEN_TALK: Line[] = [
  { id: "k1", speaker: "mina", text: "You're up late. Couldn't sleep either?", next: "k2" },
  { id: "k2", speaker: "rook", text: "The captain wants the square held by noon. I keep walking the streets in my head.", next: "k3" },
  { id: "k3", speaker: "mina", text: "Then stop walking them alone. Sit. There's bread, and I stole a little of the good honey.", next: "k4" },
  { id: "k4", speaker: null, text: "The hearth pops. Somewhere above, the herbs turn slowly on their strings.", next: "k5" },
  { id: "k5", speaker: "rook", text: "If it goes badly tomorrow—", next: "k6" },
  {
    id: "k6",
    speaker: "mina",
    text: "It won't. And if it does, I'll be two tiles behind you with a staff and a very loud opinion. So. What do you need from me?",
    choices: [
      { label: "Stay close and keep the archer alive.", next: "c1" },
      { label: "Hold the planters. Don't chase.", next: "c2" },
      { label: "Nothing yet. Let's eat.", next: "c3" },
    ],
  },
  { id: "c1", speaker: "mina", text: "Lys? She'll hate being minded. I'll do it anyway.", next: "end1" },
  { id: "c2", speaker: "mina", text: "Hold, not chase. You realise you're saying that to the one person on the squad who never chases.", next: "end1" },
  { id: "c3", speaker: "mina", text: "Finally, a sensible order. Pass the honey.", next: "end1" },
  { id: "end1", speaker: "rook", text: "Thank you, Mina.", next: "end2" },
  {
    id: "end2",
    speaker: "mina",
    text: "Get some sleep, Rook. The square will still be there at dawn.",
    choices: [
      { label: "Head to the square now.", next: "go" },
      { label: "Stay a while longer.", next: "stay" },
    ],
  },
  { id: "go", speaker: null, text: "Rook takes the lance from beside the door.", effect: "to-battle" },
  { id: "stay", speaker: null, text: "The bread is warm. It can wait until morning." },
];

/** Talking to Mina again after the first conversation. */
export const KITCHEN_AGAIN: Line[] = [
  { id: "a1", speaker: "mina", text: "Still here? Go on — the square, or bed. Those are your two options.", next: "a2" },
  {
    id: "a2",
    speaker: "rook",
    text: "…",
    choices: [
      { label: "The square.", next: "go" },
      { label: "Bed. Eventually.", next: "stay" },
    ],
  },
  { id: "go", speaker: null, text: "Rook takes the lance from beside the door.", effect: "to-battle" },
  { id: "stay", speaker: "mina", text: "\"Eventually.\" Sure." },
];

export const lineById = (script: Line[], id: string): Line => {
  const l = script.find((x) => x.id === id);
  if (!l) throw new Error(`campaign script: no line "${id}"`);
  return l;
};

/** The village square at night — Bram, the well-keeper, first time. */
export const VILLAGE_TALK: Line[] = [
  { id: "v1", speaker: "bram", text: "Evening, soldier. Odd hour to be pacing the square.", next: "v2" },
  { id: "v2", speaker: "rook", text: "Odd hour to be drawing water.", next: "v3" },
  { id: "v3", speaker: "bram", text: "The well doesn't sleep and neither do the horses. You're the ones holding the square at noon?", next: "v4" },
  {
    id: "v4",
    speaker: "rook",
    text: "We are. Anything I should know about it?",
    choices: [
      { label: "Where do they usually come from?", next: "v5" },
      { label: "Which cottages have cellars?", next: "v6" },
      { label: "Nothing. Good night.", next: "v7" },
    ],
  },
  { id: "v5", speaker: "bram", text: "The east lane. Always the east lane — the planters slow them, but they come anyway. Put your archer where she can see it.", next: "vend" },
  { id: "v6", speaker: "bram", text: "The baker's and mine. Doors bar from inside. If it goes wrong, that's where the children go.", next: "vend" },
  { id: "v7", speaker: "bram", text: "Good night, then. Mind the well rope — it's slick.", next: "vend" },
  { id: "vend", speaker: null, text: "Bram hauls the bucket up. Somewhere a shutter bangs in the wind." },
];

/** Bram again. */
export const VILLAGE_AGAIN: Line[] = [
  { id: "w1", speaker: "bram", text: "Still pacing? The kitchen's warmer than my square. Go on.", next: "w2" },
  { id: "w2", speaker: "rook", text: "Soon." },
];
