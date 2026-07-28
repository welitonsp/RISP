import assert from "node:assert/strict";
import { readFile, writeFile, unlink } from "node:fs/promises";
import test from "node:test";
import esbuild from "esbuild";

async function loadTitleCase() {
  const sourcePath = new URL("../app/regional-dashboard.tsx", import.meta.url);
  const tmpPath = new URL(`../app/.tmp-titlecase-${process.pid}.mjs`, import.meta.url);
  const result = await esbuild.build({
    entryPoints: [sourcePath.pathname.replace(/^\/([A-Za-z]:)/, "$1")],
    bundle: true,
    write: false,
    format: "esm",
    jsx: "automatic",
    platform: "node",
    external: ["react", "react-dom"],
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
