export const dynamic = "force-dynamic";

import { createClient } from "@supabase/supabase-js";

if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
}

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const ALPHA = 0.2;
const MAX_ALPHA = 0.35;
const MIN_ALPHA = 0.05;
const BATCH_SIZE = 300;

export async function GET() {
  try {
    let processedCount = 0;

    // ✅ Only fetch completed, unprocessed games
    const { data: games, error } = await supabase
      .from("games")
      .select("*")
      .eq("ratings_processed", false)
      .not("home_score", "is", null)
      .not("away_score", "is", null)
      .gt("home_score", 0)
      .gt("away_score", 0)
      .order("game_date", { ascending: true })
      .limit(BATCH_SIZE);

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    if (!games || games.length === 0) {
      return Response.json({
        message: "No completed unprocessed games remaining",
        processedCount: 0,
      });
    }

    for (const game of games) {
      const gameId = game.id;

      // Fetch both teams
      const { data: teams, error: teamError } = await supabase
        .from("teams")
        .select("*")
        .in("name", [game.home_team, game.away_team]);

      if (teamError || !teams || teams.length < 2) {
        console.log("TEAM FETCH ISSUE:", gameId);
        continue;
      }

      const home = teams.find((t) => t.name === game.home_team);
      const away = teams.find((t) => t.name === game.away_team);

      if (!home || !away) {
        console.log("TEAM MATCH ISSUE:", gameId);
        continue;
      }

      // Possession estimate
      const possessions = (game.home_score + game.away_score) / 2;
      if (!possessions || possessions <= 0) {
        console.log("INVALID POSSESSIONS:", gameId);
        continue;
      }

      // Game efficiencies
      const homeOff = (game.home_score / possessions) * 100;
      const homeDef = (game.away_score / possessions) * 100;
      const awayOff = (game.away_score / possessions) * 100;
      const awayDef = (game.home_score / possessions) * 100;

      const pointDiff = game.home_score - game.away_score;
      const marginMultiplier = Math.log(Math.abs(pointDiff) + 1);

      let scaledAlpha = ALPHA * marginMultiplier;
      if (scaledAlpha > MAX_ALPHA) scaledAlpha = MAX_ALPHA;
      if (scaledAlpha < MIN_ALPHA) scaledAlpha = MIN_ALPHA;

      const homeOffRating = Number(home.off_rating ?? 100);
      const homeDefRating = Number(home.def_rating ?? 100);
      const homePace = Number(home.pace ?? 100);

      const awayOffRating = Number(away.off_rating ?? 100);
      const awayDefRating = Number(away.def_rating ?? 100);
      const awayPace = Number(away.pace ?? 100);

      // New ratings
      const newHomeOff =
        scaledAlpha * homeOff + (1 - scaledAlpha) * homeOffRating;

      const newHomeDef =
        scaledAlpha * homeDef + (1 - scaledAlpha) * homeDefRating;

      const newHomePace =
        ALPHA * possessions + (1 - ALPHA) * homePace;

      const newAwayOff =
        scaledAlpha * awayOff + (1 - scaledAlpha) * awayOffRating;

      const newAwayDef =
        scaledAlpha * awayDef + (1 - scaledAlpha) * awayDefRating;

      const newAwayPace =
        ALPHA * possessions + (1 - ALPHA) * awayPace;

      // Update teams
      await supabase
        .from("teams")
        .update({
          off_rating: newHomeOff,
          def_rating: newHomeDef,
          pace: newHomePace,
        })
        .eq("name", game.home_team);

      await supabase
        .from("teams")
        .update({
          off_rating: newAwayOff,
          def_rating: newAwayDef,
          pace: newAwayPace,
        })
        .eq("name", game.away_team);

      // Mark game processed
      await supabase
        .from("games")
        .update({ ratings_processed: true })
        .eq("id", gameId);

      processedCount++;
    }

    // Count remaining completed games
    const { count } = await supabase
      .from("games")
      .select("*", { count: "exact", head: true })
      .eq("ratings_processed", false)
      .not("home_score", "is", null)
      .not("away_score", "is", null)
      .gt("home_score", 0)
      .gt("away_score", 0);

    return Response.json({
      message: "Batch processed successfully",
      processedCount,
      remainingCompletedGames: count ?? 0,
    });

  } catch (err: any) {
    return Response.json(
      { error: err?.message || "Processing failed" },
      { status: 500 }
    );
  }
}
