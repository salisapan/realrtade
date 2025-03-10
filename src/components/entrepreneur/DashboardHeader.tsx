
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
  return (
    <div className="container mx-auto px-4 py-4">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center">
          <img src="/lovable-uploads/d4d21b09-7174-49fb-af4f-ee02e8e4966f.png" alt="RealTrade Logo" className="h-10 mr-4 rounded-lg" />
          <h1 className="text-xl font-semibold">{title}</h1>
        </div>
        <div className="flex items-center gap-4">
          <Link to="/">
            <Button variant="outline" size="sm" className="flex items-center gap-2">
              <Home size={16} />
              Home
            </Button>
          </Link>
          
          {onAddDeal && (
            <Button 
              onClick={onAddDeal}
              size="sm" 
              className="flex items-center gap-2"
            >
              <PlusCircle size={16} />
              Add Deal
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
