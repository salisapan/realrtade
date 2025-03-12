
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";

export const RiskAssessment = () => {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="p-3 md:p-4">
        <CardTitle className="text-base md:text-lg">Risk Assessment</CardTitle>
        <CardDescription className="text-xs md:text-sm">Current risk profile analysis</CardDescription>
      </CardHeader>
      <CardContent className="p-3 md:p-4">
        <div className="space-y-3 md:space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-xs md:text-sm">Volatility</span>
            <div className="w-1/2 md:w-2/3 bg-gray-200 rounded-full h-2">
              <div className="bg-blue-600 h-2 rounded-full" style={{ width: '45%' }}></div>
            </div>
            <span className="text-xs md:text-sm font-medium">Low</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs md:text-sm">Liquidity Risk</span>
            <div className="w-1/2 md:w-2/3 bg-gray-200 rounded-full h-2">
              <div className="bg-blue-400 h-2 rounded-full" style={{ width: '72%' }}></div>
            </div>
            <span className="text-xs md:text-sm font-medium">Medium</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs md:text-sm">Market Risk</span>
            <div className="w-1/2 md:w-2/3 bg-gray-200 rounded-full h-2">
              <div className="bg-blue-600 h-2 rounded-full" style={{ width: '38%' }}></div>
            </div>
            <span className="text-xs md:text-sm font-medium">Low</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs md:text-sm">Concentration Risk</span>
            <div className="w-1/2 md:w-2/3 bg-gray-200 rounded-full h-2">
              <div className="bg-blue-800 h-2 rounded-full" style={{ width: '85%' }}></div>
            </div>
            <span className="text-xs md:text-sm font-medium">High</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
