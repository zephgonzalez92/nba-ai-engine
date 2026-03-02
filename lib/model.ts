export function logisticProbability(features: any) {
  const { elo_diff, off_diff, def_diff, pace, home } = features;

  const z =
    0.004 * elo_diff +
    0.08 * off_diff -
    0.07 * def_diff +
    0.01 * pace +
    0.15 * home;

  return 1 / (1 + Math.exp(-z));
}
