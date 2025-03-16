
import { createClient } from '@supabase/supabase-js';
import { Database } from '../types/supabase';

// Use the values from our Supabase integration instead of environment variables
// Since the integration provides these values directly
const supabaseUrl = "https://nlvljclvoguvrnntwufu.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5sdmxqY2x2b2d1dnJubnR3dWZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDIxMjQxMTcsImV4cCI6MjA1NzcwMDExN30.G-Kap81tXWNWkggTEH9d47fNU2-RNKzyokgVivy201M";

export const supabase = createClient<Database>(
  supabaseUrl,
  supabaseAnonKey
);
