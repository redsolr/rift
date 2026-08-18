import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { arenaPlayers, db } from "@/db";
import { cleanHandle, currentPlayer, ensureBots, leaderboard, playerView, recentMatches } from "@/arena/server";

export const dynamic = "force-dynamic";

/** Who am I on the ladder + my recent matches + the top of the table. Creates the identity on first call. */
export async function GET() {
  const me = await currentPlayer();
  await ensureBots();
  const [recent, top] = await Promise.all([recentMatches(me.id), leaderboard()]);
  return NextResponse.json({ me: playerView(me), recent, leaderboard: top });
}

/** Rename. */
export async function PATCH(req: Request) {
  const me = await currentPlayer();
  const body = (await req.json().catch(() => ({}))) as { handle?: unknown };
  const handle = cleanHandle(body.handle);
  if (!handle) return NextResponse.json({ error: "A name needs 2–20 letters" }, { status: 400 });
  const [p] = await db.update(arenaPlayers).set({ handle }).where(eq(arenaPlayers.id, me.id)).returning();
  return NextResponse.json({ me: playerView(p) });
}
