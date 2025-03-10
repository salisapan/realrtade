
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { BarChart3, Calendar, CheckCircle2 } from "lucide-react";

type AutopilotInvestment = {
  id: string;
  propertyName: string;
  amount: number;
  date: string;
  status: 'completed' | 'pending' | 'cancelled';
};

export const AutopilotStatus = () => {
  const [recentInvestments, setRecentInvestments] = useState<AutopilotInvestment[]>([]);
  const [totalInvested, setTotalInvested] = useState(0);
  const [nextDate, setNextDate] = useState<string | null>(null);

  useEffect(() => {
    // In a real app, this would fetch from an API
    // For this demo, we'll generate some sample data
    const sampleInvestments: AutopilotInvestment[] = [
      {
        id: "inv-1",
        propertyName: "The International Gem Tower",
        amount: 500,
        date: new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'completed'
      },
      {
        id: "inv-2",
        propertyName: "4 Bed in Arabian Ranches",
        amount: 500,
        date: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'completed'
      }
    ];
    
    setRecentInvestments(sampleInvestments);
    setTotalInvested(sampleInvestments.reduce((sum, inv) => sum + inv.amount, 0));
    
    // Get next investment date from settings
    const settings = JSON.parse(localStorage.getItem("autopilotSettings") || "{}");
    if (settings.nextInvestmentDate) {
      setNextDate(settings.nextInvestmentDate);
    }
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary" />
          <span>Autopilot Status</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Next Investment */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">Next Automatic Investment</h3>
            <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
              ACTIVE
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span>
              {nextDate 
                ? new Date(nextDate).toLocaleDateString('en-US', {
                    month: 'short', 
                    day: 'numeric',
                    year: 'numeric'
                  })
                : "Not scheduled"}
            </span>
          </div>
        </div>
        
        {/* Progress */}
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Portfolio Growth</h3>
          <Progress value={75} className="h-2" />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Total Invested: ${totalInvested.toLocaleString()}</span>
            <span>Target: $10,000</span>
          </div>
        </div>
        
        {/* Recent Investments */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium">Recent Autopilot Investments</h3>
          {recentInvestments.map((investment) => (
            <div key={investment.id} className="flex items-start gap-3 rounded-lg border p-3">
              <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5" />
              <div className="flex-1 space-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">{investment.propertyName}</p>
                  <p className="text-sm font-medium">${investment.amount}</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  {new Date(investment.date).toLocaleDateString('en-US', {
                    month: 'short', 
                    day: 'numeric',
                    year: 'numeric'
                  })}
                </p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
