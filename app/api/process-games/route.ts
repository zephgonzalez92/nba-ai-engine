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

const BATCH_SIZE = 300;

export async function GET() {
  try {
    let processedCount = 0;
    let failedUpdates: number[] = [];

    const { data: games, error } = await supabase
      .from("games")
      .select("*")
      .eq("ratings_processed", false)
      .not("home_score", "is", null)
      .not("away_score", "is", null)
      .gt("home_score", 0)
      .gt("away_score", 0)
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
      const { data: updateData, error: updateError } = await supabase
        .from("games")
        .update({ ratings_processed: true })
        .eq("id", game.id)
        .select("id");

      if (updateError || !updateData || updateData.length === 0) {
        console.log("UPDATE FAILED:", game.id, updateError);
        failedUpdates.push(game.id);
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
      message: "Strict processing complete",
      processedCount,
      remainingCompletedGames: count ?? 0,
      failedUpdates,
    });

  } catch (err: any) {
    return Response.json(
      { error: err?.message || "Processing failed" },
      { status: 500 }
    );
  }
}
