export const dynamic = "force-dynamic";

import { createClient } from "@supabase/supabase-js";

if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
}

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const ALPHA = 0.2;
const MAX_ALPHA = 0.35;

export async function GET() {
  try {
    const { data: games, error } = await supabase
      .from("games")
      .select("*")
      .not("home_score", "is", null)
      .not("away_score", "is", null)
      .gt("home_score", 0)
      .gt("away_score", 0)
      .eq("ratings_processed", false)
      .order("game_date", { ascending: true });

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    if (!games || games.length === 0) {
      return Response.json({
        message: "No new finished games to process",
        processedCount: 0
      });
    }

    let processedCount = 0;

    for (const game of games) {
      const { data: teams } = await supabase
        .from("teams")
        .select("*")
        .in("name", [game.home_team, game.away_team]);

      if (!teams || teams.length < 2) continue;

      const home = teams.find(t => t.name === game.home_team);
      const away = teams.find(t => t.name === game.away_team);

      if (!home || !away) continue;

      const possessions = (game.home_score + game.away_score) / 2;

      const homeOff = (game.home_score / possessions) * 100;
      const homeDef = (game.away_score / possessions) * 100;

      const awayOff = (game.away_score / possessions) * 100;
      const awayDef = (game.home_score / possessions) * 100;

      const pointDiff = game.home_score - game.away_score;
      const marginMultiplier = Math.log(Math.abs(pointDiff) + 1);

      let scaledAlpha = ALPHA * marginMultiplier;
      if (scaledAlpha > MAX_ALPHA) scaledAlpha = MAX_ALPHA;
      if (scaledAlpha < 0.05) scaledAlpha = 0.05;

      const newHomeOff =
        scaledAlpha * homeOff + (1 - scaledAlpha) * home.off_rating;

      const newHomeDef =
        scaledAlpha * homeDef + (1 - scaledAlpha) * home.def_rating;

      const newHomePace =
        ALPHA * possessions + (1 - ALPHA) * home.pace;

      const newAwayOff =
        scaledAlpha * awayOff + (1 - scaledAlpha) * away.off_rating;

      const newAwayDef =
        scaledAlpha * awayDef + (1 - scaledAlpha) * away.def_rating;

      const newAwayPace =
        ALPHA * possessions + (1 - ALPHA) * away.pace;

      await supabase
        .from("teams")
        .update({
          off_rating: newHomeOff,
          def_rating: newHomeDef,
          pace: newHomePace
        })
        .eq("name", game.home_team);

      await supabase
        .from("teams")
        .update({
          off_rating: newAwayOff,
          def_rating: newAwayDef,
          pace: newAwayPace
        })
        .eq("name", game.away_team);

      await supabase
        .from("games")
        .update({ ratings_processed: true })
        .eq("id", game.id);

      processedCount++;
    }

    return Response.json({
      message: "Games processed successfully",
      processedCount
    });

  } catch (err: any) {
    return Response.json(
      { error: err?.message || "Processing failed" },
      { status: 500 }
    );
  }
}
