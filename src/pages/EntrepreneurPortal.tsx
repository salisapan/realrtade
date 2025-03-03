
import { useState } from "react";
import { AppSidebar } from "@/components/AppSidebar";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { Building, FileText, Upload, Users } from "lucide-react";

// Import our new components
import { DealUploadForm } from "@/components/entrepreneur/DealUploadForm";
import { DealsList } from "@/components/entrepreneur/DealsList";
import { InvestorList } from "@/components/entrepreneur/InvestorList";
import { DueDiligenceList } from "@/components/entrepreneur/DueDiligenceList";
import { DashboardStats } from "@/components/entrepreneur/DashboardStats";
import { DashboardHeader } from "@/components/entrepreneur/DashboardHeader";

// Import mock data
import { 
  mockDeals, 
  mockInvestors, 
  mockDueDiligenceItems,
  mockDashboardStats
} from "@/data/entrepreneurData";

const EntrepreneurPortal = () => {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [deals, setDeals] = useState(mockDeals);
  
  const handleEditDeal = (dealId: string) => {
    console.log("Editing deal:", dealId);
    // In a real app, this would load the deal data into a form
    toast({
      title: "Edit Deal",
      description: `Opening editor for deal ${dealId}`,
    });
  };

  const handleDeleteDeal = (dealId: string) => {
    console.log("Deleting deal:", dealId);
    // In a real app, this would confirm before deleting
    setDeals(deals.filter(deal => deal.id !== dealId));
    toast({
      title: "Deal Deleted",
      description: "The deal has been removed successfully",
    });
  };

  const handleViewDeal = (dealId: string) => {
    console.log("Viewing deal:", dealId);
    // In a real app, this would navigate to a deal detail page
    toast({
      title: "View Deal",
      description: `Viewing details for deal ${dealId}`,
    });
  };

  const handleUploadDocument = (itemId: string) => {
    console.log("Uploading document for:", itemId);
    toast({
      title: "Upload Started",
      description: "Please select the document to upload",
    });
  };

  const handleScheduleDueDiligence = (itemId: string) => {
    console.log("Scheduling due diligence for:", itemId);
    toast({
      title: "Schedule Task",
      description: "Please select a date for this task",
    });
  };

  const handleAddDeal = () => {
    setActiveTab("upload-deals");
  };

  const handleDealSubmitted = () => {
    setActiveTab("manage-deals");
    // In a real app, this would refresh the deals list from the API
    toast({
      title: "Success",
      description: "Your deal has been submitted and is pending review",
    });
  };

  return (
    <div className="flex">
      <AppSidebar />
      <div className="flex-1 min-h-screen bg-gray-50">
        <header className="bg-white shadow-sm">
          <DashboardHeader 
            title="Entrepreneur Portal" 
            onAddDeal={handleAddDeal} 
          />
        </header>

        <main className="container mx-auto px-4 py-8">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid grid-cols-4 mb-8">
              <TabsTrigger value="dashboard" className="flex items-center gap-2">
                <Building size={18} />
                Dashboard
              </TabsTrigger>
              <TabsTrigger value="upload-deals" className="flex items-center gap-2">
                <Upload size={18} />
                Upload Deals
              </TabsTrigger>
              <TabsTrigger value="manage-deals" className="flex items-center gap-2">
                <Building size={18} />
                Manage Deals
              </TabsTrigger>
              <TabsTrigger value="due-diligence" className="flex items-center gap-2">
                <FileText size={18} />
                Due Diligence
              </TabsTrigger>
            </TabsList>

            <TabsContent value="dashboard">
              <Card className="p-6">
                <h2 className="text-xl font-semibold mb-6">Dashboard Overview</h2>
                
                <DashboardStats stats={mockDashboardStats} />
                
                <div className="mt-8">
                  <h3 className="text-lg font-medium mb-4">Active Deals</h3>
                  <DealsList 
                    deals={deals.slice(0, 2)} 
                    onEdit={handleEditDeal}
                    onDelete={handleDeleteDeal}
                    onView={handleViewDeal}
                  />
                </div>
              </Card>
            </TabsContent>

            <TabsContent value="upload-deals">
              <Card className="p-6">
                <DealUploadForm onDealSubmitted={handleDealSubmitted} />
              </Card>
            </TabsContent>

            <TabsContent value="manage-deals">
              <Card className="p-6">
                <h2 className="text-xl font-semibold mb-6">Manage Your Deals</h2>
                
                <DealsList 
                  deals={deals} 
                  onEdit={handleEditDeal}
                  onDelete={handleDeleteDeal}
                  onView={handleViewDeal}
                />
              </Card>
            </TabsContent>

            <TabsContent value="investors">
              <Card className="p-6">
                <h2 className="text-xl font-semibold mb-6">Manage Investors</h2>
                
                <InvestorList 
                  dealTitle="International Gem Tower" 
                  investors={mockInvestors} 
                />
              </Card>
            </TabsContent>

            <TabsContent value="due-diligence">
              <Card className="p-6">
                <h2 className="text-xl font-semibold mb-6">Due Diligence</h2>
                
                <DueDiligenceList 
                  dealTitle="Tech Hub Square" 
                  items={mockDueDiligenceItems} 
                  onUpload={handleUploadDocument}
                  onSchedule={handleScheduleDueDiligence}
                />
              </Card>
            </TabsContent>
          </Tabs>
        </main>
      </div>
    </div>
  );
};

export default EntrepreneurPortal;
