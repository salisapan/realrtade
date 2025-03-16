
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { HomeHeader } from "@/components/layout/HomeHeader";
import { Loader2, Database, UserCheck, Image, ArrowRight, Check, AlertCircle } from "lucide-react";
import { migrateAllDataToSupabase } from "@/utils/migrateDataToSupabase";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";

// בדיקה האם המשתמש מחובר כרגע
const isAuthenticated = async () => {
  const { data } = await supabase.auth.getSession();
  return !!data.session;
};

const SupabaseMigration = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationState, setMigrationState] = useState({
    propertiesSuccess: false,
    propertiesCount: 0,
    profilesSuccess: false,
    profilesCount: 0,
    errorMessage: ""
  });

  const handleMigration = async () => {
    setIsMigrating(true);
    
    try {
      // בדיקה האם המשתמש מחובר
      const authenticated = await isAuthenticated();
      
      if (!authenticated) {
        toast({
          title: "Authentication Required",
          description: "Please log in before migrating data",
          variant: "destructive"
        });
        navigate("/investor-signup");
        return;
      }
      
      // ביצוע המעבר
      const result = await migrateAllDataToSupabase();
      
      // עדכון מצב המעבר
      setMigrationState({
        propertiesSuccess: result.properties.success,
        propertiesCount: result.properties.count,
        profilesSuccess: result.profiles.success,
        profilesCount: result.profiles.count,
        errorMessage: result.properties.success && result.profiles.success ? 
                    "" : 
                    `Errors: ${!result.properties.success ? result.properties.message : ""} ${!result.profiles.success ? result.profiles.message : ""}`.trim()
      });
      
      // הצגת הודעת הצלחה או כישלון
      if (result.properties.success && result.profiles.success) {
        toast({
          title: "Migration Successful",
          description: `Migrated ${result.properties.count} properties and ${result.profiles.count} profiles to Supabase`,
        });
      } else {
        toast({
          title: "Migration Partial or Failed",
          description: `Some data could not be migrated. Check the details page.`,
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error("Migration error:", error);
      
      setMigrationState({
        ...migrationState,
        errorMessage: error instanceof Error ? error.message : "An unexpected error occurred"
      });
      
      toast({
        title: "Migration Failed",
        description: error instanceof Error ? error.message : "Failed to migrate data to Supabase",
        variant: "destructive"
      });
    } finally {
      setIsMigrating(false);
    }
  };

  const handleContinue = () => {
    navigate("/properties");
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <HomeHeader />
      
      <div className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-2xl text-center">Supabase Integration</CardTitle>
            <CardDescription className="text-center">
              Transfer your local data to Supabase cloud database
            </CardDescription>
          </CardHeader>
          
          <CardContent className="space-y-6">
            <div className="flex flex-col space-y-4">
              {/* Status: Properties */}
              <div className="flex items-center space-x-3 p-3 rounded-md bg-gray-50">
                <Database className="w-5 h-5 text-blue-500" />
                <div className="flex-1">
                  <h3 className="font-medium">Properties Data</h3>
                  <p className="text-sm text-gray-500">
                    {migrationState.propertiesSuccess 
                      ? `Successfully migrated ${migrationState.propertiesCount} properties` 
                      : "Will transfer property listings to Supabase"}
                  </p>
                </div>
                {migrationState.propertiesSuccess && <Check className="w-5 h-5 text-green-500" />}
              </div>
              
              {/* Status: User Profiles */}
              <div className="flex items-center space-x-3 p-3 rounded-md bg-gray-50">
                <UserCheck className="w-5 h-5 text-blue-500" />
                <div className="flex-1">
                  <h3 className="font-medium">User Profiles</h3>
                  <p className="text-sm text-gray-500">
                    {migrationState.profilesSuccess 
                      ? `Successfully migrated ${migrationState.profilesCount} profiles` 
                      : "Will transfer user profiles to Supabase authentication"}
                  </p>
                </div>
                {migrationState.profilesSuccess && <Check className="w-5 h-5 text-green-500" />}
              </div>
              
              {/* Status: Media Files */}
              <div className="flex items-center space-x-3 p-3 rounded-md bg-gray-50">
                <Image className="w-5 h-5 text-blue-500" />
                <div className="flex-1">
                  <h3 className="font-medium">Media Files</h3>
                  <p className="text-sm text-gray-500">
                    Image URLs will be preserved and ready for future uploads
                  </p>
                </div>
              </div>
            </div>
            
            {/* Error Message if any */}
            {migrationState.errorMessage && (
              <div className="p-3 bg-red-50 rounded-md border border-red-100 flex items-start space-x-3">
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-800">{migrationState.errorMessage}</p>
              </div>
            )}
            
            {/* Success Message */}
            {(migrationState.propertiesSuccess || migrationState.profilesSuccess) && (
              <div className="p-3 bg-green-50 rounded-md border border-green-100">
                <h3 className="font-medium text-green-800 flex items-center">
                  <Check className="w-5 h-5 mr-2" /> Migration Completed
                </h3>
                <p className="text-sm text-green-700 mt-1">
                  Your data has been successfully migrated to Supabase. You can now use all Supabase features!
                </p>
              </div>
            )}
          </CardContent>
          
          <CardFooter className="flex justify-between">
            {/* הצגת כפתור שונה בהתאם לסטטוס המעבר */}
            {migrationState.propertiesSuccess && migrationState.profilesSuccess ? (
              <Button onClick={handleContinue} className="w-full">
                Continue to App <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            ) : (
              <Button 
                onClick={handleMigration} 
                disabled={isMigrating} 
                className="w-full"
              >
                {isMigrating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Migrating Data...
                  </>
                ) : (
                  "Start Migration"
                )}
              </Button>
            )}
          </CardFooter>
        </Card>
      </div>
    </div>
  );
};

export default SupabaseMigration;
