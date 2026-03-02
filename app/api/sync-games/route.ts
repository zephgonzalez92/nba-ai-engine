import axios from "axios";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const API_KEY = process.env.BALLDONTLIE_API_KEY!;

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const seasonParam = searchParams.get("season");

    if (!seasonParam) {
      return Response.json(
        { error: "Missing ?season=YYYY parameter" },
        { status: 400 }
      );
    }

    const season = parseInt(seasonParam);
    let page = 1;
    let totalProcessed = 0;

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
        // Handle rate limit safely
        if (err.response?.status === 429) {
          console.log("Rate limited. Waiting 1 second...");
          await sleep(1000);
          continue;
        }
        throw err;
      }

      const games = response.data.data;

      // No more pages
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

      // Light throttle (safe for 60 req/min tier)
      await sleep(300);

      // Safety guard (NBA season normally < 20 pages)
      if (page > 40) break;
    }

    return Response.json({
      status: `Season ${season} fully synced`,
      totalRecordsProcessed: totalProcessed,
    });

  } catch (error: any) {
    return Response.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
