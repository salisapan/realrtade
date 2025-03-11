
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
      className="cursor-pointer transition-all duration-300 hover:shadow-md hover:shadow-blue-100 hover:-translate-y-1" 
      onClick={onClick}
    >
      <CardHeader className="flex flex-row items-center justify-between pb-1 md:pb-2 px-3 md:px-6 pt-3 md:pt-6">
        <CardTitle className="text-xs md:text-sm font-medium text-gray-500">
          {title}
        </CardTitle>
        <Icon className="w-3 h-3 md:w-4 md:h-4 text-blue-500" />
      </CardHeader>
      <CardContent className="px-3 md:px-6 pb-3 md:pb-6 pt-1 md:pt-2">
        <div className="text-lg md:text-2xl font-bold">{value}</div>
        <p className={`text-2xs md:text-xs ${percent && percent.includes('+') ? 'text-green-600' : 'text-gray-600'}`}>
          {percent ? percent : description}
        </p>
      </CardContent>
    </Card>
  );
};
