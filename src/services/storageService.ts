
import { supabase } from '@/lib/supabase';
import { v4 as uuidv4 } from 'uuid';

// העלאת תמונת נכס
export const uploadPropertyImage = async (file: File): Promise<string | null> => {
  try {
    const fileExt = file.name.split('.').pop();
    const fileName = `${uuidv4()}.${fileExt}`;
    const filePath = `properties/${fileName}`;

    const { error } = await supabase.storage.from('images').upload(filePath, file);

    if (error) throw error;

    const { data } = supabase.storage.from('images').getPublicUrl(filePath);
    return data.publicUrl;
  } catch (error) {
    console.error('Error uploading property image:', error);
    return null;
  }
};

// העלאת מסמך
export const uploadDocument = async (file: File, userId: string): Promise<string | null> => {
  try {
    const fileExt = file.name.split('.').pop();
    const fileName = `${uuidv4()}.${fileExt}`;
    const filePath = `documents/${userId}/${fileName}`;

    const { error } = await supabase.storage.from('documents').upload(filePath, file);

    if (error) throw error;

    const { data } = supabase.storage.from('documents').getPublicUrl(filePath);
    return data.publicUrl;
  } catch (error) {
    console.error('Error uploading document:', error);
    return null;
  }
};

// העלאת תמונת פרופיל
export const uploadProfileImage = async (file: File, userId: string): Promise<string | null> => {
  try {
    const fileExt = file.name.split('.').pop();
    const fileName = `${userId}.${fileExt}`;
    const filePath = `avatars/${fileName}`;

    const { error } = await supabase.storage.from('images').upload(filePath, file, {
      upsert: true // לדרוס קובץ קיים עם אותו שם
    });

    if (error) throw error;

    const { data } = supabase.storage.from('images').getPublicUrl(filePath);
    return data.publicUrl;
  } catch (error) {
    console.error('Error uploading profile image:', error);
    return null;
  }
};

// מחיקת קובץ
export const deleteFile = async (path: string, bucket: 'images' | 'documents'): Promise<boolean> => {
  try {
    const { error } = await supabase.storage.from(bucket).remove([path]);
    
    if (error) throw error;
    
    return true;
  } catch (error) {
    console.error(`Error deleting file at path ${path}:`, error);
    return false;
  }
};
