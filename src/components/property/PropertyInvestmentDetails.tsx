
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { FileText, MessageSquare } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, BarChart as RechartsBarChart, Bar, PieChart, Pie, Cell, Legend } from "recharts";

interface PropertyInvestmentDetailsProps {
  cashFlowData: any[];
  roiComponentsData: any[];
  riskAssessmentData: any[];
  chartColors: string[];
}

export const PropertyInvestmentDetails = ({
  cashFlowData,
  roiComponentsData,
  riskAssessmentData,
  chartColors
}: PropertyInvestmentDetailsProps) => {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Investment Details</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <Tabs defaultValue="analysis">
          <TabsList className="mb-3 w-full h-9">
            <TabsTrigger value="analysis" className="text-xs h-7">Financial Analysis</TabsTrigger>
            <TabsTrigger value="documents" className="text-xs h-7">Documents</TabsTrigger>
            <TabsTrigger value="qa" className="text-xs h-7">Q&A</TabsTrigger>
          </TabsList>
          
          <TabsContent value="analysis">
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-medium mb-3">5-Year Cash Flow Projections</h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={cashFlowData} margin={{
                    top: 10,
                    right: 30,
                    left: 0,
                    bottom: 0
                  }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="year" tick={{
                      fontSize: 12
                    }} />
                      <YAxis tick={{
                      fontSize: 12
                    }} />
                      <RechartsTooltip contentStyle={{
                      fontSize: 12
                    }} />
                      <Area type="monotone" dataKey="cashFlow" stroke="#1A2E5A" fill="#1A2E5A" fillOpacity={0.3} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-sm font-medium mb-3">ROI Components</h3>
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={roiComponentsData} cx="50%" cy="50%" labelLine={false} outerRadius={70} fill="#007BFF" dataKey="value" label={({
                        name,
                        percent
                      }) => `${name}: ${(percent * 100).toFixed(0)}%`}>
                          {roiComponentsData.map((entry, index) => <Cell key={`cell-${index}`} fill={chartColors[index % chartColors.length]} />)}
                        </Pie>
                        <RechartsTooltip contentStyle={{
                        fontSize: 12
                      }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                
                <div>
                  <h3 className="text-sm font-medium mb-3">Risk Assessment</h3>
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <RechartsBarChart data={riskAssessmentData} margin={{
                      top: 20,
                      right: 30,
                      left: 20,
                      bottom: 5
                    }} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" domain={[0, 10]} tick={{
                        fontSize: 12
                      }} />
                        <YAxis dataKey="name" type="category" width={120} tick={{
                        fontSize: 12
                      }} />
                        <RechartsTooltip contentStyle={{
                        fontSize: 12
                      }} />
                        <Legend wrapperStyle={{
                        fontSize: 12
                      }} />
                        <Bar dataKey="score" fill="#007BFF" name="Risk Score (lower is better)" />
                      </RechartsBarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>
          
          <TabsContent value="documents">
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-primary" />
                  <div>
                    <h4 className="text-sm font-medium">Investment Prospectus</h4>
                    <p className="text-xs text-gray-500">Detailed overview of the investment</p>
                  </div>
                </div>
                <Button size="sm" className="h-7 text-xs px-2">View</Button>
              </div>
              
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-primary" />
                  <div>
                    <h4 className="text-sm font-medium">Financial Projections</h4>
                    <p className="text-xs text-gray-500">Cash flow projections</p>
                  </div>
                </div>
                <Button size="sm" className="h-7 text-xs px-2">View</Button>
              </div>
              
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-primary" />
                  <div>
                    <h4 className="text-sm font-medium">Property Appraisal</h4>
                    <p className="text-xs text-gray-500">Professional property valuation</p>
                  </div>
                </div>
                <Button size="sm" className="h-7 text-xs px-2">View</Button>
              </div>
              
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-primary" />
                  <div>
                    <h4 className="text-sm font-medium">Market Analysis</h4>
                    <p className="text-xs text-gray-500">Analysis of local real estate market</p>
                  </div>
                </div>
                <Button size="sm" className="h-7 text-xs px-2">View</Button>
              </div>
              
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-primary" />
                  <div>
                    <h4 className="text-sm font-medium">Legal Documentation</h4>
                    <p className="text-xs text-gray-500">Investment terms and agreements</p>
                  </div>
                </div>
                <Button size="sm" className="h-7 text-xs px-2">View</Button>
              </div>
            </div>
          </TabsContent>
          
          <TabsContent value="qa">
            <div className="space-y-3">
              <div className="border rounded-md p-3">
                <div className="flex items-start gap-2">
                  <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-xs font-semibold">
                    JD
                  </div>
                  <div>
                    <div className="flex items-center gap-1">
                      <h4 className="text-sm font-medium">John Doe</h4>
                      <span className="text-xs text-gray-500">2 days ago</span>
                    </div>
                    <p className="mt-1 text-xs">What is the expected timeline for the first distribution after funding completes?</p>
                    
                    <div className="mt-2 pl-3 border-l-2 border-gray-200">
                      <div className="flex items-center gap-1">
                        <h4 className="text-xs font-medium text-primary">Property Developer</h4>
                        <span className="text-xs text-gray-500">1 day ago</span>
                      </div>
                      <p className="mt-0.5 text-xs">The first distribution is scheduled for approximately 90 days after the funding period closes, assuming we reach our funding goal on time.</p>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="border rounded-md p-3">
                <div className="flex items-start gap-2">
                  <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-xs font-semibold">
                    SM
                  </div>
                  <div>
                    <div className="flex items-center gap-1">
                      <h4 className="text-sm font-medium">Sarah Miller</h4>
                      <span className="text-xs text-gray-500">1 week ago</span>
                    </div>
                    <p className="mt-1 text-xs">Are there any plans for property renovations that might impact the cash flow in year 1?</p>
                    
                    <div className="mt-2 pl-3 border-l-2 border-gray-200">
                      <div className="flex items-center gap-1">
                        <h4 className="text-xs font-medium text-primary">Property Developer</h4>
                        <span className="text-xs text-gray-500">5 days ago</span>
                      </div>
                      <p className="mt-0.5 text-xs">We have budgeted for minor cosmetic improvements in year 1, but these costs are already factored into the cash flow projections. No major renovations are planned.</p>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="mt-4">
                <h4 className="text-sm font-medium mb-1.5">Ask a Question</h4>
                <textarea className="w-full p-2 border rounded-md text-sm" rows={2} placeholder="Type your question here..."></textarea>
                <div className="flex justify-end mt-2">
                  <Button size="sm" className="h-7 text-xs">
                    <MessageSquare className="w-3.5 h-3.5 mr-1.5" />
                    Submit Question
                  </Button>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};
