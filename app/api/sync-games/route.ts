import axios from "axios";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const API_KEY = process.env.BALLDONTLIE_API_KEY!;

const seasons = [2022, 2023, 2024, 2025];

export async function GET() {
  try {
    let totalProcessed = 0;

    for (const season of seasons) {
      let page = 1;

      while (true) {
        const response = await axios.get(
          "https://api.balldontlie.io/v1/games",
          {
            headers: {
              Authorization: API_KEY,
            },
            params: {
              seasons: [season],
              per_page: 100,
              page: page,
            },
          }
        );

        const games = response.data.data;

        // 🔥 If no games returned, we reached the end
        if (!games || games.length === 0) {
          break;
        }

        const formatted = games
          .filter((g: any) => g.home_team && g.visitor_team)
          .map((g: any) => ({
            id: g.id,
            game_date: g.date,
            season: season,
            home_team: g.home_team.name,
            away_team: g.visitor_team.name,
            home_score: g.home_team_score,
            away_score: g.visitor_team_score,
          }));

        const { error } = await supabase
          .from("games")
          .upsert(formatted, { onConflict: "id" });

        if (error) {
          throw new Error(error.message);
        }

        totalProcessed += formatted.length;

        // 🔥 Move to next page
        page++;

        // 🔒 Safety stop (NBA seasons ~13 pages max)
        if (page > 30) break;
      }
    }

    return Response.json({
      status: "2022–2025 games fully synced with robust pagination",
      totalRecordsProcessed: totalProcessed,
    });

  } catch (error: any) {
    return Response.json(
      { error: error.message },
      { status: 400 }
    );
  }
}
