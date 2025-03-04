
import { AppSidebar } from "@/components/AppSidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Settings as SettingsIcon, Bell, Lock, User, Shield, Mail, Globe, Save } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

const Settings = () => {
  const { toast } = useToast();
  
  const handleSave = () => {
    toast({
      title: "Settings Saved",
      description: "Your profile settings have been successfully updated.",
      variant: "success",
    });
  };

  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      <AppSidebar />
      <div className="flex-1 bg-gray-50 p-4 md:p-6 lg:p-8">
        <div className="max-w-4xl mx-auto">
          <header className="mb-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold mb-1">Settings</h1>
                <p className="text-gray-500 text-sm">
                  Manage your account preferences and settings
                </p>
              </div>
              <Button variant="outline" onClick={handleSave}>
                <Save className="mr-2 h-4 w-4" />
                Save Changes
              </Button>
            </div>
          </header>
          
          <div className="grid gap-6">
            <Card className="overflow-hidden">
              <CardHeader className="bg-gray-50 border-b">
                <CardTitle className="flex items-center gap-2">
                  <User className="w-5 h-5 text-primary" />
                  Profile Settings
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <div className="space-y-6">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                    <div className="w-20 h-20 rounded-full bg-gray-200 flex items-center justify-center">
                      <User className="w-10 h-10 text-gray-400" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-medium mb-1">Profile Picture</h3>
                      <p className="text-sm text-gray-500 mb-3">
                        Update your profile photo
                      </p>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm">Upload New</Button>
                        <Button variant="ghost" size="sm">Remove</Button>
                      </div>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="text-sm font-medium block mb-1.5">Full Name</label>
                      <input
                        type="text"
                        defaultValue="John Doe"
                        className="w-full p-2.5 border rounded-md focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium block mb-1.5">Email Address</label>
                      <input
                        type="email"
                        defaultValue="john.doe@example.com"
                        className="w-full p-2.5 border rounded-md focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium block mb-1.5">Phone Number</label>
                      <input
                        type="tel"
                        defaultValue="+1 (555) 123-4567"
                        className="w-full p-2.5 border rounded-md focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium block mb-1.5">Location</label>
                      <input
                        type="text"
                        defaultValue="New York, USA"
                        className="w-full p-2.5 border rounded-md focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="overflow-hidden">
              <CardHeader className="bg-gray-50 border-b">
                <CardTitle className="flex items-center gap-2">
                  <Bell className="w-5 h-5 text-primary" />
                  Notification Preferences
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between py-2 border-b">
                    <div>
                      <h4 className="font-medium">Email Notifications</h4>
                      <p className="text-sm text-gray-500">
                        Receive updates about your investments via email
                      </p>
                    </div>
                    <div className="h-6 w-12 bg-gray-200 rounded-full p-1 cursor-pointer flex items-center">
                      <div className="h-4 w-4 rounded-full bg-primary transform translate-x-6"></div>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between py-2 border-b">
                    <div>
                      <h4 className="font-medium">Investment Updates</h4>
                      <p className="text-sm text-gray-500">
                        Receive notifications when your investments change status
                      </p>
                    </div>
                    <div className="h-6 w-12 bg-gray-200 rounded-full p-1 cursor-pointer flex items-center">
                      <div className="h-4 w-4 rounded-full bg-primary transform translate-x-6"></div>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between py-2 border-b">
                    <div>
                      <h4 className="font-medium">New Property Alerts</h4>
                      <p className="text-sm text-gray-500">
                        Get notified when new properties match your criteria
                      </p>
                    </div>
                    <div className="h-6 w-12 bg-gray-200 rounded-full p-1 cursor-pointer flex items-center">
                      <div className="h-4 w-4 rounded-full bg-primary transform translate-x-6"></div>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between py-2">
                    <div>
                      <h4 className="font-medium">Marketing Communications</h4>
                      <p className="text-sm text-gray-500">
                        Receive promotional offers and newsletter
                      </p>
                    </div>
                    <div className="h-6 w-12 bg-gray-200 rounded-full p-1 cursor-pointer flex items-center">
                      <div className="h-4 w-4 rounded-full bg-gray-400 transform translate-x-0"></div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="overflow-hidden">
              <CardHeader className="bg-gray-50 border-b">
                <CardTitle className="flex items-center gap-2">
                  <Lock className="w-5 h-5 text-primary" />
                  Security Settings
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <div className="space-y-6">
                  <div>
                    <h4 className="font-medium mb-4">Password</h4>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <label className="text-sm font-medium block mb-1.5">Current Password</label>
                        <input
                          type="password"
                          className="w-full p-2.5 border rounded-md focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </div>
                      <div></div>
                      <div>
                        <label className="text-sm font-medium block mb-1.5">New Password</label>
                        <input
                          type="password"
                          className="w-full p-2.5 border rounded-md focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium block mb-1.5">Confirm New Password</label>
                        <input
                          type="password"
                          className="w-full p-2.5 border rounded-md focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </div>
                    </div>
                    <Button className="mt-4">Update Password</Button>
                  </div>
                  
                  <div className="pt-4 border-t">
                    <h4 className="font-medium mb-2">Two-Factor Authentication</h4>
                    <p className="text-sm text-gray-500 mb-4">
                      Add an extra layer of security to your account
                    </p>
                    <Button variant="outline">Enable 2FA</Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
