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

export async function GET() {
  try {
    // Get completed games that have scores
    const { data: games, error } = await supabase
      .from("games")
      .select("*")
      .not("home_score", "is", null)
      .not("away_score", "is", null)
      .gt("home_score", 0)
      .gt("away_score", 0);

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    let updated = 0;

    for (const game of games || []) {
      const actualWinner =
        game.home_score > game.away_score
          ? game.home_team
          : game.away_team;

      const { data: prediction } = await supabase
        .from("predictions")
        .select("*")
        .eq("game_id", game.id)
        .single();

      if (!prediction) continue;

      const correct =
        prediction.predicted_winner === actualWinner;

      const { error: updateError } = await supabase
        .from("predictions")
        .update({ correct_prediction: correct })
        .eq("game_id", game.id);

      if (!updateError) updated++;
    }

    return Response.json({
      message: "Results updated successfully",
      updated
    });

  } catch (err: any) {
    return Response.json(
      { error: err?.message || "Update failed" },
      { status: 500 }
    );
  }
}
