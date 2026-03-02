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
    const { data: games } = await supabase
      .from("games")
      .select("*")
      .order("game_date", { ascending: true });

    if (!games) {
      return Response.json({ error: "No games found" }, { status: 404 });
    }

    let totalGames = 0;
    let correctModel = 0;
    let correctElo = 0;
    let brierModel = 0;
    let brierElo = 0;

    for (const game of games) {
      const { home_team, away_team, home_score, away_score } = game;

      // Get Elo BEFORE game
      const { data: homeEloData } = await supabase
        .from("elo_ratings")
        .select("elo_before")
        .eq("team", home_team)
        .order("game_id", { ascending: false })
        .limit(1)
        .single();

      const { data: awayEloData } = await supabase
        .from("elo_ratings")
        .select("elo_before")
        .eq("team", away_team)
        .order("game_id", { ascending: false })
        .limit(1)
        .single();

      if (!homeEloData || !awayEloData) continue;

      const homeElo = homeEloData.elo_before + HOME_ADV;
      const awayElo = awayEloData.elo_before;

      const eloProb = expectedScore(homeElo, awayElo);

      // Get team stats
      const { data: homeTeam } = await supabase
        .from("teams")
        .select("*")
        .eq("name", home_team)
        .single();

      const { data: awayTeam } = await supabase
        .from("teams")
        .select("*")
        .eq("name", away_team)
        .single();

      if (!homeTeam || !awayTeam) continue;

      const features = {
        elo_diff: homeElo - awayElo,
        off_diff: homeTeam.off_rating - awayTeam.off_rating,
        def_diff: homeTeam.def_rating - awayTeam.def_rating,
        pace: homeTeam.pace - awayTeam.pace,
        home: 1
      };

      const modelProb = logisticProbability(features);

      const actual = home_score > away_score ? 1 : 0;

      // Accuracy
      if ((modelProb > 0.5 && actual === 1) || (modelProb <= 0.5 && actual === 0)) {
        correctModel++;
      }

      if ((eloProb > 0.5 && actual === 1) || (eloProb <= 0.5 && actual === 0)) {
        correctElo++;
      }

      // Brier score
      brierModel += Math.pow(modelProb - actual, 2);
      brierElo += Math.pow(eloProb - actual, 2);

      totalGames++;
    }

    return Response.json({
      totalGames,
      modelAccuracy: (correctModel / totalGames).toFixed(4),
      eloAccuracy: (correctElo / totalGames).toFixed(4),
      modelBrier: (brierModel / totalGames).toFixed(4),
      eloBrier: (brierElo / totalGames).toFixed(4)
    });

  } catch (err) {
    return Response.json({ error: "Backtest failed" }, { status: 500 });
  }
}
