
import React from 'react';
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart, Calendar, FileText, History, ShieldAlert, Users } from "lucide-react";
import { DeveloperProfileHeader } from './developer/DeveloperProfileHeader';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Developer } from '@/data/developers';
import { useIsMobile } from "@/hooks/use-mobile";

interface DeveloperProfileModalProps {
  developer: Developer;
}

export const DeveloperProfileModal = ({ developer }: DeveloperProfileModalProps) => {
  const isMobile = useIsMobile();
  
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button 
          variant="link" 
          className="p-0 h-auto flex items-center gap-1 text-gray-800 hover:text-primary"
        >
          <span>{developer.name}</span>
          <span className="text-yellow-500 text-sm ml-1">★ {developer.rating}</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DeveloperProfileHeader developer={developer} />

        <Tabs defaultValue="overview" className="mt-4">
          {/* Custom mobile-friendly tabs layout */}
          <div className="relative overflow-x-auto pb-2 -mx-2 px-2">
            <TabsList className={`grid w-full h-auto ${isMobile ? 'grid-cols-2 gap-1' : 'grid-cols-5'}`}>
              {isMobile ? (
                <>
                  <div className="contents">
                    <TabsTrigger value="overview" className="text-xs py-2 px-1">Overview</TabsTrigger>
                    <TabsTrigger value="projects" className="text-xs py-2 px-1">Past Projects</TabsTrigger>
                  </div>
                  <div className="contents">
                    <TabsTrigger value="performance" className="text-xs py-2 px-1">Performance</TabsTrigger>
                    <TabsTrigger value="risk" className="text-xs py-2 px-1">Risk Factors</TabsTrigger>
                  </div>
                  <div className="col-span-2 mt-1">
                    <TabsTrigger value="media" className="text-xs py-2 w-full">Media & Legal</TabsTrigger>
                  </div>
                </>
              ) : (
                <>
                  <TabsTrigger value="overview" className="text-xs py-2">Overview</TabsTrigger>
                  <TabsTrigger value="projects" className="text-xs py-2">Past Projects</TabsTrigger>
                  <TabsTrigger value="performance" className="text-xs py-2">Performance</TabsTrigger>
                  <TabsTrigger value="risk" className="text-xs py-2">Risk Factors</TabsTrigger>
                  <TabsTrigger value="media" className="text-xs py-2">Media & Legal</TabsTrigger>
                </>
              )}
            </TabsList>
          </div>
          
          <TabsContent value="overview" className="pt-4 block">
            <div className="mb-4">
              <h3 className="text-sm font-semibold mb-2">About {developer.name}</h3>
              <p className="text-sm text-gray-700">{developer.bio}</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
              <div className="bg-gray-50 p-3 rounded-lg">
                <div className="flex items-center mb-2">
                  <Calendar className="w-4 h-4 text-primary mr-2" />
                  <h4 className="text-sm font-medium">Founded</h4>
                </div>
                <p className="text-lg font-bold">{developer.foundedYear}</p>
                <p className="text-xs text-gray-500">
                  {new Date().getFullYear() - developer.foundedYear} years in business
                </p>
              </div>
              
              <div className="bg-gray-50 p-3 rounded-lg">
                <div className="flex items-center mb-2">
                  <History className="w-4 h-4 text-primary mr-2" />
                  <h4 className="text-sm font-medium">Completed Projects</h4>
                </div>
                <p className="text-lg font-bold">{developer.completedProjects}</p>
                <p className="text-xs text-gray-500">Successful developments</p>
              </div>
              
              <div className="bg-gray-50 p-3 rounded-lg">
                <div className="flex items-center mb-2">
                  <Users className="w-4 h-4 text-primary mr-2" />
                  <h4 className="text-sm font-medium">Team Size</h4>
                </div>
                <p className="text-lg font-bold">{developer.teamSize}</p>
                <p className="text-xs text-gray-500">Development professionals</p>
              </div>
            </div>
          </TabsContent>
          
          <TabsContent value="projects" className="pt-4 block">
            <h3 className="text-sm font-semibold mb-3">Past Project History</h3>
            <div className="space-y-3">
              {developer.pastProjects.map((project, index) => (
                <div key={index} className="bg-gray-50 p-3 rounded-lg">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-medium text-sm">{project.name}</h4>
                      <p className="text-xs text-gray-500">{project.location}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-xs text-gray-500">Completed</span>
                      <p className="font-medium">{project.year}</p>
                    </div>
                  </div>
                  <div className="flex justify-between items-center mt-2 pt-2 border-t border-gray-200">
                    <div className="flex items-center">
                      <BarChart className="w-3 h-3 text-primary mr-1" />
                      <span className="text-xs">ROI</span>
                    </div>
                    <span className="font-medium text-sm">{project.roi}%</span>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>
          
          <TabsContent value="performance" className="pt-4 block">
            <h3 className="text-sm font-semibold mb-3">Annual ROI Performance</h3>
            <div className="h-64 bg-gray-50 p-3 rounded-lg">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={developer.performanceData}
                  margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="year" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Area 
                    type="monotone" 
                    dataKey="roi" 
                    name="ROI %" 
                    stroke="#1A2E5A" 
                    fill="#1A2E5A" 
                    fillOpacity={0.3} 
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            
            <div className="mt-4 bg-gray-50 p-3 rounded-lg">
              <div className="flex items-center mb-2">
                <BarChart className="w-4 h-4 text-primary mr-2" />
                <h4 className="text-sm font-medium">Key Performance Indicators</h4>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm">Average ROI</span>
                  <span className="font-medium">
                    {(developer.performanceData.reduce((acc, curr) => acc + curr.roi, 0) / developer.performanceData.length).toFixed(1)}%
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm">Latest ROI</span>
                  <span className="font-medium">
                    {developer.performanceData[developer.performanceData.length - 1].roi}%
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm">Projects Delivered On Time</span>
                  <span className="font-medium">95%</span>
                </div>
              </div>
            </div>
          </TabsContent>
          
          <TabsContent value="risk" className="pt-4 block">
            <h3 className="text-sm font-semibold mb-3">Risk Assessment</h3>
            <div className="space-y-3">
              {developer.riskFactors.map((risk, index) => (
                <div key={index} className="flex items-start p-3 bg-gray-50 rounded-lg">
                  <ShieldAlert className="w-4 h-4 text-amber-500 mr-2 mt-0.5 flex-shrink-0" />
                  <p className="text-sm">{risk}</p>
                </div>
              ))}
            </div>
            
            <div className="mt-4 bg-gray-50 p-3 rounded-lg">
              <h3 className="text-sm font-semibold mb-2">Risk Mitigation Strategies</h3>
              <ul className="text-sm space-y-2">
                <li className="flex items-start">
                  <span className="text-primary mr-2">•</span>
                  <span>Strict due diligence process for all investments</span>
                </li>
                <li className="flex items-start">
                  <span className="text-primary mr-2">•</span>
                  <span>Diversified project portfolio across multiple markets</span>
                </li>
                <li className="flex items-start">
                  <span className="text-primary mr-2">•</span>
                  <span>Conservative underwriting standards</span>
                </li>
                <li className="flex items-start">
                  <span className="text-primary mr-2">•</span>
                  <span>Experienced management team with market downturns experience</span>
                </li>
              </ul>
            </div>
          </TabsContent>
          
          <TabsContent value="media" className="pt-4 block">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h3 className="text-sm font-semibold mb-3">Recent Media Coverage</h3>
                <div className="space-y-3">
                  {developer.mediaArticles.map((article, index) => (
                    <div key={index} className="bg-gray-50 p-3 rounded-lg">
                      <div className="flex items-start">
                        <FileText className="w-4 h-4 text-primary mr-2 mt-0.5 flex-shrink-0" />
                        <div>
                          <h4 className="text-sm font-medium">{article.title}</h4>
                          <div className="flex items-center mt-1">
                            <span className="text-xs text-gray-500">{article.source}</span>
                            <span className="mx-1 text-gray-300">•</span>
                            <span className="text-xs text-gray-500">{article.date}</span>
                          </div>
                        </div>
                      </div>
                      <div className="mt-2 text-right">
                        <a 
                          href={article.url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-xs text-primary hover:underline"
                        >
                          Read Article
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              
              <div>
                <h3 className="text-sm font-semibold mb-3">Legal History</h3>
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="text-sm">{developer.legalHistory}</p>
                </div>
                
                <h3 className="text-sm font-semibold mb-3 mt-4">Compliance Record</h3>
                <div className="bg-gray-50 p-3 rounded-lg">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm">Regulatory Compliance</span>
                    <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full">
                      Excellent
                    </span>
                  </div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm">Legal Disputes</span>
                    <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full">
                      Minimal
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Environmental Compliance</span>
                    <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full">
                      Excellent
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
