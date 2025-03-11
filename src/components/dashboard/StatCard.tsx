
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
  const colorMap: Record<string, { bg: string, glow: string, text: string, iconBg: string }> = {
    blue: { 
      bg: "bg-blue-900/30", 
      glow: "shadow-[0_0_15px_rgba(59,130,246,0.3)]", 
      text: "text-blue-400", 
      iconBg: "bg-blue-500/20" 
    },
    green: { 
      bg: "bg-green-900/30", 
      glow: "shadow-[0_0_15px_rgba(34,197,94,0.3)]", 
      text: "text-green-400", 
      iconBg: "bg-green-500/20" 
    },
    purple: { 
      bg: "bg-purple-900/30", 
      glow: "shadow-[0_0_15px_rgba(168,85,247,0.3)]", 
      text: "text-purple-400", 
      iconBg: "bg-purple-500/20" 
    },
    orange: { 
      bg: "bg-orange-900/30", 
      glow: "shadow-[0_0_15px_rgba(249,115,22,0.3)]", 
      text: "text-orange-400", 
      iconBg: "bg-orange-500/20" 
    }
  };
  
  const currentColor = colorMap[color] || colorMap.blue;

  return (
    <Card 
      className={`cursor-pointer hover:-translate-y-1 transition-all duration-300 ${currentColor.bg} backdrop-blur-md border border-gray-700 ${currentColor.glow} hover:${currentColor.glow.replace('0.3', '0.5')}`} 
      onClick={onClick}
    >
      <CardHeader className="flex flex-row items-center justify-between pb-1 md:pb-2 px-3 md:px-6 pt-3 md:pt-6">
        <CardTitle className="text-xs md:text-sm font-medium text-gray-300">
          {title}
        </CardTitle>
        <div className={`p-1.5 rounded-md ${currentColor.iconBg}`}>
          <Icon className={`w-3 h-3 md:w-4 md:h-4 ${currentColor.text}`} />
        </div>
      </CardHeader>
      <CardContent className="px-3 md:px-6 pb-3 md:pb-6 pt-1 md:pt-2">
        <div className={`text-lg md:text-2xl font-bold ${currentColor.text}`}>{value}</div>
        <p className={`text-2xs md:text-xs ${percent && percent.includes('+') ? 'text-green-400' : 'text-gray-400'}`}>
          {percent ? percent : description}
        </p>
      </CardContent>
    </Card>
  );
};
