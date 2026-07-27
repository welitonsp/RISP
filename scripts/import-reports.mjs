import * as XLSX from "xlsx";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const EXPECTED_NATURES = [
  "HOMICÍDIO DOLOSO",
  "FEMINICÍDIO",
  "ESTUPRO",
  "LATROCÍNIO",
  "LESÃO SEGUIDA DE MORTE",
  "ROUBO A TRANSEUNTE",
  "ROUBO DE VEÍCULOS",
  "ROUBO EM COMÉRCIO",
  "ROUBO EM RESIDÊNCIA",
  "ROUBO DE CARGA",
  "ROUBO A INSTITUIÇÃO FINANCEIRA",
  "FURTO DE VEÍCULOS",
  "FURTO EM COMÉRCIO",
  "FURTO EM RESIDÊNCIA",
  "FURTO A TRANSEUNTE",
];

const TERRITORIAL_UNITS = {
  BPTUR: ["CALDAS NOVAS", "RIO QUENTE", "MARZAGÃO", "CORUMBAÍBA"],
  "36º BPM": ["MORRINHOS", "PONTALINA", "MAIRIPOTABA", "CROMÍNIA"],
  "6ª CIPM": ["PIRACANJUBA", "PROFESSOR JAMIL", "CRISTIANÓPOLIS"],
};

function folded(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

const natureByFolded = new Map(EXPECTED_NATURES.map((value) => [folded(value), value]));
const municipalities = Object.values(TERRITORIAL_UNITS).flat();
const municipalityByFolded = new Map(municipalities.map((value) => [folded(value), value]));
const unitByMunicipality = new Map(
  Object.entries(TERRITORIAL_UNITS).flatMap(([unit, cities]) =>
    cities.map((city) => [city, unit]),
  ),
);

function headersOf(rows) {
  return (rows[0] ?? []).map((value) => String(value ?? "").trim());
}

function detectType(headers) {
  const set = new Set(headers.filter(Boolean));
  if (set.has("ID_RAI") && set.has("GRUPO_REATIVAS") && set.has("MUNICIPIO_NOME")) {
    return "detail";
  }
  if (set.has("DESC") && set.has("ANTERIOR") && set.has("ATUAL")) {
    return "comparison";
  }
  return null;
}

function rowObject(row, headers) {
  const object = {};
  for (let column = 0; column < headers.length; column += 1) {
    if (headers[column]) object[headers[column]] = row[column];
  }
  return object;
}

function parseDate(value) {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  const match = String(value ?? "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
}

function parseTime(value) {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) {
    return `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`;
  }
  const match = String(value ?? "").trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return "00:00";
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

function numberValue(value, label) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`Valor inválido em ${label}: ${value}`);
  return parsed;
}

async function readWorkbook(filePath) {
  const workbook = XLSX.read(await readFile(filePath), { cellDates: true });
  const sheet = workbook.Sheets.Export ?? workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: true,
    defval: null,
    blankrows: true,
  });
  if (!rows.length) throw new Error(`Arquivo sem dados: ${filePath}`);
  const headers = headersOf(rows);
  const type = detectType(headers);
  if (!type) {
    throw new Error(
      `Layout não reconhecido em ${path.basename(filePath)}. Cabeçalhos encontrados: ${headers.filter(Boolean).join(", ")}`,
    );
  }
  return { filePath, rows, headers, type };
}

function parseDetail(source) {
  const records = [];
  const warnings = [];
  const factMap = new Map();

  for (let rowNumber = 2; rowNumber <= source.rows.length; rowNumber += 1) {
    const row = rowObject(source.rows[rowNumber - 1], source.headers);
    const rawId = row.ID_RAI;
    const rawNature = row.GRUPO_REATIVAS;
    const rawMunicipality = row.MUNICIPIO_NOME;
    const date = parseDate(row.DATA_FATO);

    if (!rawId && !rawNature && !rawMunicipality && !date) continue;
    if (String(rawId ?? "").startsWith("Filtros aplicados:")) continue;
    if (!rawId || !rawNature || !rawMunicipality || !date) {
      warnings.push(`Linha ${rowNumber} ignorada por não ser um registro completo.`);
      continue;
    }

    const nature = natureByFolded.get(folded(rawNature));
    const municipality = municipalityByFolded.get(folded(rawMunicipality));
    if (!nature) throw new Error(`Natureza não reconhecida na linha ${rowNumber}: ${rawNature}`);
    if (!municipality) {
      throw new Error(`Município fora da 19ª RISP na linha ${rowNumber}: ${rawMunicipality}`);
    }

    const idKey = String(rawId);
    if (!factMap.has(idKey)) {
      factMap.set(idKey, `F${String(factMap.size + 1).padStart(6, "0")}`);
    }

    records.push({
      date,
      time: parseTime(row.HORA_FATO),
      factId: factMap.get(idKey),
      nature,
      municipality,
      neighborhood: String(row.BAIRRO ?? "BAIRRO NÃO INFORMADO").trim().toUpperCase(),
      territorialUnit: unitByMunicipality.get(municipality),
    });
  }

  if (!records.length) throw new Error("O relatório detalhado não contém registros válidos.");
  records.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
  return { records, warnings };
}

function parseComparison(source) {
  const entries = [];
  for (let rowNumber = 2; rowNumber <= source.rows.length; rowNumber += 1) {
    const row = rowObject(source.rows[rowNumber - 1], source.headers);
    if (!row.DESC || !Number.isFinite(Number(row.ID))) continue;
    const nature = natureByFolded.get(folded(row.DESC));
    if (!nature) throw new Error(`Natureza comparativa não reconhecida na linha ${rowNumber}: ${row.DESC}`);
    const previous = numberValue(row.ANTERIOR, `ANTERIOR, linha ${rowNumber}`);
    const current = numberValue(row.ATUAL, `ATUAL, linha ${rowNumber}`);
    entries.push({
      id: Number(row.ID),
      nature,
      previous,
      current,
      variation: previous === 0 ? (current === 0 ? 0 : null) : (current - previous) / previous,
    });
  }
  entries.sort((a, b) => a.id - b.id);
  if (entries.length !== EXPECTED_NATURES.length) {
    throw new Error(`O comparativo deve conter ${EXPECTED_NATURES.length} naturezas; foram encontradas ${entries.length}.`);
  }
  return entries;
}

const inputPaths = process.argv.slice(2).map((value) => path.resolve(value));
if (inputPaths.length !== 2) {
  throw new Error('Uso: npm run atualizar -- "caminho-do-arquivo-1.xlsx" "caminho-do-arquivo-2.xlsx"');
}

const loaded = await Promise.all(inputPaths.map(readWorkbook));
const detailSource = loaded.find((item) => item.type === "detail");
const comparisonSource = loaded.find((item) => item.type === "comparison");
if (!detailSource || !comparisonSource) {
  throw new Error("Forneça um relatório detalhado e um relatório comparativo.");
}

const detail = parseDetail(detailSource);
const comparison = parseComparison(comparisonSource);
const comparisonCurrent = comparison.reduce((sum, item) => sum + item.current, 0);
if (comparisonCurrent !== detail.records.length) {
  throw new Error(
    `Os relatórios não conferem: o detalhado possui ${detail.records.length} registros e o comparativo informa ${comparisonCurrent}.`,
  );
}

const uniqueFacts = new Set(detail.records.map((record) => record.factId)).size;
const dates = detail.records.map((record) => record.date);
const previousTotal = comparison.reduce((sum, item) => sum + item.previous, 0);
const currentTotal = comparison.reduce((sum, item) => sum + item.current, 0);

const output = {
  schemaVersion: 1,
  metadata: {
    generatedAt: new Date().toISOString(),
    sourceFiles: [path.basename(detailSource.filePath), path.basename(comparisonSource.filePath)],
    periodStart: dates[0],
    periodEnd: dates.at(-1),
    records: detail.records.length,
    uniqueFacts,
    previousTotal,
    currentTotal,
    regionalVariation: previousTotal === 0 ? null : (currentTotal - previousTotal) / previousTotal,
    warnings: [
      ...detail.warnings,
      "O comparativo anterior é fornecido apenas no nível regional e por natureza.",
      "A fonte não identifica a unidade que realizou o atendimento; a unidade exibida é territorial.",
    ],
  },
  dimensions: {
    natures: EXPECTED_NATURES,
    territorialUnits: TERRITORIAL_UNITS,
    groups: {
      CVLI: ["HOMICÍDIO DOLOSO", "FEMINICÍDIO", "LATROCÍNIO", "LESÃO SEGUIDA DE MORTE"],
      "CRIMES SEXUAIS": ["ESTUPRO"],
      ROUBOS: EXPECTED_NATURES.filter((nature) => nature.startsWith("ROUBO")),
      FURTOS: EXPECTED_NATURES.filter((nature) => nature.startsWith("FURTO")),
    },
  },
  comparison,
  records: detail.records,
};

const outputPath = path.resolve("data/dashboard.json");
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");

console.log(`Dados atualizados: ${detail.records.length} registros, ${uniqueFacts} fatos únicos.`);
console.log(`Período: ${output.metadata.periodStart} a ${output.metadata.periodEnd}.`);
console.log(`Arquivo gerado: ${outputPath}`);
