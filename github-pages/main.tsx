import { Component, StrictMode, type ErrorInfo, type ReactNode } from "react";
import { createRoot } from "react-dom/client";

import "../app/globals.css";
import { RegionalDashboard } from "../app/regional-dashboard";
import { isDataIntegrityError } from "../app/errors";
import dashboardData from "../data/dashboard.json";
import populacaoData from "../config/populacao.json";

type ErrorBoundaryState = {
  error: Error | null;
};

class DashboardErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Detalhe técnico só no console — a tela mostra mensagem para o comandante.
    console.error("Falha ao renderizar o painel:", error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) {
      return this.props.children;
    }

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
}

const root = document.getElementById("root");

if (!root) {
  throw new Error("Elemento principal do painel não encontrado.");
}

createRoot(root).render(
  <StrictMode>
    <DashboardErrorBoundary>
      <RegionalDashboard data={dashboardData} populacao={populacaoData} />
    </DashboardErrorBoundary>
  </StrictMode>,
);
