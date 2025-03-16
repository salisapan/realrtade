
import { WorkspaceLayout } from "@/components/admin/WorkspaceLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Globe, PlusCircle, ExternalLink, CheckCircle } from "lucide-react";

const DomainsPage = () => {
  return (
    <WorkspaceLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Domains</h1>
        <p className="text-gray-600">Manage your application domains</p>
      </div>
      
      <div className="flex justify-end mb-6">
        <Button>
          <PlusCircle className="mr-2 h-4 w-4" />
          Add Domain
        </Button>
      </div>
      
      <div className="space-y-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Active Domains</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="border rounded-lg overflow-hidden">
              <div className="bg-gray-50 p-4 border-b flex items-center">
                <Globe className="h-5 w-5 text-primary mr-2" />
                <span className="font-medium">realtrade.lovable.app</span>
                <span className="ml-3 px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full flex items-center">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Active
                </span>
                <div className="ml-auto flex">
                  <Button variant="ghost" size="sm" className="text-xs">
                    <ExternalLink className="h-3 w-3 mr-1" />
                    Visit
                  </Button>
                </div>
              </div>
              <div className="p-4">
                <div className="text-sm flex items-center justify-between py-2">
                  <span className="text-gray-600">Status</span>
                  <span className="font-medium text-green-600">Operational</span>
                </div>
                <div className="text-sm flex items-center justify-between py-2">
                  <span className="text-gray-600">Type</span>
                  <span className="font-medium">Staging Subdomain</span>
                </div>
                <div className="text-sm flex items-center justify-between py-2">
                  <span className="text-gray-600">Created</span>
                  <span className="font-medium">Sept 15, 2023</span>
                </div>
                <div className="text-sm flex items-center justify-between py-2">
                  <span className="text-gray-600">Last Update</span>
                  <span className="font-medium">Today</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Custom Domain Setup</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="p-8 border border-dashed rounded-lg flex flex-col items-center justify-center text-center">
              <Globe className="h-12 w-12 text-gray-400 mb-4" />
              <h3 className="text-lg font-medium mb-2">Connect a Custom Domain</h3>
              <p className="text-gray-500 mb-4 max-w-md">
                Upgrade to a paid plan to connect your own custom domain to your RealTrade application.
              </p>
              <Button variant="outline">
                Upgrade Plan
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </WorkspaceLayout>
  );
};

export default DomainsPage;
