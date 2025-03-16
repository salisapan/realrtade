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
          <img src="/lovable-uploads/d4d21b09-7174-49fb-af4f-ee02e8e4966f.png" alt="RealTrade Logo" className="h-10 mr-4 rounded-lg shadow-[0_0_10px_rgba(66,133,244,0.3)] transition-all duration-300 hover:shadow-[0_0_20px_rgba(66,133,244,0.5)] animate-pulse-slow" />
          <h1 className="text-xl font-semibold relative">
            {title}
            <span className="absolute bottom-0 left-0 w-full h-0.5 bg-gradient-to-r from-primary/20 via-primary to-primary/20 animate-[grow_2.5s_ease-in-out_infinite_alternate]"></span>
          </h1>
        </div>
        <div className="flex items-center gap-4">
          <Link to="/">
            
          </Link>
          
          {onAddDeal && <Button onClick={onAddDeal} size="sm" className="flex items-center gap-2 transition-all duration-300 hover:shadow-[0_0_12px_rgba(66,133,244,0.4)] bg-gradient-to-r from-primary to-primary-light group">
              <PlusCircle size={16} className="transition-transform group-hover:rotate-90 duration-300" />
              <span>Add Deal</span>
            </Button>}
        </div>
      </div>
    </div>;
};