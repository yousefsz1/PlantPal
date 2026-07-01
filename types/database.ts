export type Database = {
  public: {
    Tables: {
      plants: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          species: string | null;
          level: number;
          xp: number;
          health_percent: number;
          last_watered: string | null;
          created_at: string;
          watering_frequency: 'daily' | 'weekly' | 'monthly' | null;
          sunlight: 'low' | 'medium' | 'bright' | null;
          notes: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          species?: string | null;
          level?: number;
          xp?: number;
          health_percent?: number;
          last_watered?: string | null;
          created_at?: string;
          watering_frequency?: 'daily' | 'weekly' | 'monthly' | null;
          sunlight?: 'low' | 'medium' | 'bright' | null;
          notes?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          species?: string | null;
          level?: number;
          xp?: number;
          health_percent?: number;
          last_watered?: string | null;
          created_at?: string;
          watering_frequency?: 'daily' | 'weekly' | 'monthly' | null;
          sunlight?: 'low' | 'medium' | 'bright' | null;
          notes?: string | null;
        };
      };
    };
  };
};

export type Plant = Database['public']['Tables']['plants']['Row'];
