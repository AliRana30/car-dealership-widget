-- ============================================================================
-- Front Desk Phase 2: Generic Data Foundation Migration
-- ============================================================================

-- 1. Ensure default organization, website, and widget exist to satisfy constraints
INSERT INTO organizations (id, name)
VALUES ('00000000-0000-0000-0000-000000000000', 'Default Organization')
ON CONFLICT (id) DO NOTHING;

INSERT INTO websites (id, organization_id, name, allowed_domains)
VALUES ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000', 'Default Website', '{}'::TEXT[])
ON CONFLICT (id) DO NOTHING;

INSERT INTO widgets (id, widget_id, organization_id, name, status, website_id, allowed_domains, config)
VALUES (
    '00000000-0000-0000-0000-000000000000',
    'default-widget-placeholder',
    '00000000-0000-0000-0000-000000000000',
    'Default Widget',
    'active',
    '00000000-0000-0000-0000-000000000000',
    '{}'::TEXT[],
    '{}'::JSONB
)
ON CONFLICT (id) DO NOTHING;

-- 2. Drop the old foreign key constraint and index first so we can freely map/modify column values
ALTER TABLE website_data DROP CONSTRAINT IF EXISTS website_data_website_id_fkey;
DROP INDEX IF EXISTS idx_website_data_website_id;

-- 3. Clean up and rename website_id to widget_id if website_id still exists and widget_id doesn't
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='website_data' AND column_name='website_id') 
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='website_data' AND column_name='widget_id') THEN
    -- Rename column
    ALTER TABLE website_data RENAME COLUMN website_id TO widget_id;

    -- Map old website_id values (now in widget_id) to the corresponding widget id
    UPDATE website_data wd
    SET widget_id = w.id
    FROM widgets w
    WHERE w.website_id = wd.widget_id;
  END IF;
END $$;

-- Fallback for any orphaned records (e.g. ones pointing to websites that had no widget, or already renamed but unmapped)
UPDATE website_data
SET widget_id = '00000000-0000-0000-0000-000000000000'
WHERE widget_id NOT IN (SELECT id FROM widgets);

-- 5. Add new foreign key constraint pointing to widgets(id)
ALTER TABLE website_data DROP CONSTRAINT IF EXISTS website_data_widget_id_fkey;
ALTER TABLE website_data
  ADD CONSTRAINT website_data_widget_id_fkey FOREIGN KEY (widget_id) REFERENCES widgets(id) ON DELETE CASCADE;

-- 6. Create index on the new widget_id column
CREATE INDEX IF NOT EXISTS idx_website_data_widget_id ON website_data(widget_id);

-- 7. Rename existing url column to source_url if url column exists and source_url doesn't
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='website_data' AND column_name='url') 
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='website_data' AND column_name='source_url') THEN
    ALTER TABLE website_data RENAME COLUMN url TO source_url;
  END IF;
END $$;

-- 8. Rename existing data_type column to entity_type if data_type column exists and entity_type doesn't
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='website_data' AND column_name='data_type') 
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='website_data' AND column_name='entity_type') THEN
    ALTER TABLE website_data RENAME COLUMN data_type TO entity_type;
  END IF;
END $$;

-- 9. Add new columns for generic Entity foundation
ALTER TABLE website_data ADD COLUMN IF NOT EXISTS short_description TEXT;
ALTER TABLE website_data ADD COLUMN IF NOT EXISTS image_urls JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE website_data ADD COLUMN IF NOT EXISTS data_type TEXT NOT NULL DEFAULT 'crawl';
ALTER TABLE website_data ADD COLUMN IF NOT EXISTS category_path TEXT[] DEFAULT '{}'::text[];
ALTER TABLE website_data ADD COLUMN IF NOT EXISTS content_hash TEXT;
ALTER TABLE website_data ADD COLUMN IF NOT EXISTS embedding DOUBLE PRECISION[];

-- 10. Populate new columns for existing records
UPDATE website_data
SET short_description = COALESCE(metadata->>'description', substring(content from 1 for 200))
WHERE short_description IS NULL;

UPDATE website_data
SET image_urls = 
  CASE 
    WHEN metadata->'images' IS NOT NULL AND jsonb_typeof(metadata->'images') = 'array' THEN metadata->'images'
    WHEN metadata->'image' IS NOT NULL AND metadata->>'image' != '' THEN jsonb_build_array(metadata->'image')
    ELSE '[]'::jsonb
  END
WHERE image_urls = '[]'::jsonb;

-- Update data_type to 'crawl' for existing website_data records
UPDATE website_data
SET data_type = 'crawl'
WHERE data_type IS NULL OR data_type = '';
