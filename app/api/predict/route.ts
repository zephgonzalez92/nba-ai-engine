import { createClient } from "@supabase/supabase-js";
import { logisticProbability } from "@/lib/model";
import { blendedProbability } from "@/lib/blend";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const HOME_ADV = 100;

function expectedScore(eloA: number, eloB: number) {
  return 1 / (1 + Math.pow(10, (eloB - eloA) / 400));
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { home, away, marketProb } = body;

    if (!home || !away) {
      return Response.json({ error: "Missing teams" }, { status: 400 });
    }

    // 🔹 Get latest Elo ratings
    const { data: homeEloData } = await supabase
      .from("elo_ratings")
      .select("elo_before")
      .eq("team", home)
      .order("game_id", { ascending: false })
      .limit(1)
      .single();

    const { data: awayEloData } = await supabase
      .from("elo_ratings")
      .select("elo_before")
      .eq("team", away)
      .order("game_id", { ascending: false })
      .limit(1)
      .single();

    if (!homeEloData || !awayEloData) {
      return Response.json({ error: "Elo data not found" }, { status: 404 });
    }

    const homeElo = homeEloData.elo_before + HOME_ADV;
    const awayElo = awayEloData.elo_before;

    const eloProb = expectedScore(homeElo, awayElo);

    // 🔹 Get team stats from teams table
    const { data: homeTeam } = await supabase
      .from("teams")
      .select("*")
      .eq("name", home)
      .single();

    const { data: awayTeam } = await supabase
      .from("teams")
      .select("*")
      .eq("name", away)
      .single();

    if (!homeTeam || !awayTeam) {
      return Response.json({ error: "Team stats not found" }, { status: 404 });
    }

    // 🔹 Build model features automatically
    const features = {
      elo_diff: homeElo - awayElo,
      off_diff: homeTeam.off_rating - awayTeam.off_rating,
      def_diff: homeTeam.def_rating - awayTeam.def_rating,
      pace: homeTeam.pace - awayTeam.pace,
      home: 1
    };

    const modelProb = logisticProbability(features);

    // 🔹 Blend everything
    const finalProb = blendedProbability(
      modelProb,
      eloProb,
      marketProb ?? eloProb
    );

    return Response.json({
      home,
      away,
      eloProb: Number(eloProb.toFixed(4)),
      modelProb: Number(modelProb.toFixed(4)),
      finalProb: Number(finalProb.toFixed(4))
    });

  } catch (err) {
    return Response.json({ error: "Prediction failed" }, { status: 500 });
  }
}
