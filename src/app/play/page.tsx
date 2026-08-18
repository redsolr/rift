import type { Metadata } from "next";
import ArenaLobby from "@/components/menu/ArenaLobby";

export const metadata: Metadata = { title: "Rift — Multiplayer" };

export default function Page() {
  return <ArenaLobby />;
}
