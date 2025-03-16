
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, ArrowLeft, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { HomeHeader } from "@/components/layout/HomeHeader";
import { InvestorForm } from "@/components/investor/InvestorForm";
import { RegistrationComplete } from "@/components/investor/RegistrationComplete";
import { InvestorFormValues } from "@/schemas/investorSchema";
import { SignInOptions } from "@/components/investor/SignInOptions";
import { signUpWithEmail, signInWithProvider } from "@/services/authService";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const InvestorSignup = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [registrationComplete, setRegistrationComplete] = useState(false);
  const [isAccredited, setIsAccredited] = useState(false);
  const [showStandardForm, setShowStandardForm] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isGoogleSignInLoading, setIsGoogleSignInLoading] = useState(false);
  const [isAppleSignInLoading, setIsAppleSignInLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // טיפול בטופס הרשמה מלא
  async function onSubmit(values: InvestorFormValues) {
    setIsSubmitting(true);
    setAuthError(null);

    try {
      // רישום המשתמש ב-Supabase
      const response = await signUpWithEmail(values.email, password, values);

      if (response.error) {
        throw new Error(response.error.message || "Registration failed");
      }

      // שמירת סטטוס הכרה פיננסית לצורך מסך ההצלחה
      setIsAccredited(values.isAccredited === "yes");

      // הודעה מותאמת בהתאם לסטטוס ההכרה
      if (values.isAccredited === "yes") {
        toast({
          title: "Registration Successful",
          description: "Welcome, accredited investor! You now have access to all investment opportunities."
        });
      } else {
        toast({
          title: "Registration Successful",
          description: "Welcome! You now have access to our verified deals with lower minimum investments."
        });
      }

      // הצגת הודעת השלמה לפני הפניה
      setRegistrationComplete(true);

      // הפניה בהתאם לסטטוס ההכרה
      setTimeout(() => {
        if (values.isAccredited === "yes") {
          navigate("/properties");
        } else {
          navigate("/verified-deals");
        }
      }, 2000);

    } catch (error) {
      console.error("Registration error:", error);
      setAuthError(error instanceof Error ? error.message : "An unexpected error occurred");
      toast({
        title: "Registration Failed",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  // התחברות באמצעות Google
  const handleGoogleSignIn = async () => {
    setIsGoogleSignInLoading(true);
    setAuthError(null);
    
    try {
      console.log("Starting Google sign-in process...");
      const response = await signInWithProvider('google');
      
      if (response.error) {
        // בדיקת שגיאות ספציפיות
        if (response.error.message?.includes("provider is not enabled")) {
          setAuthError("Google authentication is not currently configured in the Supabase project. Please enable the Google provider in the Supabase Auth providers settings.");
          toast({
            title: "Google Sign-In Unavailable",
            description: "Google authentication is not currently configured. Please use email signup or contact support.",
            variant: "destructive"
          });
        } else if (response.error.message?.includes("403") || response.error.originalError?.status === 403) {
          setAuthError("Received a 403 Forbidden error from Google. This usually means the OAuth credentials are incorrect or the authorized redirect URI is not properly configured in Google Cloud Console.");
          toast({
            title: "Google Authentication Error (403)",
            description: "Google OAuth configuration error. Please check the OAuth credentials and redirect URIs.",
            variant: "destructive"
          });
        } else {
          throw new Error(response.error.message || "Google sign-in failed");
        }
      } else {
        toast({
          title: "Google Sign-In Process Started",
          description: "Please complete the authentication in the Google popup window."
        });
      }
    } catch (error) {
      console.error("Google sign-in error:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to sign in with Google";
      setAuthError(errorMessage);
      toast({
        title: "Sign-In Failed",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setIsGoogleSignInLoading(false);
    }
  };

  // התחברות באמצעות Apple
  const handleAppleSignIn = async () => {
    setIsAppleSignInLoading(true);
    setAuthError(null);
    
    try {
      const response = await signInWithProvider('apple');
      
      if (response.error) {
        // Check for specific provider not enabled error
        if (response.error.message?.includes("provider is not enabled")) {
          setAuthError("Apple authentication is not currently configured in the Supabase project. Please check the provider settings in the Supabase dashboard or use email signup instead.");
          toast({
            title: "Apple Sign-In Unavailable",
            description: "Apple authentication is not currently configured. Please use email signup or contact support.",
            variant: "destructive"
          });
        } else {
          throw new Error(response.error.message || "Apple sign-in failed");
        }
      } else {
        toast({
          title: "Apple Sign-In Process Started",
          description: "Please complete the authentication in the Apple popup window."
        });
      }
    } catch (error) {
      console.error("Apple sign-in error:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to sign in with Apple";
      setAuthError(errorMessage);
      toast({
        title: "Sign-In Failed",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setIsAppleSignInLoading(false);
    }
  };

  // מעבר לטופס הרשמה מלא
  const handleEmailSignIn = () => {
    setShowStandardForm(true);
    setAuthError(null);
  };

  if (registrationComplete) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <HomeHeader />
        <div className="flex-1 flex flex-col items-center justify-center p-4">
          <RegistrationComplete isAccredited={isAccredited} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-white to-blue-50 animate-fade-in">
      <HomeHeader />
      
      <main className="container mx-auto px-4 py-8">
        <div className="mb-8"></div>
        
        <div className="max-w-3xl mx-auto">
          <Card className="shadow-[0_4px_24px_rgba(66,133,244,0.15)] animate-fade-in overflow-hidden border-0">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-50/50 to-white/30 pointer-events-none"></div>
            <CardHeader className="relative">
              <div className="flex justify-center mb-4">
                <img 
                  src="/lovable-uploads/d4d21b09-7174-49fb-af4f-ee02e8e4966f.png" 
                  alt="RealTrade Logo" 
                  className="h-12 rounded-lg animate-float shadow-[0_0_15px_rgba(66,133,244,0.3)]" 
                />
              </div>
              <CardTitle className="text-2xl text-center">Investor Registration</CardTitle>
              <CardDescription className="text-center">
                Complete your investor profile to access real estate opportunities
              </CardDescription>
            </CardHeader>
            <CardContent className="relative">
              {authError && (
                <Alert variant="destructive" className="mb-4">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>שגיאת אימות</AlertTitle>
                  <AlertDescription className="text-sm">
                    {authError}
                  </AlertDescription>
                </Alert>
              )}

              {/* Google OAuth Error Guide */}
              {authError && authError.includes("403") && (
                <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                  <h3 className="font-bold text-amber-800 mb-2 flex items-center gap-1">
                    <AlertCircle className="h-4 w-4" /> מדריך פתרון שגיאת 403
                  </h3>
                  <div className="text-sm text-amber-800 space-y-2">
                    <p>שגיאת 403 מתרחשת כאשר הגדרות OAuth של Google אינן מוגדרות כראוי. הנה מה שעליך לעשות:</p>
                    <ol className="list-decimal pl-5 space-y-1">
                      <li>היכנס ל-<a href="https://console.cloud.google.com" target="_blank" rel="noopener noreferrer" className="underline text-blue-600 hover:text-blue-800 inline-flex items-center">Google Cloud Console <ExternalLink className="h-3 w-3 ml-1" /></a></li>
                      <li>צור פרויקט חדש או השתמש בקיים</li>
                      <li>פתח את מסך OAuth consent screen והגדר אותו</li>
                      <li>צור OAuth credentials מסוג "Web application"</li>
                      <li>הוסף את הכתובת של האפליקציה שלך ב-Authorized JavaScript origins</li>
                      <li>הוסף את כתובת ה-callback של Supabase ב-Authorized redirect URIs</li>
                      <li>העתק את Client ID וה-Client Secret</li>
                      <li>הכנס את המידע הזה בהגדרות ספקי האימות ב-<a href="https://supabase.com/dashboard/project/nlvljclvoguvrnntwufu/auth/providers" target="_blank" rel="noopener noreferrer" className="underline text-blue-600 hover:text-blue-800 inline-flex items-center">Supabase <ExternalLink className="h-3 w-3 ml-1" /></a></li>
                      <li>ודא שכתובות ה-URL מוגדרות כראוי ב-<a href="https://supabase.com/dashboard/project/nlvljclvoguvrnntwufu/auth/url-configuration" target="_blank" rel="noopener noreferrer" className="underline text-blue-600 hover:text-blue-800 inline-flex items-center">Supabase Auth URL Configuration <ExternalLink className="h-3 w-3 ml-1" /></a></li>
                    </ol>
                  </div>
                </div>
              )}

              {!showStandardForm ? (
                // אפשרויות התחברות
                <SignInOptions 
                  onGoogleSignIn={handleGoogleSignIn} 
                  onAppleSignIn={handleAppleSignIn} 
                  onEmailSignIn={handleEmailSignIn}
                  isGoogleLoading={isGoogleSignInLoading}
                  isAppleLoading={isAppleSignInLoading}
                />
              ) : (
                // טופס הרשמה מלא
                <>
                  {/* שדות אימייל וסיסמה */}
                  <div className="mb-6 space-y-4">
                    <div className="space-y-2">
                      <label htmlFor="email" className="text-sm font-medium text-gray-700">Email</label>
                      <input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                        placeholder="Enter your email"
                      />
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="password" className="text-sm font-medium text-gray-700">Password</label>
                      <input
                        id="password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                        placeholder="Create a password"
                      />
                    </div>
                  </div>
                  
                  <InvestorForm onSubmit={onSubmit} isSubmitting={isSubmitting} />
                </>
              )}
            </CardContent>
            <CardFooter className="flex flex-col items-start relative">
              <p className="text-sm text-gray-500">
                By registering, you agree to our Terms of Service and Privacy Policy.
              </p>
              <p className="text-sm text-gray-500 mt-2">
                Already have an account? <Link to="/login" className="text-primary font-medium hover:underline hover:text-primary-dark transition-colors duration-300">Log in</Link>
              </p>
            </CardFooter>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default InvestorSignup;
