import axios from "axios";
import { supabase } from "../../../lib/supabase";

export async function GET() {
  try {
    const seasons = [2022, 2023, 2024, 2025];

    for (const season of seasons) {
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const res = await axios.get(
          "https://api.balldontlie.io/v1/games",
          {
            params: {
              seasons: season,
              per_page: 100,
              page: page,
            },
            headers: {
              Authorization: process.env.BALLDONTLIE_API_KEY || ""
            }
          }
        );

        const games = res.data.data;

        for (const game of games) {
          if (
            game.home_team_score === null ||
            game.visitor_team_score === null
          )
            continue;

          await supabase.from("games").upsert({
            id: game.id,
            game_date: game.date,
            season: season,
            home_team: game.home_team.full_name,
            away_team: game.visitor_team.full_name,
            home_score: game.home_team_score,
            away_score: game.visitor_team_score,
          });
        }

        hasMore = res.data.meta?.next_page !== null;
        page++;
      }
    }

    return Response.json({ status: "Historical games synced" });
  } catch (error: any) {
    return Response.json({ error: error.message });
  }
}
