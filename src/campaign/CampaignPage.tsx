"use client";
import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import CampaignScene from "./CampaignScene";
import Dialogue from "./Dialogue";
import { useCampaign } from "./store";
import "./campaign.css";

/** Campaign prototype page: the room, the walk HUD, the Talk prompt, the dialogue overlay. */
export default function CampaignPage() {
  const nearNpc = useCampaign((s) => s.nearNpc);
  const dialogue = useCampaign((s) => s.dialogue);
  const leaving = useCampaign((s) => s.leaving);
  const talk = useCampaign((s) => s.talk);
  const router = useRouter();

  useEffect(() => {
    (window as unknown as { __campaign?: typeof useCampaign }).__campaign = useCampaign;
  }, []);
  // "to-battle" effect: after the last line closes, go to the skirmish
  useEffect(() => {
    if (leaving && !dialogue) router.push("/");
  }, [leaving, dialogue, router]);

  return (
    <div className="campaign">
      <CampaignScene />
      <div className="campaign-hud">
        <span className="campaign-brand">TACTICIAN</span>
        <span className="campaign-chapter">Prologue · The night before the square</span>
        <Link className="campaign-back" href="/">
          ← Skirmish
        </Link>
      </div>
      {!dialogue && (
        <div className="campaign-controls">
          <kbd>W</kbd>
          <kbd>A</kbd>
          <kbd>S</kbd>
          <kbd>D</kbd> walk · click the floor to walk there · <kbd>E</kbd> talk
        </div>
      )}
      {nearNpc && !dialogue && (
        <button className="campaign-prompt" onClick={talk}>
          <kbd>E</kbd>Talk to Mina
        </button>
      )}
      <Dialogue />
    </div>
  );
}
