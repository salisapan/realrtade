
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";

export const ForecastCard = () => {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="p-3 md:p-4">
        <CardTitle className="text-base md:text-lg">Forecast</CardTitle>
        <CardDescription className="text-xs md:text-sm">Expected performance for next 12 months</CardDescription>
      </CardHeader>
      <CardContent className="p-3 md:p-4">
        <div className="space-y-3 md:space-y-4">
          <div className="flex justify-between">
            <span className="text-xs md:text-sm">Projected Returns</span>
            <span className="font-bold text-blue-600 text-xs md:text-sm">12.8%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-xs md:text-sm">Expected Yield</span>
            <span className="font-bold text-xs md:text-sm">7.3%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-xs md:text-sm">Growth Potential</span>
            <span className="font-bold text-blue-600 text-xs md:text-sm">High</span>
          </div>
          <div className="flex justify-between">
            <span className="text-xs md:text-sm">Confidence Level</span>
            <span className="font-bold text-xs md:text-sm">85%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-xs md:text-sm">Target Cap Rate</span>
            <span className="font-bold text-xs md:text-sm">6.2%</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
