-- Run this in the Supabase SQL Editor:
-- https://supabase.com/dashboard/project/xiqexeullniezghwdjfb/sql/new

-- ─── Plants table ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.plants (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name          TEXT          NOT NULL,
  species       TEXT,
  level         INTEGER       NOT NULL DEFAULT 1 CHECK (level >= 1),
  xp            INTEGER       NOT NULL DEFAULT 0 CHECK (xp >= 0),
  health_percent INTEGER      NOT NULL DEFAULT 100 CHECK (health_percent BETWEEN 0 AND 100),
  last_watered  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Index for fast per-user queries
CREATE INDEX IF NOT EXISTS plants_user_id_idx ON public.plants (user_id);

-- ─── Row Level Security ──────────────────────────────────────────────────────

ALTER TABLE public.plants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own plants"
  ON public.plants FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own plants"
  ON public.plants FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own plants"
  ON public.plants FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own plants"
  ON public.plants FOR DELETE
  USING (auth.uid() = user_id);
