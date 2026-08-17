/**
 * Campaign prototype — the dialogue script for the one room. Pure data: the overlay walks it, the scene reacts to
 * `effects`. Speakers are the two characters in the room; `null` speaker = narration.
 */
export type SpeakerId = "rook" | "mina";

/** how the walking sprite is drawn (Ragnarok-style chibi pixel art) — colours + hair style per character */
export interface Look {
  hair: string;
  hairDark: string;
  hairLight: string;
  style: "short" | "long";
  eyes: string;
  skin: string;
  outfit: string;
  outfitDark: string;
  accent: string;
  boots: string;
}

export interface Speaker {
  id: SpeakerId;
  name: string;
  /** which portrait to use (team × archetype in `components/portraits.ts`) */
  team: "blue" | "red";
  archetype: "knight" | "fighter" | "archer" | "mage" | "healer";
  look: Look;
}

export const SPEAKERS: Record<SpeakerId, Speaker> = {
  rook: {
    id: "rook",
    name: "Rook",
    team: "blue",
    archetype: "knight",
    look: { hair: "#3f9aa8", hairDark: "#2a6b78", hairLight: "#7fd0dc", style: "short", eyes: "#5aa8ff", skin: "#f2cfae", outfit: "#2a2b38", outfitDark: "#1a1b26", accent: "#7fb2ff", boots: "#15100c" },
  },
  mina: {
    id: "mina",
    name: "Mina",
    team: "blue",
    archetype: "healer",
    look: { hair: "#6e4030", hairDark: "#4a2a1e", hairLight: "#a06a50", style: "long", eyes: "#5fbf6f", skin: "#f4d3b4", outfit: "#8a2440", outfitDark: "#5e1830", accent: "#e8c070", boots: "#2a1c14" },
  },
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
