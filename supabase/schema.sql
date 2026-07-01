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

-- ─── User profiles (XP totals) ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.profiles (
  id         UUID    PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  total_xp   INTEGER NOT NULL DEFAULT 0 CHECK (total_xp >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Atomic XP increment: inserts the profile row on first scan, increments on subsequent ones.
-- Call from client: supabase.rpc('increment_xp', { xp_amount: 30 })
CREATE OR REPLACE FUNCTION public.increment_xp(xp_amount INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_total INTEGER;
BEGIN
  INSERT INTO public.profiles (id, total_xp)
  VALUES (auth.uid(), xp_amount)
  ON CONFLICT (id) DO UPDATE
    SET total_xp = profiles.total_xp + xp_amount
  RETURNING total_xp INTO new_total;
  RETURN new_total;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_xp(INTEGER) TO authenticated;

-- ─── Plants table: new care columns ─────────────────────────────────────────
-- Run only on an existing DB (safe to re-run; IF NOT EXISTS guards each column)

ALTER TABLE public.plants
  ADD COLUMN IF NOT EXISTS watering_frequency TEXT
    CHECK (watering_frequency IN ('daily', 'weekly', 'monthly')),
  ADD COLUMN IF NOT EXISTS sunlight TEXT
    CHECK (sunlight IN ('low', 'medium', 'bright')),
  ADD COLUMN IF NOT EXISTS notes TEXT;
