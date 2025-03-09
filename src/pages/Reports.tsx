
import { AppSidebar } from "@/components/AppSidebar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { FileText, Download, ExternalLink, ChevronRight, Calendar, BarChart, PieChart, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";

const Reports = () => {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  
  const handleReportClick = (reportTitle: string) => {
    toast({
      title: "Opening Report",
      description: `Loading ${reportTitle}...`,
    });
  };
  
  const handleDownload = (reportTitle: string) => {
    toast({
      title: "Download Started",
      description: `Downloading ${reportTitle}...`,
    });
  };

  const quarterlyReports = [
    {
      title: "Q1 2024 Investment Summary",
      date: "2024-03-31",
      type: "Quarterly Report",
      size: "4.2 MB",
      icon: BarChart,
      description: "Comprehensive analysis of Q1 2024 investment performance, including ROI, capital gains, and market trends.",
    },
    {
      title: "Q4 2023 Investment Summary",
      date: "2023-12-31",
      type: "Quarterly Report",
      size: "3.8 MB",
      icon: BarChart,
      description: "Detailed report covering Q4 2023 performance metrics, year-end summary, and tax considerations.",
    },
    {
      title: "Q3 2023 Investment Summary",
      date: "2023-09-30",
      type: "Quarterly Report",
      size: "3.5 MB",
      icon: BarChart,
      description: "Analysis of Q3 2023 performance with focus on market volatility and strategic adjustments.",
    },
  ];

  const annualReports = [
    {
      title: "Annual Performance Review 2023",
      date: "2024-01-15",
      type: "Annual Report",
      size: "12.7 MB",
      icon: Calendar,
      description: "Complete annual review of investment performance, tax implications, and strategic planning for 2024.",
    },
    {
      title: "Annual Performance Review 2022",
      date: "2023-01-20",
      type: "Annual Report",
      size: "11.3 MB",
      icon: Calendar,
      description: "Year-in-review report highlighting key metrics, portfolio changes, and comparative analysis against benchmarks.",
    },
  ];

  const propertyReports = [
    {
      title: "Property Assessment: Tech Hub Square",
      date: "2024-02-28",
      type: "Property Report",
      size: "8.4 MB",
      icon: PieChart,
      description: "Detailed assessment of Tech Hub Square property including valuation, occupancy rates, and improvement recommendations.",
    },
    {
      title: "Property Assessment: 401 N Michigan Ave",
      date: "2024-01-25",
      type: "Property Report",
      size: "7.9 MB",
      icon: PieChart,
      description: "Comprehensive analysis of the 401 N Michigan Ave property with tenant analysis and maintenance forecasts.",
    },
    {
      title: "Market Analysis: Silicon Valley Commercial Real Estate",
      date: "2024-03-15",
      type: "Market Report",
      size: "5.6 MB",
      icon: TrendingUp,
      description: "In-depth market analysis of commercial real estate trends in Silicon Valley with 5-year projections.",
    },
  ];

  return (
    <div className="flex min-h-screen">
      <AppSidebar />
      <div className="flex-1 bg-gray-50 w-full">
        <div className="container mx-auto px-3 sm:px-4 py-4 md:py-8">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 sm:mb-6 gap-3">
            <h1 className="text-xl md:text-2xl font-bold">Reports</h1>
            <Button variant="outline" onClick={() => {
              toast({
                title: "Generate Report",
                description: "Opening report generation tool...",
              });
            }}>
              Generate New Report
            </Button>
          </div>
          
          <Tabs defaultValue="quarterly" className="mb-6">
            <TabsList className="mb-4 w-full tabs-list">
              <TabsTrigger className="tabs-trigger flex-1" value="quarterly">Quarterly Reports</TabsTrigger>
              <TabsTrigger className="tabs-trigger flex-1" value="annual">Annual Reports</TabsTrigger>
              <TabsTrigger className="tabs-trigger flex-1" value="property">Property Reports</TabsTrigger>
            </TabsList>
            
            <TabsContent value="quarterly">
              <div className="grid gap-4">
                {quarterlyReports.map((report) => (
                  <Card key={report.title} className="report-card">
                    <CardHeader className="report-card-header pb-2">
                      <div className="report-icon-container">
                        <report.icon className="w-6 h-6 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <CardTitle className="text-base md:text-lg truncate">{report.title}</CardTitle>
                        <CardDescription className="text-xs md:text-sm">{report.date} • {report.type}</CardDescription>
                      </div>
                    </CardHeader>
                    <CardContent className="report-card-content">
                      <p className="report-description">{report.description}</p>
                      <p className="text-xs text-gray-500">File size: {report.size}</p>
                    </CardContent>
                    <CardFooter className="report-card-footer">
                      <Button variant="outline" size={isMobile ? "sm" : "default"} onClick={() => handleDownload(report.title)}>
                        <Download className="w-3 h-3 md:w-4 md:h-4 mr-1 md:mr-2" /> Download
                      </Button>
                      <Button size={isMobile ? "sm" : "default"} onClick={() => handleReportClick(report.title)}>
                        View Report <ChevronRight className="w-3 h-3 md:w-4 md:h-4 ml-1" />
                      </Button>
                    </CardFooter>
                  </Card>
                ))}
              </div>
            </TabsContent>
            
            <TabsContent value="annual">
              <div className="grid gap-4">
                {annualReports.map((report) => (
                  <Card key={report.title} className="report-card">
                    <CardHeader className="report-card-header pb-2">
                      <div className="report-icon-container">
                        <report.icon className="w-6 h-6 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <CardTitle className="text-base md:text-lg truncate">{report.title}</CardTitle>
                        <CardDescription className="text-xs md:text-sm">{report.date} • {report.type}</CardDescription>
                      </div>
                    </CardHeader>
                    <CardContent className="report-card-content">
                      <p className="report-description">{report.description}</p>
                      <p className="text-xs text-gray-500">File size: {report.size}</p>
                    </CardContent>
                    <CardFooter className="report-card-footer">
                      <Button variant="outline" size={isMobile ? "sm" : "default"} onClick={() => handleDownload(report.title)}>
                        <Download className="w-3 h-3 md:w-4 md:h-4 mr-1 md:mr-2" /> Download
                      </Button>
                      <Button size={isMobile ? "sm" : "default"} onClick={() => handleReportClick(report.title)}>
                        View Report <ChevronRight className="w-3 h-3 md:w-4 md:h-4 ml-1" />
                      </Button>
                    </CardFooter>
                  </Card>
                ))}
              </div>
            </TabsContent>
            
            <TabsContent value="property">
              <div className="grid gap-4">
                {propertyReports.map((report) => (
                  <Card key={report.title} className="report-card">
                    <CardHeader className="report-card-header pb-2">
                      <div className="report-icon-container">
                        <report.icon className="w-6 h-6 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <CardTitle className="text-base md:text-lg truncate">{report.title}</CardTitle>
                        <CardDescription className="text-xs md:text-sm">{report.date} • {report.type}</CardDescription>
                      </div>
                    </CardHeader>
                    <CardContent className="report-card-content">
                      <p className="report-description">{report.description}</p>
                      <p className="text-xs text-gray-500">File size: {report.size}</p>
                    </CardContent>
                    <CardFooter className="report-card-footer">
                      <Button variant="outline" size={isMobile ? "sm" : "default"} onClick={() => handleDownload(report.title)}>
                        <Download className="w-3 h-3 md:w-4 md:h-4 mr-1 md:mr-2" /> Download
                      </Button>
                      <Button size={isMobile ? "sm" : "default"} onClick={() => handleReportClick(report.title)}>
                        View Report <ChevronRight className="w-3 h-3 md:w-4 md:h-4 ml-1" />
                      </Button>
                    </CardFooter>
                  </Card>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
};

export default Reports;
