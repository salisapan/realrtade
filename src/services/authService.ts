import { supabase } from '@/lib/supabase';
import { InvestorFormValues } from '@/schemas/investorSchema';

export interface AuthResponse {
  user: any;
  session: any;
  error: any;
}

// Registration with email and password
export const signUpWithEmail = async (email: string, password: string, userData: Partial<InvestorFormValues>): Promise<AuthResponse> => {
  try {
    console.log("Starting signup process for email:", email);
    
    // First check if the user already exists
    const { data: existingUser, error: checkError } = await supabase
      .from('profiles')
      .select('*')
      .eq('email', email)
      .single();
      
    if (!checkError && existingUser) {
      console.log("User already exists in profiles table:", existingUser);
      
      // Try to sign in the user since they already exist
      const { data: authData, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password
      });
      
      if (signInError) {
        console.error("Error signing in existing user:", signInError);
        return { 
          user: null, 
          session: null, 
          error: {
            code: "user_already_exists",
            message: "This email is already registered. Please use a different email or try logging in instead."
          }
        };
      }
      
      // If sign-in succeeded, return the auth data
      if (authData.user) {
        // Update the user profile with the new data
        const { error: updateError } = await supabase
          .from('profiles')
          .update({
            full_name: userData.fullName || existingUser.full_name,
            phone: userData.phone || existingUser.phone,
            address: userData.address || existingUser.address,
            age: userData.age || existingUser.age,
            annual_income: userData.annualIncome || existingUser.annual_income,
            net_worth: userData.netWorth || existingUser.net_worth,
            investment_experience: userData.investmentExperience || existingUser.investment_experience,
            is_accredited: userData.isAccredited === 'yes' || existingUser.is_accredited,
            updated_at: new Date().toISOString(),
          })
          .eq('id', authData.user.id);
          
        if (updateError) {
          console.error("Error updating existing profile:", updateError);
        } else {
          console.log("Updated existing profile successfully");
        }
        
        return { 
          user: authData.user, 
          session: authData.session, 
          error: {
            code: "user_already_exists",
            message: "This email is already registered. Please use a different email or try logging in instead."
          }
        };
      }
    }
    
    // If user doesn't exist, sign up
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: userData.fullName || '',
        }
      }
    });

    if (authError) {
      console.error('Auth error during signup:', authError);
      
      // Check if this is a "User already registered" error
      if (authError.message?.includes("already registered")) {
        // Try to sign in the user since they already exist
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password
        });
        
        if (signInError) {
          return { 
            user: null, 
            session: null, 
            error: {
              code: "user_already_exists",
              message: "This email is already registered. Please use a different email or try logging in instead."
            }
          };
        }
        
        return { 
          user: signInData.user, 
          session: signInData.session, 
          error: {
            code: "user_already_exists",
            message: "This email is already registered. Please use a different email or try logging in instead."
          }
        };
      }
      
      return { user: null, session: null, error: authError };
    }

    console.log("Auth signup successful, creating profile");

    // If we get a user back, create their profile
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

      if (profileError) {
        console.error('Profile creation error:', profileError);
        return { user: authData.user, session: authData.session, error: profileError };
      }
      
      console.log("Profile created successfully");
    }

    return { user: authData.user, session: authData.session, error: null };
  } catch (error) {
    console.error('Error signing up:', error);
    return { user: null, session: null, error };
  }
};

// Login with email and password
export const signInWithEmail = async (email: string, password: string): Promise<AuthResponse> => {
  try {
    console.log("Attempting to sign in with email:", email);
    
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      console.error('SignIn error:', error);
      return { user: null, session: null, error };
    }

    console.log("Sign in successful, checking for profile");
    
    // Check if the user profile exists after login
    if (data.user) {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', data.user.id)
        .single();
      
      if (profileError) {
        console.warn('Profile not found for user, creating one now');
        // Create a profile if missing
        await supabase
          .from('profiles')
          .insert({
            id: data.user.id,
            email: data.user.email,
            full_name: data.user.user_metadata?.full_name || 'Investor',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
      } else {
        console.log("Found existing profile:", profile);
      }
      
      // Save user profile to localStorage for app-wide access
      localStorage.setItem("investorProfile", JSON.stringify({
        id: data.user.id,
        email: data.user.email,
        fullName: profile?.full_name || data.user.user_metadata?.full_name || 'Investor'
      }));
    }

    return { user: data.user, session: data.session, error: null };
  } catch (error) {
    console.error('Error signing in:', error);
    return { user: null, session: null, error };
  }
};

// Sign in with provider (Google only, Apple removed)
export const signInWithProvider = async (provider: 'google'): Promise<AuthResponse> => {
  try {
    console.log(`Attempting to sign in with ${provider}...`);
    
    // Add diagnostic information
    const currentUrl = window.location.origin;
    console.log(`Current origin URL: ${currentUrl}`);
    
    // Set correct redirect URL with /auth/callback
    const redirectTo = `${window.location.origin}/auth/callback`;
    console.log(`Setting redirect URL to: ${redirectTo}`);
    
    // Call signInWithOAuth which returns URL information
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo,
        queryParams: {
          prompt: 'select_account', // Force Google account selection screen
        }
      }
    });

    if (error) {
      console.error(`OAuth error for ${provider}:`, error);
      
      // More detailed error checking
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

// Logout
export const signOut = async (): Promise<{ error: any }> => {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    
    // Clear local storage
    localStorage.removeItem("investorProfile");
    return { error: null };
  } catch (error) {
    console.error('Error signing out:', error);
    return { error };
  }
};

// Check current session
export const getCurrentSession = async () => {
  return await supabase.auth.getSession();
};

// Get current user
export const getCurrentUser = async () => {
  const { data } = await supabase.auth.getUser();
  return data?.user;
};

// Get user profile
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

// Update user profile
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
