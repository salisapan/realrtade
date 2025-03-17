
import { supabase } from '@/lib/supabase';
import { InvestorFormValues } from '@/schemas/investorSchema';

export interface AuthResponse {
  user: any;
  session: any;
  error: any;
}

// הרשמה עם אימייל וסיסמה
export const signUpWithEmail = async (email: string, password: string, userData: Partial<InvestorFormValues>): Promise<AuthResponse> => {
  try {
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (authError) throw authError;

    // עדכון נתוני המשתמש בטבלת פרופילים
    if (authData.user) {
      const { error: profileError } = await supabase
        .from('profiles')
        .insert({
          id: authData.user.id,
          full_name: userData.fullName || '',
          email: userData.email || '',
          phone: userData.phone || '',
          address: userData.address || '',
          age: userData.age || 0,
          annual_income: userData.annualIncome || 0,
          net_worth: userData.netWorth || 0,
          investment_experience: userData.investmentExperience || 'none',
          is_accredited: userData.isAccredited === 'yes',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

      if (profileError) throw profileError;
    }

    return { user: authData.user, session: authData.session, error: null };
  } catch (error) {
    console.error('Error signing up:', error);
    return { user: null, session: null, error };
  }
};

// התחברות עם אימייל וסיסמה
export const signInWithEmail = async (email: string, password: string): Promise<AuthResponse> => {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;

    return { user: data.user, session: data.session, error: null };
  } catch (error) {
    console.error('Error signing in:', error);
    return { user: null, session: null, error };
  }
};

// התחברות עם ספק חיצוני (גוגל, פייסבוק וכו')
export const signInWithProvider = async (provider: 'google' | 'facebook' | 'apple'): Promise<AuthResponse> => {
  try {
    console.log(`Attempting to sign in with ${provider}...`);
    
    // תוספת מידע דיאגנוסטי
    const currentUrl = window.location.origin;
    console.log(`Current origin URL: ${currentUrl}`);
    
    // הגדיר את כתובת ה-callback בצורה דינמית בהתאם לכתובת האתר הנוכחית
    const redirectUrl = `${window.location.origin}/auth/callback`;
    console.log(`Setting redirect URL to: ${redirectUrl}`);
    
    // הקריאה ל-signInWithOAuth מחזירה רק מידע על ה-URL, ולא את פרטי המשתמש או הסשן
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: redirectUrl,
        queryParams: {
          prompt: 'select_account', // To force Google to show the account selection screen
        }
      }
    });

    if (error) {
      console.error(`OAuth error for ${provider}:`, error);
      
      // בדיקה מפורטת יותר של סוגי שגיאות
      if (error.message?.includes("provider is not enabled")) {
        return { 
          user: null, 
          session: null, 
          error: { 
            message: `Authentication with ${provider} is not currently enabled in Supabase. Please enable it in the Auth providers section.`,
            originalError: error
          } 
        };
      }
      
      if (error.message?.includes("403") || error.status === 403) {
        return {
          user: null,
          session: null,
          error: {
            message: `Received a 403 error from ${provider}. This usually means your OAuth credentials are incorrect or the redirect URI is not authorized. Please check your Google Cloud Console configuration.`,
            originalError: error
          }
        };
      }
      
      throw error;
    }

    console.log(`OAuth URL generated for ${provider}:`, data.url);
    
    // במקרה זה אנחנו מחזירים אובייקט ריק עבור user ו-session
    // המשתמש והסשן יהיו זמינים רק לאחר שהמשתמש יסיים את תהליך ההתחברות
    return { user: null, session: null, error: null };
  } catch (error) {
    console.error(`Error signing in with ${provider}:`, error);
    return { 
      user: null, 
      session: null, 
      error: {
        message: `Error connecting to ${provider}. The service may be unavailable or not properly configured. Details: ${error instanceof Error ? error.message : 'Unknown error'}`,
        originalError: error
      }
    };
  }
};

// התנתקות
export const signOut = async (): Promise<{ error: any }> => {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    return { error: null };
  } catch (error) {
    console.error('Error signing out:', error);
    return { error };
  }
};

// בדיקת מצב ההתחברות הנוכחי
export const getCurrentSession = async () => {
  return await supabase.auth.getSession();
};

// קבלת המשתמש הנוכחי
export const getCurrentUser = async () => {
  const { data } = await supabase.auth.getUser();
  return data?.user;
};

// קבלת נתוני פרופיל המשתמש
export const getUserProfile = async (userId: string) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) {
    console.error('Error fetching user profile:', error);
    return null;
  }

  return data;
};

// עדכון פרטי משתמש
export const updateUserProfile = async (userId: string, userData: Partial<InvestorFormValues>) => {
  try {
    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: userData.fullName,
        phone: userData.phone,
        address: userData.address,
        age: userData.age,
        annual_income: userData.annualIncome,
        net_worth: userData.netWorth,
        investment_experience: userData.investmentExperience,
        is_accredited: userData.isAccredited === 'yes',
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (error) throw error;
    return { success: true, error: null };
  } catch (error) {
    console.error('Error updating profile:', error);
    return { success: false, error };
  }
};
