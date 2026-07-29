import assert from "node:assert/strict";
import { readFile, writeFile, unlink } from "node:fs/promises";
import test from "node:test";
import esbuild from "esbuild";

async function loadTitleCase() {
  const sourcePath = new URL("../app/analytics.ts", import.meta.url);
  const tmpPath = new URL(`./.tmp-titlecase-${process.pid}.mjs`, import.meta.url);
  const result = await esbuild.build({
    entryPoints: [sourcePath.pathname.replace(/^\/([A-Za-z]:)/, "$1")],
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
  });
  const code = result.outputFiles[0].text;
  await writeFile(tmpPath, code, "utf8");
  try {
    const mod = await import(`${tmpPath.href}?t=${Date.now()}`);
    return mod.titleCase;
  } finally {
    await unlink(tmpPath);
  }
}

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("dados importados reconciliam os dois relatórios", async () => {
  const data = JSON.parse(await readFile(new URL("../data/dashboard.json", import.meta.url), "utf8"));
  assert.equal(data.schemaVersion, 1);
  assert.equal(data.records.length, data.metadata.currentTotal);
  assert.equal(new Set(data.records.map((record) => record.factId)).size, data.metadata.uniqueFacts);
  assert.equal(data.comparison.length, 15);
  assert.equal(
    data.comparison.reduce((sum, item) => sum + item.current, 0),
    data.records.length,
  );
  assert.ok(data.records.every((record) => !("personId" in record) && !("vehicleId" in record)));
});

test("domínio do dashboard confere com config/dominio.json", async () => {
  const data = JSON.parse(await readFile(new URL("../data/dashboard.json", import.meta.url), "utf8"));
  const dominio = JSON.parse(await readFile(new URL("../config/dominio.json", import.meta.url), "utf8"));
  assert.deepEqual(data.dimensions.natures, dominio.naturezas);
  assert.deepEqual(data.dimensions.groups, dominio.grupos);
  assert.deepEqual(data.dimensions.territorialUnits, dominio.unidadesTerritoriais);
});

test("servidor entrega o painel regional", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /Indicadores Criminais da 19ª RISP/i);
  assert.match(html, /Escolha o que deseja visualizar/i);
  assert.match(html, /Unidades e municípios/i);
  assert.match(html, /Naturezas controladas pela SSP/i);
  assert.doesNotMatch(html, /codex-preview|Starter Project|react-loading-skeleton/i);
  // O grupo CVLI é uma sigla e deve permanecer em maiúsculas no seletor visível.
  assert.match(html, /<option value="CVLI">CVLI<\/option>/);
  assert.doesNotMatch(html, /Cvli/);
  // Municípios devem ser exibidos em Title Case no seletor visível, não em caixa alta crua.
  assert.match(html, /<option value="CALDAS NOVAS">Caldas Novas<\/option>/);
  assert.doesNotMatch(html, /<option value="CALDAS NOVAS">CALDAS NOVAS<\/option>/);
  assert.match(html, /<option value="PIRACANJUBA">Piracanjuba<\/option>/);
  assert.doesNotMatch(html, /<option value="PIRACANJUBA">PIRACANJUBA<\/option>/);
});

test("rótulo da taxa é sempre 'por 100 mil habitantes no período', nunca anualizado", async () => {
  const response = await render();
  const html = await response.text();
  assert.match(html, /por 100 mil habitantes no período/);
  assert.doesNotMatch(html, /por 100 mil habitantes ao ano/i);
  assert.doesNotMatch(html, /taxa anual/i);
  assert.doesNotMatch(html, /anualizad/i);
});

test("municípios com menos de 10 registros recebem estilo atenuado e asterisco na taxa", async () => {
  const response = await render();
  const html = await response.text();
  const rankingStart = html.indexOf("Municípios com maior volume");
  assert.ok(rankingStart > -1, "seção de ranking de municípios não encontrada no HTML renderizado");

  // MAIRIPOTABA tem 2 registros no dashboard.json atual (< LOW_VOLUME_THRESHOLD = 10).
  const mairipotabaIndex = html.indexOf("Mairipotaba", rankingStart);
  assert.ok(mairipotabaIndex > -1, "Mairipotaba não encontrado no ranking de municípios");
  const aroundMairipotaba = html.slice(mairipotabaIndex, mairipotabaIndex + 600);
  assert.match(aroundMairipotaba, /rate-low-volume/);
  assert.match(aroundMairipotaba, /por 100 mil habitantes no período(<!-- -->)?\*/);

  // CALDAS NOVAS tem 446 registros no dashboard.json atual (>= LOW_VOLUME_THRESHOLD): sem atenuação.
  const caldasIndex = html.indexOf("Caldas Novas", rankingStart);
  assert.ok(caldasIndex > -1, "Caldas Novas não encontrado no ranking de municípios");
  const aroundCaldas = html.slice(caldasIndex, caldasIndex + 600);
  assert.doesNotMatch(aroundCaldas, /rate-low-volume/);
  assert.match(aroundCaldas, /por 100 mil habitantes no período(<!-- -->)?<\/span>/);
});

test("titleCase preserva siglas conhecidas e converte o restante para Title Case", async () => {
  const titleCase = await loadTitleCase();
  assert.equal(titleCase("CVLI"), "CVLI");
  assert.equal(titleCase("PIRACANJUBA"), "Piracanjuba");
  assert.equal(titleCase("CALDAS NOVAS"), "Caldas Novas");
  assert.equal(titleCase("PROFESSOR JAMIL"), "Professor Jamil");
  assert.equal(titleCase("ROUBO A INSTITUIÇÃO FINANCEIRA"), "Roubo A Instituição Financeira");
});

test("o importador não publica identificadores pessoais da fonte", async () => {
  const importer = await readFile(new URL("../scripts/import-reports.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(importer, /PESSOA_ID.*records\.push|VEICULO_ID.*records\.push/s);
  assert.match(importer, /Os relatórios não conferem/);
  assert.match(importer, /unidade que realizou o atendimento/);
  await readFile(new URL("../app/regional-dashboard.tsx", import.meta.url), "utf8");
});

test("paridade numérica: o redesign não altera nenhum número exibido", async () => {
  const baseline = JSON.parse(
    await readFile(new URL("./fixtures/numeric-baseline.json", import.meta.url), "utf8"),
  );
  const response = await render();
  let html = await response.text();
  // Nomes de arquivo de build com hash de conteúdo (ex.: /assets/index-XYZ.css,
  // /assets/regional-dashboard-ABC.js) mudam sempre que o CSS/JS empacotado muda de
  // conteúdo (inclusive por efeito cascata: um chunk JS que importa um CSS alterado
  // também muda de hash), e o payload RSC embute um "deploymentVersion" (UUID) gerado
  // a cada build — nenhum dos dois é um número exibido ao usuário. Excluí-los evita
  // falso positivo neste teste de paridade.
  html = html.replace(/\/assets\/[A-Za-z0-9_.-]+\.(?:js|css)/g, "");
  html = html.replace(/\\?"deploymentVersion\\?":\\?"[^"\\]*\\?"/g, "");
  const tokens = (html.match(/-?\d[\d.,]*\s*%?/g) ?? []).slice().sort();
  assert.equal(tokens.length, baseline.count);
  assert.deepEqual(tokens, baseline.tokens);
});
