import axios from "axios";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const API_KEY = process.env.BALLDONTLIE_API_KEY;

const seasons = [2022, 2023, 2024, 2025];

export async function GET() {
  try {
    for (const season of seasons) {
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const response = await axios.get(
          "https://api.balldontlie.io/v1/games",
          {
            headers: {
              Authorization: API_KEY!,
            },
            params: {
              seasons: [season],
              per_page: 100,
              page: page,
            },
          }
        );

        const games = response.data.data;
        const meta = response.data.meta;

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

        await supabase.from("games").upsert(formatted);

        if (meta?.next_page) {
          page = meta.next_page;
        } else {
          hasMore = false;
        }
      }
    }

    return Response.json({
      status: "2022–2025 games fully synced with pagination"
    });

  } catch (error: any) {
    return Response.json(
      { error: error.message },
      { status: 400 }
    );
  }
}
