
import { useState } from "react";
import { Link } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Home, Upload, Users, ClipboardList, BarChart3, FileText, Plus } from "lucide-react";
import { AppSidebar } from "@/components/AppSidebar";
import { toast } from "sonner";

const EntrepreneurPortal = () => {
  const [activeTab, setActiveTab] = useState("deals");
  const [deals, setDeals] = useState([
    { id: 1, title: "Downtown Office Complex", status: "Live", investors: 12, funded: "67%", dueDiligence: "Completed" },
    { id: 2, title: "Westside Retail Plaza", status: "Draft", investors: 0, funded: "0%", dueDiligence: "Not Started" },
    { id: 3, title: "Eastside Apartments", status: "In Review", investors: 0, funded: "0%", dueDiligence: "In Progress" }
  ]);
  
  const handleSubmitDeal = (e: React.FormEvent) => {
    e.preventDefault();
    toast.success("Deal draft saved successfully!");
  };
  
  const handleSubmitDueDiligence = (e: React.FormEvent) => {
    e.preventDefault();
    toast.success("Due diligence documents uploaded!");
  };

  return (
    <div className="flex min-h-screen">
      <AppSidebar />
      <div className="flex-1 bg-gray-50">
        <header className="bg-white shadow-sm">
          <div className="container mx-auto px-4 py-4">
            <div className="flex justify-between items-center">
              <div className="flex items-center">
                <img src="/lovable-uploads/d4d21b09-7174-49fb-af4f-ee02e8e4966f.png" alt="RealTrade Logo" className="h-10 mr-4 rounded-lg" />
                <h1 className="text-2xl font-bold text-gray-900">Entrepreneur Portal</h1>
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
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid grid-cols-4 mb-8">
              <TabsTrigger value="deals" className="flex items-center gap-2">
                <ClipboardList className="w-4 h-4" />
                My Deals
              </TabsTrigger>
              <TabsTrigger value="investors" className="flex items-center gap-2">
                <Users className="w-4 h-4" />
                Investors
              </TabsTrigger>
              <TabsTrigger value="upload" className="flex items-center gap-2">
                <Upload className="w-4 h-4" />
                Upload Deal
              </TabsTrigger>
              <TabsTrigger value="diligence" className="flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Due Diligence
              </TabsTrigger>
            </TabsList>

            <TabsContent value="deals">
              <div className="flex justify-between mb-6">
                <h2 className="text-xl font-semibold">My Properties</h2>
                <Button onClick={() => setActiveTab("upload")} className="flex items-center gap-2">
                  <Plus className="w-4 h-4" />
                  Add New Deal
                </Button>
              </div>
              
              <div className="grid gap-4">
                {deals.map(deal => (
                  <Card key={deal.id} className="hover:shadow-md transition-shadow">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                      <div>
                        <CardTitle>{deal.title}</CardTitle>
                        <CardDescription>Status: {deal.status}</CardDescription>
                      </div>
                      <div className={`px-3 py-1 rounded-full text-sm ${
                        deal.status === "Live" ? "bg-green-100 text-green-800" :
                        deal.status === "Draft" ? "bg-gray-100 text-gray-800" :
                        "bg-yellow-100 text-yellow-800"
                      }`}>
                        {deal.status}
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-3 gap-4 mt-2">
                        <div>
                          <p className="text-sm text-gray-500">Investors</p>
                          <p className="font-medium">{deal.investors}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-500">Funded</p>
                          <p className="font-medium">{deal.funded}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-500">Due Diligence</p>
                          <p className="font-medium">{deal.dueDiligence}</p>
                        </div>
                      </div>
                    </CardContent>
                    <CardFooter className="flex justify-end space-x-2">
                      <Button variant="outline" size="sm">Edit</Button>
                      <Button size="sm">Manage</Button>
                    </CardFooter>
                  </Card>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="investors">
              <Card>
                <CardHeader>
                  <CardTitle>Investor Management</CardTitle>
                  <CardDescription>View and manage investors in your properties</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="rounded-md border">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Investment Amount</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Properties</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        <tr>
                          <td className="px-6 py-4 whitespace-nowrap">John Doe</td>
                          <td className="px-6 py-4 whitespace-nowrap">john@example.com</td>
                          <td className="px-6 py-4 whitespace-nowrap">$250,000</td>
                          <td className="px-6 py-4 whitespace-nowrap">2</td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">Active</span>
                          </td>
                        </tr>
                        <tr>
                          <td className="px-6 py-4 whitespace-nowrap">Jane Smith</td>
                          <td className="px-6 py-4 whitespace-nowrap">jane@example.com</td>
                          <td className="px-6 py-4 whitespace-nowrap">$175,000</td>
                          <td className="px-6 py-4 whitespace-nowrap">1</td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">Active</span>
                          </td>
                        </tr>
                        <tr>
                          <td className="px-6 py-4 whitespace-nowrap">Robert Johnson</td>
                          <td className="px-6 py-4 whitespace-nowrap">robert@example.com</td>
                          <td className="px-6 py-4 whitespace-nowrap">$120,000</td>
                          <td className="px-6 py-4 whitespace-nowrap">1</td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800">Pending</span>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="upload">
              <Card>
                <CardHeader>
                  <CardTitle>Upload New Deal</CardTitle>
                  <CardDescription>Provide details about your property investment opportunity</CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSubmitDeal}>
                    <div className="grid gap-6">
                      <div className="grid gap-3">
                        <Label htmlFor="title">Property Title</Label>
                        <Input id="title" placeholder="Enter property title" />
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div className="grid gap-3">
                          <Label htmlFor="location">Location</Label>
                          <Input id="location" placeholder="City, State" />
                        </div>
                        <div className="grid gap-3">
                          <Label htmlFor="price">Target Raise</Label>
                          <Input id="price" placeholder="$ Amount" type="number" />
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-3 gap-4">
                        <div className="grid gap-3">
                          <Label htmlFor="cashOnCash">Target Cash on Cash</Label>
                          <Input id="cashOnCash" placeholder="%" type="text" />
                        </div>
                        <div className="grid gap-3">
                          <Label htmlFor="upside">Projected Upside</Label>
                          <Input id="upside" placeholder="%" type="text" />
                        </div>
                        <div className="grid gap-3">
                          <Label htmlFor="category">Category</Label>
                          <Input id="category" placeholder="Office, Retail, etc." />
                        </div>
                      </div>
                      
                      <div className="grid gap-3">
                        <Label htmlFor="description">Property Description</Label>
                        <Textarea id="description" placeholder="Describe the property and investment opportunity" rows={4} />
                      </div>
                      
                      <div className="grid gap-3">
                        <Label htmlFor="image">Property Images</Label>
                        <div className="border border-dashed border-gray-300 rounded-md p-6 text-center cursor-pointer hover:bg-gray-50">
                          <Upload className="mx-auto h-10 w-10 text-gray-400" />
                          <p className="mt-2 text-sm text-gray-500">Click to upload or drag and drop</p>
                          <p className="text-xs text-gray-500">PNG, JPG, GIF up to 10MB</p>
                        </div>
                      </div>
                    </div>
                  </form>
                </CardContent>
                <CardFooter className="flex justify-between">
                  <Button variant="outline">Save as Draft</Button>
                  <Button onClick={handleSubmitDeal}>Submit for Review</Button>
                </CardFooter>
              </Card>
            </TabsContent>

            <TabsContent value="diligence">
              <Card>
                <CardHeader>
                  <CardTitle>Due Diligence Requirements</CardTitle>
                  <CardDescription>Upload required documents for verification and compliance</CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSubmitDueDiligence}>
                    <div className="space-y-6">
                      <div>
                        <h3 className="text-lg font-medium">Legal Documents</h3>
                        <Separator className="my-2" />
                        <div className="grid gap-4 mt-3">
                          <div>
                            <Label htmlFor="titleDeed">Title Deed / Ownership Proof</Label>
                            <div className="mt-1 flex items-center">
                              <Input id="titleDeed" type="file" className="w-full" />
                            </div>
                          </div>
                          <div>
                            <Label htmlFor="incorporation">Company Incorporation Documents</Label>
                            <div className="mt-1 flex items-center">
                              <Input id="incorporation" type="file" className="w-full" />
                            </div>
                          </div>
                        </div>
                      </div>
                      
                      <div>
                        <h3 className="text-lg font-medium">Financial Documents</h3>
                        <Separator className="my-2" />
                        <div className="grid gap-4 mt-3">
                          <div>
                            <Label htmlFor="proForma">Financial Pro Forma</Label>
                            <div className="mt-1 flex items-center">
                              <Input id="proForma" type="file" className="w-full" />
                            </div>
                          </div>
                          <div>
                            <Label htmlFor="taxReturns">Tax Returns (Last 3 years)</Label>
                            <div className="mt-1 flex items-center">
                              <Input id="taxReturns" type="file" className="w-full" />
                            </div>
                          </div>
                          <div>
                            <Label htmlFor="bankStatements">Bank Statements</Label>
                            <div className="mt-1 flex items-center">
                              <Input id="bankStatements" type="file" className="w-full" />
                            </div>
                          </div>
                        </div>
                      </div>
                      
                      <div>
                        <h3 className="text-lg font-medium">Property Documents</h3>
                        <Separator className="my-2" />
                        <div className="grid gap-4 mt-3">
                          <div>
                            <Label htmlFor="appraisal">Property Appraisal</Label>
                            <div className="mt-1 flex items-center">
                              <Input id="appraisal" type="file" className="w-full" />
                            </div>
                          </div>
                          <div>
                            <Label htmlFor="inspection">Inspection Reports</Label>
                            <div className="mt-1 flex items-center">
                              <Input id="inspection" type="file" className="w-full" />
                            </div>
                          </div>
                          <div>
                            <Label htmlFor="permits">Permits & Zoning Documents</Label>
                            <div className="mt-1 flex items-center">
                              <Input id="permits" type="file" className="w-full" />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </form>
                </CardContent>
                <CardFooter className="flex justify-end space-x-2">
                  <Button variant="outline">Save Progress</Button>
                  <Button onClick={handleSubmitDueDiligence}>Complete Due Diligence</Button>
                </CardFooter>
              </Card>
            </TabsContent>
          </Tabs>
        </main>
      </div>
    </div>
  );
};

export default EntrepreneurPortal;
