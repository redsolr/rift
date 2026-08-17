"use client";
import { useGame } from "@/store/game";
import { otherTeam } from "@/sim/types";
import { Section } from "./panel/ui";
import { DoctrineEditor, SquadList } from "./panel/Squad";
import { Explain, OrdersEditor, PersonalityEditor, StatsEditor, UnitCard } from "./panel/UnitSections";
import { EditorTools, SimPanel } from "./panel/EditorPanel";
import SharePanel from "./panel/SharePanel";
import BattleLog from "./panel/BattleLog";

export default function Panel() {
  const mode = useGame((s) => s.mode);
  const unit = useGame((s) => s.config.units.find((u) => u.id === s.selected) ?? null);
  const lastDecision = useGame((s) => (s.selected ? s.view.lastDecision[s.selected] : undefined));
  const battle = useGame((s) => s.battle);
  const playerTeam = useGame((s) => s.playerTeam);
  const enemyTeam = otherTeam(playerTeam);

  return (
    <aside className="panel">
      {mode === "editor" && (
        <>
          <Section title="Tools">
            <EditorTools />
          </Section>
          <Section title="Simulate">
            <SimPanel />
          </Section>
        </>
      )}

      {unit ? (
        <>
          <Section title={`Unit · ${unit.name}`}>
            <UnitCard u={unit} />
          </Section>
          {mode === "editor" && (
            <Section title="Stats" defaultOpen={false}>
              <StatsEditor u={unit} />
            </Section>
          )}
          {(mode !== "manual" || !battle) && (
            <Section title="Orders">
              <OrdersEditor u={unit} />
            </Section>
          )}
          <Section title="Personality" defaultOpen={mode === "editor"}>
            <PersonalityEditor u={unit} />
          </Section>
          {lastDecision && (
            <Section title="Why did it do that?">
              <Explain cands={lastDecision} />
            </Section>
          )}
        </>
      ) : (
        <Section title="Selection">
          <p className="muted">
            {mode === "manual" && "Click one of your units to move it. Blue tiles = where it can move, red = where it can attack into."}
            {mode === "manager" && "Click any unit to view and edit its orders, personality and last decision."}
            {mode === "editor" && "Pick a tool on the left, or click a unit to edit it."}
          </p>
        </Section>
      )}

      {mode !== "editor" && (
        <>
          <Section title={`Your squad (${playerTeam})`}>
            <DoctrineEditor team={playerTeam} />
            <SquadList team={playerTeam} />
          </Section>
          <Section title={`Enemy squad (${enemyTeam})`} defaultOpen={false}>
            <DoctrineEditor team={enemyTeam} />
            <SquadList team={enemyTeam} />
          </Section>
        </>
      )}
      {mode === "editor" && (
        <>
          <Section title="Red squad" defaultOpen={false}>
            <DoctrineEditor team="red" />
            <SquadList team="red" />
          </Section>
          <Section title="Blue squad" defaultOpen={false}>
            <DoctrineEditor team="blue" />
            <SquadList team="blue" />
          </Section>
        </>
      )}
      {mode !== "editor" || battle ? (
        <Section title="Battle log">
          <BattleLog />
        </Section>
      ) : null}
      <Section title="Share" defaultOpen={false}>
        <SharePanel />
      </Section>
    </aside>
  );
}
