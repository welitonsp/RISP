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
    .sort((a, b) => b.count - a.count);
  const total = records.length;
  const top5 = rows.slice(0, 5).reduce((sum, row) => sum + row.count, 0);
  return { rows, distinct: rows.length, cr5: total === 0 ? 0 : top5 / total };
}

const HOUR_BUCKETS = ["00–04h", "04–08h", "08–12h", "12–16h", "16–20h", "20–24h"];
const WEEKDAY_LABELS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

export type WeekHourMatrix = { cells: number[][]; max: number; total: number; semHora: number };

export function weekHourMatrix(records: { date: string; time: string | null }[]): WeekHourMatrix {
  const cells: number[][] = Array.from({ length: 7 }, () => Array(6).fill(0));
  let semHora = 0;
  let total = 0;
  for (const record of records) {
    if (record.time === null) { semHora += 1; continue; }
    const [year, month, day] = record.date.split("-").map(Number);
    const weekday = new Date(year, month - 1, day).getDay();
    const [hourStr] = record.time.split(":");
    const hour = Number(hourStr);
    const bucket = Math.min(5, Math.floor(hour / 4));
    cells[weekday][bucket] += 1;
    total += 1;
  }
  const max = Math.max(0, ...cells.flat());
  return { cells, max, total, semHora };
}

export function ratePer100k(count: number, population: number): number | null {
  return population > 0 ? (count / population) * 100000 : null;
}

export { HOUR_BUCKETS, WEEKDAY_LABELS };
