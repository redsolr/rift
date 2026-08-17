import type { Metadata } from "next";
import CampaignPage from "@/campaign/CampaignPage";

export const metadata: Metadata = { title: "Tactician — Campaign" };

export default function Page() {
  return <CampaignPage />;
}
