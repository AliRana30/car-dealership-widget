-- ==============================================================================
-- Freshness Tracking Migration (A.2): first_seen, last_seen, still_listed
-- ==============================================================================

-- 1. Add timestamp and availability tracking columns to website_data
ALTER TABLE website_data 
ADD COLUMN IF NOT EXISTS first_seen TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL;

ALTER TABLE website_data 
ADD COLUMN IF NOT EXISTS last_seen TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL;

ALTER TABLE website_data 
ADD COLUMN IF NOT EXISTS still_listed BOOLEAN DEFAULT TRUE NOT NULL;

-- 2. Backfill existing records: set first_seen = created_at, last_seen = updated_at (or created_at)
UPDATE website_data 
SET 
  first_seen = COALESCE(first_seen, created_at, NOW()),
  last_seen = COALESCE(last_seen, updated_at, created_at, NOW()),
  still_listed = COALESCE(still_listed, TRUE)
WHERE first_seen IS NULL OR last_seen IS NULL OR still_listed IS NULL;

-- 3. Create performance indexes for freshness and availability filtering
CREATE INDEX IF NOT EXISTS idx_website_data_last_seen ON website_data(last_seen DESC);
CREATE INDEX IF NOT EXISTS idx_website_data_still_listed ON website_data(still_listed);

-- 4. Add known_urls tracking column to websites table (A.3)
ALTER TABLE websites
ADD COLUMN IF NOT EXISTS known_urls JSONB DEFAULT '[]'::jsonb NOT NULL;
