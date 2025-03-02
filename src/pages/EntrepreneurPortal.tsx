
import { useState } from "react";
import { Link } from "react-router-dom";
import { AppSidebar } from "@/components/AppSidebar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { 
  Home, 
  Upload, 
  FileText, 
  Users, 
  CheckCircle, 
  Clock, 
  Building, 
  DollarSign,
  PlusCircle,
  Save,
  Check,
  X
} from "lucide-react";

const EntrepreneurPortal = () => {
  const [activeTab, setActiveTab] = useState("upload-deals");
  const [uploadStep, setUploadStep] = useState(1);
  const [dealName, setDealName] = useState("");
  const [location, setLocation] = useState("");
  const [dealType, setDealType] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [targetROI, setTargetROI] = useState("");
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedImage(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const handleNextStep = () => {
    setUploadStep(prev => prev + 1);
  };

  const handlePrevStep = () => {
    setUploadStep(prev => Math.max(1, prev - 1));
  };

  const handleSubmitDeal = () => {
    // Here you would normally submit the deal to your backend
    alert("Deal submitted successfully!");
    setUploadStep(1);
    setDealName("");
    setLocation("");
    setDealType("");
    setDescription("");
    setPrice("");
    setTargetROI("");
    setSelectedImage(null);
    setPreviewUrl("");
  };

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
              <TabsTrigger value="upload-deals" className="flex items-center gap-2">
                <Upload size={18} />
                Upload Deals
              </TabsTrigger>
              <TabsTrigger value="manage-deals" className="flex items-center gap-2">
                <Building size={18} />
                Manage Deals
              </TabsTrigger>
              <TabsTrigger value="manage-investors" className="flex items-center gap-2">
                <Users size={18} />
                Manage Investors
              </TabsTrigger>
              <TabsTrigger value="due-diligence" className="flex items-center gap-2">
                <FileText size={18} />
                Due Diligence
              </TabsTrigger>
            </TabsList>

            <TabsContent value="upload-deals">
              <Card className="p-6">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-semibold">Upload New Deal</h2>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-500">Step {uploadStep} of 3</span>
                  </div>
                </div>

                {uploadStep === 1 && (
                  <div className="space-y-6">
                    <h3 className="text-lg font-medium">Basic Information</h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <Label htmlFor="deal-name">Deal Name</Label>
                        <Input 
                          id="deal-name" 
                          placeholder="Enter deal name" 
                          value={dealName}
                          onChange={(e) => setDealName(e.target.value)}
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="location">Location</Label>
                        <Input 
                          id="location" 
                          placeholder="City, State, Country" 
                          value={location}
                          onChange={(e) => setLocation(e.target.value)}
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="deal-type">Deal Type</Label>
                        <Input 
                          id="deal-type" 
                          placeholder="Commercial, Residential, etc." 
                          value={dealType}
                          onChange={(e) => setDealType(e.target.value)}
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="property-image">Property Image</Label>
                        <div className="flex items-center gap-4">
                          <Input 
                            id="property-image" 
                            type="file" 
                            accept="image/*"
                            onChange={handleImageChange}
                          />
                          {previewUrl && (
                            <div className="h-20 w-20 overflow-hidden rounded-md border">
                              <img 
                                src={previewUrl} 
                                alt="Property preview" 
                                className="h-full w-full object-cover" 
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="description">Description</Label>
                      <Textarea 
                        id="description" 
                        placeholder="Describe the property and investment opportunity" 
                        rows={4}
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                      />
                    </div>

                    <div className="flex justify-end">
                      <Button onClick={handleNextStep} className="flex items-center gap-2">
                        Next <PlusCircle className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                )}

                {uploadStep === 2 && (
                  <div className="space-y-6">
                    <h3 className="text-lg font-medium">Financial Details</h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <Label htmlFor="price">Price (USD)</Label>
                        <Input 
                          id="price" 
                          placeholder="e.g. 2,500,000" 
                          value={price}
                          onChange={(e) => setPrice(e.target.value)}
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="target-roi">Target ROI (%)</Label>
                        <Input 
                          id="target-roi" 
                          placeholder="e.g. 12.5" 
                          value={targetROI}
                          onChange={(e) => setTargetROI(e.target.value)}
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="funding-goal">Funding Goal (USD)</Label>
                        <Input 
                          id="funding-goal" 
                          placeholder="e.g. 1,800,000" 
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="min-investment">Minimum Investment (USD)</Label>
                        <Input 
                          id="min-investment" 
                          placeholder="e.g. 10,000" 
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="funding-period">Funding Period (days)</Label>
                        <Input 
                          id="funding-period" 
                          placeholder="e.g. 90" 
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="expected-term">Expected Term (years)</Label>
                        <Input 
                          id="expected-term" 
                          placeholder="e.g. 5" 
                        />
                      </div>
                    </div>

                    <div className="flex justify-between">
                      <Button variant="outline" onClick={handlePrevStep} className="flex items-center gap-2">
                        Back
                      </Button>
                      <Button onClick={handleNextStep} className="flex items-center gap-2">
                        Next <PlusCircle className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                )}

                {uploadStep === 3 && (
                  <div className="space-y-6">
                    <h3 className="text-lg font-medium">Documents & Submission</h3>
                    
                    <div className="space-y-4">
                      <div className="border rounded-md p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <FileText className="text-primary" />
                            <span>Property Appraisal</span>
                          </div>
                          <Button variant="outline" size="sm">Upload</Button>
                        </div>
                      </div>
                      
                      <div className="border rounded-md p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <FileText className="text-primary" />
                            <span>Financial Projections</span>
                          </div>
                          <Button variant="outline" size="sm">Upload</Button>
                        </div>
                      </div>
                      
                      <div className="border rounded-md p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <FileText className="text-primary" />
                            <span>Legal Documents</span>
                          </div>
                          <Button variant="outline" size="sm">Upload</Button>
                        </div>
                      </div>
                      
                      <div className="border rounded-md p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <FileText className="text-primary" />
                            <span>Market Analysis</span>
                          </div>
                          <Button variant="outline" size="sm">Upload</Button>
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-between mt-8">
                      <Button variant="outline" onClick={handlePrevStep}>
                        Back
                      </Button>
                      <Button onClick={handleSubmitDeal} className="flex items-center gap-2">
                        Submit Deal <Save className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            </TabsContent>

            <TabsContent value="manage-deals">
              <Card className="p-6">
                <h2 className="text-xl font-semibold mb-6">Manage Your Deals</h2>
                
                <div className="space-y-4">
                  <div className="border rounded-md p-4 hover:bg-gray-50">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <img 
                          src="https://images.unsplash.com/photo-1486406146926-c627a92ad1ab" 
                          alt="Property" 
                          className="w-16 h-16 object-cover rounded" 
                        />
                        <div>
                          <h3 className="font-medium">The International Gem Tower</h3>
                          <p className="text-sm text-gray-500">New York | $2,700,000</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm bg-green-100 text-green-800 px-2 py-1 rounded">91% Funded</span>
                        <Button variant="outline" size="sm">Edit</Button>
                        <Button variant="outline" size="sm">View</Button>
                      </div>
                    </div>
                  </div>
                  
                  <div className="border rounded-md p-4 hover:bg-gray-50">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <img 
                          src="https://images.unsplash.com/photo-1487958449943-2429e8be8625" 
                          alt="Property" 
                          className="w-16 h-16 object-cover rounded" 
                        />
                        <div>
                          <h3 className="font-medium">401 N Michigan Ave</h3>
                          <p className="text-sm text-gray-500">Chicago | $8,770,000</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm bg-yellow-100 text-yellow-800 px-2 py-1 rounded">81% Funded</span>
                        <Button variant="outline" size="sm">Edit</Button>
                        <Button variant="outline" size="sm">View</Button>
                      </div>
                    </div>
                  </div>
                  
                  <div className="border rounded-md p-4 hover:bg-gray-50">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <img 
                          src="https://images.unsplash.com/photo-1518005020951-eccb494ad742" 
                          alt="Property" 
                          className="w-16 h-16 object-cover rounded" 
                        />
                        <div>
                          <h3 className="font-medium">Tech Hub Square</h3>
                          <p className="text-sm text-gray-500">Silicon Valley | $12,500,000</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm bg-green-100 text-green-800 px-2 py-1 rounded">95% Funded</span>
                        <Button variant="outline" size="sm">Edit</Button>
                        <Button variant="outline" size="sm">View</Button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-6 flex justify-center">
                  <Button className="flex items-center gap-2">
                    <PlusCircle className="w-4 h-4" /> Add New Deal
                  </Button>
                </div>
              </Card>
            </TabsContent>

            <TabsContent value="manage-investors">
              <Card className="p-6">
                <h2 className="text-xl font-semibold mb-6">Manage Investors</h2>
                
                <div className="space-y-4">
                  <div className="border rounded-md p-4">
                    <h3 className="font-medium mb-4">International Gem Tower Investors</h3>
                    
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Investor</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Investment</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          <tr>
                            <td className="px-6 py-4 whitespace-nowrap">John Smith</td>
                            <td className="px-6 py-4 whitespace-nowrap">$250,000</td>
                            <td className="px-6 py-4 whitespace-nowrap">2023-05-12</td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                                Active
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                              <Button variant="ghost" size="sm">Contact</Button>
                            </td>
                          </tr>
                          <tr>
                            <td className="px-6 py-4 whitespace-nowrap">Jane Doe</td>
                            <td className="px-6 py-4 whitespace-nowrap">$175,000</td>
                            <td className="px-6 py-4 whitespace-nowrap">2023-05-14</td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                                Active
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                              <Button variant="ghost" size="sm">Contact</Button>
                            </td>
                          </tr>
                          <tr>
                            <td className="px-6 py-4 whitespace-nowrap">Robert Johnson</td>
                            <td className="px-6 py-4 whitespace-nowrap">$350,000</td>
                            <td className="px-6 py-4 whitespace-nowrap">2023-05-10</td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800">
                                Pending
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                              <Button variant="ghost" size="sm">Contact</Button>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </Card>
            </TabsContent>

            <TabsContent value="due-diligence">
              <Card className="p-6">
                <h2 className="text-xl font-semibold mb-6">Due Diligence</h2>
                
                <div className="space-y-4">
                  <div className="border rounded-md p-4">
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="font-medium">Tech Hub Square - Due Diligence Checklist</h3>
                      <span className="text-sm bg-yellow-100 text-yellow-800 px-2 py-1 rounded">In Progress</span>
                    </div>
                    
                    <div className="space-y-2">
                      <div className="flex items-center justify-between p-2 hover:bg-gray-50 rounded-md">
                        <div className="flex items-center gap-3">
                          <CheckCircle className="text-green-500 w-5 h-5" />
                          <span>Financial Statement Review</span>
                        </div>
                        <span className="text-sm text-gray-500">Completed on May 15, 2023</span>
                      </div>
                      
                      <div className="flex items-center justify-between p-2 hover:bg-gray-50 rounded-md">
                        <div className="flex items-center gap-3">
                          <CheckCircle className="text-green-500 w-5 h-5" />
                          <span>Property Title Search</span>
                        </div>
                        <span className="text-sm text-gray-500">Completed on May 17, 2023</span>
                      </div>
                      
                      <div className="flex items-center justify-between p-2 hover:bg-gray-50 rounded-md">
                        <div className="flex items-center gap-3">
                          <Clock className="text-yellow-500 w-5 h-5" />
                          <span>Environmental Assessment</span>
                        </div>
                        <Button size="sm" variant="outline">Upload Results</Button>
                      </div>
                      
                      <div className="flex items-center justify-between p-2 hover:bg-gray-50 rounded-md">
                        <div className="flex items-center gap-3">
                          <Clock className="text-yellow-500 w-5 h-5" />
                          <span>Property Inspection</span>
                        </div>
                        <Button size="sm" variant="outline">Upload Report</Button>
                      </div>
                      
                      <div className="flex items-center justify-between p-2 hover:bg-gray-50 rounded-md">
                        <div className="flex items-center gap-3">
                          <X className="text-gray-300 w-5 h-5" />
                          <span>Legal Compliance Review</span>
                        </div>
                        <Button size="sm" variant="outline">Schedule</Button>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            </TabsContent>
          </Tabs>
        </main>
      </div>
    </div>
  );
};

export default EntrepreneurPortal;
