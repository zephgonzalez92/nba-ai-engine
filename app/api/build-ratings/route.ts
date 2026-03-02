import { createClient } from "@supabase/supabase-js";

// 🔎 Validate environment variables early
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
const MAX_ALPHA = 0.35; // 🔒 Prevent explosive updates

export async function GET() {
  try {
    // 1️⃣ Get only completed games chronologically (ignore future 0-0 games)
    const { data: games, error: gamesError } = await supabase
  .from("games")
  .select("*")
  .not("home_score", "is", null)
  .not("away_score", "is", null)
  .gt("home_score", 0)
  .gt("away_score", 0)
  .order("game_date", { ascending: true })
  .range(0, 10000);

    if (gamesError) {
      return Response.json(
        { error: gamesError.message },
        { status: 500 }
      );
    }

    if (!games || games.length === 0) {
      return Response.json({
        message: "No completed games found",
        totalGames: 0
      });
    }

    // 2️⃣ Clear previous ratings history
    const { error: deleteError } = await supabase
      .from("team_ratings_history")
      .delete()
      .gt("id", 0);

    if (deleteError) {
      return Response.json(
        { error: deleteError.message },
        { status: 500 }
      );
    }

    const ratings: Record<
      string,
      { off: number; def: number; pace: number }
    > = {};

    for (const game of games) {
      const home = game.home_team;
      const away = game.away_team;

      const homePoints = game.home_score ?? 0;
      const awayPoints = game.away_score ?? 0;

      const possessions = (homePoints + awayPoints) / 2;
      if (possessions === 0) continue;

      // Efficiency per 100 possessions
      const homeOff = (homePoints / possessions) * 100;
      const homeDef = (awayPoints / possessions) * 100;

      const awayOff = (awayPoints / possessions) * 100;
      const awayDef = (homePoints / possessions) * 100;

      // Initialize ratings if first appearance
      if (!ratings[home]) {
        ratings[home] = {
          off: homeOff,
          def: homeDef,
          pace: possessions
        };
      }

      if (!ratings[away]) {
        ratings[away] = {
          off: awayOff,
          def: awayDef,
          pace: possessions
        };
      }

      // 🔹 SAVE PRE-GAME SNAPSHOT
      const { error: insertError } = await supabase
        .from("team_ratings_history")
        .insert([
          {
            team: home,
            game_id: game.id,
            game_date: game.game_date,
            season: game.season,
            off_rating: ratings[home].off,
            def_rating: ratings[home].def,
            pace: ratings[home].pace
          },
          {
            team: away,
            game_id: game.id,
            game_date: game.game_date,
            season: game.season,
            off_rating: ratings[away].off,
            def_rating: ratings[away].def,
            pace: ratings[away].pace
          }
        ]);

      if (insertError) {
        return Response.json(
          { error: insertError.message },
          { status: 500 }
        );
      }

      // 🔹 Margin-of-victory scaling
      const pointDiff = homePoints - awayPoints;
      const marginMultiplier = Math.log(Math.abs(pointDiff) + 1);

      // 🔹 Opponent-adjusted efficiency
      const adjHomeOff = homeOff - ratings[away].def;
      const adjHomeDef = homeDef - ratings[away].off;

      const adjAwayOff = awayOff - ratings[home].def;
      const adjAwayDef = awayDef - ratings[home].off;

      // 🔹 Scaled alpha (clamped for safety)
      let scaledAlpha = ALPHA * marginMultiplier;
      if (scaledAlpha > MAX_ALPHA) scaledAlpha = MAX_ALPHA;
      if (scaledAlpha < 0.05) scaledAlpha = 0.05;

      // 🔁 Update ratings AFTER snapshot
      ratings[home].off =
        scaledAlpha * adjHomeOff + (1 - scaledAlpha) * ratings[home].off;

      ratings[home].def =
        scaledAlpha * adjHomeDef + (1 - scaledAlpha) * ratings[home].def;

      ratings[home].pace =
        ALPHA * possessions + (1 - ALPHA) * ratings[home].pace;

      ratings[away].off =
        scaledAlpha * adjAwayOff + (1 - scaledAlpha) * ratings[away].off;

      ratings[away].def =
        scaledAlpha * adjAwayDef + (1 - scaledAlpha) * ratings[away].def;

      ratings[away].pace =
        ALPHA * possessions + (1 - ALPHA) * ratings[away].pace;
    }

    // 🔥 NEW: UPDATE TEAMS TABLE WITH FINAL RATINGS SNAPSHOT
    const teamUpdates = Object.entries(ratings).map(([team, values]) => ({
      name: team,
      off_rating: values.off,
      def_rating: values.def,
      pace: values.pace
    }));

    const { error: teamError } = await supabase
      .from("teams")
      .upsert(teamUpdates, { onConflict: "name" });

    if (teamError) {
      return Response.json(
        { error: teamError.message },
        { status: 500 }
      );
    }

    return Response.json({
      message: "Advanced margin-adjusted efficiency ratings successfully rebuilt",
      totalGames: games.length,
      totalTeamsUpdated: teamUpdates.length
    });

  } catch (err: any) {
    return Response.json(
      { error: err?.message || "Ratings build failed" },
      { status: 500 }
    );
  }
}
