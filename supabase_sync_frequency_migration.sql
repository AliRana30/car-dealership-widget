-- Migration: Add sync_frequency to websites table for Phase 5.1

ALTER TABLE websites
ADD COLUMN IF NOT EXISTS sync_frequency TEXT DEFAULT 'off' NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'websites_sync_frequency_check'
    ) THEN
        ALTER TABLE websites
        ADD CONSTRAINT websites_sync_frequency_check
        CHECK (sync_frequency IN ('off', 'weekly', 'daily', 'twice_daily', 'three_times_daily'));
    END IF;
END $$;

COMMENT ON COLUMN websites.sync_frequency IS 'Automated recurring crawl sync frequency (off, weekly, daily, twice_daily, three_times_daily)';
