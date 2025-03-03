
import { useState } from "react";
import { Link } from "react-router-dom";
import { AppSidebar } from "@/components/AppSidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Home, 
  FileText, 
  CheckCircle,
  Clock, 
  X, 
  AlertTriangle,
  Download,
  Upload,
  Search,
  Check,
  Briefcase
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

const DueDiligencePortal = () => {
  const [activeTab, setActiveTab] = useState("pending");
  const [searchTerm, setSearchTerm] = useState("");
  
  const handleApprove = (dealId: string) => {
    toast.success(`Deal #${dealId} approved and listed for investors`);
  };
  
  const handleReject = (dealId: string) => {
    toast.error(`Deal #${dealId} rejected`);
  };
  
  const handleRequestChanges = (dealId: string) => {
    toast.info(`Change request sent for deal #${dealId}`);
  };
  
  const filteredPendingDeals = pendingDeals.filter(deal => 
    deal.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    deal.location.toLowerCase().includes(searchTerm.toLowerCase()) ||
    deal.entrepreneur.toLowerCase().includes(searchTerm.toLowerCase())
  );
  
  const filteredApprovedDeals = approvedDeals.filter(deal => 
    deal.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    deal.location.toLowerCase().includes(searchTerm.toLowerCase()) ||
    deal.entrepreneur.toLowerCase().includes(searchTerm.toLowerCase())
  );
  
  const filteredRejectedDeals = rejectedDeals.filter(deal => 
    deal.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    deal.location.toLowerCase().includes(searchTerm.toLowerCase()) ||
    deal.entrepreneur.toLowerCase().includes(searchTerm.toLowerCase())
  );
  
  return (
    <div className="flex">
      <AppSidebar />
      <div className="flex-1 min-h-screen bg-gray-50">
        <header className="bg-white shadow-sm">
          <div className="container mx-auto px-4 py-4">
            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center">
                <img 
                  src="/lovable-uploads/d4d21b09-7174-49fb-af4f-ee02e8e4966f.png" 
                  alt="RealTrade Logo" 
                  className="h-10 mr-4 rounded-lg" 
                />
                <h1 className="text-2xl font-bold text-gray-900">Due Diligence Portal</h1>
              </div>
              <div className="flex items-center gap-4">
                <Link to="/">
                  <Button variant="outline" size="sm" className="flex items-center gap-1">
                    <Home className="w-4 h-4" />
                    Home
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </header>

        <main className="container mx-auto px-4 py-8">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-xl font-semibold">Deal Review & Approval</h2>
            <div className="relative w-64">
              <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
              <Input
                placeholder="Search deals..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>
          
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="mb-8 grid w-full grid-cols-3">
              <TabsTrigger value="pending" className="flex items-center gap-2">
                <Clock size={18} />
                Pending Review ({pendingDeals.length})
              </TabsTrigger>
              <TabsTrigger value="approved" className="flex items-center gap-2">
                <CheckCircle size={18} />
                Approved ({approvedDeals.length})
              </TabsTrigger>
              <TabsTrigger value="rejected" className="flex items-center gap-2">
                <X size={18} />
                Rejected ({rejectedDeals.length})
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="pending">
              <div className="space-y-6">
                {filteredPendingDeals.length === 0 ? (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-10">
                      <AlertTriangle className="h-12 w-12 text-muted-foreground mb-4" />
                      <p className="text-lg font-medium">No pending deals found</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        {searchTerm ? "Try a different search term" : "All deals have been reviewed"}
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  filteredPendingDeals.map((deal) => (
                    <Card key={deal.id} className="overflow-hidden">
                      <div className="flex flex-col md:flex-row">
                        <div className="md:w-1/4 bg-gray-100 p-4 flex items-center justify-center">
                          <img 
                            src={deal.image} 
                            alt={deal.name} 
                            className="w-full h-40 object-cover rounded-md" 
                          />
                        </div>
                        <div className="md:w-3/4 p-6">
                          <div className="flex justify-between items-start mb-4">
                            <div>
                              <h3 className="text-lg font-semibold">{deal.name}</h3>
                              <p className="text-sm text-gray-500">{deal.location}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <Badge variant="outline" className="bg-blue-50">
                                  {deal.type}
                                </Badge>
                                <span className="text-sm">${deal.price.toLocaleString()}</span>
                              </div>
                            </div>
                            <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">
                              Pending Review
                            </Badge>
                          </div>
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                            <div>
                              <p className="text-sm font-medium">Entrepreneur</p>
                              <p className="text-sm">{deal.entrepreneur}</p>
                            </div>
                            <div>
                              <p className="text-sm font-medium">Submission Date</p>
                              <p className="text-sm">{deal.submissionDate}</p>
                            </div>
                            <div>
                              <p className="text-sm font-medium">Target ROI</p>
                              <p className="text-sm">{deal.targetROI}%</p>
                            </div>
                            <div>
                              <p className="text-sm font-medium">Funding Goal</p>
                              <p className="text-sm">${deal.fundingGoal.toLocaleString()}</p>
                            </div>
                          </div>
                          
                          <div className="flex flex-wrap gap-2 mb-6">
                            <Button variant="outline" size="sm" className="flex items-center gap-1">
                              <FileText className="w-4 h-4" />
                              Financial Report
                            </Button>
                            <Button variant="outline" size="sm" className="flex items-center gap-1">
                              <FileText className="w-4 h-4" />
                              Business Plan
                            </Button>
                            <Button variant="outline" size="sm" className="flex items-center gap-1">
                              <FileText className="w-4 h-4" />
                              Property Appraisal
                            </Button>
                            <Button variant="outline" size="sm" className="flex items-center gap-1">
                              <FileText className="w-4 h-4" />
                              Legal Documents
                            </Button>
                          </div>
                          
                          <div className="flex flex-wrap gap-3">
                            <Button 
                              onClick={() => handleApprove(deal.id)} 
                              className="flex items-center gap-1"
                            >
                              <Check className="w-4 h-4" />
                              Approve
                            </Button>
                            <Button 
                              variant="destructive" 
                              onClick={() => handleReject(deal.id)}
                              className="flex items-center gap-1"
                            >
                              <X className="w-4 h-4" />
                              Reject
                            </Button>
                            <Button 
                              variant="outline" 
                              onClick={() => handleRequestChanges(deal.id)}
                              className="flex items-center gap-1"
                            >
                              <AlertTriangle className="w-4 h-4" />
                              Request Changes
                            </Button>
                          </div>
                        </div>
                      </div>
                    </Card>
                  ))
                )}
              </div>
            </TabsContent>
            
            <TabsContent value="approved">
              <div className="space-y-6">
                {filteredApprovedDeals.length === 0 ? (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-10">
                      <AlertTriangle className="h-12 w-12 text-muted-foreground mb-4" />
                      <p className="text-lg font-medium">No approved deals found</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        {searchTerm ? "Try a different search term" : "No deals have been approved yet"}
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  filteredApprovedDeals.map((deal) => (
                    <Card key={deal.id} className="overflow-hidden">
                      <div className="flex flex-col md:flex-row">
                        <div className="md:w-1/4 bg-gray-100 p-4 flex items-center justify-center">
                          <img 
                            src={deal.image} 
                            alt={deal.name} 
                            className="w-full h-40 object-cover rounded-md" 
                          />
                        </div>
                        <div className="md:w-3/4 p-6">
                          <div className="flex justify-between items-start mb-4">
                            <div>
                              <h3 className="text-lg font-semibold">{deal.name}</h3>
                              <p className="text-sm text-gray-500">{deal.location}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <Badge variant="outline" className="bg-blue-50">
                                  {deal.type}
                                </Badge>
                                <span className="text-sm">${deal.price.toLocaleString()}</span>
                              </div>
                            </div>
                            <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                              Approved
                            </Badge>
                          </div>
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                            <div>
                              <p className="text-sm font-medium">Entrepreneur</p>
                              <p className="text-sm">{deal.entrepreneur}</p>
                            </div>
                            <div>
                              <p className="text-sm font-medium">Approval Date</p>
                              <p className="text-sm">{deal.approvalDate}</p>
                            </div>
                            <div>
                              <p className="text-sm font-medium">Target ROI</p>
                              <p className="text-sm">{deal.targetROI}%</p>
                            </div>
                            <div>
                              <p className="text-sm font-medium">Funding Status</p>
                              <p className="text-sm">{deal.fundingStatus}% Funded</p>
                            </div>
                          </div>
                          
                          <div className="flex flex-wrap gap-2 mb-6">
                            <Button variant="outline" size="sm" className="flex items-center gap-1">
                              <FileText className="w-4 h-4" />
                              Review Documents
                            </Button>
                            <Button variant="outline" size="sm" className="flex items-center gap-1">
                              <Download className="w-4 h-4" />
                              Download Reports
                            </Button>
                          </div>
                          
                          <div className="flex flex-wrap gap-3">
                            <Button variant="outline" className="flex items-center gap-1">
                              <Briefcase className="w-4 h-4" />
                              View Investors
                            </Button>
                          </div>
                        </div>
                      </div>
                    </Card>
                  ))
                )}
              </div>
            </TabsContent>
            
            <TabsContent value="rejected">
              <div className="space-y-6">
                {filteredRejectedDeals.length === 0 ? (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-10">
                      <AlertTriangle className="h-12 w-12 text-muted-foreground mb-4" />
                      <p className="text-lg font-medium">No rejected deals found</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        {searchTerm ? "Try a different search term" : "No deals have been rejected"}
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  filteredRejectedDeals.map((deal) => (
                    <Card key={deal.id} className="overflow-hidden">
                      <div className="flex flex-col md:flex-row">
                        <div className="md:w-1/4 bg-gray-100 p-4 flex items-center justify-center">
                          <img 
                            src={deal.image} 
                            alt={deal.name} 
                            className="w-full h-40 object-cover rounded-md" 
                          />
                        </div>
                        <div className="md:w-3/4 p-6">
                          <div className="flex justify-between items-start mb-4">
                            <div>
                              <h3 className="text-lg font-semibold">{deal.name}</h3>
                              <p className="text-sm text-gray-500">{deal.location}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <Badge variant="outline" className="bg-blue-50">
                                  {deal.type}
                                </Badge>
                                <span className="text-sm">${deal.price.toLocaleString()}</span>
                              </div>
                            </div>
                            <Badge className="bg-red-100 text-red-800 hover:bg-red-100">
                              Rejected
                            </Badge>
                          </div>
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                            <div>
                              <p className="text-sm font-medium">Entrepreneur</p>
                              <p className="text-sm">{deal.entrepreneur}</p>
                            </div>
                            <div>
                              <p className="text-sm font-medium">Rejection Date</p>
                              <p className="text-sm">{deal.rejectionDate}</p>
                            </div>
                            <div>
                              <p className="text-sm font-medium">Rejection Reason</p>
                              <p className="text-sm">{deal.rejectionReason}</p>
                            </div>
                          </div>
                          
                          <div className="flex flex-wrap gap-3">
                            <Button variant="outline" className="flex items-center gap-1">
                              <Upload className="w-4 h-4" />
                              View Resubmission
                            </Button>
                          </div>
                        </div>
                      </div>
                    </Card>
                  ))
                )}
              </div>
            </TabsContent>
          </Tabs>
        </main>
      </div>
    </div>
  );
};

// Sample data
const pendingDeals = [
  {
    id: "PD001",
    name: "Downtown Office Complex",
    location: "Chicago, IL",
    type: "Commercial",
    price: 3450000,
    entrepreneur: "John Smith",
    submissionDate: "2023-06-15",
    targetROI: 12.5,
    fundingGoal: 2800000,
    image: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab"
  },
  {
    id: "PD002",
    name: "Riverside Apartments",
    location: "Portland, OR",
    type: "Residential",
    price: 5200000,
    entrepreneur: "Emma Johnson",
    submissionDate: "2023-06-12",
    targetROI: 9.8,
    fundingGoal: 4100000,
    image: "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00"
  },
  {
    id: "PD003",
    name: "Retail Plaza",
    location: "Austin, TX",
    type: "Retail",
    price: 2750000,
    entrepreneur: "Michael Brown",
    submissionDate: "2023-06-10",
    targetROI: 11.2,
    fundingGoal: 2200000,
    image: "https://images.unsplash.com/photo-1556707752-481d500a2c58"
  }
];

const approvedDeals = [
  {
    id: "AD001",
    name: "Tech Hub Square",
    location: "Silicon Valley, CA",
    type: "Commercial",
    price: 12500000,
    entrepreneur: "Sarah Williams",
    approvalDate: "2023-05-28",
    targetROI: 14.5,
    fundingStatus: 95,
    image: "https://images.unsplash.com/photo-1518005020951-eccb494ad742"
  },
  {
    id: "AD002",
    name: "Green Energy Complex",
    location: "Denver, CO",
    type: "Industrial",
    price: 8700000,
    entrepreneur: "David Miller",
    approvalDate: "2023-05-20",
    targetROI: 15.8,
    fundingStatus: 87,
    image: "https://images.unsplash.com/photo-1521791136064-7986c2920216"
  }
];

const rejectedDeals = [
  {
    id: "RD001",
    name: "Luxury Condos",
    location: "Miami, FL",
    type: "Residential",
    price: 9800000,
    entrepreneur: "Robert Davis",
    rejectionDate: "2023-05-15",
    rejectionReason: "Insufficient market analysis and overvalued property",
    image: "https://images.unsplash.com/photo-1460317442991-0ec209397118"
  }
];

export default DueDiligencePortal;
