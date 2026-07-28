import assert from "node:assert/strict";
import { readFile, writeFile, unlink } from "node:fs/promises";
import test from "node:test";
import esbuild from "esbuild";

async function loadTsModule(relativePath, tmpName) {
  const sourcePath = new URL(relativePath, import.meta.url);
  const source = await readFile(sourcePath, "utf8");
  const { code } = await esbuild.transform(source, {
    loader: "ts",
    format: "esm",
  });
  const tmpPath = new URL(`./${tmpName}-${process.pid}.mjs`, import.meta.url);
  await writeFile(tmpPath, code, "utf8");
  try {
    const mod = await import(`${tmpPath.href}?t=${Date.now()}`);
    return mod;
  } finally {
    await unlink(tmpPath);
  }
}

async function loadStatistics() {
  return loadTsModule("../app/statistics.ts", ".tmp-statistics");
}

async function loadAnalytics() {
  return loadTsModule("../app/analytics.ts", ".tmp-analytics");
}

function makeLcg(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

test("poissonComparisonPValue(0, 0) retorna null", async () => {
  const { poissonComparisonPValue } = await loadStatistics();
  assert.equal(poissonComparisonPValue(0, 0), null);
});

test("classifyVariation(1, 3) é baixo-volume (caso real do CVLI do painel)", async () => {
  const { classifyVariation } = await loadStatistics();
  assert.equal(classifyVariation(1, 3).level, "baixo-volume");
});

test("classifyVariation(717, 686) não é significativo (par regional real do dashboard.json)", async () => {
  const { classifyVariation } = await loadStatistics();
  assert.notEqual(classifyVariation(717, 686).level, "significativo");
});

test("classifyVariation(100, 180) é significativo com direção alta", async () => {
  const { classifyVariation } = await loadStatistics();
  const result = classifyVariation(100, 180);
  assert.equal(result.level, "significativo");
  assert.equal(result.direction, "alta");
});

test("poissonComparisonPValue é simétrico", async () => {
  const { poissonComparisonPValue } = await loadStatistics();
  const a = poissonComparisonPValue(10, 20);
  const b = poissonComparisonPValue(20, 10);
  assert.ok(Math.abs(a - b) < 1e-9, `esperado a≈b, obtido ${a} e ${b}`);
});

test("fuzz determinista: poissonComparisonPValue sempre retorna valor válido", async () => {
  const { poissonComparisonPValue } = await loadStatistics();
  const rand = makeLcg(42);
  for (let i = 0; i < 200; i += 1) {
    const previous = Math.floor(rand() * 501);
    const current = Math.floor(rand() * 501);
    let result;
    assert.doesNotThrow(() => {
      result = poissonComparisonPValue(previous, current);
    });
    if (previous === 0 && current === 0) {
      assert.equal(result, null);
    } else {
      assert.ok(result >= 0 && result <= 1, `resultado fora de [0,1]: ${result} (previous=${previous}, current=${current})`);
    }
  }
});

test("rankNeighborhoods agrega por município+bairro e calcula cr5", async () => {
  const { rankNeighborhoods } = await loadAnalytics();
  const records = [
    { municipality: "MORRINHOS", neighborhood: "CENTRO" },
    { municipality: "MORRINHOS", neighborhood: "CENTRO" },
    { municipality: "MORRINHOS", neighborhood: "CENTRO" },
    { municipality: "PONTALINA", neighborhood: "CENTRO" },
    { municipality: "PONTALINA", neighborhood: "ZONA RURAL" },
  ];
  const result = rankNeighborhoods(records);
  assert.equal(result.distinct, 3);
  assert.equal(result.rows[0].municipality, "MORRINHOS");
  assert.equal(result.rows[0].count, 3);
  assert.equal(result.cr5, 1);
  const rural = result.rows.find((row) => row.municipality === "PONTALINA" && row.neighborhood === "ZONA RURAL");
  assert.equal(rural.rural, true);
  const naoRural = result.rows.find((row) => row.neighborhood === "CENTRO");
  assert.equal(naoRural.rural, false);
});

test("rankNeighborhoods com lista vazia retorna cr5 zero", async () => {
  const { rankNeighborhoods } = await loadAnalytics();
  const result = rankNeighborhoods([]);
  assert.equal(result.distinct, 0);
  assert.equal(result.cr5, 0);
  assert.deepEqual(result.rows, []);
});

test("weekHourMatrix distribui registros por dia da semana e faixa de horário", async () => {
  const { weekHourMatrix } = await loadAnalytics();
  const records = [
    { date: "2026-01-01", time: "00:00" }, // quinta
    { date: "2026-01-01", time: "05:00" }, // quinta, 04-08h
    { date: "2026-01-02", time: "23:59" }, // sexta, 20-24h
    { date: "2026-01-03", time: null },
  ];
  const result = weekHourMatrix(records);
  assert.equal(result.total, 3);
  assert.equal(result.semHora, 1);
  const quinta = new Date(2026, 0, 1).getDay();
  const sexta = new Date(2026, 0, 2).getDay();
  assert.equal(result.cells[quinta][0], 1);
  assert.equal(result.cells[quinta][1], 1);
  assert.equal(result.cells[sexta][5], 1);
  assert.equal(result.max, 1);
});

test("ratePer100k(10, 0) retorna null", async () => {
  const { ratePer100k } = await loadAnalytics();
  assert.equal(ratePer100k(10, 0), null);
});

test("ratePer100k(100, 100000) é 100", async () => {
  const { ratePer100k } = await loadAnalytics();
  assert.equal(ratePer100k(100, 100000), 100);
});

test("ratePer100k(52, 104000) é aproximadamente 50 (Caldas Novas)", async () => {
  const { ratePer100k } = await loadAnalytics();
  const result = ratePer100k(52, 104000);
  assert.ok(Math.abs(result - 50) < 1e-9, `esperado ≈50, obtido ${result}`);
});

test("populacao.json cobre exatamente os municípios de dominio.json", async () => {
  const dominio = JSON.parse(await readFile(new URL("../config/dominio.json", import.meta.url), "utf8"));
  const populacao = JSON.parse(await readFile(new URL("../config/populacao.json", import.meta.url), "utf8"));
  const municipiosDominio = new Set(Object.values(dominio.unidadesTerritoriais).flat());
  const municipiosPopulacao = new Set(Object.keys(populacao.municipios));
  assert.equal(municipiosPopulacao.size, municipiosDominio.size);
  for (const municipio of municipiosDominio) {
    assert.ok(municipiosPopulacao.has(municipio), `populacao.json não tem ${municipio}`);
  }
  for (const municipio of municipiosPopulacao) {
    assert.ok(municipiosDominio.has(municipio), `populacao.json tem município extra: ${municipio}`);
  }
  for (const [municipio, valor] of Object.entries(populacao.municipios)) {
    assert.ok(Number.isInteger(valor) && valor > 0, `${municipio} deve ter população inteira positiva`);
  }
});
