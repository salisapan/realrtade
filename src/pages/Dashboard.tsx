
import { useEffect, useState } from "react";
import { AppSidebar } from "@/components/AppSidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LineChart, UserCircle, DollarSign, FileText, Building2, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/components/ui/use-toast";

const Dashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [userName, setUserName] = useState("Investor");

  useEffect(() => {
    // Get user profile from localStorage
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

  const handleViewAllReports = () => {
    navigate('/reports');
  };

  const handleViewPerformance = () => {
    navigate('/performance');
  };

  const handleViewWallet = () => {
    navigate('/wallet');
  };

  const handleNavigate = (path: string) => {
    navigate(path);
  };

  return (
    <div className="flex">
      <AppSidebar />
      <div className="flex-1 min-h-screen bg-gray-50 p-4 sm:p-8 pb-16 md:pb-8">
        {/* Profile Header */}
        <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
          <div className="flex items-center gap-4 md:gap-6">
            <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-primary/10 flex items-center justify-center cursor-pointer"
                 onClick={() => handleNavigate('/settings')}>
              <UserCircle className="w-10 h-10 md:w-12 md:h-12 text-primary" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-gray-900">{userName}</h1>
              <p className="text-sm md:text-base text-gray-600">Active Investor since 2023</p>
            </div>
          </div>
          <Button onClick={handleProfileUpdate}>
            Edit Profile
          </Button>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-6 md:mb-8">
          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={handleViewWallet}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">
                Total Invested
              </CardTitle>
              <DollarSign className="w-4 h-4 text-gray-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">$125,000</div>
              <p className="text-xs text-green-600">+12.5% from last month</p>
            </CardContent>
          </Card>

          <Link to="/properties">
            <Card className="cursor-pointer hover:shadow-md transition-shadow h-full">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-gray-500">
                  Active Projects
                </CardTitle>
                <Building2 className="w-4 h-4 text-gray-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">8</div>
                <p className="text-xs text-gray-600">Across 3 platforms</p>
              </CardContent>
            </Card>
          </Link>

          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={handleViewPerformance}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">
                Total Returns
              </CardTitle>
              <LineChart className="w-4 h-4 text-gray-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">18.3%</div>
              <p className="text-xs text-green-600">+2.1% from last quarter</p>
            </CardContent>
          </Card>

          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={handleViewAllReports}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">
                Reports
              </CardTitle>
              <FileText className="w-4 h-4 text-gray-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">24</div>
              <p className="text-xs text-gray-600">Last updated 2 days ago</p>
            </CardContent>
          </Card>
        </div>

        {/* Recent Activity */}
        <Card className="mb-8">
          <CardHeader className="flex justify-between items-center">
            <CardTitle>Recent Activity</CardTitle>
            <Button variant="ghost" size="sm" onClick={handleViewAllReports} className="gap-2">
              View All <ArrowRight className="w-4 h-4" />
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
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
                  className="flex items-center justify-between border-b pb-4 last:border-0 cursor-pointer hover:bg-gray-50 p-2 rounded-md transition-colors"
                  onClick={() => navigate(activity.path)}
                >
                  <div>
                    <p className="font-medium text-gray-900">{activity.title}</p>
                    <p className="text-sm text-gray-500">{activity.date}</p>
                  </div>
                  <div className={`px-3 py-1 rounded-full text-sm ${
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
      </div>
    </div>
  );
};

export default Dashboard;
