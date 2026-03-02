export function blendedProbability(modelProb: number, eloProb: number, marketProb: number) {
  return 0.5 * modelProb + 0.3 * eloProb + 0.2 * marketProb;
}
