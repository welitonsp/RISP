import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "../app/globals.css";
import { RegionalDashboard } from "../app/regional-dashboard";
import dashboardData from "../data/dashboard.json";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Elemento principal do painel não encontrado.");
}

createRoot(root).render(
  <StrictMode>
    <RegionalDashboard data={dashboardData} />
  </StrictMode>,
);
