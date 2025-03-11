
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MapPin, Flame } from "lucide-react";

const neighborhoods = [
  { name: "Downtown Central", score: 92, trend: "up" },
  { name: "Westside Heights", score: 87, trend: "up" },
  { name: "Riverside District", score: 85, trend: "up" },
  { name: "North Village", score: 79, trend: "stable" },
  { name: "Eastside Park", score: 76, trend: "down" }
];

const getScoreColor = (score: number) => {
  if (score >= 90) return "text-green-600";
  if (score >= 80) return "text-green-500";
  if (score >= 70) return "text-amber-500";
  return "text-amber-600";
};

const getTrendIcon = (trend: string) => {
  if (trend === "up") return <Flame className="h-3.5 w-3.5 text-red-500" />;
  if (trend === "down") return <Flame className="h-3.5 w-3.5 text-blue-500" />;
  return <Flame className="h-3.5 w-3.5 text-amber-500" />;
};

export const HotspotHeatmap = () => {
  return (
    <Card className="hover:shadow-md transition-all duration-300">
      <CardHeader className="pb-2">
        <CardTitle className="text-base md:text-lg text-gray-800 flex items-center gap-2">
          <MapPin className="h-4 w-4 text-blue-500" />
          Investment Hotspots
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-60 overflow-auto">
          <div className="space-y-3">
            {neighborhoods.map((hood, index) => (
              <div 
                key={index}
                className="p-3 rounded-md border border-gray-100 hover:border-blue-200 hover:bg-blue-50 transition-all duration-300"
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-medium text-sm">{hood.name}</h3>
                  <div className="flex items-center gap-1">
                    {getTrendIcon(hood.trend)}
                    <span className={`font-bold text-sm ${getScoreColor(hood.score)}`}>
                      {hood.score}
                    </span>
                  </div>
                </div>
                
                <div className="w-full bg-gray-200 rounded-full h-1.5">
                  <div 
                    className="bg-blue-500 h-1.5 rounded-full transition-all duration-500 ease-out hover:bg-blue-600"
                    style={{ width: `${hood.score}%` }}
                  ></div>
                </div>
                
                <p className="text-xs text-gray-500 mt-1">
                  {hood.score >= 85 ? "Exceptional growth potential" : 
                   hood.score >= 80 ? "Strong investment opportunity" : 
                   hood.score >= 75 ? "Promising market conditions" : 
                   "Moderate investment potential"}
                </p>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
