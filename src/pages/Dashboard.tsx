
import { AppSidebar } from "@/components/AppSidebar";
import { DashboardContent } from "@/components/dashboard/DashboardContent";

const Dashboard = () => {
  return (
    <div className="flex bg-gray-900">
      <AppSidebar />
      <DashboardContent />
    </div>
  );
};

export default Dashboard;
