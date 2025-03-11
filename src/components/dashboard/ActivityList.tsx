
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

export const ActivityList = () => {
  const navigate = useNavigate();

  return (
    <Card className="lg:col-span-2">
      <CardHeader className="flex justify-between items-center">
        <CardTitle className="text-base md:text-lg">Recent Activity</CardTitle>
        <Button variant="ghost" size="sm" onClick={() => navigate('/reports')} className="gap-1 md:gap-2">
          View All <ArrowRight className="w-3 h-3 md:w-4 md:h-4" />
        </Button>
      </CardHeader>
      <CardContent>
        <div className="space-y-3 md:space-y-4">
          {[
            {
              title: "Quarterly Report: The International Gem Tower",
              date: "2024-03-15",
              type: "report",
              path: "/reports"
            },
            {
              title: "Investment Return: 401 N Michigan Ave",
              date: "2024-03-10",
              type: "return",
              path: "/wallet"
            },
            {
              title: "New Investment: Tech Hub Project",
              date: "2024-03-01",
              type: "investment",
              path: "/properties"
            }
          ].map((activity) => (
            <div 
              key={activity.title} 
              className="flex items-center justify-between border-b pb-3 md:pb-4 last:border-0 cursor-pointer hover:bg-gray-50 p-2 rounded-md transition-colors"
              onClick={() => navigate(activity.path)}
            >
              <div className="min-w-0 flex-1 pr-2">
                <p className="font-medium text-gray-900 text-sm md:text-base truncate">{activity.title}</p>
                <p className="text-xs md:text-sm text-gray-500">{activity.date}</p>
              </div>
              <div className={`px-2 md:px-3 py-1 rounded-full text-xs ${
                activity.type === 'return' 
                  ? 'bg-green-100 text-green-800' 
                  : activity.type === 'report'
                  ? 'bg-blue-100 text-blue-800'
                  : 'bg-purple-100 text-purple-800'
              }`}>
                {activity.type}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
