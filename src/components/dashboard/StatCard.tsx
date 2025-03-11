
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
  color = "blue",
  onClick 
}: StatCardProps) => {
  // Define color maps for different themes
  const colorMap: Record<string, { bg: string, text: string, iconBg: string }> = {
    blue: { 
      bg: "bg-blue-50", 
      text: "text-blue-600", 
      iconBg: "bg-blue-100" 
    }
  };
  
  const currentColor = colorMap[color] || colorMap.blue;

  return (
    <Card 
      className={`cursor-pointer hover:-translate-y-1 transition-all duration-300 ${currentColor.bg} border border-blue-100 hover:shadow-lg`}
      onClick={onClick}
    >
      <CardHeader className="flex flex-row items-center justify-between pb-1 md:pb-2 px-3 md:px-6 pt-3 md:pt-6">
        <CardTitle className="text-xs md:text-sm font-medium text-gray-600">
          {title}
        </CardTitle>
        <div className={`p-1.5 rounded-md ${currentColor.iconBg}`}>
          <Icon className={`w-3 h-3 md:w-4 md:h-4 ${currentColor.text}`} />
        </div>
      </CardHeader>
      <CardContent className="px-3 md:px-6 pb-3 md:pb-6 pt-1 md:pt-2">
        <div className={`text-lg md:text-2xl font-bold ${currentColor.text}`}>{value}</div>
        <p className={`text-2xs md:text-xs ${percent && percent.includes('+') ? 'text-green-600' : 'text-gray-500'}`}>
          {percent ? percent : description}
        </p>
      </CardContent>
    </Card>
  );
};
