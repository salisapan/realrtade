import { Button } from "@/components/ui/button";
import { Loader2, AlertCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface SignInOptionsProps {
  onGoogleSignIn: () => void;
  onAppleSignIn: () => void;
  onEmailSignIn: () => void;
  isGoogleLoading?: boolean;
  isAppleLoading?: boolean;
}

export const SignInOptions = ({ 
  onGoogleSignIn, 
  onAppleSignIn, 
  onEmailSignIn, 
  isGoogleLoading = false,
  isAppleLoading = false
}: SignInOptionsProps) => {
  const currentOrigin = window.location.origin;
  const supabaseCallback = "https://nlvljclvoguvrnntwufu.supabase.co/auth/v1/callback";

  return (
    <div className="space-y-4 p-5 bg-white rounded-lg shadow-sm border border-gray-100 animate-in fade-in-50 duration-500">
      <h3 className="text-center font-medium mb-4">Sign in with</h3>
      
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button 
              onClick={onGoogleSignIn}
              disabled={isGoogleLoading}
              className="w-full flex items-center justify-center gap-3 p-3 rounded-lg border border-gray-200 bg-white hover:shadow-md transition-all duration-300 hover:border-primary/30 hover:translate-y-[-2px] disabled:opacity-70 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none group"
              aria-label="Sign in with Google"
            >
              {isGoogleLoading ? (
                <Loader2 className="h-5 w-5 animate-spin text-gray-500" />
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
                  <path fill="#EA4335" d="M5.26620003,9.76452941 C6.19878754,6.93863203 8.85444915,4.90909091 12,4.90909091 C13.6909091,4.90909091 15.2181818,5.50909091 16.4181818,6.49090909 L19.9090909,3 C17.7818182,1.14545455 15.0545455,0 12,0 C7.27006974,0 3.1977497,2.69829785 1.23999023,6.65002441 L5.26620003,9.76452941 Z" />
                  <path fill="#34A853" d="M16.0407269,18.0125889 C14.9509167,18.7163518 13.5660892,19.0909091 12,19.0909091 C8.86648613,19.0909091 6.21911939,17.076871 5.27698177,14.2678769 L1.23746264,17.3349879 C3.19279051,21.2936293 7.26500293,24 12,24 C14.9328362,24 17.7353462,22.9573905 19.834192,20.9995801 L16.0407269,18.0125889 Z" />
                  <path fill="#4A90E2" d="M19.834192,20.9995801 C22.0291676,18.9520994 23.4545455,15.903663 23.4545455,12 C23.4545455,11.2909091 23.3454545,10.5272727 23.1818182,9.81818182 L12,9.81818182 L12,14.4545455 L18.4363636,14.4545455 C18.1187732,16.013626 17.2662994,17.2212117 16.0407269,18.0125889 L19.834192,20.9995801 Z" />
                  <path fill="#FBBC05" d="M5.27698177,14.2678769 C5.03832634,13.556323 4.90909091,12.7937589 4.90909091,12 C4.90909091,11.2182781 5.03443647,10.4668121 5.26620003,9.76452941 L1.23999023,6.65002441 C0.43658717,8.26043162 0,10.0753848 0,12 C0,13.9195484 0.444780743,15.7301709 1.23746264,17.3349879 L5.27698177,14.2678769 Z" />
                </svg>
              )}
              <span className="flex-1">{isGoogleLoading ? "Connecting..." : "Continue with Google"}</span>
              <AlertCircle className="h-4 w-4 text-amber-500 opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-[320px] p-3 bg-amber-50 border-amber-200 text-amber-800">
            <p className="font-medium mb-1">הגדרת אימות Google</p>
            <p className="text-xs">לוודא שהוספת את הכתובות הבאות ב-Google OAuth:</p>
            <ol className="text-xs list-decimal pl-4 mt-1 space-y-1">
              <li><strong>JavaScript Origins:</strong> <span className="font-mono bg-white/80 px-1 rounded select-all">{currentOrigin}</span></li>
              <li><strong>Redirect URI:</strong> <span className="font-mono bg-white/80 px-1 rounded select-all">{supabaseCallback}</span></li>
            </ol>
            <p className="text-xs mt-1">וודא גם שהוספת את ה-Client ID וה-Client Secret ב-Supabase</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      
      <button 
        onClick={onAppleSignIn}
        disabled={isAppleLoading}
        className="w-full flex items-center justify-center gap-3 p-3 rounded-lg border border-gray-200 bg-white hover:shadow-md transition-all duration-300 hover:border-primary/30 hover:translate-y-[-2px] disabled:opacity-70 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none"
      >
        {isAppleLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-gray-500" />
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
            <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.53 4.08zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.32 4.5-3.74 4.25z" />
          </svg>
        )}
        <span>{isAppleLoading ? "Connecting..." : "Continue with Apple"}</span>
      </button>
      
      <button 
        onClick={onEmailSignIn}
        className="w-full flex items-center justify-center gap-3 p-3 rounded-lg border border-gray-200 bg-white hover:shadow-md transition-all duration-300 hover:border-primary/30 hover:translate-y-[-2px]"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect width="20" height="16" x="2" y="4" rx="2" />
          <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
        </svg>
        <span>Continue with Email</span>
      </button>
      
      <div className="relative flex items-center justify-center w-full mt-8 mb-4">
        <hr className="w-full border-gray-200" />
        <span className="absolute px-3 text-xs text-gray-500 bg-white">or</span>
      </div>
      
      <Button 
        variant="outline" 
        onClick={onEmailSignIn}
        className="w-full hover:shadow-[0_0_10px_rgba(66,133,244,0.3)] transition-all duration-300 hover:translate-y-[-2px]"
      >
        Sign up with detailed profile
      </Button>

      <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
        <div className="flex gap-2 items-start">
          <AlertCircle className="h-5 w-5 text-amber-500 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-medium">בעיות באימות Google?</p>
            <p className="mt-1">
              לוודא שהגדרות OAuth מוגדרות נכון ב-Google Cloud Console. שגיאת 403 עשויה להצביע על בעיית הרשאות או URL לא נכונים.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
