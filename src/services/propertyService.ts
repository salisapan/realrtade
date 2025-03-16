
import { supabase } from '@/lib/supabase';

export interface Property {
  id: string;
  title: string;
  location: string;
  company: string;
  website?: string;
  cashOnCash: string;
  upside: string;
  funded: string;
  rented: string;
  sqft: string;
  floors: string;
  status: string;
  year: string;
  price: string;
  imageUrl: string;
  category: string;
  minInvestment: number;
}

// המרה של נתוני נכס מהפורמט של Supabase לפורמט שהאפליקציה משתמשת בו
const mapPropertyFromDB = (property: any): Property => {
  return {
    id: property.id,
    title: property.title,
    location: property.location,
    company: property.company,
    website: property.website,
    cashOnCash: property.cash_on_cash,
    upside: property.upside,
    funded: property.funded,
    rented: property.rented,
    sqft: property.sqft,
    floors: property.floors,
    status: property.status,
    year: property.year,
    price: property.price,
    imageUrl: property.image_url,
    category: property.category,
    minInvestment: property.min_investment
  };
};

// קבלת כל הנכסים
export const getAllProperties = async (): Promise<Property[]> => {
  try {
    const { data, error } = await supabase
      .from('properties')
      .select('*');

    if (error) throw error;

    return data.map(mapPropertyFromDB);
  } catch (error) {
    console.error('Error fetching properties:', error);
    return [];
  }
};

// קבלת נכסים לפי קטגוריה
export const getPropertiesByCategory = async (category: string): Promise<Property[]> => {
  try {
    const { data, error } = await supabase
      .from('properties')
      .select('*')
      .eq('category', category);

    if (error) throw error;

    return data.map(mapPropertyFromDB);
  } catch (error) {
    console.error(`Error fetching properties by category ${category}:`, error);
    return [];
  }
};

// קבלת נכס לפי ID
export const getPropertyById = async (id: string): Promise<Property | null> => {
  try {
    const { data, error } = await supabase
      .from('properties')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;

    return mapPropertyFromDB(data);
  } catch (error) {
    console.error(`Error fetching property with id ${id}:`, error);
    return null;
  }
};

// הוספת נכס חדש
export const addProperty = async (property: Omit<Property, 'id'>): Promise<Property | null> => {
  try {
    const propertyForDB = {
      title: property.title,
      location: property.location,
      company: property.company,
      website: property.website,
      cash_on_cash: property.cashOnCash,
      upside: property.upside,
      funded: property.funded,
      rented: property.rented,
      sqft: property.sqft,
      floors: property.floors,
      status: property.status,
      year: property.year,
      price: property.price,
      image_url: property.imageUrl,
      category: property.category,
      min_investment: property.minInvestment,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('properties')
      .insert(propertyForDB)
      .select()
      .single();

    if (error) throw error;

    return mapPropertyFromDB(data);
  } catch (error) {
    console.error('Error adding property:', error);
    return null;
  }
};

// עדכון נכס קיים
export const updateProperty = async (id: string, property: Partial<Property>): Promise<Property | null> => {
  try {
    const propertyForDB: any = {};
    
    if (property.title) propertyForDB.title = property.title;
    if (property.location) propertyForDB.location = property.location;
    if (property.company) propertyForDB.company = property.company;
    if (property.website) propertyForDB.website = property.website;
    if (property.cashOnCash) propertyForDB.cash_on_cash = property.cashOnCash;
    if (property.upside) propertyForDB.upside = property.upside;
    if (property.funded) propertyForDB.funded = property.funded;
    if (property.rented) propertyForDB.rented = property.rented;
    if (property.sqft) propertyForDB.sqft = property.sqft;
    if (property.floors) propertyForDB.floors = property.floors;
    if (property.status) propertyForDB.status = property.status;
    if (property.year) propertyForDB.year = property.year;
    if (property.price) propertyForDB.price = property.price;
    if (property.imageUrl) propertyForDB.image_url = property.imageUrl;
    if (property.category) propertyForDB.category = property.category;
    if (property.minInvestment) propertyForDB.min_investment = property.minInvestment;
    
    propertyForDB.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('properties')
      .update(propertyForDB)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return mapPropertyFromDB(data);
  } catch (error) {
    console.error(`Error updating property with id ${id}:`, error);
    return null;
  }
};

// מחיקת נכס
export const deleteProperty = async (id: string): Promise<boolean> => {
  try {
    const { error } = await supabase
      .from('properties')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return true;
  } catch (error) {
    console.error(`Error deleting property with id ${id}:`, error);
    return false;
  }
};
