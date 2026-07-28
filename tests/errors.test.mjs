import assert from "node:assert/strict";
import { writeFile, unlink } from "node:fs/promises";
import test from "node:test";
import esbuild from "esbuild";

async function loadErrors() {
  const sourcePath = new URL("../app/errors.ts", import.meta.url);
  const result = await esbuild.build({
    entryPoints: [sourcePath.pathname.replace(/^\/([A-Za-z]:)/, "$1")],
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
  });
  const code = result.outputFiles[0].text;
  const tmpPath = new URL(`./.tmp-errors-${process.pid}.mjs`, import.meta.url);
  await writeFile(tmpPath, code, "utf8");
  try {
    const mod = await import(`${tmpPath.href}?t=${Date.now()}`);
    return mod;
  } finally {
    await unlink(tmpPath);
  }
}

test("isDataIntegrityError classifica um DataIntegrityError como erro de base, mesmo com mensagem qualquer", async () => {
  const { DataIntegrityError, isDataIntegrityError } = await loadErrors();
  const error = new DataIntegrityError("qualquer texto, sem relação com CVLI");
  assert.equal(isDataIntegrityError(error), true);
});

test("isDataIntegrityError não é enganado por um Error genérico cujo texto imita a mensagem antiga", async () => {
  const { isDataIntegrityError } = await loadErrors();
  // Este é exatamente o cenário da armadilha: um erro comum cuja mensagem
  // contém o texto que a detecção antiga (baseada em string) usava como
  // marcador. Se a detecção voltasse a comparar `error.message`, este teste
  // continuaria passando por acidente — por isso o teste abaixo cobre o caso
  // inverso: reescrever a mensagem de um DataIntegrityError real não pode
  // quebrar a detecção.
  const generic = new Error("data.dimensions.groups.CVLI ausente: KPI de CVLI não pode ser calculado.");
  assert.equal(isDataIntegrityError(generic), false);
});

test("isDataIntegrityError continua reconhecendo o erro mesmo após a mensagem ser reescrita", async () => {
  const { DataIntegrityError, isDataIntegrityError } = await loadErrors();
  const error = new DataIntegrityError("mensagem totalmente reescrita, sem menção a CVLI ou a dimensions.groups");
  assert.equal(isDataIntegrityError(error), true);
  assert.equal(error.name, "DataIntegrityError");
});

test("isDataIntegrityError retorna false para valores não-objeto e null", async () => {
  const { isDataIntegrityError } = await loadErrors();
  assert.equal(isDataIntegrityError(null), false);
  assert.equal(isDataIntegrityError(undefined), false);
  assert.equal(isDataIntegrityError("erro qualquer"), false);
});
