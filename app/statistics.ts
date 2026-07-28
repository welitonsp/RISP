const logFactorialCache: number[] = [0, 0];
function logFactorial(n: number): number {
  if (n < 0) throw new Error(`logFactorial recebeu valor negativo: ${n}`);
  for (let i = logFactorialCache.length; i <= n; i += 1) {
    logFactorialCache.push(logFactorialCache[i - 1] + Math.log(i));
  }
  return logFactorialCache[n];
}

export function poissonComparisonPValue(previous: number, current: number): number | null {
  const n = previous + current;
  if (n === 0) return null;
  const logChoose = (k: number) => logFactorial(n) - logFactorial(k) - logFactorial(n - k);
  const pk = (k: number) => Math.exp(logChoose(k) + n * Math.log(0.5));
  const observed = pk(current) * (1 + 1e-7);
  let total = 0;
  for (let k = 0; k <= n; k += 1) {
    const value = pk(k);
    if (value <= observed) total += value;
  }
  return Math.min(1, total);
}

export type VariationLevel = "baixo-volume" | "significativo" | "observar" | "sem-diferenca";
export type VariationDirection = "alta" | "queda" | "estavel";

export type VariationClassification = {
  level: VariationLevel;
  direction: VariationDirection;
  pValue: number | null;
};

export function classifyVariation(
  previous: number,
  current: number,
  options: { alpha?: number; minVolume?: number; bonferroniN?: number } = {},
): VariationClassification {
  const alpha = options.alpha ?? 0.05;
  const minVolume = options.minVolume ?? 10;
  const bonferroniN = options.bonferroniN ?? 1;
  const direction: VariationDirection =
    current > previous ? "alta" : current < previous ? "queda" : "estavel";
  const pValue = poissonComparisonPValue(previous, current);
  if (previous + current < minVolume) {
    return { level: "baixo-volume", direction, pValue };
  }
  if (pValue !== null && pValue < alpha / bonferroniN) {
    return { level: "significativo", direction, pValue };
  }
  if (pValue !== null && pValue < alpha) {
    return { level: "observar", direction, pValue };
  }
  return { level: "sem-diferenca", direction, pValue };
}
