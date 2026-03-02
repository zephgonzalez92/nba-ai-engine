// 🔥 Temperature calibration parameter
const TEMPERATURE = 1.3;

export function logisticProbability(features: any) {
  const { elo_diff, off_diff, def_diff, pace, home } = features;

  const z =
    0.004 * elo_diff +
    0.05 * off_diff -   // ⬅ reduced from 0.08
    0.05 * def_diff +   // ⬅ reduced from 0.07
    0.01 * pace +
    0.15 * home;

  // 🔥 Apply temperature scaling
  const scaledZ = z / TEMPERATURE;

  return 1 / (1 + Math.exp(-scaledZ));
}
