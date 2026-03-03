export const dynamic = "force-dynamic";

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
if (!serviceRoleKey) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

const supabase = createClient(supabaseUrl, serviceRoleKey);

const HOME_ADVANTAGE = 3;
const K_FACTOR = 0.12;
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
    const today = new Date().toISOString().split("T")[0];

    const { data: games, error } = await supabase
      .from("games")
      .select("*")
      .eq("game_date", today);

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    if (!games || games.length === 0) {
      return Response.json({
        message: "No games found for today",
        totalBuilt: 0
      });
    }

    let totalBuilt = 0;

    for (const game of games as any[]) {

      const { data: homeTeam } = await supabase
        .from("teams")
        .select("*")
        .eq("name", game.home_team)
        .single();

      const { data: awayTeam } = await supabase
        .from("teams")
        .select("*")
        .eq("name", game.away_team)
        .single();

      if (!homeTeam || !awayTeam) continue;

      const homeEffNet =
        Number(homeTeam.off_rating) - Number(homeTeam.def_rating);

      const awayEffNet =
        Number(awayTeam.off_rating) - Number(awayTeam.def_rating);

      const { data: eloRows } = await supabase
        .from("elo_ratings")
        .select("*")
        .in("team", [game.home_team, game.away_team]);

      const homeElo =
        (eloRows as any[])?.find((e: any) => e.team === game.home_team)?.elo ?? 1500;

      const awayElo =
        (eloRows as any[])?.find((e: any) => e.team === game.away_team)?.elo ?? 1500;

      const eloGap = (Number(homeElo) - Number(awayElo)) / 25;

      const efficiencyGap =
        homeEffNet - awayEffNet + HOME_ADVANTAGE;

      let homeImpact = 0;
      let awayImpact = 0;

      const { data: missingHome } = await supabase
        .from("player_status")
        .select("player_id")
        .eq("team", game.home_team)
        .eq("game_date", today)
        .eq("status", "Out");

      if (missingHome) {
        for (const player of missingHome as any[]) {
          const { data: impact } = await supabase
            .from("player_impact")
            .select("impact_score")
            .eq("player_id", player.player_id)
            .single();

          if (impact?.impact_score) {
            homeImpact += Number(impact.impact_score);
          }
        }
      }

      const { data: missingAway } = await supabase
        .from("player_status")
        .select("player_id")
        .eq("team", game.away_team)
        .eq("game_date", today)
        .eq("status", "Out");

      if (missingAway) {
        for (const player of missingAway as any[]) {
          const { data: impact } = await supabase
            .from("player_impact")
            .select("impact_score")
            .eq("player_id", player.player_id)
            .single();

          if (impact?.impact_score) {
            awayImpact += Number(impact.impact_score);
          }
        }
      }

      const injuryAdjustment = homeImpact - awayImpact;

      const finalGap =
        EFF_WEIGHT * efficiencyGap +
        ELO_WEIGHT * eloGap -
        injuryAdjustment;

      const homeWinProb = logistic(finalGap);

      const predictedWinner =
        homeWinProb >= 0.5 ? game.home_team : game.away_team;

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
            correct_prediction: null
          },
          { onConflict: "game_id" }
        );

      totalBuilt++;
    }

    return Response.json({
      message: "Today's predictions built successfully",
      totalBuilt
    });

  } catch (err: any) {
    return Response.json(
      { error: err?.message || "Prediction build failed" },
      { status: 500 }
    );
  }
}
