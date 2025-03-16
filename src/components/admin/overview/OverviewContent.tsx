
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { BarChart3, Users, Globe, DollarSign, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

// Mock data for overview stats
const stats = [
  {
    title: "Total Users",
    value: "4",
    change: "+2 this month",
    icon: <Users className="h-6 w-6 text-blue-600" />,
    link: "/admin/users"
  },
  {
    title: "Active Sessions",
    value: "1",
    change: "Currently online",
    icon: <Activity className="h-6 w-6 text-green-600" />,
    link: "/admin/analytics"
  },
  {
    title: "Domains",
    value: "1",
    change: "All operational",
    icon: <Globe className="h-6 w-6 text-purple-600" />,
    link: "/admin/domains"
  },
  {
    title: "Revenue",
    value: "$12,500",
    change: "+$4,000 this month",
    icon: <DollarSign className="h-6 w-6 text-yellow-600" />,
    link: "/admin/payments"
  }
];

// Mock recent activity data
const recentActivity = [
  {
    user: "realtrade324@gmail.com",
    action: "Logged in",
    time: "2 minutes ago"
  },
  {
    user: "jane.doe@example.com",
    action: "Viewed Properties",
    time: "15 minutes ago"
  },
  {
    user: "realtrade324@gmail.com",
    action: "Updated settings",
    time: "1 hour ago"
  },
  {
    user: "john.smith@example.com",
    action: "Added a new property",
    time: "3 hours ago"
  },
  {
    user: "alice.johnson@example.com",
    action: "Made a payment",
    time: "Yesterday"
  }
];

export const OverviewContent = () => {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Overview</h1>
        <p className="text-gray-600">Platform summary and recent activity</p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {stats.map((stat, index) => (
          <Card key={index} className="hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">{stat.title}</CardTitle>
              {stat.icon}
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className="text-xs text-gray-500 mt-1">{stat.change}</p>
            </CardContent>
            <CardFooter className="pt-0">
              <Link to={stat.link} className="text-xs text-blue-600 hover:underline">
                View details →
              </Link>
            </CardFooter>
          </Card>
        ))}
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentActivity.map((activity, index) => (
                <div key={index} className="flex items-start pb-4 border-b border-gray-100 last:border-0 last:pb-0">
                  <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 mr-3"></div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-sm">{activity.action}</p>
                      <span className="text-xs text-gray-500">{activity.time}</span>
                    </div>
                    <p className="text-xs text-gray-600 mt-1">{activity.user}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
          <CardFooter>
            <Button variant="outline" size="sm" asChild>
              <Link to="/admin/users">
                View all activity
              </Link>
            </Button>
          </CardFooter>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <Button variant="outline" className="h-auto py-4 flex flex-col items-center justify-center" asChild>
                <Link to="/admin/users">
                  <Users className="h-6 w-6 mb-2" />
                  <span>Manage Users</span>
                </Link>
              </Button>
              
              <Button variant="outline" className="h-auto py-4 flex flex-col items-center justify-center" asChild>
                <Link to="/admin/analytics">
                  <BarChart3 className="h-6 w-6 mb-2" />
                  <span>View Analytics</span>
                </Link>
              </Button>
              
              <Button variant="outline" className="h-auto py-4 flex flex-col items-center justify-center" asChild>
                <Link to="/admin/data/property">
                  <Globe className="h-6 w-6 mb-2" />
                  <span>Manage Properties</span>
                </Link>
              </Button>
              
              <Button variant="outline" className="h-auto py-4 flex flex-col items-center justify-center" asChild>
                <Link to="/admin/payments">
                  <DollarSign className="h-6 w-6 mb-2" />
                  <span>View Payments</span>
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
