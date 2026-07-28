// Erro dedicado para falhas de integridade da base de indicadores (ex.: grupo
// CVLI ausente/vazio em data/dashboard.json). A detecção pelos error
// boundaries (github-pages/main.tsx e app/error.tsx) NÃO deve depender do
// texto de `error.message` — mensagens são reescritas com frequência em
// edições aparentemente inocentes, e uma comparação de texto quebra em
// silêncio nesse caso.
//
// A checagem usa uma propriedade marcadora booliana (`isDataIntegrityError`)
// em vez de `instanceof`, porque `instanceof` pode falhar quando a classe é
// carregada a partir de cópias duplicadas do módulo em bundles diferentes
// (aqui: o bundle da SPA em github-pages/main.tsx e o bundle do Next em
// app/error.tsx). Uma propriedade de dados sobrevive a essa duplicação.
export class DataIntegrityError extends Error {
  readonly isDataIntegrityError = true as const;

  constructor(message: string) {
    super(message);
    this.name = "DataIntegrityError";
  }
}

export function isDataIntegrityError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { isDataIntegrityError?: unknown }).isDataIntegrityError === true
  );
}
