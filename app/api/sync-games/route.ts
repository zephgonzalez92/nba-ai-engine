import axios from "axios";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic"; // 🔥 VERY IMPORTANT FIX

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const API_KEY = process.env.BALLDONTLIE_API_KEY!;

const seasons = [2022, 2023, 2024, 2025];

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function GET() {
  try {
    let totalProcessed = 0;

    for (const season of seasons) {
      let page = 1;

      while (true) {
        let response;

        try {
          response = await axios.get(
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
        } catch (err: any) {
          if (err.response?.status === 429) {
            console.log("Rate limited. Waiting 2 seconds...");
            await sleep(2000);
            continue;
          }
          throw err;
        }

        const games = response.data.data;

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

        page++;

        await sleep(600);

        if (page > 30) break;
      }
    }

    return Response.json({
      status: "2022–2025 games fully synced (rate-limit safe)",
      totalRecordsProcessed: totalProcessed,
    });

  } catch (error: any) {
    return Response.json(
      { error: error.message },
      { status: 400 }
    );
  }
}
