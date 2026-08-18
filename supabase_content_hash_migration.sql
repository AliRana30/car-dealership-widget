-- Migration: Add last_checked_at and indexes for Phase 5.2 Content Hashing

ALTER TABLE website_data
ADD COLUMN IF NOT EXISTS last_checked_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL;

CREATE INDEX IF NOT EXISTS idx_website_data_content_hash ON website_data(widget_id, source_url, content_hash);

COMMENT ON COLUMN website_data.content_hash IS 'SHA-256 hash of raw page content used for incremental crawl change detection';
COMMENT ON COLUMN website_data.last_checked_at IS 'Timestamp when the page was last crawled/checked for modifications';
