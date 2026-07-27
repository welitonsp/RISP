import dashboardData from "@/data/dashboard.json";
import { RegionalDashboard } from "./regional-dashboard";

export default function Home() {
  return <RegionalDashboard data={dashboardData} />;
}
