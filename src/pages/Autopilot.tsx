
import { useState } from "react";
import { Layout } from "@/components/Layout";
import { AppSidebar } from "@/components/AppSidebar";
import { AutopilotSetup } from "@/components/autopilot/AutopilotSetup";
import { AutopilotStatus } from "@/components/autopilot/AutopilotStatus";
import { AutopilotRecommendations } from "@/components/autopilot/AutopilotRecommendations";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";

const Autopilot = () => {
  const { toast } = useToast();
  const [isAutopilotActive, setIsAutopilotActive] = useState(false);

  const handleActivateAutopilot = (amount: number, frequency: string, investmentTheme: string) => {
    setIsAutopilotActive(true);
    
    // Store autopilot settings in localStorage
    localStorage.setItem("autopilotSettings", JSON.stringify({
      active: true,
      amount,
      frequency,
      theme: investmentTheme,
      activatedAt: new Date().toISOString(),
      nextInvestmentDate: getNextInvestmentDate(frequency)
    }));
    
    toast({
      title: "Autopilot Activated",
      description: `Your monthly $${amount.toLocaleString()} investment plan is now active. We'll notify you before each investment.`,
      variant: "success",
    });
  };
  
  const handleDeactivateAutopilot = () => {
    setIsAutopilotActive(false);
    
    // Update localStorage
    const settings = JSON.parse(localStorage.getItem("autopilotSettings") || "{}");
    settings.active = false;
    localStorage.setItem("autopilotSettings", JSON.stringify(settings));
    
    toast({
      title: "Autopilot Paused",
      description: "Your automatic investment plan has been paused. You can restart it anytime.",
      variant: "default",
    });
  };
  
  // Helper function to calculate next investment date based on frequency
  const getNextInvestmentDate = (frequency: string) => {
    const date = new Date();
    
    if (frequency === "weekly") {
      date.setDate(date.getDate() + 7);
    } else if (frequency === "bi-weekly") {
      date.setDate(date.getDate() + 14);
    } else {
      // monthly is default
      date.setMonth(date.getMonth() + 1);
    }
    
    return date.toISOString();
  };

  return (
    <Layout>
      <AppSidebar />
      <div className="flex-1 p-6 lg:p-8">
        <div className="container mx-auto">
          {/* Header */}
          <div className="flex flex-col items-start justify-between gap-4 border-b pb-5 sm:flex-row sm:items-center sm:gap-0">
            <h1 className="text-3xl font-bold tracking-tight">Autopilot</h1>
            <p className="text-muted-foreground max-w-md">
              Invest effortlessly in real estate worldwide with automated allocations
            </p>
          </div>
          
          {/* Main Content */}
          <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-12">
            {/* Left Column (Setup & Status) */}
            <div className="lg:col-span-5 flex flex-col gap-6">
              <AutopilotSetup 
                isActive={isAutopilotActive}
                onActivate={handleActivateAutopilot}
                onDeactivate={handleDeactivateAutopilot}
              />
              
              {isAutopilotActive && (
                <AutopilotStatus />
              )}
            </div>
            
            {/* Right Column (Recommendations) */}
            <div className="lg:col-span-7">
              <Tabs defaultValue="all" className="w-full">
                <TabsList className="mb-4 w-full justify-start">
                  <TabsTrigger value="all">All Properties</TabsTrigger>
                  <TabsTrigger value="low-risk">Low Risk</TabsTrigger>
                  <TabsTrigger value="high-yield">High Yield</TabsTrigger>
                  <TabsTrigger value="growth">Growth Focused</TabsTrigger>
                </TabsList>
                <TabsContent value="all">
                  <AutopilotRecommendations filter="all" />
                </TabsContent>
                <TabsContent value="low-risk">
                  <AutopilotRecommendations filter="low-risk" />
                </TabsContent>
                <TabsContent value="high-yield">
                  <AutopilotRecommendations filter="high-yield" />
                </TabsContent>
                <TabsContent value="growth">
                  <AutopilotRecommendations filter="growth" />
                </TabsContent>
              </Tabs>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Autopilot;
