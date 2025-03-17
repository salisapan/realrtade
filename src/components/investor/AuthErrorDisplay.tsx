
import { AlertCircle, ExternalLink } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface AuthErrorDisplayProps {
  error: string | null;
}

export const AuthErrorDisplay = ({ error }: AuthErrorDisplayProps) => {
  if (!error) return null;

  const is403Error = error.includes("403");

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
      {is403Error && (
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
    </>
  );
};
