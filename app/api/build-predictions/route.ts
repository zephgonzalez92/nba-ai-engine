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

const HOME_ADVANTAGE = 3;       // points
const K_FACTOR = 0.12;          // logistic sensitivity
const EFF_WEIGHT = 0.65;
const ELO_WEIGHT = 0.35;

function logistic(x: number) {
  return 1 / (1 + Math.exp(-K_FACTOR * x));
}

function confidenceTier(prob: number) {
  if (prob >= 0.65) return "STRONG";
  if (prob >= 0.60) return "HIGH";
  if (prob >= 0.55) return "MEDIUM";
  return "LOW";
}

export async function GET() {
  try {
    // Pull completed games only
    const { data: games, error: gamesError } = await supabase
      .from("games")
      .select("*")
      .not("home_score", "is", null)
      .not("away_score", "is", null)
      .range(0, 10000);

    if (gamesError) {
      return Response.json({ error: gamesError.message }, { status: 500 });
    }

    if (!games || games.length === 0) {
      return Response.json({
        message: "No completed games found",
        totalBuilt: 0
      });
    }

    let totalBuilt = 0;

    for (const game of games) {
      // Pull pre-game efficiency ratings
      const { data: ratings } = await supabase
        .from("team_ratings_history")
        .select("*")
        .eq("game_id", game.id);

      if (!ratings || ratings.length < 2) continue;

      const homeEff = ratings.find(r => r.team === game.home_team);
      const awayEff = ratings.find(r => r.team === game.away_team);

      if (!homeEff || !awayEff) continue;

      const homeEffNet = homeEff.off_rating - homeEff.def_rating;
      const awayEffNet = awayEff.off_rating - awayEff.def_rating;

      // Pull latest ELO ratings
      const { data: eloRows } = await supabase
        .from("elo_ratings")
        .select("*")
        .in("team", [game.home_team, game.away_team]);

      const homeElo =
        eloRows?.find(e => e.team === game.home_team)?.elo ?? 1500;

      const awayElo =
        eloRows?.find(e => e.team === game.away_team)?.elo ?? 1500;

      const eloGap = (homeElo - awayElo) / 25; // scale ELO to point-like gap

      // Combine efficiency + ELO
      const efficiencyGap = homeEffNet - awayEffNet + HOME_ADVANTAGE;

      const finalGap =
        EFF_WEIGHT * efficiencyGap +
        ELO_WEIGHT * eloGap;

      const homeWinProb = logistic(finalGap);

      const predictedWinner =
        homeWinProb >= 0.5 ? game.home_team : game.away_team;

      const actualWinner =
        game.home_score > game.away_score
          ? game.home_team
          : game.away_team;

      const correct = predictedWinner === actualWinner;

      await supabase
        .from("predictions")
        .upsert(
          {
            game_id: game.id,
            season: game.season,
            home_team: game.home_team,
            away_team: game.away_team,
            predicted_winner: predictedWinner,
            home_win_probability: homeWinProb,
            rating_gap: finalGap,
            confidence_tier: confidenceTier(homeWinProb),
            correct_prediction: correct
          },
          { onConflict: "game_id" }
        );

      totalBuilt++;
    }

    return Response.json({
      message: "Predictions built successfully",
      totalBuilt
    });

  } catch (err: any) {
    return Response.json(
      { error: err?.message || "Prediction build failed" },
      { status: 500 }
    );
  }
}
