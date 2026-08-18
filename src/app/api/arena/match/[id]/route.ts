import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { PLAYER_COOKIE, matchById } from "@/arena/server";
import { arenaPlayers, db } from "@/db";

export const dynamic = "force-dynamic";

/** One match with both lineups + seed + sim version — everything a client needs to replay it locally. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Bad match id" }, { status: 400 });
  // the viewer is optional — a shared replay link works for anyone; looking never creates an identity
  const token = (await cookies()).get(PLAYER_COOKIE)?.value;
  const viewer = token ? ((await db.select({ id: arenaPlayers.id }).from(arenaPlayers).where(eq(arenaPlayers.token, token)).limit(1))[0]?.id ?? null) : null;
  const m = await matchById(id, viewer);
  if (!m) return NextResponse.json({ error: "No such match" }, { status: 404 });
  return NextResponse.json({ match: m });
}
