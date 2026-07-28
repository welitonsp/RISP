import assert from "node:assert/strict";
import { readFile, writeFile, unlink } from "node:fs/promises";
import test from "node:test";
import esbuild from "esbuild";

async function loadTsModule(relativePath, tmpName) {
  const sourcePath = new URL(relativePath, import.meta.url);
  const result = await esbuild.build({
    entryPoints: [sourcePath.pathname.replace(/^\/([A-Za-z]:)/, "$1")],
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
  });
  const code = result.outputFiles[0].text;
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

function emptyRanking() {
  return { rows: [], distinct: 0, cr5: 0 };
}

function rankingFromRows(rows) {
  const sorted = [...rows].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    const neighborhoodDiff = a.neighborhood.localeCompare(b.neighborhood, "pt-BR");
    if (neighborhoodDiff !== 0) return neighborhoodDiff;
    return a.municipality.localeCompare(b.municipality, "pt-BR");
  });
  const total = sorted.reduce((sum, row) => sum + row.count, 0);
  const top5 = sorted.slice(0, 5).reduce((sum, row) => sum + row.count, 0);
  return { rows: sorted, distinct: sorted.length, cr5: total === 0 ? 0 : top5 / total };
}

test("executiveSummary: sem naturezas significativas cai no texto de fallback (alta e queda)", async () => {
  const { executiveSummary } = await loadAnalytics();
  const result = executiveSummary({
    comparison: [
      { nature: "FURTO", previous: 100, current: 102 },
      { nature: "ROUBO", previous: 50, current: 48 },
    ],
    neighborhoodRanking: emptyRanking(),
    hourCells: Array.from({ length: 7 }, () => Array(6).fill(0)),
  });
  assert.match(result.maiorAlta, /Nenhuma natureza apresentou alta/);
  assert.match(result.maiorQueda, /Nenhuma natureza apresentou queda/);
});

test("executiveSummary: escolhe maior alta e maior queda significativas, sem empate (percentuais distintos)", async () => {
  const { executiveSummary } = await loadAnalytics();
  const comparison = [
    { nature: "FURTO", previous: 100, current: 180 }, // alta +80%, significativo
    { nature: "ROUBO", previous: 100, current: 170 }, // alta +70%, significativo
    { nature: "ESTUPRO", previous: 180, current: 100 }, // queda -44.4%, significativo
    { nature: "LESAO", previous: 170, current: 100 }, // queda -41.2%, significativo
  ];
  const build = () =>
    executiveSummary({
      comparison,
      neighborhoodRanking: emptyRanking(),
      hourCells: Array.from({ length: 7 }, () => Array(6).fill(0)),
    });
  const first = build();
  const second = build();
  assert.equal(first.maiorAlta, second.maiorAlta);
  assert.match(first.maiorAlta, /Furto/);
  assert.match(first.maiorQueda, /Estupro/);
});

test("executiveSummary: desempate determinístico por delta absoluto quando percentuais empatam", async () => {
  const { executiveSummary } = await loadAnalytics();
  // FURTO e ROUBO empatam em +100% de variação; ROUBO tem delta absoluto maior (500 vs 100)
  // e deve vencer o desempate.
  const comparison = [
    { nature: "FURTO", previous: 100, current: 200 }, // +100%, delta 100
    { nature: "ROUBO", previous: 500, current: 1000 }, // +100%, delta 500
  ];
  const result = executiveSummary({
    comparison,
    neighborhoodRanking: emptyRanking(),
    hourCells: Array.from({ length: 7 }, () => Array(6).fill(0)),
  });
  assert.match(result.maiorAlta, /Roubo/);
  assert.doesNotMatch(result.maiorAlta, /Furto/);
});

test("executiveSummary: desempate determinístico por ordem alfabética quando percentual e delta empatam", async () => {
  const { executiveSummary } = await loadAnalytics();
  // ESTUPRO e LESAO CORPORAL empatam em +100% de variação e em delta absoluto (100);
  // o desempate final deve ser alfabético.
  const comparison = [
    { nature: "LESAO CORPORAL", previous: 100, current: 200 }, // +100%, delta 100
    { nature: "ESTUPRO", previous: 100, current: 200 }, // +100%, delta 100
  ];
  const result = executiveSummary({
    comparison,
    neighborhoodRanking: emptyRanking(),
    hourCells: Array.from({ length: 7 }, () => Array(6).fill(0)),
  });
  assert.match(result.maiorAlta, /Estupro/);
  assert.doesNotMatch(result.maiorAlta, /Lesao Corporal/i);
});

test("executiveSummary: comparisonApplicable=false não afirma ausência de significância", async () => {
  const { executiveSummary } = await loadAnalytics();
  const result = executiveSummary({
    comparison: [],
    comparisonApplicable: false,
    neighborhoodRanking: emptyRanking(),
    hourCells: Array.from({ length: 7 }, () => Array(6).fill(0)),
  });
  assert.doesNotMatch(result.maiorAlta, /Nenhuma natureza apresentou/);
  assert.doesNotMatch(result.maiorQueda, /Nenhuma natureza apresentou/);
  assert.match(result.maiorAlta, /não está disponível neste recorte/);
  assert.match(result.maiorQueda, /não está disponível neste recorte/);
  assert.match(result.maiorAlta, /município, unidade ou datas detalhadas/);
});

test("executiveSummary: previous=0 (partiu de zero) não vence delta absoluto maior e tem texto gramatical correto", async () => {
  const { executiveSummary } = await loadAnalytics();
  const comparison = [
    { nature: "AMEACA", previous: 0, current: 10 }, // partiu de zero, delta 10
    { nature: "FURTO", previous: 100, current: 300 }, // +200%, delta 200, significativo
  ];
  const result = executiveSummary({
    comparison,
    neighborhoodRanking: emptyRanking(),
    hourCells: Array.from({ length: 7 }, () => Array(6).fill(0)),
  });
  // Delta absoluto maior (Furto, 200) deve vencer, mesmo com Ameaça tendo variação "infinita".
  assert.match(result.maiorAlta, /Furto/);
  assert.doesNotMatch(result.maiorAlta, /Ameaca|Ameaça/i);

  const onlyZeroBase = executiveSummary({
    comparison: [{ nature: "AMEACA", previous: 0, current: 10 }],
    neighborhoodRanking: emptyRanking(),
    hourCells: Array.from({ length: 7 }, () => Array(6).fill(0)),
  });
  assert.match(onlyZeroBase.maiorAlta, /partiu de zero/);
  assert.match(onlyZeroBase.maiorAlta, /chegou a 10 registros/);
  assert.doesNotMatch(onlyZeroBase.maiorAlta, /Infinity|NaN/);
  assert.doesNotMatch(onlyZeroBase.maiorAlta, /com variação de aumento/);
});

test("executiveSummary: maior alta é ordem total — vencedor não depende da ordem de entrada quando há item que partiu de zero", async () => {
  const { executiveSummary } = await loadAnalytics();
  // Probe do reviewer: A partiu de zero (delta 10), B tem variação de 300% mas
  // delta pequeno (6), C tem variação de 200% com delta grande (300). Antes da
  // correção, o comparador não era transitivo (A>B, B>C, C>A por regras
  // diferentes conforme o par), então o vencedor variava conforme a ordem de
  // `comparison`. Agora o critério é único para o conjunto inteiro: como há
  // Infinity entre os candidatos, todos são ordenados por delta absoluto, e "C"
  // (delta 300) deve vencer sempre, em qualquer permutação de entrada.
  const a = { nature: "AMEACA", previous: 0, current: 10 }; // Infinity, delta 10
  const b = { nature: "ROUBO", previous: 2, current: 8 }; // var 3 (+300%), delta 6
  const c = { nature: "FURTO", previous: 150, current: 450 }; // var 2 (+200%), delta 300

  const permutations = [
    [a, b, c],
    [a, c, b],
    [b, a, c],
    [b, c, a],
    [c, a, b],
    [c, b, a],
  ];

  const winners = permutations.map((comparison) => {
    const result = executiveSummary({
      comparison,
      neighborhoodRanking: emptyRanking(),
      hourCells: Array.from({ length: 7 }, () => Array(6).fill(0)),
    });
    return result.maiorAlta;
  });

  for (const winner of winners) {
    assert.match(winner, /Furto/, `esperado Furto (maior delta absoluto) em qualquer ordem, obtido: ${winner}`);
  }
  const distinctWinners = new Set(winners);
  assert.equal(distinctWinners.size, 1, `vencedor variou conforme a ordem de entrada: ${[...distinctWinners].join(" | ")}`);
});

test("executiveSummary: bairro crítico exige count >= 5 e usa fallback quando nenhum atinge", async () => {
  const { executiveSummary } = await loadAnalytics();
  const base = {
    comparison: [],
    hourCells: Array.from({ length: 7 }, () => Array(6).fill(0)),
  };
  const semDestaque = executiveSummary({
    ...base,
    neighborhoodRanking: rankingFromRows([
      { municipality: "MORRINHOS", neighborhood: "CENTRO", count: 4 },
      { municipality: "PONTALINA", neighborhood: "CENTRO", count: 3 },
    ]),
  });
  assert.equal(semDestaque.bairroCritico, "Nenhum bairro concentra volume suficiente para destaque no recorte.");

  const comDestaque = executiveSummary({
    ...base,
    neighborhoodRanking: rankingFromRows([
      { municipality: "MORRINHOS", neighborhood: "CENTRO", count: 5 },
      { municipality: "PONTALINA", neighborhood: "SETOR SUL", count: 6 },
    ]),
  });
  assert.match(comDestaque.bairroCritico, /Setor Sul/);
  assert.match(comDestaque.bairroCritico, /Pontalina/);
});

test("executiveSummary: bairro crítico em empate de contagem aponta para o mesmo bairro do topo do ranking exibido", async () => {
  const { executiveSummary, rankNeighborhoods } = await loadAnalytics();
  // MORRINHOS/CENTRO e ARAGUAPAZ/SETOR SUL empatam em count=7; o desempate
  // alfabético de rankNeighborhoods deve decidir quem fica na posição 01, e o
  // sumário precisa nomear exatamente esse bairro — nunca outro.
  const records = [
    ...Array(7).fill({ municipality: "MORRINHOS", neighborhood: "CENTRO" }),
    ...Array(7).fill({ municipality: "ARAGUAPAZ", neighborhood: "SETOR SUL" }),
  ];
  const ranking = rankNeighborhoods(records);
  const top = ranking.rows[0];

  const result = executiveSummary({
    comparison: [],
    neighborhoodRanking: ranking,
    hourCells: Array.from({ length: 7 }, () => Array(6).fill(0)),
  });

  assert.match(result.bairroCritico, new RegExp(titleCaseEscaped(top.neighborhood)));
  assert.match(result.bairroCritico, new RegExp(titleCaseEscaped(top.municipality)));
});

function titleCaseEscaped(value) {
  // Aproximação simples de Title Case só para montar o regex de asserção acima
  // (não precisa reproduzir titleCase exatamente, só a primeira palavra em maiúscula).
  return value
    .toLowerCase()
    .replace(/(^|\s)\p{L}/gu, (letter) => letter.toUpperCase())
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("executiveSummary: faixa horária exige count >= 5 e cai para agregado semanal quando nenhuma célula atinge", async () => {
  const { executiveSummary } = await loadAnalytics();
  const base = {
    comparison: [],
    neighborhoodRanking: emptyRanking(),
  };
  const cellsBaixoVolume = Array.from({ length: 7 }, () => Array(6).fill(0));
  cellsBaixoVolume[0][0] = 3;
  cellsBaixoVolume[1][0] = 2;
  cellsBaixoVolume[2][0] = 4;
  const fallback = executiveSummary({ ...base, hourCells: cellsBaixoVolume });
  assert.match(fallback.faixaCritica, /Nenhuma combinação específica/);
  assert.match(fallback.faixaCritica, /00–04h/);
  assert.match(fallback.faixaCritica, /9 registros/);

  const cellsComDestaque = Array.from({ length: 7 }, () => Array(6).fill(0));
  cellsComDestaque[6][4] = 9; // sábado, 16-20h
  const direto = executiveSummary({ ...base, hourCells: cellsComDestaque });
  assert.match(direto.faixaCritica, /Sábado/);
  assert.match(direto.faixaCritica, /16–20h/);
});

test("executiveSummary: concentração territorial calcula CR5 e distintos a partir dos registros", async () => {
  const { executiveSummary } = await loadAnalytics();
  const result = executiveSummary({
    comparison: [],
    neighborhoodRanking: rankingFromRows([
      { municipality: "GOIANIA", neighborhood: "SETOR A", count: 40 },
      { municipality: "GOIANIA", neighborhood: "SETOR B", count: 20 },
      { municipality: "GOIANIA", neighborhood: "SETOR C", count: 10 },
      { municipality: "GOIANIA", neighborhood: "SETOR D", count: 10 },
      { municipality: "GOIANIA", neighborhood: "SETOR E", count: 10 },
      { municipality: "GOIANIA", neighborhood: "SETOR F", count: 10 },
    ]),
    hourCells: Array.from({ length: 7 }, () => Array(6).fill(0)),
  });
  // top5 = 40+20+10+10+10 = 90, total = 100 -> cr5 = 90%
  assert.match(result.concentracaoTerritorial, /90,0%/);
  assert.match(result.concentracaoTerritorial, /6 bairros/);
  assert.match(result.concentracaoTerritorial, /nos 5 bairros mais frequentes/);
  assert.match(result.concentracaoTerritorial, /priorizado/);
});

test("executiveSummary: concentração territorial não quebra em recorte vazio", async () => {
  const { executiveSummary } = await loadAnalytics();
  const result = executiveSummary({
    comparison: [],
    neighborhoodRanking: emptyRanking(),
    hourCells: Array.from({ length: 7 }, () => Array(6).fill(0)),
  });
  assert.doesNotMatch(result.concentracaoTerritorial, /NaN/);
  assert.match(result.concentracaoTerritorial, /não há registros/);
});

test("executiveSummary: concentração territorial ajusta a redação com menos de 5 bairros distintos", async () => {
  const { executiveSummary } = await loadAnalytics();
  const result = executiveSummary({
    comparison: [],
    neighborhoodRanking: rankingFromRows([
      { municipality: "MORRINHOS", neighborhood: "CENTRO", count: 6 },
      { municipality: "MORRINHOS", neighborhood: "SETOR SUL", count: 4 },
    ]),
    hourCells: Array.from({ length: 7 }, () => Array(6).fill(0)),
  });
  assert.match(result.concentracaoTerritorial, /nos 2 bairros mais frequentes/);
  assert.match(result.concentracaoTerritorial, /100,0%/);
  assert.match(result.concentracaoTerritorial, /2 bairros/);
  assert.doesNotMatch(result.concentracaoTerritorial, /5 bairros mais frequentes/);
});

test("classifyVariation: bonferroniN muda o resultado quando o p-valor cai entre alpha/N e alpha (armadilha A8)", async () => {
  const { classifyVariation, poissonComparisonPValue } = await loadStatistics();
  const previous = 5;
  const current = 15;
  const alpha = 0.05;
  const n = 15;
  const pValue = poissonComparisonPValue(previous, current);
  // Confirma a premissa do teste: o p-valor precisa estar estritamente entre
  // alpha/N e alpha para que a correção de Bonferroni faça diferença.
  assert.ok(pValue > alpha / n && pValue < alpha, `p-valor fora da faixa esperada: ${pValue}`);

  const semCorrecao = classifyVariation(previous, current, { bonferroniN: 1 });
  assert.equal(semCorrecao.level, "significativo");

  const comCorrecao = classifyVariation(previous, current, { bonferroniN: n });
  assert.equal(comCorrecao.level, "observar");
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

test("soma de população por unidade territorial trava os valores exibidos no painel", async () => {
  const dominio = JSON.parse(await readFile(new URL("../config/dominio.json", import.meta.url), "utf8"));
  const populacao = JSON.parse(await readFile(new URL("../config/populacao.json", import.meta.url), "utf8"));
  const somaPorUnidade = (unidade) =>
    dominio.unidadesTerritoriais[unidade].reduce((sum, municipio) => sum + populacao.municipios[municipio], 0);

  assert.equal(somaPorUnidade("BPTUR"), 119786);
  assert.equal(somaPorUnidade("36º BPM"), 76104);
  assert.equal(somaPorUnidade("6ª CIPM"), 32036);
});
