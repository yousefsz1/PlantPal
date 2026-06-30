import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';

const SUPABASE_URL = 'https://xiqexeullniezghwdjfb.supabase.co';
// Publishable key — safe to commit (protected by Row Level Security)
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_nDFXGei3ZvmNKZZ6ZAuWpw_BOUgFXB4';

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
