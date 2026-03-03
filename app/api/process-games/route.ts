export const dynamic = "force-dynamic";

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const BATCH_SIZE = 300;

export async function GET() {
  try {

    const debug: any[] = [];
    let processedCount = 0;

    const { data: games } = await supabase
      .from("games")
      .select("*")
      .eq("ratings_processed", false)
      .not("home_score", "is", null)
      .not("away_score", "is", null)
      .gt("home_score", 0)
      .gt("away_score", 0)
      .order("game_date", { ascending: true })
      .limit(BATCH_SIZE);

    if (!games || games.length === 0) {
      return Response.json({
        message: "No unprocessed games remaining",
        processedCount: 0,
        remainingGames: 0
      });
    }

    for (const game of games) {

      const gameId = Number(game.id);

      const { data: teams } = await supabase
        .from("teams")
        .select("*")
        .in("name", [game.home_team, game.away_team]);

      if (!teams || teams.length < 2) {
        debug.push({ gameId, reason: "TEAM_NOT_FOUND" });
        continue;
      }

      const { data: updated } = await supabase
        .from("games")
        .update({ ratings_processed: true })
        .eq("id", gameId)
        .select("id");

      if (!updated || updated.length === 0) {
        debug.push({ gameId, reason: "UPDATE_FAILED" });
        continue;
      }

      processedCount++;
    }

    const { count } = await supabase
      .from("games")
      .select("*", { count: "exact", head: true })
      .eq("ratings_processed", false)
      .not("home_score", "is", null)
      .not("away_score", "is", null)
      .gt("home_score", 0)
      .gt("away_score", 0);

    return Response.json({
      message: "Diagnostic run complete",
      processedCount,
      remainingGames: count ?? 0,
      skipped: debug.slice(0, 20)
    });

  } catch (err: any) {
    return Response.json(
      { error: err?.message || "Processing failed" },
      { status: 500 }
    );
  }
}
