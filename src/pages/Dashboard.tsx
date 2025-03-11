
import { AppSidebar } from "@/components/AppSidebar";
import { DashboardContent } from "@/components/dashboard/DashboardContent";

const Dashboard = () => {
  return (
    <div className="flex">
      <AppSidebar />
      <DashboardContent />
    </div>
  );
};

export default Dashboard;
