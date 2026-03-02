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

export async function GET() {
  try {
    // 1️⃣ Get all games chronologically
    const { data: games, error: gamesError } = await supabase
      .from("games")
      .select("*")
      .order("game_date", { ascending: true });

    if (gamesError) {
      return Response.json(
        { error: gamesError.message },
        { status: 500 }
      );
    }

    if (!games || games.length === 0) {
      return Response.json({
        message: "No games found",
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

    // Store latest ratings in memory
    const ratings: Record<
      string,
      { off: number; def: number; pace: number }
    > = {};

    for (const game of games) {
      const home = game.home_team;
      const away = game.away_team;

      const homePoints = game.home_score ?? 0;
      const awayPoints = game.away_score ?? 0;
      const totalPoints = homePoints + awayPoints;

      if (!ratings[home]) {
        ratings[home] = {
          off: homePoints,
          def: awayPoints,
          pace: totalPoints
        };
      }

      if (!ratings[away]) {
        ratings[away] = {
          off: awayPoints,
          def: homePoints,
          pace: totalPoints
        };
      }

      // 👇 SAVE PRE-GAME SNAPSHOT
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

      // 🔁 THEN UPDATE RATINGS AFTER SNAPSHOT
      ratings[home].off =
        ALPHA * homePoints + (1 - ALPHA) * ratings[home].off;

      ratings[home].def =
        ALPHA * awayPoints + (1 - ALPHA) * ratings[home].def;

      ratings[home].pace =
        ALPHA * totalPoints + (1 - ALPHA) * ratings[home].pace;

      ratings[away].off =
        ALPHA * awayPoints + (1 - ALPHA) * ratings[away].off;

      ratings[away].def =
        ALPHA * homePoints + (1 - ALPHA) * ratings[away].def;

      ratings[away].pace =
        ALPHA * totalPoints + (1 - ALPHA) * ratings[away].pace;
    }

    return Response.json({
      message: "Pre-game dynamic ratings successfully rebuilt",
      totalGames: games.length
    });

  } catch (err: any) {
    return Response.json(
      { error: err?.message || "Ratings build failed" },
      { status: 500 }
    );
  }
}
