"use client";

import { useEffect } from "react";

import { isDataIntegrityError } from "./errors";

export default function DashboardError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Detalhe técnico só no console — a tela mostra mensagem para o comandante.
    console.error("Falha ao renderizar o painel:", error);
  }, [error]);

  if (isDataIntegrityError(error)) {
    return (
      <div className="error-boundary error-boundary-data" role="alert">
        <strong>O painel foi interrompido de propósito</strong>
        <p>
          Foi detectado um problema na <strong>base de dados</strong> (arquivo
          de indicadores), não na aplicação: uma das naturezas usadas no
          cálculo de CVLI está ausente ou vazia. O painel deixou de exibir os
          números para não mostrar um resultado errado — nenhum dado foi
          perdido.
        </p>
        <p>
          Avise o responsável técnico e peça a regeneração do arquivo de
          indicadores antes de usar o painel novamente.
        </p>
      </div>
    );
  }

  return (
    <div className="error-boundary" role="alert">
      <strong>Não foi possível carregar o painel</strong>
      <p>
        Ocorreu uma falha inesperada ao exibir os dados. Os dados não foram
        perdidos — o problema é apenas na exibição desta página.
      </p>
      <p>
        Recarregue a página. Se o problema persistir, avise o responsável
        técnico.
      </p>
    </div>
  );
}
