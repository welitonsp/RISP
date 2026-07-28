import dashboardData from "@/data/dashboard.json";
import populacaoData from "@/config/populacao.json";
import { RegionalDashboard } from "./regional-dashboard";

export default function Home() {
  return <RegionalDashboard data={dashboardData} populacao={populacaoData} />;
}
