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
        };
      };
    };
  };
};

export type Plant = Database['public']['Tables']['plants']['Row'];
