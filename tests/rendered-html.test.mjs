import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

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
});

test("o importador não publica identificadores pessoais da fonte", async () => {
  const importer = await readFile(new URL("../scripts/import-reports.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(importer, /PESSOA_ID.*records\.push|VEICULO_ID.*records\.push/s);
  assert.match(importer, /Os relatórios não conferem/);
  assert.match(importer, /unidade que realizou o atendimento/);
  await readFile(new URL("../app/regional-dashboard.tsx", import.meta.url), "utf8");
});
