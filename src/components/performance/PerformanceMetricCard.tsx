
import { Card, CardContent } from "@/components/ui/card";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";

interface PerformanceMetricCardProps {
  name: string;
  value: string;
  change: string;
  positive: boolean;
  onClick: () => void;
}

export const PerformanceMetricCard = ({ 
  name, 
  value, 
  change, 
  positive, 
  onClick 
}: PerformanceMetricCardProps) => {
  return (
    <Card 
      className="overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-lg hover:shadow-blue-100/50 group"
      onClick={onClick}
    >
      <CardContent className="p-3 md:p-4">
        <div className="flex justify-between items-start">
          <div>
            <p className="text-sm text-gray-500 group-hover:text-blue-600 transition-colors">{name}</p>
            <p className="text-lg md:text-xl font-bold group-hover:text-blue-700 transition-colors">{value}</p>
          </div>
          <div className={`flex items-center ${positive ? 'text-blue-600' : 'text-red-600'}`}>
            {positive ? <ArrowUpRight className="w-4 h-4 mr-1" /> : <ArrowDownRight className="w-4 h-4 mr-1" />}
            <span className="text-sm font-medium">{change}</span>
          </div>
        </div>
        
        <div className="absolute inset-0 bg-gradient-to-r from-blue-50/0 via-blue-50/30 to-blue-50/0 
                      opacity-0 group-hover:opacity-100 transition-opacity duration-700"></div>
        <div className="absolute bottom-0 left-0 h-0.5 w-0 bg-gradient-to-r from-blue-400 to-blue-200 
                      group-hover:w-full transition-all duration-700"></div>
      </CardContent>
    </Card>
  );
};
