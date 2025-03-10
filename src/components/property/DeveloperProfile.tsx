
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Building, Users, FileText, AlertTriangle, MapPin, BarChart, Star } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface DeveloperProfileProps {
  developer: {
    id: string;
    name: string;
    rating: number;
    location: string;
    foundedYear: number;
    completedProjects: number;
    teamSize: string;
    bio: string;
    pastProjects: {
      name: string;
      year: number;
      roi: number;
      location: string;
    }[];
    performanceData: {
      year: string;
      roi: number;
    }[];
    riskFactors: string[];
    legalHistory: string;
    mediaArticles: {
      title: string;
      source: string;
      date: string;
      url: string;
    }[];
  };
}

export const DeveloperProfile = ({ developer }: DeveloperProfileProps) => {
  const [activeTab, setActiveTab] = useState("overview");
  
  const renderStars = (rating: number) => {
    const stars = [];
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 >= 0.5;
    
    for (let i = 1; i <= 5; i++) {
      if (i <= fullStars) {
        stars.push(<Star key={i} className="fill-yellow-400 text-yellow-400 w-4 h-4" />);
      } else if (i === fullStars + 1 && hasHalfStar) {
        stars.push(<Star key={i} className="fill-yellow-400 text-yellow-400 w-4 h-4 fill-[50%]" />);
      } else {
        stars.push(<Star key={i} className="text-gray-300 w-4 h-4" />);
      }
    }
    
    return stars;
  };
  
  return (
    <Card className="w-full overflow-hidden border">
      <div className="p-6 border-b bg-gray-50">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-xl font-bold">{developer.name}</h2>
            <div className="flex items-center mt-1 gap-2">
              <div className="flex items-center">
                {renderStars(developer.rating)}
                <span className="ml-2 text-sm font-medium">{developer.rating}/5</span>
              </div>
              <span className="text-gray-500 text-sm">•</span>
              <div className="flex items-center text-gray-500 text-sm">
                <MapPin className="w-3 h-3 mr-1" />
                {developer.location}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <div className="flex flex-col items-center">
              <span className="font-medium">{developer.foundedYear}</span>
              <span className="text-gray-500 text-xs">Founded</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="font-medium">{developer.completedProjects}</span>
              <span className="text-gray-500 text-xs">Projects</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="font-medium">{developer.teamSize}</span>
              <span className="text-gray-500 text-xs">Team</span>
            </div>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="px-6 pt-4 border-b">
          <TabsList className="grid w-full sm:w-auto sm:inline-grid grid-cols-2 sm:grid-cols-5 h-auto gap-2">
            <TabsTrigger value="overview" className="px-3 py-2">
              <Building className="w-4 h-4 mr-2 sm:mr-0 md:mr-2" />
              <span className="hidden sm:inline-block md:inline-block">Overview</span>
            </TabsTrigger>
            <TabsTrigger value="performance" className="px-3 py-2">
              <BarChart className="w-4 h-4 mr-2 sm:mr-0 md:mr-2" />
              <span className="hidden sm:inline-block md:inline-block">Performance</span>
            </TabsTrigger>
            <TabsTrigger value="projects" className="px-3 py-2">
              <Building className="w-4 h-4 mr-2 sm:mr-0 md:mr-2" />
              <span className="hidden sm:inline-block md:inline-block">Projects</span>
            </TabsTrigger>
            <TabsTrigger value="media" className="px-3 py-2">
              <FileText className="w-4 h-4 mr-2 sm:mr-0 md:mr-2" />
              <span className="hidden sm:inline-block md:inline-block">Media</span>
            </TabsTrigger>
            <TabsTrigger value="risks" className="px-3 py-2">
              <AlertTriangle className="w-4 h-4 mr-2 sm:mr-0 md:mr-2" />
              <span className="hidden sm:inline-block md:inline-block">Risks</span>
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="p-6">
          <TabsContent value="overview" className="mt-0">
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-medium mb-2">About {developer.name}</h3>
                <p className="text-gray-700">{developer.bio}</p>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h4 className="font-medium flex items-center"><Users className="w-4 h-4 mr-2" /> Company Details</h4>
                  <div className="mt-2 space-y-2">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Founded</span>
                      <span>{developer.foundedYear}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Location</span>
                      <span>{developer.location}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Team Size</span>
                      <span>{developer.teamSize}</span>
                    </div>
                  </div>
                </div>
                
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h4 className="font-medium flex items-center"><Building className="w-4 h-4 mr-2" /> Track Record</h4>
                  <div className="mt-2 space-y-2">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Completed Projects</span>
                      <span>{developer.completedProjects}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Average ROI</span>
                      <span>{developer.performanceData.reduce((acc, curr) => acc + curr.roi, 0) / developer.performanceData.length}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Legal History</span>
                      <span>Clean</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="performance" className="mt-0">
            <div>
              <h3 className="text-lg font-medium mb-4">Historical Performance</h3>
              <div className="h-64 sm:h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={developer.performanceData}
                    margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="year" />
                    <YAxis unit="%" />
                    <Tooltip formatter={(value) => [`${value}%`, 'ROI']} />
                    <Area type="monotone" dataKey="roi" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.3} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              
              <div className="mt-6 bg-gray-50 p-4 rounded-lg">
                <h4 className="font-medium mb-2">Performance Metrics</h4>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Highest Annual ROI</span>
                    <span className="font-medium">{Math.max(...developer.performanceData.map(d => d.roi))}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Average Annual ROI</span>
                    <span className="font-medium">{(developer.performanceData.reduce((acc, curr) => acc + curr.roi, 0) / developer.performanceData.length).toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Profitable Years</span>
                    <span className="font-medium">{developer.performanceData.filter(d => d.roi > 0).length} / {developer.performanceData.length}</span>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="projects" className="mt-0">
            <h3 className="text-lg font-medium mb-4">Past Projects</h3>
            <div className="space-y-4">
              {developer.pastProjects.map((project, index) => (
                <div key={index} className="border rounded-lg overflow-hidden">
                  <div className="p-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-medium">{project.name}</h4>
                        <div className="flex items-center text-sm text-gray-500 mt-1">
                          <MapPin className="w-3 h-3 mr-1" />
                          <span>{project.location}</span>
                          <span className="mx-2">•</span>
                          <span>{project.year}</span>
                        </div>
                      </div>
                      <div className="bg-blue-50 text-blue-700 font-medium px-2 py-1 rounded text-sm">
                        {project.roi}% ROI
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="media" className="mt-0">
            <h3 className="text-lg font-medium mb-4">Media Coverage</h3>
            <div className="space-y-4">
              {developer.mediaArticles.map((article, index) => (
                <div key={index} className="border rounded-lg p-4">
                  <h4 className="font-medium text-blue-600 hover:underline">
                    <a href={article.url} target="_blank" rel="noopener noreferrer">
                      {article.title}
                    </a>
                  </h4>
                  <div className="flex items-center text-sm text-gray-500 mt-1">
                    <span className="font-medium">{article.source}</span>
                    <span className="mx-2">•</span>
                    <span>{article.date}</span>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="risks" className="mt-0">
            <h3 className="text-lg font-medium mb-4">Risk Assessment</h3>
            <div className="bg-yellow-50 border border-yellow-100 rounded-lg p-4 mb-4">
              <div className="flex items-start">
                <AlertTriangle className="w-5 h-5 text-yellow-500 mt-0.5 mr-2" />
                <div>
                  <h4 className="font-medium text-yellow-800">Risk Disclosure</h4>
                  <p className="text-yellow-700 text-sm mt-1">
                    All investments carry risks. Please review the following risk factors before investing
                    with this developer. Past performance does not guarantee future results.
                  </p>
                </div>
              </div>
            </div>
            
            <div className="space-y-4">
              {developer.riskFactors.map((risk, index) => (
                <div key={index} className="flex items-start">
                  <div className="bg-gray-100 p-1 rounded-full mr-3 mt-0.5">
                    <AlertTriangle className="w-4 h-4 text-gray-500" />
                  </div>
                  <div>
                    <p className="text-gray-700">{risk}</p>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="mt-6 bg-gray-50 p-4 rounded-lg">
              <h4 className="font-medium mb-2">Legal History</h4>
              <p className="text-gray-700">{developer.legalHistory}</p>
            </div>
          </TabsContent>
        </div>
      </Tabs>
    </Card>
  );
};
