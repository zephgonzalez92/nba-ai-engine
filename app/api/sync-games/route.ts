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
      const response = await axios.get(
        "https://api.balldontlie.io/v1/games",
        {
          headers: {
            Authorization: API_KEY,
          },
          params: {
            seasons: [season],
            per_page: 100, // limited batch to avoid rate limits
          },
        }
      );

      const games = response.data.data;

      const formatted = games.map((g: any) => ({
        id: g.id,
        game_date: g.date,
        season: season,
        home_team: g.home_team.full_name,
        away_team: g.away_team.full_name,
        home_score: g.home_team_score,
        away_score: g.visitor_team_score,
      }));

      await supabase.from("games").upsert(formatted);
    }

    return Response.json({
      status: "2022–2025 games synced (limited batch)"
    });

  } catch (error: any) {
    return Response.json(
      { error: error.message },
      { status: 400 }
    );
  }
}
