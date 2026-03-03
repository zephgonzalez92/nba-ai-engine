export const dynamic = "force-dynamic";

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const BALLDONTLIE_KEY = process.env.BALLDONTLIE_API_KEY!;

export async function GET() {
  try {
    const res = await fetch(
      "https://api.balldontlie.io/v1/player_injuries",
      {
        headers: {
          Authorization: BALLDONTLIE_KEY,
        },
      }
    );

    const data = await res.json();

    if (!data.data) {
      return Response.json({ message: "No injury data found" });
    }

    for (const player of data.data) {
      await supabase.from("player_status").upsert({
        player_id: player.player.id,
        team: player.player.team.full_name,
        status: player.status,
        game_date: new Date().toISOString().split("T")[0],
      });
    }

    return Response.json({
      message: "Player status updated",
      count: data.data.length,
    });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
