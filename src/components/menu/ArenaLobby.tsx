"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MatchSummary, MeResponse, PlayerView, arenaApi, deltaFor, opponentOf, verdictFor } from "@/arena/client";
import { Lineup, MAX_UNITS, lineupError, lineupFromConfig } from "@/arena/lineup";
import { ARCHETYPE_LABEL } from "@/sim/presets";
import { useGame } from "@/store/game";
import "./menu.css";

/**
 * Multiplayer lobby: your name + MMR + record, your lineup (lifted from the active skirmish setup — the blue side,
 * gear-off), ONE button. Find match = the server pairs you with the nearest-MMR standing lineup, resolves the mirror
 * (two legs, same seed) with the deterministic engine and moves both ratings; the card shows both legs, each
 * watchable as a full replay on the board.
 */
export default function ArenaLobby() {
  const config = useGame((s) => s.config);
  const hydrateMaps = useGame((s) => s.hydrateMaps);
  const [data, setData] = useState<MeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [handle, setHandle] = useState("");
  const [result, setResult] = useState<MatchSummary | null>(null);

  useEffect(() => {
    hydrateMaps();
  }, [hydrateMaps]);
  const load = useCallback(() => {
    arenaApi
      .me()
      .then((d) => {
        setData(d);
        setHandle(d.me.handle);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const lineup: Lineup = useMemo(() => lineupFromConfig(config, "blue"), [config]);
  const lineupProblem = lineupError(lineup);

  const findMatch = async () => {
    if (busy || lineupProblem) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const r = await arenaApi.findMatch(lineup);
      setResult(r.match);
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const rename = async () => {
    if (!data || handle.trim() === data.me.handle) return;
    try {
      const r = await arenaApi.rename(handle);
      setData({ ...data, me: r.me });
      setHandle(r.me.handle);
    } catch (e) {
      setError((e as Error).message);
      setHandle(data.me.handle);
    }
  };

  const me = data?.me ?? null;
  return (
    <main className="lobby">
      <div className="menu-sky" aria-hidden />
      <div className="lobby-card">
        <div className="screen-head">
          <Link className="screen-back" href="/">
            ← Menu
          </Link>
          <h1>MULTIPLAYER</h1>
          <span className="lobby-note">ranked ladder · mirror matches · Manager rules · gear off</span>
        </div>
        <div className="lobby-grid">
          <section className="lobby-me">
            <div className="lobby-handle">
              <input value={handle} maxLength={20} onChange={(e) => setHandle(e.target.value)} onBlur={rename} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} placeholder="Your name" aria-label="Your name" disabled={!me} />
            </div>
            <div className="lobby-mmr">
              <span className="big">{me ? me.mmr : "—"}</span>
              <span className="rec">
                MMR · {me ? `${me.wins}W ${me.losses}L ${me.draws}D` : "…"}
              </span>
            </div>
            <div className="lineup-box">
              <div className="lineup-title">
                <span>YOUR LINEUP · {lineup.units.length}/{MAX_UNITS}</span>
                <Link href="/skirmish">edit in Skirmish →</Link>
              </div>
              <div className="lineup-units">
                {lineup.units.map((u, i) => (
                  <span key={i} className={`lineup-unit ${u.archetype}`} title={`${ARCHETYPE_LABEL[u.archetype]} · ${u.orders.stance} · targets ${u.orders.targetPref}`}>
                    <b>{ARCHETYPE_LABEL[u.archetype].slice(0, 3).toUpperCase()}</b>
                    {u.name}
                  </span>
                ))}
              </div>
              <div className="lobby-note" style={{ marginTop: 6 }}>
                doctrine: {lineup.doctrine.aggression.replace("_", " ")} · {lineup.doctrine.objective}
              </div>
              {lineupProblem && <div className="lineup-error">✕ {lineupProblem}</div>}
            </div>
            <button className={`find-match ${busy ? "searching" : ""}`} onClick={findMatch} disabled={busy || !me || !!lineupProblem}>
              {busy ? "FINDING A MATCH…" : "FIND MATCH"}
            </button>
            <span className="lobby-note">Your lineup becomes your standing defence: others will be matched against it while you are away, and your MMR moves either way.</span>
            {error && <div className="lobby-error">{error}</div>}
            {result && me && <MatchCard m={result} onAgain={findMatch} busy={busy} />}
          </section>
          <aside className="lobby-side">
            <h2>LADDER</h2>
            <div className="ladder">
              {(data?.leaderboard ?? []).map((p, i) => (
                <LadderRow key={p.id} p={p} rank={i + 1} me={me?.id === p.id} />
              ))}
              {data && !data.leaderboard.length && <span className="history-empty">Nobody has fought yet.</span>}
            </div>
            <h2 style={{ marginTop: 16 }}>RECENT MATCHES</h2>
            <div className="history">
              {(data?.recent ?? []).map((m) => {
                const v = verdictFor(m);
                const d = deltaFor(m);
                return (
                  <Link key={m.id} href={`/skirmish?match=${m.id}&leg=1`} className={`history-row ${v ?? ""}`} title="Watch the replay">
                    <span className="verdict">{v === "win" ? "WIN" : v === "loss" ? "LOSS" : "DRAW"}</span>
                    <span>
                      vs {opponentOf(m).handle}
                      {opponentOf(m).bot && <span className="bot">house</span>}
                    </span>
                    <span className={`delta ${d > 0 ? "up" : d < 0 ? "down" : ""}`}>{d > 0 ? `+${d}` : d}</span>
                    <span className="lobby-note">{m.legs.map((l) => (l.side === "draw" ? "=" : l.side === m.mySide ? "W" : "L")).join(" ")}</span>
                  </Link>
                );
              })}
              {data && !data.recent.length && <span className="history-empty">No matches yet — press Find match.</span>}
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}

function LadderRow({ p, rank, me }: { p: PlayerView; rank: number; me: boolean }) {
  return (
    <div className={`ladder-row ${me ? "me" : ""}`}>
      <span className="rank">{rank}</span>
      <span>
        {p.handle}
        {p.bot && <span className="bot">house</span>}
      </span>
      <span className="mmr">{p.mmr}</span>
    </div>
  );
}

function MatchCard({ m, onAgain, busy }: { m: MatchSummary; onAgain: () => void; busy: boolean }) {
  const v = verdictFor(m) ?? "draw";
  const d = deltaFor(m);
  const meSide = m.mySide ?? "a";
  const mine = meSide === "a" ? m.a : m.b;
  const opp = opponentOf(m, meSide);
  return (
    <div className={`match-card ${v}`} role="status">
      <div className="match-verdict">{v === "win" ? "VICTORY" : v === "loss" ? "DEFEAT" : "DRAW"}</div>
      <div className="match-vs">
        <div className="who">
          {mine.handle}
          <div className="mmr-line">
            {mine.mmrBefore} → {mine.mmrAfter} ({d > 0 ? `+${d}` : d})
          </div>
        </div>
        <div className="vs">vs</div>
        <div className="who right">
          {opp.handle}
          {opp.bot && <span className="bot"> house</span>}
          <div className="mmr-line">
            {opp.mmrBefore} → {opp.mmrAfter}
          </div>
        </div>
      </div>
      <div className="match-legs">
        {m.legs.map((l) => {
          const lv = l.side === "draw" ? "draw" : l.side === meSide ? "win" : "loss";
          const attackerIsMe = (l.leg === 1) === (meSide === "a");
          return (
            <div key={l.leg} className="match-leg">
              <span className="leg-title">LEG {l.leg} · {attackerIsMe ? "you move first" : "they move first"}</span>
              <span className={`leg-result ${lv}`}>{lv === "win" ? "Won" : lv === "loss" ? "Lost" : "Draw"} · turn {l.turns}</span>
              <span className="lobby-note">
                HP left · you {l.hpPct[meSide]}% · them {l.hpPct[meSide === "a" ? "b" : "a"]}%
              </span>
              <Link href={`/skirmish?match=${m.id}&leg=${l.leg}`}>▶ Watch leg {l.leg}</Link>
            </div>
          );
        })}
      </div>
      <div className="match-actions">
        <button className="primary" onClick={onAgain} disabled={busy}>
          Find another
        </button>
        <Link className="ghost" href={`/skirmish?match=${m.id}&leg=1`} style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid var(--line)", background: "var(--bg-3)", textDecoration: "none", color: "var(--fg)" }}>
          Watch the match
        </Link>
      </div>
    </div>
  );
}
