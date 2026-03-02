import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const START_ELO = 1500;
const K = 20;
const HOME_ADV = 100;

function expectedScore(eloA: number, eloB: number) {
  return 1 / (1 + Math.pow(10, (eloB - eloA) / 400));
}

export async function GET() {
  try {
    // Clear previous Elo ratings
    await supabase.from("elo_ratings").delete().neq("game_id", 0);

    // Get completed games for specific season only
const { data: games, error } = await supabase
  .from("games")
  .select("*")
  .eq("season", 2025)        // ← THIS LINE IS THE SEASON GUARD
  .gt("home_score", 0)       // only completed games
  .gt("away_score", 0)
  .order("game_date", { ascending: true });

    if (error) throw error;

    const ratings: Record<string, number> = {};

    for (const game of games!) {
      const home = game.home_team;
      const away = game.away_team;

      if (!ratings[home]) ratings[home] = START_ELO;
      if (!ratings[away]) ratings[away] = START_ELO;

      const homeElo = ratings[home];
      const awayElo = ratings[away];

      // Store pre-game Elo
      await supabase.from("elo_ratings").insert([
        { game_id: game.id, team: home, elo_before: homeElo },
        { game_id: game.id, team: away, elo_before: awayElo }
      ]);

      const homeExpected = expectedScore(homeElo + HOME_ADV, awayElo);
      const awayExpected = expectedScore(awayElo, homeElo + HOME_ADV);

      const homeWon = game.home_score > game.away_score ? 1 : 0;
      const awayWon = homeWon === 1 ? 0 : 1;

      ratings[home] = homeElo + K * (homeWon - homeExpected);
      ratings[away] = awayElo + K * (awayWon - awayExpected);
    }

    return Response.json({ status: "Elo ratings built successfully" });
  } catch (err: any) {
    return Response.json({ error: err.message });
  }
}
