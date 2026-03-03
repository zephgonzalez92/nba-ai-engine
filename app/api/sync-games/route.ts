export const dynamic = "force-dynamic";

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  try {

    // fetch games from external API here
    const externalGames = await fetchExternalGames(); // your existing fetch logic

    for (const game of externalGames) {

      // 🔒 DO NOT INCLUDE ratings_processed
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

    }

    return Response.json({ success: true });

  } catch (err: any) {
    return Response.json(
      { error: err?.message || "Sync failed" },
      { status: 500 }
    );
  }
}
