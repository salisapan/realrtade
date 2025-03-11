
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string;
  description: string;
  icon: LucideIcon;
  percent?: string;
  color?: string;
  onClick?: () => void;
}

export const StatCard = ({ 
  title, 
  value, 
  description, 
  icon: Icon, 
  percent, 
  onClick 
}: StatCardProps) => {
  return (
    <Card 
      className="cursor-pointer relative overflow-hidden group animate-fade-in transition-all duration-300 
                hover:shadow-md hover:shadow-blue-100 hover:-translate-y-1 border border-gray-100"
      onClick={onClick}
    >
      {/* Background glow effects */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-50/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
      <div className="absolute -inset-1 bg-gradient-to-r from-blue-100/20 to-transparent opacity-0 blur-xl group-hover:opacity-30 transition-opacity duration-500 z-0"></div>
      
      <CardHeader className="flex flex-row items-center justify-between pb-1 md:pb-2 px-3 md:px-6 pt-3 md:pt-6 relative z-10">
        <CardTitle className="text-xs md:text-sm font-medium text-gray-500">
          <span className="relative group-hover:text-blue-600 transition-colors duration-300">
            {title}
            <span className="absolute -bottom-0.5 left-0 w-0 h-0.5 bg-blue-400/50 group-hover:w-full transition-all duration-500"></span>
          </span>
        </CardTitle>
        <div className="w-6 h-6 md:w-7 md:h-7 rounded-full bg-blue-100 flex items-center justify-center 
                     transform group-hover:scale-110 group-hover:bg-blue-200 transition-all duration-300">
          <Icon className="w-3 h-3 md:w-4 md:h-4 text-blue-500 group-hover:text-blue-600 transition-colors duration-300" />
        </div>
      </CardHeader>
      <CardContent className="px-3 md:px-6 pb-3 md:pb-6 pt-1 md:pt-2 relative z-10">
        <div className="text-lg md:text-2xl font-bold group-hover:text-blue-700 transition-colors duration-300">{value}</div>
        <p className={`text-2xs md:text-xs ${percent && percent.includes('+') ? 'text-green-600' : 'text-gray-600'} 
                      group-hover:opacity-80 transition-opacity duration-300`}>
          {percent ? percent : description}
        </p>
      </CardContent>
      
      {/* Subtle pulsing effect on hover */}
      <div className="absolute bottom-0 left-0 h-0.5 w-0 bg-gradient-to-r from-blue-400 to-blue-200 
                    group-hover:w-full transition-all duration-1000 opacity-0 group-hover:opacity-100"></div>
    </Card>
  );
};
