
import { StatCard } from "./StatCard";
import { LineChart, UserCircle, DollarSign, FileText, Building2 } from "lucide-react";
import { Link } from "react-router-dom";
import { useNavigate } from "react-router-dom";

export const StatsGrid = () => {
  const navigate = useNavigate();

  const handleNavigate = (path: string) => {
    navigate(path);
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-6 mb-6 md:mb-8">
      <StatCard
        title="Total Invested"
        value="$125,000"
        description="from last month"
        percent="+12.5% from last month"
        icon={DollarSign}
        onClick={() => handleNavigate('/wallet')}
      />

      <Link to="/properties" className="block">
        <StatCard
          title="Active Projects"
          value="8"
          description="Across 3 platforms"
          icon={Building2}
          onClick={() => {}}
        />
      </Link>

      <StatCard
        title="Total Returns"
        value="18.3%"
        description="from last quarter"
        percent="+2.1% from last quarter"
        icon={LineChart}
        onClick={() => handleNavigate('/performance')}
      />

      <StatCard
        title="Reports"
        value="24"
        description="Last updated 2 days ago"
        icon={FileText}
        onClick={() => handleNavigate('/reports')}
      />
    </div>
  );
};
