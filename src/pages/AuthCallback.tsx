
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Loader2 } from "lucide-react";

const AuthCallback = () => {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // הטיפול בקוד ה-auth מחזרת ה-OAuth
    const handleAuthCallback = async () => {
      try {
        // בדיקה אם יש פרמטרים ב-URL שמצביעים על הצלחה או כישלון
        const hash = window.location.hash;
        const query = new URLSearchParams(window.location.search);
        
        if (query.get("error")) {
          // אם יש פרמטר שגיאה ב-URL, מציגים את השגיאה
          setError(query.get("error_description") || "התרחשה שגיאה בתהליך ההתחברות");
          console.error("Auth error:", query.get("error"), query.get("error_description"));
          return;
        }

        // השלמת תהליך ה-sign in להתחברות עם הפרמטרים מה-URL
        const { data, error } = await supabase.auth.getSession();
        
        if (error) {
          throw error;
        }

        if (data?.session) {
          // בדיקה אם המשתמש רשום והפניה בהתאם
          const { data: profileData } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", data.session.user.id)
            .single();
            
          if (profileData) {
            // משתמש קיים - הפניה לדף הבית או מאושרים
            navigate(profileData.is_accredited ? "/properties" : "/verified-deals");
          } else {
            // משתמש חדש - הפניה להשלמת הרשמה
            navigate("/investor-signup");
          }
        } else {
          // אם אין סשן, חוזרים לדף ההרשמה
          navigate("/investor-signup");
        }
      } catch (error) {
        console.error("Error in auth callback:", error);
        setError(error instanceof Error ? error.message : "התרחשה שגיאה לא צפויה");
        // במקרה של שגיאה, חוזרים לדף ההרשמה אחרי 3 שניות
        setTimeout(() => navigate("/investor-signup"), 3000);
      }
    };

    handleAuthCallback();
  }, [navigate]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-white to-blue-50">
      {error ? (
        <div className="p-6 max-w-md bg-white rounded-lg shadow-lg border border-red-200">
          <h2 className="text-xl font-semibold text-red-600 mb-4">שגיאת התחברות</h2>
          <p className="text-gray-700">{error}</p>
          <p className="mt-4 text-sm text-gray-500">מועבר בחזרה לדף ההרשמה...</p>
        </div>
      ) : (
        <div className="p-6 max-w-md bg-white rounded-lg shadow-lg text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-800 mb-2">מאמת התחברות</h2>
          <p className="text-gray-600">אנא המתן בזמן שאנו מסיימים את תהליך ההתחברות...</p>
        </div>
      )}
    </div>
  );
};

export default AuthCallback;
