export const dynamic = "force-dynamic";

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const BALLDONTLIE_KEY = process.env.BALLDONTLIE_API_KEY!;

function calculateTier(score: number) {
  if (score > 4) return "ELITE";
  if (score > 2.5) return "STAR";
  if (score > 1) return "STARTER";
  return "ROLE";
}

export async function GET() {
  try {
    const res = await fetch(
      "https://api.balldontlie.io/v1/game_player_stats?per_page=100",
      {
        headers: {
          Authorization: BALLDONTLIE_KEY,
        },
      }
    );

    const data = await res.json();

    if (!data.data) {
      return Response.json({ message: "No player stats found" });
    }

    const playerMap: Record<
      number,
      { totalImpact: number; games: number; team: string }
    > = {};

    for (const stat of data.data) {
      const playerId = stat.player.id;

      const basicImpact =
        stat.pts +
        stat.ast * 1.5 +
        stat.reb * 0.7 -
        stat.turnover * 1.2;

      if (!playerMap[playerId]) {
        playerMap[playerId] = {
          totalImpact: 0,
          games: 0,
          team: stat.team.full_name,
        };
      }

      playerMap[playerId].totalImpact += basicImpact;
      playerMap[playerId].games += 1;
    }

    for (const playerId in playerMap) {
      const avgImpact =
        playerMap[playerId].totalImpact /
        playerMap[playerId].games;

      await supabase.from("player_impact").upsert({
        player_id: Number(playerId),
        team: playerMap[playerId].team,
        impact_score: avgImpact,
        impact_tier: calculateTier(avgImpact),
        games_sampled: playerMap[playerId].games,
        last_updated: new Date(),
      });
    }

    return Response.json({
      message: "Player impact updated",
      playersUpdated: Object.keys(playerMap).length,
    });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
