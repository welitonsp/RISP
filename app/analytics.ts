import { classifyVariation } from "./statistics";

export type NeighborhoodRow = { municipality: string; neighborhood: string; count: number; rural: boolean };
export type NeighborhoodRanking = { rows: NeighborhoodRow[]; distinct: number; cr5: number };

export function rankNeighborhoods(records: { municipality: string; neighborhood: string }[]): NeighborhoodRanking {
  const counts = new Map<string, { municipality: string; neighborhood: string; count: number }>();
  for (const record of records) {
    const key = `${record.municipality}\u0000${record.neighborhood}`;
    const entry = counts.get(key) ?? { municipality: record.municipality, neighborhood: record.neighborhood, count: 0 };
    entry.count += 1;
    counts.set(key, entry);
  }
  const rows = [...counts.values()]
    .map((entry) => ({ ...entry, rural: entry.neighborhood === "ZONA RURAL" }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      const neighborhoodDiff = a.neighborhood.localeCompare(b.neighborhood, "pt-BR");
      if (neighborhoodDiff !== 0) return neighborhoodDiff;
      return a.municipality.localeCompare(b.municipality, "pt-BR");
    });
  const total = records.length;
  const top5 = rows.slice(0, 5).reduce((sum, row) => sum + row.count, 0);
  return { rows, distinct: rows.length, cr5: total === 0 ? 0 : top5 / total };
}

const HOUR_BUCKETS = ["00–04h", "04–08h", "08–12h", "12–16h", "16–20h", "20–24h"];
const WEEKDAY_LABELS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

export type WeekHourMatrix = {
  cells: number[][];
  max: number;
  total: number;
  semHora: number;
  ambiguousMidnight: number;
};

export function weekHourMatrix(records: { date: string; time: string | null }[]): WeekHourMatrix {
  const cells: number[][] = Array.from({ length: 7 }, () => Array(6).fill(0));
  let semHora = 0;
  let ambiguousMidnight = 0;
  let total = 0;
  for (const record of records) {
    if (record.time === null) { semHora += 1; continue; }
    // A fonte grava o texto literal "00:00" tanto para meia-noite real quanto para
    // hora não informada — foi verificado no arquivo de origem que a coluna HORA_FATO
    // nunca vem em branco. Não há como separar os dois casos aqui, então estes
    // registros CONTINUAM na matriz e são apenas contados, para que o painel possa
    // declarar quanto da faixa 00–04h é incerto. Não transforme isto num descarte
    // silencioso: jogaria fora meia-noite verdadeira sem o usuário saber.
    if (record.time === "00:00") ambiguousMidnight += 1;
    const [year, month, day] = record.date.split("-").map(Number);
    const weekday = new Date(year, month - 1, day).getDay();
    const [hourStr] = record.time.split(":");
    const hour = Number(hourStr);
    const bucket = Math.min(5, Math.floor(hour / 4));
    cells[weekday][bucket] += 1;
    total += 1;
  }
  const max = Math.max(0, ...cells.flat());
  return { cells, max, total, semHora, ambiguousMidnight };
}

export function ratePer100k(count: number, population: number): number | null {
  return population > 0 ? (count / population) * 100000 : null;
}

export { HOUR_BUCKETS, WEEKDAY_LABELS };

const KNOWN_ACRONYMS = new Set(["CVLI", "BPTUR", "SSP", "RAI", "CIPM", "BPM"]);

export function titleCase(value: string) {
  return value
    .split(/(\s+)/)
    .map((token) => {
      const bareLetters = token.replace(/[^\p{L}]/gu, "").toLocaleUpperCase("pt-BR");
      if (KNOWN_ACRONYMS.has(bareLetters)) {
        return token.toLocaleUpperCase("pt-BR");
      }
      return token
        .toLocaleLowerCase("pt-BR")
        .replace(/(^|\s)\p{L}/gu, (letter) => letter.toLocaleUpperCase("pt-BR"));
    })
    .join("");
}

const pctFormatter = new Intl.NumberFormat("pt-BR", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const numFormatter = new Intl.NumberFormat("pt-BR");

function formatSignedPercent(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${pctFormatter.format(value)}`;
}

export type ExecutiveSummaryComparisonItem = { nature: string; previous: number; current: number };

export type ExecutiveSummary = {
  maiorAlta: string;
  maiorQueda: string;
  bairroCritico: string;
  faixaCritica: string;
  concentracaoTerritorial: string;
};

function compareNatureItems(
  a: { nature: string; variation: number; delta: number },
  b: { nature: string; variation: number; delta: number },
  direction: "alta" | "queda",
  useAbsoluteDelta: boolean,
): number {
  // `useAbsoluteDelta` é decidido uma única vez para todo o conjunto de candidatos
  // (ver summarizeNatureExtreme), nunca por par. Isso garante ordem total: o mesmo
  // critério vale para toda combinação de itens, então o resultado não depende da
  // ordem de entrada nem pode ser intransitivo.
  //
  // Quando qualquer item do conjunto "partiu de zero" (variation = Infinity), a
  // variação percentual deixa de ser comparável entre si — o conjunto inteiro passa
  // a ser ordenado por delta absoluto, para que um salto pequeno em números
  // absolutos (ex.: 0 -> 10) não vença artificialmente uma alta grande em base maior
  // (ex.: 100 -> 300) só por ter percentual infinito.
  if (!useAbsoluteDelta && a.variation !== b.variation) {
    return direction === "alta" ? b.variation - a.variation : a.variation - b.variation;
  }
  const absDeltaDiff = Math.abs(b.delta) - Math.abs(a.delta);
  if (absDeltaDiff !== 0) return absDeltaDiff;
  return a.nature.localeCompare(b.nature, "pt-BR");
}

function summarizeNatureExtreme(
  comparison: ExecutiveSummaryComparisonItem[],
  direction: "alta" | "queda",
  bonferroniN: number,
  comparisonApplicable: boolean,
): string {
  const label = direction === "alta" ? "Maior alta" : "Maior queda";

  if (!comparisonApplicable) {
    return `${label}: comparação com o período anterior não está disponível neste recorte — o arquivo comparativo não traz município, unidade ou datas detalhadas, e por isso essa coluna aparece somente na visão regional completa.`;
  }

  const candidates = comparison
    .map((item) => ({
      nature: item.nature,
      previous: item.previous,
      current: item.current,
      delta: item.current - item.previous,
      variation: item.previous === 0 ? Infinity : (item.current - item.previous) / item.previous,
      classification: classifyVariation(item.previous, item.current, { bonferroniN }),
    }))
    .filter((item) => item.classification.level === "significativo" && item.classification.direction === direction);

  if (candidates.length === 0) {
    return direction === "alta"
      ? "Nenhuma natureza apresentou alta estatisticamente sustentada — as variações do período estão dentro da flutuação esperada."
      : "Nenhuma natureza apresentou queda estatisticamente sustentada — as variações do período estão dentro da flutuação esperada.";
  }

  const useAbsoluteDelta = candidates.some((item) => item.variation === Infinity);
  candidates.sort((a, b) => compareNatureItems(a, b, direction, useAbsoluteDelta));
  const winner = candidates[0];

  if (winner.variation === Infinity) {
    return `${label} estatisticamente sustentada: ${titleCase(winner.nature)}, que partiu de zero e chegou a ${numFormatter.format(
      winner.current,
    )} registros frente ao período anterior — sem variação percentual interpretável, por não haver base de comparação.`;
  }

  return `${label} estatisticamente sustentada: ${titleCase(winner.nature)}, com variação de ${formatSignedPercent(
    winner.variation,
  )} (de ${numFormatter.format(winner.previous)} para ${numFormatter.format(
    winner.current,
  )} registros) frente ao período anterior.`;
}

function summarizeCriticalNeighborhood(rows: NeighborhoodRow[]): string {
  // `rows` já vem ordenado por rankNeighborhoods (count desc, com o mesmo desempate
  // determinístico por bairro/município) — o primeiro elegível aqui é sempre o mesmo
  // bairro que aparece na posição 01 do ranking exibido no painel.
  const top = rows.find((row) => row.count >= 5);
  if (!top) {
    return "Nenhum bairro concentra volume suficiente para destaque no recorte.";
  }
  return `Bairro mais crítico: ${titleCase(top.neighborhood)}, em ${titleCase(top.municipality)}, com ${numFormatter.format(
    top.count,
  )} registros no período.`;
}

function summarizeCriticalTimeslot(cells: number[][]): string {
  let best: { day: number; hour: number; count: number } | null = null;
  for (let day = 0; day < cells.length; day += 1) {
    for (let hour = 0; hour < cells[day].length; hour += 1) {
      const count = cells[day][hour];
      if (count < 5) continue;
      // A iteração percorre dia e hora em ordem crescente, então em caso de empate o
      // primeiro encontrado já é o de menor (dia, hora) — não há necessidade (nem
      // possibilidade) de um candidato posterior vencer um empate por essa ordenação.
      if (best === null || count > best.count) {
        best = { day, hour, count };
      }
    }
  }
  if (best) {
    return `Faixa mais crítica: ${WEEKDAY_LABELS[best.day]}, ${HOUR_BUCKETS[best.hour]}, com ${numFormatter.format(
      best.count,
    )} registros no período.`;
  }

  const bucketTotals = HOUR_BUCKETS.map((_, hour) => cells.reduce((sum, dayCells) => sum + dayCells[hour], 0));
  let bestHour = 0;
  for (let hour = 1; hour < bucketTotals.length; hour += 1) {
    if (bucketTotals[hour] > bucketTotals[bestHour]) bestHour = hour;
  }
  return `Nenhuma combinação específica de dia e horário reuniu volume suficiente para destaque; agregando os sete dias da semana, a faixa de horário com mais registros é ${HOUR_BUCKETS[bestHour]}, com ${numFormatter.format(
    bucketTotals[bestHour],
  )} registros no período.`;
}

function summarizeTerritorialConcentration(ranking: NeighborhoodRanking): string {
  // Consome `cr5` e `distinct` diretamente de rankNeighborhoods (fonte única do
  // indicador), em vez de recalcular a partir de `rows` — evita duas implementações
  // divergentes do mesmo número.
  const { rows, distinct, cr5 } = ranking;
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  if (total <= 0) {
    return "Concentração territorial: não há registros no recorte para calcular a concentração territorial.";
  }

  // Enquadramento operacional (o que o número significa para o emprego de
  // patrulhamento) — a nota de metodologia ao lado do ranking de bairros mantém o
  // enquadramento metodológico (como o índice é calculado), evitando redação
  // duplicada dos mesmos fatos.
  const topN = Math.min(5, distinct);
  const topLabel = topN === 1 ? "no bairro mais frequente" : `nos ${topN} bairros mais frequentes`;
  const distinctLabel = distinct === 1 ? "1 bairro" : `${numFormatter.format(distinct)} bairros`;

  let text = `Concentração territorial: ${pctFormatter.format(
    cr5,
  )} dos registros do recorte estão concentrados ${topLabel}, entre ${distinctLabel} identificados no período.`;

  if (cr5 >= 0.5) {
    text +=
      " Esforço de patrulhamento pode ser priorizado nesse conjunto reduzido de áreas, com potencial de maior retorno por viatura empenhada.";
  } else {
    text += " A ocorrência está pulverizada pelo recorte, o que recomenda cobertura mais distribuída em vez de reforço pontual.";
  }

  return text;
}

export function executiveSummary(input: {
  comparison: ExecutiveSummaryComparisonItem[];
  /**
   * Se o comparativo com o período anterior é aplicável ao recorte atual. O arquivo
   * comparativo só traz totais regionais do período completo, então recortes por
   * unidade, município ou datas não têm base de comparação (ver banner do painel).
   * Default true para preservar o comportamento de chamadas que já fornecem um
   * `comparison` que sabidamente se aplica ao recorte.
   */
  comparisonApplicable?: boolean;
  bonferroniN?: number;
  /**
   * Ranking de bairros, produzido por `rankNeighborhoods` — fonte única para
   * bairro crítico e concentração territorial (CR5/distintos), evitando que o
   * sumário reimplemente esses indicadores por conta própria.
   */
  neighborhoodRanking: NeighborhoodRanking;
  hourCells: number[][];
}): ExecutiveSummary {
  const comparisonApplicable = input.comparisonApplicable ?? true;
  const bonferroniN = input.bonferroniN ?? Math.max(1, input.comparison.length);
  return {
    maiorAlta: summarizeNatureExtreme(input.comparison, "alta", bonferroniN, comparisonApplicable),
    maiorQueda: summarizeNatureExtreme(input.comparison, "queda", bonferroniN, comparisonApplicable),
    bairroCritico: summarizeCriticalNeighborhood(input.neighborhoodRanking.rows),
    faixaCritica: summarizeCriticalTimeslot(input.hourCells),
    concentracaoTerritorial: summarizeTerritorialConcentration(input.neighborhoodRanking),
  };
}
