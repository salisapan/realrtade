import { useEffect, useState } from "react";
import { AppSidebar } from "@/components/AppSidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  LineChart, 
  UserCircle, 
  DollarSign, 
  FileText, 
  Building2, 
  ArrowRight, 
} from "lucide-react";
import { Link } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/components/ui/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { DashboardRecommendations } from "@/components/recommendations/DashboardRecommendations";

const Dashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [userName, setUserName] = useState("Investor");
  const isMobile = useIsMobile();

  useEffect(() => {
    try {
      const profile = localStorage.getItem("investorProfile");
      if (profile) {
        const parsedProfile = JSON.parse(profile);
        setUserName(parsedProfile.fullName || "Investor");
      }
    } catch (error) {
      console.error("Error getting user name:", error);
    }
  }, []);

  const handleProfileUpdate = () => {
    navigate('/settings');
    toast({
      title: "Redirecting to settings",
      description: "Update your profile information in the settings page",
    });
  };

  const handleNavigate = (path: string) => {
    navigate(path);
  };

  return (
    <div className="flex">
      <AppSidebar />
      <div className="flex-1 min-h-screen bg-gray-50 p-4 sm:p-6 md:p-8 pb-16 md:pb-8">
        <div className="flex items-center justify-between mb-6 md:mb-8 flex-wrap gap-3">
          <div className="flex items-center gap-3 md:gap-6">
            <div className="w-12 h-12 md:w-16 md:h-16 rounded-full bg-primary/10 flex items-center justify-center cursor-pointer"
                 onClick={() => handleNavigate('/settings')}>
              <UserCircle className="w-8 h-8 md:w-10 md:h-10 text-primary" />
            </div>
            <div>
              <h1 className="text-lg md:text-2xl font-bold text-gray-900">{userName}</h1>
              <p className="text-xs md:text-sm text-gray-600">Active Investor since 2023</p>
            </div>
          </div>
          <Button onClick={handleProfileUpdate} size={isMobile ? "sm" : "default"}>
            Edit Profile
          </Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-6 mb-6 md:mb-8">
          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => handleNavigate('/wallet')}>
            <CardHeader className="flex flex-row items-center justify-between pb-1 md:pb-2 px-3 md:px-6 pt-3 md:pt-6">
              <CardTitle className="text-xs md:text-sm font-medium text-gray-500">
                Total Invested
              </CardTitle>
              <DollarSign className="w-3 h-3 md:w-4 md:h-4 text-gray-500" />
            </CardHeader>
            <CardContent className="px-3 md:px-6 pb-3 md:pb-6 pt-1 md:pt-2">
              <div className="text-lg md:text-2xl font-bold">$125,000</div>
              <p className="text-2xs md:text-xs text-green-600">+12.5% from last month</p>
            </CardContent>
          </Card>

          <Link to="/properties" className="block">
            <Card className="cursor-pointer hover:shadow-md transition-shadow h-full">
              <CardHeader className="flex flex-row items-center justify-between pb-1 md:pb-2 px-3 md:px-6 pt-3 md:pt-6">
                <CardTitle className="text-xs md:text-sm font-medium text-gray-500">
                  Active Projects
                </CardTitle>
                <Building2 className="w-3 h-3 md:w-4 md:h-4 text-gray-500" />
              </CardHeader>
              <CardContent className="px-3 md:px-6 pb-3 md:pb-6 pt-1 md:pt-2">
                <div className="text-lg md:text-2xl font-bold">8</div>
                <p className="text-2xs md:text-xs text-gray-600">Across 3 platforms</p>
              </CardContent>
            </Card>
          </Link>

          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => handleNavigate('/performance')}>
            <CardHeader className="flex flex-row items-center justify-between pb-1 md:pb-2 px-3 md:px-6 pt-3 md:pt-6">
              <CardTitle className="text-xs md:text-sm font-medium text-gray-500">
                Total Returns
              </CardTitle>
              <LineChart className="w-3 h-3 md:w-4 md:h-4 text-gray-500" />
            </CardHeader>
            <CardContent className="px-3 md:px-6 pb-3 md:pb-6 pt-1 md:pt-2">
              <div className="text-lg md:text-2xl font-bold">18.3%</div>
              <p className="text-2xs md:text-xs text-green-600">+2.1% from last quarter</p>
            </CardContent>
          </Card>

          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => handleNavigate('/reports')}>
            <CardHeader className="flex flex-row items-center justify-between pb-1 md:pb-2 px-3 md:px-6 pt-3 md:pt-6">
              <CardTitle className="text-xs md:text-sm font-medium text-gray-500">
                Reports
              </CardTitle>
              <FileText className="w-3 h-3 md:w-4 md:h-4 text-gray-500" />
            </CardHeader>
            <CardContent className="px-3 md:px-6 pb-3 md:pb-6 pt-1 md:pt-2">
              <div className="text-lg md:text-2xl font-bold">24</div>
              <p className="text-2xs md:text-xs text-gray-600">Last updated 2 days ago</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6 mb-8">
          <Card className="lg:col-span-2">
            <CardHeader className="flex justify-between items-center">
              <CardTitle className="text-base md:text-lg">Recent Activity</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => handleNavigate('/reports')} className="gap-1 md:gap-2">
                View All <ArrowRight className="w-3 h-3 md:w-4 md:h-4" />
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 md:space-y-4">
                {[
                  {
                    title: "Quarterly Report: The International Gem Tower",
                    date: "2024-03-15",
                    type: "report",
                    path: "/reports"
                  },
                  {
                    title: "Investment Return: 401 N Michigan Ave",
                    date: "2024-03-10",
                    type: "return",
                    path: "/wallet"
                  },
                  {
                    title: "New Investment: Tech Hub Project",
                    date: "2024-03-01",
                    type: "investment",
                    path: "/properties"
                  }
                ].map((activity) => (
                  <div 
                    key={activity.title} 
                    className="flex items-center justify-between border-b pb-3 md:pb-4 last:border-0 cursor-pointer hover:bg-gray-50 p-2 rounded-md transition-colors"
                    onClick={() => navigate(activity.path)}
                  >
                    <div className="min-w-0 flex-1 pr-2">
                      <p className="font-medium text-gray-900 text-sm md:text-base truncate">{activity.title}</p>
                      <p className="text-xs md:text-sm text-gray-500">{activity.date}</p>
                    </div>
                    <div className={`px-2 md:px-3 py-1 rounded-full text-xs ${
                      activity.type === 'return' 
                        ? 'bg-green-100 text-green-800' 
                        : activity.type === 'report'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-purple-100 text-purple-800'
                    }`}>
                      {activity.type}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          
          <div className="space-y-4 md:space-y-6">
            <DashboardRecommendations />
            
            <Card>
              <CardHeader>
                <CardTitle className="text-base md:text-lg">Tools & Resources</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 md:space-y-4">
                  <Button 
                    variant="outline" 
                    className="w-full justify-start text-left h-auto py-2 md:py-3 px-3 md:px-4"
                    onClick={() => navigate("/reports")}
                  >
                    <div className="flex items-start gap-2 md:gap-3">
                      <FileText className="h-4 w-4 md:h-5 md:w-5 text-green-500 mt-0.5" />
                      <div>
                        <h3 className="font-medium text-sm md:text-base mb-0 md:mb-1">Property Reports</h3>
                        <p className="text-xs md:text-sm text-gray-500">View detailed analytics on your investments</p>
                      </div>
                    </div>
                  </Button>

                  <Button 
                    variant="outline" 
                    className="w-full justify-start text-left h-auto py-2 md:py-3 px-3 md:px-4"
                    onClick={() => navigate("/performance")}
                  >
                    <div className="flex items-start gap-2 md:gap-3">
                      <LineChart className="h-4 w-4 md:h-5 md:w-5 text-blue-500 mt-0.5" />
                      <div>
                        <h3 className="font-medium text-sm md:text-base mb-0 md:mb-1">Investment Analysis</h3>
                        <p className="text-xs md:text-sm text-gray-500">Track performance across your portfolio</p>
                      </div>
                    </div>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
