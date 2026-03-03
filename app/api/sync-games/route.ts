export const dynamic = "force-dynamic";

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  try {

    // 🔥 Replace with your real external API endpoint
    const response = await fetch("https://your-external-api.com/games");

    if (!response.ok) {
      throw new Error("Failed to fetch external games");
    }

    const externalGames = await response.json();

    if (!Array.isArray(externalGames)) {
      throw new Error("Invalid external games format");
    }

    let syncedCount = 0;

    for (const game of externalGames) {

      await supabase
        .from("games")
        .upsert(
          {
            id: game.id,
            game_date: game.game_date,
            home_team: game.home_team,
            away_team: game.away_team,
            home_score: game.home_score,
            away_score: game.away_score
          },
          {
            onConflict: "id"
          }
        );

      syncedCount++;
    }

    return Response.json({
      success: true,
      syncedCount
    });

  } catch (err: any) {
    return Response.json(
      { error: err?.message || "Sync failed" },
      { status: 500 }
    );
  }
}
