
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building, DollarSign, Percent, Users } from "lucide-react";

interface DashboardStatsProps {
  stats: {
    activeDeals: number;
    totalRaised: string;
    investors: number;
    avgCompletionRate: number;
  };
}

export const DashboardStats = ({ stats }: DashboardStatsProps) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <Card className="hover:shadow-md transition-shadow">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Active Deals</CardTitle>
          <Building className="h-4 w-4 text-primary" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.activeDeals}</div>
          <div className="flex items-center mt-1">
            <div className="h-1.5 w-full bg-gray-200 rounded-full overflow-hidden">
              <div 
                className="h-full bg-primary rounded-full" 
                style={{ width: `${Math.min(stats.activeDeals * 10, 100)}%` }}
              ></div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Properties seeking funding
          </p>
        </CardContent>
      </Card>
      
      <Card className="hover:shadow-md transition-shadow">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Raised</CardTitle>
          <DollarSign className="h-4 w-4 text-primary" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.totalRaised}</div>
          <div className="flex items-center gap-1 mt-1">
            <div className="w-2 h-2 bg-primary rounded-full"></div>
            <div className="w-2 h-2 bg-primary/80 rounded-full"></div>
            <div className="w-2 h-2 bg-primary/60 rounded-full"></div>
            <div className="w-2 h-2 bg-primary/40 rounded-full"></div>
            <div className="w-2 h-2 bg-primary/20 rounded-full"></div>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Across all properties
          </p>
        </CardContent>
      </Card>
      
      <Card className="hover:shadow-md transition-shadow">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Investors</CardTitle>
          <Users className="h-4 w-4 text-primary" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.investors}</div>
          <div className="flex items-center mt-1">
            <div className="flex -space-x-1.5">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="w-5 h-5 rounded-full bg-secondary/80 border border-white ring-1 ring-white"></div>
              ))}
              {stats.investors > 5 && (
                <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center text-[10px] text-white font-medium border border-white">
                  +{stats.investors - 5}
                </div>
              )}
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Unique investors in your deals
          </p>
        </CardContent>
      </Card>
      
      <Card className="hover:shadow-md transition-shadow">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Avg. Completion</CardTitle>
          <Percent className="h-4 w-4 text-primary" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.avgCompletionRate}%</div>
          <div className="flex items-center mt-1">
            <div className="h-1.5 w-full bg-gray-200 rounded-full overflow-hidden">
              <div 
                className="h-full bg-primary rounded-full" 
                style={{ width: `${stats.avgCompletionRate}%` }}
              ></div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Average funding completion
          </p>
        </CardContent>
      </Card>
    </div>
  );
};
