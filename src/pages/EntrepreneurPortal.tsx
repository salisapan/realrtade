
import { useState } from "react";
import { Link } from "react-router-dom";
import { AppSidebar } from "@/components/AppSidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { Building2, UploadCloud, Users, FileText, CheckCircle, AlertTriangle, Calendar, Plus, CreditCard, Clock, DollarSign, TrendingUp } from "lucide-react";

const EntrepreneurPortal = () => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("properties");
  
  // For demo purposes - these would normally come from an API
  const properties = [
    {
      id: "prop1",
      title: "The International Gem Tower",
      location: "50 West 47th Street, New York",
      status: "Listed",
      investors: 47,
      funded: "91%",
      totalRaised: "$2,457,000",
      lastUpdated: "2024-03-10",
    },
    {
      id: "prop2",
      title: "401 N Michigan Ave",
      location: "401 N Michigan Ave, Chicago",
      status: "Listed",
      investors: 63,
      funded: "81%",
      totalRaised: "$7,103,700",
      lastUpdated: "2024-03-05",
    },
    {
      id: "prop3",
      title: "Tech Hub Square",
      location: "Silicon Valley, CA",
      status: "Listed",
      investors: 78,
      funded: "95%",
      totalRaised: "$11,875,000",
      lastUpdated: "2024-02-28",
    },
    {
      id: "prop5",
      title: "Modern Industrial Complex",
      location: "Austin, TX",
      status: "Due Diligence",
      investors: 0,
      funded: "0%",
      totalRaised: "$0",
      lastUpdated: "2024-03-15",
    },
  ];
  
  const investors = [
    { id: 1, name: "Michael Smith", investmentTotal: "$350,000", properties: 3, joinDate: "2023-08-15", status: "Active" },
    { id: 2, name: "Sarah Johnson", investmentTotal: "$175,000", properties: 2, joinDate: "2023-09-22", status: "Active" },
    { id: 3, name: "Robert Chen", investmentTotal: "$500,000", properties: 4, joinDate: "2023-06-10", status: "Active" },
    { id: 4, name: "Priya Patel", investmentTotal: "$225,000", properties: 2, joinDate: "2023-10-05", status: "Active" },
    { id: 5, name: "James Wilson", investmentTotal: "$150,000", properties: 1, joinDate: "2024-01-18", status: "Active" },
    { id: 6, name: "Lisa Martinez", investmentTotal: "$75,000", properties: 1, joinDate: "2024-02-03", status: "Pending KYC" },
  ];
  
  const dueDiligenceItems = [
    { id: 1, property: "Tech Hub Square", task: "Property Appraisal", status: "Completed", dueDate: "2023-12-10" },
    { id: 2, property: "Tech Hub Square", task: "Environmental Assessment", status: "Completed", dueDate: "2023-12-15" },
    { id: 3, property: "Tech Hub Square", task: "Title Search", status: "Completed", dueDate: "2023-12-05" },
    { id: 4, property: "Modern Industrial Complex", task: "Property Appraisal", status: "In Progress", dueDate: "2024-03-25" },
    { id: 5, property: "Modern Industrial Complex", task: "Environmental Assessment", status: "Pending", dueDate: "2024-04-05" },
    { id: 6, property: "Modern Industrial Complex", task: "Title Search", status: "Completed", dueDate: "2024-03-10" },
    { id: 7, property: "Modern Industrial Complex", task: "Building Inspection", status: "Scheduled", dueDate: "2024-03-30" },
  ];
  
  const upcomingReports = [
    { id: 1, name: "Q1 2024 Investor Update - The International Gem Tower", dueDate: "2024-04-15", status: "Not Started" },
    { id: 2, name: "Q1 2024 Investor Update - 401 N Michigan Ave", dueDate: "2024-04-15", status: "Not Started" },
    { id: 3, name: "Q1 2024 Investor Update - Tech Hub Square", dueDate: "2024-04-15", status: "Not Started" },
    { id: 4, name: "Property Performance Report - Modern Industrial Complex", dueDate: "2024-04-30", status: "Not Started" },
  ];
  
  const handleUploadProperty = () => {
    toast({
      title: "Property Upload Initiated",
      description: "Opening property upload form...",
    });
  };
  
  const handleInvestorManagement = (investorId: number) => {
    toast({
      title: "Investor Selected",
      description: `Opening investor detail view for ${investors.find(i => i.id === investorId)?.name}`,
    });
  };
  
  const handleViewPropertyDetails = (propertyId: string) => {
    toast({
      title: "Property Selected",
      description: `Opening management dashboard for ${properties.find(p => p.id === propertyId)?.title}`,
    });
  };
  
  const handleCreateReport = () => {
    toast({
      title: "Report Creation",
      description: "Opening report creation tool...",
    });
  };
  
  const handleCompleteDueDiligence = (taskId: number) => {
    toast({
      title: "Due Diligence Task",
      description: `Opening task details for ${dueDiligenceItems.find(item => item.id === taskId)?.task}`,
    });
  };

  return (
    <div className="flex">
      <AppSidebar />
      <div className="flex-1 min-h-screen bg-gray-50">
        <header className="bg-white shadow-sm p-6">
          <div className="container mx-auto">
            <div className="flex justify-between items-center">
              <div className="flex items-center">
                <img 
                  src="/lovable-uploads/d4d21b09-7174-49fb-af4f-ee02e8e4966f.png" 
                  alt="RealTrade Logo" 
                  className="h-10 mr-4" 
                />
                <h1 className="text-2xl font-bold">Entrepreneur Portal</h1>
              </div>
              <Button onClick={handleUploadProperty}>
                <Plus className="mr-2 w-4 h-4" /> List New Property
              </Button>
            </div>
          </div>
        </header>
        
        <main className="container mx-auto p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Properties Listed</CardTitle>
                <CardDescription>Current active property listings</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-end gap-4">
                  <span className="text-3xl font-bold">{properties.filter(p => p.status === "Listed").length}</span>
                  <span className="text-green-600 text-sm">+1 this month</span>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Total Investors</CardTitle>
                <CardDescription>Investors across all properties</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-end gap-4">
                  <span className="text-3xl font-bold">{investors.length}</span>
                  <span className="text-green-600 text-sm">+2 this month</span>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Capital Raised</CardTitle>
                <CardDescription>Total funding for all properties</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-end gap-4">
                  <span className="text-3xl font-bold">$21.4M</span>
                  <span className="text-green-600 text-sm">+$1.2M this month</span>
                </div>
              </CardContent>
            </Card>
          </div>
          
          <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-6">
            <TabsList className="mb-6">
              <TabsTrigger value="properties">My Properties</TabsTrigger>
              <TabsTrigger value="investors">Investor Management</TabsTrigger>
              <TabsTrigger value="due-diligence">Due Diligence</TabsTrigger>
              <TabsTrigger value="reports">Reports & Documents</TabsTrigger>
            </TabsList>
            
            <TabsContent value="properties" className="space-y-6">
              {properties.map((property) => (
                <Card 
                  key={property.id}
                  className="overflow-hidden hover:shadow-md transition-all cursor-pointer"
                  onClick={() => handleViewPropertyDetails(property.id)}
                >
                  <CardContent className="p-0">
                    <div className="flex flex-col md:flex-row">
                      <div className="p-6 flex-1">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <h3 className="text-lg font-semibold">{property.title}</h3>
                            <p className="text-gray-500 text-sm">{property.location}</p>
                          </div>
                          <span className={`px-2 py-1 rounded-full text-xs ${
                            property.status === "Listed" 
                              ? "bg-green-100 text-green-800" 
                              : "bg-amber-100 text-amber-800"
                          }`}>
                            {property.status}
                          </span>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4 mt-4">
                          <div>
                            <p className="text-gray-500 text-xs">Investors</p>
                            <p className="font-medium">{property.investors}</p>
                          </div>
                          <div>
                            <p className="text-gray-500 text-xs">Funded</p>
                            <p className="font-medium">{property.funded}</p>
                          </div>
                          <div>
                            <p className="text-gray-500 text-xs">Total Raised</p>
                            <p className="font-medium">{property.totalRaised}</p>
                          </div>
                          <div>
                            <p className="text-gray-500 text-xs">Last Updated</p>
                            <p className="font-medium">{new Date(property.lastUpdated).toLocaleDateString()}</p>
                          </div>
                        </div>
                      </div>
                      
                      <div className="bg-gray-100 p-6 flex flex-row md:flex-col justify-between items-center md:w-48">
                        <Button 
                          variant="outline" 
                          className="w-full mb-2"
                          onClick={(e) => {
                            e.stopPropagation();
                            toast({
                              title: "Update Property",
                              description: `Opening update form for ${property.title}`,
                            });
                          }}
                        >
                          Update Details
                        </Button>
                        <Button 
                          className="w-full"
                          onClick={(e) => {
                            e.stopPropagation();
                            toast({
                              title: "Create Report",
                              description: `Opening report creation for ${property.title}`,
                            });
                          }}
                        >
                          Create Report
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
              
              <Card className="border-dashed border-2 hover:border-primary transition-all cursor-pointer" onClick={handleUploadProperty}>
                <CardContent className="p-8 flex flex-col items-center justify-center text-center">
                  <div className="bg-primary/10 p-3 rounded-full mb-4">
                    <UploadCloud className="w-8 h-8 text-primary" />
                  </div>
                  <h3 className="text-lg font-medium mb-2">List a New Property</h3>
                  <p className="text-gray-500 max-w-md">
                    Upload details about a new property to list it for investor funding.
                  </p>
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="investors">
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <h2 className="text-xl font-semibold">Investor Management</h2>
                  <div className="flex gap-4">
                    <Input 
                      placeholder="Search investors..." 
                      className="w-64"
                    />
                    <Button variant="outline">
                      <Users className="mr-2 w-4 h-4" /> Invite Investors
                    </Button>
                  </div>
                </div>
                
                <Card>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="bg-gray-50 text-left">
                            <th className="p-4 font-medium">Investor</th>
                            <th className="p-4 font-medium">Total Investment</th>
                            <th className="p-4 font-medium">Properties</th>
                            <th className="p-4 font-medium">Join Date</th>
                            <th className="p-4 font-medium">Status</th>
                            <th className="p-4 font-medium">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {investors.map((investor) => (
                            <tr key={investor.id} className="border-t hover:bg-gray-50 cursor-pointer" onClick={() => handleInvestorManagement(investor.id)}>
                              <td className="p-4 font-medium">{investor.name}</td>
                              <td className="p-4">{investor.investmentTotal}</td>
                              <td className="p-4">{investor.properties}</td>
                              <td className="p-4">{new Date(investor.joinDate).toLocaleDateString()}</td>
                              <td className="p-4">
                                <span className={`px-2 py-1 rounded-full text-xs ${
                                  investor.status === "Active" 
                                    ? "bg-green-100 text-green-800" 
                                    : "bg-amber-100 text-amber-800"
                                }`}>
                                  {investor.status}
                                </span>
                              </td>
                              <td className="p-4">
                                <Button 
                                  variant="ghost" 
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toast({
                                      title: "Contact Investor",
                                      description: `Opening message composer for ${investor.name}`,
                                    });
                                  }}
                                >
                                  Contact
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
            
            <TabsContent value="due-diligence">
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <h2 className="text-xl font-semibold">Due Diligence Tasks</h2>
                  <Button variant="outline">
                    <Plus className="mr-2 w-4 h-4" /> Add Task
                  </Button>
                </div>
                
                <div className="grid grid-cols-1 gap-4">
                  {dueDiligenceItems.map((item) => (
                    <Card 
                      key={item.id} 
                      className="hover:shadow-md transition-all cursor-pointer"
                      onClick={() => handleCompleteDueDiligence(item.id)}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className={`p-2 rounded-full ${
                              item.status === "Completed" 
                                ? "bg-green-100" 
                                : item.status === "In Progress" 
                                  ? "bg-blue-100" 
                                  : "bg-gray-100"
                            }`}>
                              {item.status === "Completed" ? (
                                <CheckCircle className="w-5 h-5 text-green-600" />
                              ) : item.status === "In Progress" ? (
                                <Clock className="w-5 h-5 text-blue-600" />
                              ) : (
                                <AlertTriangle className="w-5 h-5 text-gray-500" />
                              )}
                            </div>
                            <div>
                              <h4 className="font-medium">{item.task}</h4>
                              <p className="text-sm text-gray-500">{item.property}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="text-right">
                              <p className="text-sm text-gray-500">Due Date</p>
                              <p className="font-medium">{new Date(item.dueDate).toLocaleDateString()}</p>
                            </div>
                            <span className={`px-2 py-1 rounded-full text-xs ${
                              item.status === "Completed" 
                                ? "bg-green-100 text-green-800" 
                                : item.status === "In Progress" 
                                  ? "bg-blue-100 text-blue-800" 
                                  : item.status === "Scheduled"
                                    ? "bg-purple-100 text-purple-800"
                                    : "bg-gray-100 text-gray-800"
                            }`}>
                              {item.status}
                            </span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            </TabsContent>
            
            <TabsContent value="reports">
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <h2 className="text-xl font-semibold">Reports & Documents</h2>
                  <Button onClick={handleCreateReport}>
                    <FileText className="mr-2 w-4 h-4" /> Create New Report
                  </Button>
                </div>
                
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Upcoming Reports</CardTitle>
                    <CardDescription>Reports due in the next 30 days</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {upcomingReports.map((report) => (
                        <div key={report.id} className="flex items-center justify-between p-3 border rounded-lg">
                          <div className="flex items-center gap-3">
                            <FileText className="w-5 h-5 text-gray-500" />
                            <div>
                              <p className="font-medium">{report.name}</p>
                              <p className="text-sm text-gray-500">Due: {new Date(report.dueDate).toLocaleDateString()}</p>
                            </div>
                          </div>
                          <Button 
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              toast({
                                title: "Create Report",
                                description: `Starting work on ${report.name}`,
                              });
                            }}
                          >
                            Start Report
                          </Button>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Recent Documents</CardTitle>
                    <CardDescription>Documents created in the last 30 days</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {[
                        { id: 1, name: "Property Appraisal - Modern Industrial Complex", type: "PDF", date: "2024-03-10" },
                        { id: 2, name: "Title Report - Modern Industrial Complex", type: "PDF", date: "2024-03-10" },
                        { id: 3, name: "Q4 2023 Investor Update - Tech Hub Square", type: "PDF", date: "2024-02-28" },
                      ].map((doc) => (
                        <div key={doc.id} className="flex items-center justify-between p-3 border rounded-lg">
                          <div className="flex items-center gap-3">
                            <FileText className="w-5 h-5 text-gray-500" />
                            <div>
                              <p className="font-medium">{doc.name}</p>
                              <p className="text-sm text-gray-500">{doc.type} • {new Date(doc.date).toLocaleDateString()}</p>
                            </div>
                          </div>
                          <Button 
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              toast({
                                title: "Download Document",
                                description: `Downloading ${doc.name}`,
                              });
                            }}
                          >
                            Download
                          </Button>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                  <CardFooter>
                    <Button variant="outline" className="w-full">
                      View All Documents
                    </Button>
                  </CardFooter>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </main>
      </div>
    </div>
  );
};

export default EntrepreneurPortal;
