
import { createClient, User as SupabaseUser } from '@supabase/supabase-js';
import type { SavedReport, BusinessData, User, UserProfile } from '../types';
import { getEnv } from '../utils';

// Initialize Supabase Client
const supabaseUrl = getEnv('VITE_SUPABASE_URL') || getEnv('SUPABASE_URL');
const supabaseAnonKey = getEnv('VITE_SUPABASE_ANON_KEY') || getEnv('SUPABASE_ANON_KEY');

// We export the client to be used in listeners if needed, but mostly use helper functions
export const supabase = supabaseUrl && supabaseAnonKey 
  ? createClient(supabaseUrl, supabaseAnonKey) 
  : null;

if (!supabase) {
  console.warn("Supabase credentials missing. Cloud persistence features will be disabled.");
}

// --- Types for Database Rows (snake_case) ---
interface ReportRow {
  id: string;
  created_at: string;
  user_id: string;
  organization_name: string;
  analysis: string;
  business_data: BusinessData; // Jsonb in DB, mapped to object
  rating?: number;
  comment?: string;
}

// --- Helpers ---

const mapRowToSavedReport = (row: ReportRow): SavedReport => ({
  id: row.id,
  date: row.created_at,
  organizationName: row.organization_name,
  analysis: row.analysis,
  businessData: row.business_data,
  rating: row.rating,
  comment: row.comment,
  userId: row.user_id,
});

// --- Auth Services ---

export const signUp = async (email: string, password: string) => {
  if (!supabase) throw new Error("Supabase not configured");
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  });
  if (error) throw error;
  return data;
};

export const signIn = async (email: string, password: string) => {
  if (!supabase) throw new Error("Supabase not configured");
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
  return data;
};

export const signOut = async () => {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
};

export const getCurrentUser = async (): Promise<User | null> => {
    if (!supabase) return null;
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error || !session) return null;
    return session.user as unknown as User;
};

// --- Profile & Subscription Services ---

export const getUserProfile = async (userId: string): Promise<UserProfile | null> => {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  
  if (error) {
    console.error("Error fetching profile:", error);
    return null;
  }
  return data as UserProfile;
};

export const upgradeSubscription = async (userId: string, tier: 'pro' | 'enterprise'): Promise<void> => {
  if (!supabase) return;
  
  // In a real app, this would be a backend function called via webhook after Stripe payment
  const { error } = await supabase
    .from('profiles')
    .update({ subscription_tier: tier })
    .eq('id', userId);

  if (error) throw error;
};

// --- Database Services ---

export const getReports = async (): Promise<SavedReport[]> => {
  if (!supabase) return [];
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('reports')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error("Error fetching reports:", error);
    throw error;
  }

  return (data as ReportRow[]).map(mapRowToSavedReport);
};

export const createReport = async (reportData: Omit<SavedReport, 'id' | 'date'>): Promise<SavedReport> => {
  if (!supabase) {
    // Fallback for demo without backend
    return {
        ...reportData,
        id: 'local-' + Date.now(),
        date: new Date().toISOString()
    } as SavedReport;
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Please login to save your report.");

  const row = {
    user_id: user.id,
    organization_name: reportData.organizationName,
    analysis: reportData.analysis,
    business_data: reportData.businessData,
  };

  const { data, error } = await supabase
    .from('reports')
    .insert([row])
    .select()
    .single();

  if (error) {
      console.error("Supabase Insert Error:", error);
      throw new Error("Failed to save report to database.");
  }
  return mapRowToSavedReport(data as ReportRow);
};

export const deleteReport = async (reportId: string): Promise<void> => {
  if (!supabase) return;

  const { error } = await supabase
    .from('reports')
    .delete()
    .eq('id', reportId);

  if (error) throw error;
};

export const submitFeedback = async (reportId: string, rating: number, comment: string): Promise<void> => {
  if (!supabase) return;

  const { error } = await supabase
    .from('reports')
    .update({ rating, comment })
    .eq('id', reportId);

  if (error) throw error;
};
