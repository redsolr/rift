import type { Metadata } from "next";
import SettingsScreen from "@/components/menu/SettingsScreen";

export const metadata: Metadata = { title: "Rift — Settings" };

export default function Page() {
  return <SettingsScreen />;
}
