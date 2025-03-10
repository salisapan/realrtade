import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Home, PlusCircle } from "lucide-react";
interface DashboardHeaderProps {
  title: string;
  onAddDeal?: () => void;
}
export const DashboardHeader = ({
  title,
  onAddDeal
}: DashboardHeaderProps) => {
  return <div className="container mx-auto px-4 py-4">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center">
          <img src="/lovable-uploads/d4d21b09-7174-49fb-af4f-ee02e8e4966f.png" alt="RealTrade Logo" className="h-10 mr-4 rounded-lg" />
          
        </div>
        <div className="flex items-center gap-4">
          <Link to="/">
            
          </Link>
          
          {onAddDeal}
        </div>
      </div>
    </div>;
};