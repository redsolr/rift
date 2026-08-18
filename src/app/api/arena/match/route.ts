import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { currentPlayer, findMatch, playerView } from "@/arena/server";
import { arenaPlayers, db } from "@/db";

export const dynamic = "force-dynamic";

/** Find match: body = { lineup } → the resolved match (both legs) and the caller's updated profile. */
export async function POST(req: Request) {
  const me = await currentPlayer();
  const body = (await req.json().catch(() => ({}))) as { lineup?: unknown };
  const r = await findMatch(me, body.lineup);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  const [fresh] = await db.select().from(arenaPlayers).where(eq(arenaPlayers.id, me.id)).limit(1);
  return NextResponse.json({ match: r.match, me: playerView(fresh) });
}
