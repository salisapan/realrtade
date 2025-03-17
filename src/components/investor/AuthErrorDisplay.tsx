
import { AlertCircle, ExternalLink } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface AuthErrorDisplayProps {
  error: string | null;
}

export const AuthErrorDisplay = ({ error }: AuthErrorDisplayProps) => {
  if (!error) return null;

  const is403Error = error.includes("403");
  const isOAuthError = error.includes("OAuth") || error.includes("provider") || is403Error;

  const currentOrigin = window.location.origin;
  const supabaseCallbackUrl = "https://nlvljclvoguvrnntwufu.supabase.co/auth/v1/callback";

  return (
    <>
      <Alert variant="destructive" className="mb-4">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>שגיאת אימות</AlertTitle>
        <AlertDescription className="text-sm">
          {error}
        </AlertDescription>
      </Alert>

      {/* Google OAuth Error Guide */}
      {isOAuthError && (
        <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <h3 className="font-bold text-amber-800 mb-2 flex items-center gap-1">
            <AlertCircle className="h-4 w-4" /> מדריך פתרון שגיאות OAuth
          </h3>
          <div className="text-sm text-amber-800 space-y-2">
            <p>שגיאת {is403Error ? "403" : "OAuth"} עשויה להיגרם בשל הגדרות שגויות ב-Google Cloud Console. הנה מה שכדאי לבדוק:</p>
            
            <ol className="list-decimal pl-5 space-y-1.5">
              <li>ודא שה-<a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" className="underline text-blue-600 hover:text-blue-800 inline-flex items-center">Google OAuth credentials <ExternalLink className="h-3 w-3 ml-1" /></a> מוגדרים נכון:</li>
              
              <li className="font-medium">Authorized JavaScript origins - חייב לכלול:
                <div className="bg-white p-1.5 rounded mt-1 border border-amber-200 select-all overflow-x-auto">
                  {currentOrigin}
                </div>
              </li>
              
              <li className="font-medium">Authorized redirect URIs - חייב לכלול:
                <div className="bg-white p-1.5 rounded mt-1 border border-amber-200 select-all overflow-x-auto">
                  {supabaseCallbackUrl}
                </div>
              </li>
              
              <li>ודא שהכנסת את ה-Client ID וה-Client Secret הנכונים בהגדרות של <a href="https://supabase.com/dashboard/project/nlvljclvoguvrnntwufu/auth/providers" target="_blank" rel="noopener noreferrer" className="underline text-blue-600 hover:text-blue-800 inline-flex items-center">Supabase Auth Providers <ExternalLink className="h-3 w-3 ml-1" /></a></li>
              
              <li>ודא שספק האימות של Google מופעל בסופרבייס</li>
              
              <li>ודא שכתובות ה-URL מוגדרות כראוי ב-<a href="https://supabase.com/dashboard/project/nlvljclvoguvrnntwufu/auth/url-configuration" target="_blank" rel="noopener noreferrer" className="underline text-blue-600 hover:text-blue-800 inline-flex items-center">Supabase Auth URL Configuration <ExternalLink className="h-3 w-3 ml-1" /></a>:
                <ul className="list-disc pl-5 mt-1 space-y-1">
                  <li>Site URL: <span className="font-mono bg-white px-1 rounded">{currentOrigin}</span></li>
                  <li>Redirect URLs: ודא שהכתובת <span className="font-mono bg-white px-1 rounded">{currentOrigin}/auth/callback</span> נמצאת ברשימה</li>
                </ul>
              </li>
            </ol>
            
            <div className="p-2 bg-blue-50 rounded mt-2 border border-blue-200">
              <p className="font-medium text-blue-700">עצה מועילה:</p>
              <p className="text-blue-700">אחרי עדכון ההגדרות ב-Google Cloud Console, ייתכן שיחלפו כמה דקות עד שהשינויים ייכנסו לתוקף.</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
