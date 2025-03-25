
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { HomeHeader } from "@/components/layout/HomeHeader";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff, Briefcase, User } from "lucide-react";

const Auth = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Sign in with email and password
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      // Store user session in localStorage for demo purposes
      if (data.user) {
        // Fetch user profile
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', data.user.id)
          .single();
        
        if (profileData) {
          // Create a copy of the profile data to avoid modifying the original
          const profileToStore = { ...profileData };
          
          // Add the isAccredited field for backward compatibility
          if (profileData.is_accredited !== undefined) {
            profileToStore.isAccredited = profileData.is_accredited ? "yes" : "no";
          }
          
          localStorage.setItem("investorProfile", JSON.stringify(profileToStore));
          
          toast({
            title: "Login successful",
            description: "Welcome back!",
          });
          
          navigate("/properties");
        } else if (profileError) {
          console.error("Error fetching profile:", profileError);
          
          // If profile fetch fails, we should still redirect to properties and handle missing profile there
          toast({
            title: "Login successful",
            description: "Welcome back!",
          });
          
          navigate("/properties");
        }
      }
    } catch (error: any) {
      toast({
        title: "Login failed",
        description: error.message || "An error occurred during authentication",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  const navigateToInvestorRegistration = () => {
    navigate("/investor-registration");
  };

  const navigateToDevRegistration = () => {
    navigate("/developer-registration");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-white to-blue-50 animate-fade-in">
      <HomeHeader />
      
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-md mx-auto">
          <Card className="shadow-[0_4px_24px_rgba(66,133,244,0.15)] animate-fade-in overflow-hidden border-0">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-50/50 to-white/30 pointer-events-none"></div>
            <CardHeader className="relative">
              <div className="flex justify-center mb-4">
                <img src="/lovable-uploads/d4d21b09-7174-49fb-af4f-ee02e8e4966f.png" alt="RealTrade Logo" className="h-12 rounded-lg animate-float shadow-[0_0_15px_rgba(66,133,244,0.3)]" />
              </div>
              <CardTitle className="text-2xl text-center">Welcome Back</CardTitle>
              <CardDescription className="text-center">
                Log in to your RealTrade account
              </CardDescription>
            </CardHeader>
            
            <CardContent className="relative">
              <form onSubmit={handleAuth} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="Enter your email address"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="bg-white"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="bg-white pr-10"
                    />
                    <button
                      type="button"
                      onClick={togglePasswordVisibility}
                      className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-500"
                    >
                      {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                    </button>
                  </div>
                </div>
                
                <Button 
                  type="submit" 
                  className="w-full mt-6"
                  disabled={isLoading}
                >
                  {isLoading ? "Processing..." : "Sign In"}
                </Button>
              </form>

              <div className="mt-6">
                <div className="text-center text-sm text-gray-500 mb-4">
                  Don't have an account? Register as:
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Button 
                    variant="outline" 
                    onClick={navigateToInvestorRegistration}
                    className="flex items-center justify-center gap-2"
                  >
                    <User size={16} />
                    Investor
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={navigateToDevRegistration}
                    className="flex items-center justify-center gap-2"
                  >
                    <Briefcase size={16} />
                    Developer
                  </Button>
                </div>
              </div>
            </CardContent>
            
            <CardFooter className="flex flex-col items-center relative">
              <p className="text-sm text-gray-500 mt-4">
                <Link to="/" className="text-primary font-medium hover:underline hover:text-primary-dark">
                  Return to Home
                </Link>
              </p>
            </CardFooter>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default Auth;
