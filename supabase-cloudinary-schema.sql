-- =============================================================================
-- RISKLOOP CLOUDINARY INTEGRATION SCHEMA MIGRATION (PHASE 1)
-- Safe, additive migrations for Profile Avatars and Journal Trade Images
-- =============================================================================

-- 1. Add avatar_public_id to public.profiles (if not already present)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'profiles' 
      AND column_name = 'avatar_public_id'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN avatar_public_id TEXT DEFAULT NULL;
  END IF;
END $$;

-- 2. Add images JSONB to public.journal_trades (if not already present)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'journal_trades' 
      AND column_name = 'images'
  ) THEN
    ALTER TABLE public.journal_trades ADD COLUMN images JSONB DEFAULT '[]'::jsonb NOT NULL;
  END IF;
END $$;

-- 3. Create index on journal_trades.images for fast JSON operations (optional)
CREATE INDEX IF NOT EXISTS idx_journal_trades_images_gin ON public.journal_trades USING gin (images);

-- =============================================================================
-- End of Migration
-- =============================================================================
