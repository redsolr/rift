import type { Metadata } from "next";
import MainMenu from "@/components/menu/MainMenu";

export const metadata: Metadata = { title: "Rift" };

/** The title screen: Story · Multiplayer · Skirmish · Settings. Share links (`#c=…`) are forwarded to the skirmish. */
export default function Page() {
  return <MainMenu />;
}
