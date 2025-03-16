
import { useState } from "react";
import { WorkspaceLayout } from "@/components/admin/WorkspaceLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, Check, Image as ImageIcon } from "lucide-react";

const SettingsLogoPage = () => {
  const [logo, setLogo] = useState<string | null>('/lovable-uploads/d4d21b09-7174-49fb-af4f-ee02e8e4966f.png');
  const [isLogoUpdated, setIsLogoUpdated] = useState(false);
  
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        setLogo(reader.result as string);
        setIsLogoUpdated(true);
        setTimeout(() => setIsLogoUpdated(false), 3000);
      };
      reader.readAsDataURL(file);
    }
  };
  
  return (
    <WorkspaceLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Logo Settings</h1>
        <p className="text-gray-600">Manage your application's logo</p>
      </div>
      
      <div className="grid grid-cols-1 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Application Logo</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row md:items-start gap-8">
              <div className="flex-1">
                <p className="text-sm text-gray-600 mb-4">
                  Upload a logo for your application. This will be displayed in the navigation bar and other key areas.
                </p>
                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    <span className="text-sm font-medium text-gray-700">Current Logo</span>
                    {isLogoUpdated && (
                      <span className="flex items-center text-green-600 text-sm">
                        <Check className="h-4 w-4 mr-1" />
                        Updated successfully
                      </span>
                    )}
                  </div>
                  
                  <div className="border rounded-lg p-6 flex items-center justify-center bg-gray-50">
                    {logo ? (
                      <img 
                        src={logo} 
                        alt="Application Logo" 
                        className="max-h-24 max-w-full" 
                      />
                    ) : (
                      <div className="flex flex-col items-center text-gray-400">
                        <ImageIcon className="h-16 w-16 mb-2" />
                        <span>No logo uploaded</span>
                      </div>
                    )}
                  </div>
                  
                  <div className="mt-4">
                    <p className="text-sm text-gray-500 mb-2">
                      Recommended size: 240x80 pixels. PNG or SVG with transparent background preferred.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-3">
                      <Button 
                        variant="outline" 
                        className="relative"
                        onClick={() => document.getElementById('logo-upload')?.click()}
                      >
                        <Upload className="h-4 w-4 mr-2" />
                        Upload New Logo
                        <input 
                          id="logo-upload" 
                          type="file" 
                          accept="image/*" 
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" 
                          onChange={handleLogoUpload}
                        />
                      </Button>
                      
                      {logo && (
                        <Button 
                          variant="outline" 
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => setLogo(null)}
                        >
                          Remove Logo
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="w-full md:w-80 border rounded-lg p-4 bg-gray-50">
                <h3 className="font-medium mb-3">Logo Preview</h3>
                <div className="space-y-4">
                  <div className="border bg-white rounded-lg p-4">
                    <div className="flex items-center h-12">
                      {logo ? (
                        <img 
                          src={logo} 
                          alt="Preview in Header" 
                          className="h-8" 
                        />
                      ) : (
                        <div className="h-8 w-32 bg-gray-200 rounded"></div>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">Header</div>
                  </div>
                  
                  <div className="border bg-white rounded-lg p-4">
                    <div className="flex items-center justify-center h-24">
                      {logo ? (
                        <img 
                          src={logo} 
                          alt="Preview in Splash Screen" 
                          className="h-16" 
                        />
                      ) : (
                        <div className="h-16 w-48 bg-gray-200 rounded"></div>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">Splash Screen</div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </WorkspaceLayout>
  );
};

export default SettingsLogoPage;
