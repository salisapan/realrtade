
import { supabase as supabaseClient } from '@/integrations/supabase/client';

// Export the client from the integration to avoid having multiple instances
export const supabase = supabaseClient;
