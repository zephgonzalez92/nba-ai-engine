import axios from "axios";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const API_KEY = process.env.BALLDONTLIE_API_KEY!;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url: string, options: any, retries = 5) {
  try {
    return await axios.get(url, options);
  } catch (err: any) {
    const status = err.response?.status;

    if (
      retries > 0 &&
      [429, 502, 503, 504].includes(status)
    ) {
      const retryAfter =
        Number(err.response?.headers?.["retry-after"]) || 4;

      console.log(
        `API error ${status}. Retrying in ${retryAfter}s... (${retries} retries left)`
      );

      await sleep(retryAfter * 1000);
      return fetchWithRetry(url, options, retries - 1);
    }

    throw err;
  }
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

    const season = Number(seasonParam);

    if (isNaN(season)) {
      return Response.json(
        { error: "Invalid season format" },
        { status: 400 }
      );
    }

    let cursor: string | undefined = undefined;
    let totalProcessed = 0;

    do {
      const response = await fetchWithRetry(
        "https://api.balldontlie.io/v1/games",
        {
          headers: {
            Authorization: API_KEY,
          },
          params: {
            season,
            per_page: 100,
            cursor,
          },
          timeout: 15000,
        }
      );

      const games = response?.data?.data ?? [];
      const meta = response?.data?.meta;

      if (games.length === 0) break;

      const formatted = games.map((g: any) => ({
        id: g.id,
        game_date: g.date,
        season,
        home_team: g.home_team.name,
        away_team: g.visitor_team.name,
        home_score: g.home_team_score,
        away_score: g.visitor_team_score,
      }));

      if (formatted.length > 0) {
        const { error } = await supabase
          .from("games")
          .upsert(formatted, { onConflict: "id" });

        if (error) throw new Error(error.message);

        totalProcessed += formatted.length;
      }

      cursor = meta?.next_cursor;

      await sleep(500); // slower = safer

    } while (cursor);

    return Response.json({
      status: `Season ${season} fully synced`,
      totalRecordsProcessed: totalProcessed,
    });

  } catch (error: any) {
    console.error("Sync Error:", error);

    return Response.json(
      { error: error?.message || "Unknown server error" },
      { status: 500 }
    );
  }
}
