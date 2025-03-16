
import { supabase } from '@/lib/supabase';
import { InvestmentFormValues } from '@/components/property/types/letterOfIntentTypes';

export interface Investment {
  id: string;
  userId: string;
  propertyId: string;
  amount: number;
  paymentMethod: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

// המרה של נתוני השקעה מהפורמט של Supabase לפורמט שהאפליקציה משתמשת בו
const mapInvestmentFromDB = (investment: any): Investment => {
  return {
    id: investment.id,
    userId: investment.user_id,
    propertyId: investment.property_id,
    amount: investment.amount,
    paymentMethod: investment.payment_method,
    status: investment.status,
    createdAt: investment.created_at,
    updatedAt: investment.updated_at
  };
};

// יצירת השקעה חדשה
export const createInvestment = async (
  userId: string, 
  propertyId: string, 
  investmentData: InvestmentFormValues
): Promise<Investment | null> => {
  try {
    const investmentForDB = {
      user_id: userId,
      property_id: propertyId,
      amount: investmentData.investmentAmount,
      payment_method: investmentData.paymentMethod || 'creditCard',
      status: 'pending',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('investments')
      .insert(investmentForDB)
      .select()
      .single();

    if (error) throw error;

    return mapInvestmentFromDB(data);
  } catch (error) {
    console.error('Error creating investment:', error);
    return null;
  }
};

// קבלת כל ההשקעות של משתמש ספציפי
export const getUserInvestments = async (userId: string): Promise<Investment[]> => {
  try {
    const { data, error } = await supabase
      .from('investments')
      .select('*')
      .eq('user_id', userId);

    if (error) throw error;

    return data.map(mapInvestmentFromDB);
  } catch (error) {
    console.error(`Error fetching investments for user ${userId}:`, error);
    return [];
  }
};

// קבלת השקעה ספציפית לפי ID
export const getInvestmentById = async (id: string): Promise<Investment | null> => {
  try {
    const { data, error } = await supabase
      .from('investments')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;

    return mapInvestmentFromDB(data);
  } catch (error) {
    console.error(`Error fetching investment with id ${id}:`, error);
    return null;
  }
};

// עדכון השקעה קיימת
export const updateInvestment = async (id: string, status: string): Promise<Investment | null> => {
  try {
    const { data, error } = await supabase
      .from('investments')
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return mapInvestmentFromDB(data);
  } catch (error) {
    console.error(`Error updating investment with id ${id}:`, error);
    return null;
  }
};

// קבלת סיכום ההשקעות של משתמש
export const getUserInvestmentSummary = async (userId: string): Promise<{
  totalInvested: number;
  propertyCount: number;
}> => {
  try {
    const { data, error } = await supabase
      .from('investments')
      .select('*')
      .eq('user_id', userId);

    if (error) throw error;

    const totalInvested = data.reduce((sum, investment) => sum + investment.amount, 0);
    const propertyIds = new Set(data.map(investment => investment.property_id));

    return {
      totalInvested,
      propertyCount: propertyIds.size
    };
  } catch (error) {
    console.error(`Error fetching investment summary for user ${userId}:`, error);
    return {
      totalInvested: 0,
      propertyCount: 0
    };
  }
};
