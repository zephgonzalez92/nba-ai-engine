import { createClient } from "@supabase/supabase-js";
import { logisticProbability } from "@/lib/model";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const HOME_ADV = 100;

function expectedScore(eloA: number, eloB: number) {
  return 1 / (1 + Math.pow(10, (eloB - eloA) / 400));
}

export async function GET() {
  try {
    const { data: games, error: gamesError } = await supabase
      .from("games")
      .select("*")
      .order("game_date", { ascending: true });

    if (gamesError || !games) {
      return Response.json(
        { error: gamesError?.message || "No games found" },
        { status: 500 }
      );
    }

    let totalGames = 0;
    let correctModel = 0;
    let correctElo = 0;
    let brierModel = 0;
    let brierElo = 0;

    for (const game of games) {
      const {
        id,
        home_team,
        away_team,
        home_score,
        away_score,
        game_date
      } = game;

      if (home_score == null || away_score == null) continue;

      // 🔹 Get Elo BEFORE this game (prevents future leakage)
      const { data: homeEloData } = await supabase
        .from("elo_ratings")
        .select("elo_before")
        .eq("team", home_team)
        .lt("game_id", id)
        .order("game_id", { ascending: false })
        .limit(1)
        .maybeSingle();

      const { data: awayEloData } = await supabase
        .from("elo_ratings")
        .select("elo_before")
        .eq("team", away_team)
        .lt("game_id", id)
        .order("game_id", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!homeEloData || !awayEloData) continue;

      const homeElo = homeEloData.elo_before + HOME_ADV;
      const awayElo = awayEloData.elo_before;

      const eloProb = expectedScore(homeElo, awayElo);

      // 🔹 Get dynamic team ratings BEFORE this game
      const { data: homeRating } = await supabase
        .from("team_ratings_history")
        .select("*")
        .eq("team", home_team)
        .lte("game_date", game_date)
        .order("game_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      const { data: awayRating } = await supabase
        .from("team_ratings_history")
        .select("*")
        .eq("team", away_team)
        .lte("game_date", game_date)
        .order("game_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!homeRating || !awayRating) continue;

      const features = {
        elo_diff: homeElo - awayElo,
        off_diff: homeRating.off_rating - awayRating.off_rating,
        def_diff: homeRating.def_rating - awayRating.def_rating,
        pace: homeRating.pace - awayRating.pace,
        home: 1
      };

      const modelProb = logisticProbability(features);

      const actual = home_score > away_score ? 1 : 0;

      // Accuracy
      if (
        (modelProb > 0.5 && actual === 1) ||
        (modelProb <= 0.5 && actual === 0)
      ) {
        correctModel++;
      }

      if (
        (eloProb > 0.5 && actual === 1) ||
        (eloProb <= 0.5 && actual === 0)
      ) {
        correctElo++;
      }

      // Brier score
      brierModel += Math.pow(modelProb - actual, 2);
      brierElo += Math.pow(eloProb - actual, 2);

      totalGames++;
    }

    if (totalGames === 0) {
      return Response.json({
        totalGames: 0,
        message: "No valid games evaluated"
      });
    }

    return Response.json({
      totalGames,
      modelAccuracy: Number((correctModel / totalGames).toFixed(4)),
      eloAccuracy: Number((correctElo / totalGames).toFixed(4)),
      modelBrier: Number((brierModel / totalGames).toFixed(4)),
      eloBrier: Number((brierElo / totalGames).toFixed(4))
    });

  } catch (err: any) {
    return Response.json(
      { error: err?.message || "Backtest failed" },
      { status: 500 }
    );
  }
}
