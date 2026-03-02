
const K = 20;
const HOME_ADV = 100;

export function expectedScore(ratingA: number, ratingB: number) {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

export function updateElo(homeRating: number, awayRating: number, homeWon: boolean) {
  const homeExp = expectedScore(homeRating + HOME_ADV, awayRating);
  const homeScore = homeWon ? 1 : 0;

  const newHome = homeRating + K * (homeScore - homeExp);
  const newAway = awayRating + K * ((1 - homeScore) - (1 - homeExp));

  return { newHome, newAway };
}
