
import { supabase } from '@/lib/supabase';
import {
  propertiesBySector,
  propertiesByLowRisk,
  propertiesByGeography,
  propertiesByProfitable,
  propertiesByCompany
} from '@/data/propertyData';

// המרת נכס לפורמט של supabase
const mapPropertyToSupabase = (property: any, category: string) => {
  return {
    id: property.id,
    title: property.title,
    location: property.location,
    company: property.company,
    website: property.website || '',
    cash_on_cash: property.cashOnCash || property.cash_on_cash,
    upside: property.upside,
    funded: property.funded,
    rented: property.rented,
    sqft: property.sqft,
    floors: property.floors,
    status: property.status,
    year: property.year,
    price: property.price,
    image_url: property.image || property.imageUrl,
    category: category,
    min_investment: 2500, // ערך ברירת מחדל
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
};

// העברת כל הנתונים מקבצי הנתונים המקומיים ל-Supabase
export const migratePropertiesToSupabase = async (): Promise<{
  success: boolean;
  message: string;
  count: number;
}> => {
  try {
    const allProperties = [
      ...propertiesBySector.map(prop => mapPropertyToSupabase(prop, 'sector')),
      ...propertiesByLowRisk.map(prop => mapPropertyToSupabase(prop, 'low-risk')),
      ...propertiesByGeography.map(prop => mapPropertyToSupabase(prop, 'geography')),
      ...propertiesByProfitable.map(prop => mapPropertyToSupabase(prop, 'profitable')),
      ...propertiesByCompany.map(prop => mapPropertyToSupabase(prop, 'company'))
    ];

    // מניעת כפילויות על בסיס ID
    const uniqueProperties = Array.from(
      new Map(allProperties.map(prop => [prop.id, prop])).values()
    );

    // העלאה של הנכסים ל-Supabase
    const { error, count } = await supabase
      .from('properties')
      .upsert(uniqueProperties, { onConflict: 'id' });

    if (error) throw error;

    return {
      success: true,
      message: `Successfully migrated ${count} properties to Supabase`,
      count: count || 0
    };
  } catch (error) {
    console.error('Error migrating properties to Supabase:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to migrate properties',
      count: 0
    };
  }
};

// פונקציה להעברת נתוני המשתמשים מה-localStorage ל-Supabase
export const migrateUserProfilesToSupabase = async (): Promise<{
  success: boolean;
  message: string;
  count: number;
}> => {
  try {
    // בדיקה אם יש נתונים ב-localStorage
    const localProfile = localStorage.getItem("investorProfile");
    if (!localProfile) {
      return {
        success: false,
        message: 'No local profile found to migrate',
        count: 0
      };
    }

    const profile = JSON.parse(localProfile);
    const session = await supabase.auth.getSession();
    
    // אם המשתמש מחובר, נעדכן את הפרופיל שלו
    if (session.data.session) {
      const userId = session.data.session.user.id;
      
      const { error } = await supabase
        .from('profiles')
        .upsert({
          id: userId,
          full_name: profile.fullName || '',
          email: profile.email || '',
          phone: profile.phone || '',
          address: profile.address || '',
          age: profile.age || 0,
          annual_income: profile.annualIncome || 0,
          net_worth: profile.netWorth || 0,
          investment_experience: profile.investmentExperience || 'none',
          is_accredited: profile.isAccredited === 'yes',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

      if (error) throw error;

      return {
        success: true,
        message: 'Successfully migrated user profile to Supabase',
        count: 1
      };
    }

    return {
      success: false,
      message: 'No authenticated user found to associate with the profile',
      count: 0
    };
  } catch (error) {
    console.error('Error migrating user profile to Supabase:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to migrate user profile',
      count: 0
    };
  }
};

// פונקציה להעברת כל הנתונים במקביל
export const migrateAllDataToSupabase = async (): Promise<{
  properties: { success: boolean; message: string; count: number };
  profiles: { success: boolean; message: string; count: number };
}> => {
  const propertiesResult = await migratePropertiesToSupabase();
  const profilesResult = await migrateUserProfilesToSupabase();

  return {
    properties: propertiesResult,
    profiles: profilesResult,
  };
};
