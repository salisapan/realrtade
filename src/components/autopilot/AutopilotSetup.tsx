
import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Rocket, Pause, DollarSign, BarChart3 } from "lucide-react";

type AutopilotSetupProps = {
  isActive: boolean;
  onActivate: (amount: number, frequency: string, investmentTheme: string) => void;
  onDeactivate: () => void;
};

export const AutopilotSetup = ({ isActive, onActivate, onDeactivate }: AutopilotSetupProps) => {
  const [amount, setAmount] = useState(500);
  const [frequency, setFrequency] = useState("monthly");
  const [investmentTheme, setInvestmentTheme] = useState("diversified");
  const [savedSettings, setSavedSettings] = useState<any>(null);

  useEffect(() => {
    // Load saved settings from localStorage if available
    const savedSettingsData = localStorage.getItem("autopilotSettings");
    if (savedSettingsData) {
      const settings = JSON.parse(savedSettingsData);
      setSavedSettings(settings);
      setAmount(settings.amount || 500);
      setFrequency(settings.frequency || "monthly");
      setInvestmentTheme(settings.theme || "diversified");
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onActivate(amount, frequency, investmentTheme);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Rocket className="h-5 w-5 text-primary" />
          <span>{isActive ? "Autopilot Settings" : "Setup Autopilot"}</span>
        </CardTitle>
        <CardDescription>
          Set your preferences and let us automatically invest for you
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isActive ? (
          <div className="space-y-4">
            <div className="rounded-lg bg-primary/10 p-4">
              <h3 className="text-sm font-medium mb-2">Current Settings</h3>
              <div className="grid grid-cols-2 gap-y-2 text-sm">
                <span className="text-muted-foreground">Monthly Investment:</span>
                <span className="font-medium">${savedSettings?.amount.toLocaleString()}</span>
                <span className="text-muted-foreground">Frequency:</span>
                <span className="font-medium capitalize">{savedSettings?.frequency}</span>
                <span className="text-muted-foreground">Investment Theme:</span>
                <span className="font-medium capitalize">{savedSettings?.theme}</span>
              </div>
            </div>
            <div className="text-sm text-muted-foreground">
              <p>Your next automatic investment is scheduled for:</p>
              <p className="font-medium mt-1">
                {savedSettings?.nextInvestmentDate 
                  ? new Date(savedSettings.nextInvestmentDate).toLocaleDateString('en-US', {
                      weekday: 'long',
                      year: 'numeric', 
                      month: 'long', 
                      day: 'numeric'
                    })
                  : "Not scheduled"}
              </p>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="amount">Monthly Investment Amount</Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-gray-500" />
                <Input
                  id="amount"
                  type="number"
                  min="100"
                  step="100"
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  className="pl-9"
                  required
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Minimum $100 monthly investment
              </p>
            </div>

            <div className="space-y-2">
              <Label>Investment Frequency</Label>
              <RadioGroup 
                defaultValue={frequency} 
                onValueChange={setFrequency}
                className="flex flex-col space-y-1"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="monthly" id="monthly" />
                  <Label htmlFor="monthly" className="cursor-pointer">Monthly</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="bi-weekly" id="bi-weekly" />
                  <Label htmlFor="bi-weekly" className="cursor-pointer">Bi-weekly</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="weekly" id="weekly" />
                  <Label htmlFor="weekly" className="cursor-pointer">Weekly</Label>
                </div>
              </RadioGroup>
            </div>

            <div className="space-y-2">
              <Label>Investment Theme</Label>
              <RadioGroup 
                defaultValue={investmentTheme} 
                onValueChange={setInvestmentTheme}
                className="flex flex-col space-y-1"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="diversified" id="diversified" />
                  <Label htmlFor="diversified" className="cursor-pointer">Diversified Portfolio</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="income" id="income" />
                  <Label htmlFor="income" className="cursor-pointer">Income Focused</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="growth" id="growth" />
                  <Label htmlFor="growth" className="cursor-pointer">Growth Focused</Label>
                </div>
              </RadioGroup>
            </div>
          </form>
        )}
      </CardContent>
      <CardFooter>
        {isActive ? (
          <Button 
            onClick={onDeactivate} 
            variant="outline" 
            className="w-full"
          >
            <Pause className="mr-2 h-4 w-4" />
            Pause Autopilot
          </Button>
        ) : (
          <Button 
            onClick={handleSubmit} 
            className="w-full"
          >
            <Rocket className="mr-2 h-4 w-4" />
            Start Autopilot
          </Button>
        )}
      </CardFooter>
    </Card>
  );
};
