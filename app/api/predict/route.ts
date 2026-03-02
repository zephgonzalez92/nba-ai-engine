import { createClient } from "@supabase/supabase-js";
import { logisticProbability } from "../../../../lib/model";
import { blendedProbability } from "../../../../lib/blend";

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
    const { home, away, features, marketProb } = body;

    if (!home || !away) {
      return Response.json({ error: "Missing teams" }, { status: 400 });
    }

    // 🔹 Get latest Elo ratings
    const { data: homeData } = await supabase
      .from("elo_ratings")
      .select("elo_before")
      .eq("team", home)
      .order("game_id", { ascending: false })
      .limit(1)
      .single();

    const { data: awayData } = await supabase
      .from("elo_ratings")
      .select("elo_before")
      .eq("team", away)
      .order("game_id", { ascending: false })
      .limit(1)
      .single();

    if (!homeData || !awayData) {
      return Response.json({ error: "Team not found" }, { status: 404 });
    }

    const homeElo = homeData.elo_before + HOME_ADV;
    const awayElo = awayData.elo_before;

    const eloProb = expectedScore(homeElo, awayElo);

    // 🔹 Logistic model probability
    const modelProb = features ? logisticProbability(features) : eloProb;

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
