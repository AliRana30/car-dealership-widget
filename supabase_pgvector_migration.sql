-- Enable the pgvector extension in Supabase
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding vector(1536) to website_data if not already present
DO $$
BEGIN
    -- Check if column exists
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'website_data' 
          AND column_name = 'embedding'
    ) THEN
        -- If it exists, check if its type is 'vector'. If not, drop it and recreate it.
        IF NOT EXISTS (
            SELECT 1 
            FROM information_schema.columns 
            WHERE table_name = 'website_data' 
              AND column_name = 'embedding' 
              AND udt_name = 'vector'
        ) THEN
            ALTER TABLE website_data DROP COLUMN embedding;
            ALTER TABLE website_data ADD COLUMN embedding vector(1536);
        END IF;
    ELSE
        -- If it doesn't exist, just add it as vector(1536)
        ALTER TABLE website_data ADD COLUMN embedding vector(1536);
    END IF;
END $$;

-- Create match_website_data function to perform pgvector similarity searches
CREATE OR REPLACE FUNCTION match_website_data (
  query_embedding vector(1536),
  match_threshold float,
  match_count int,
  filter_widget_ids uuid[]
)
RETURNS TABLE (
  id uuid,
  widget_id uuid,
  source_url text,
  title text,
  content text,
  entity_type text,
  metadata jsonb,
  short_description text,
  image_urls jsonb,
  data_type text,
  category_path text[],
  content_hash text,
  similarity float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    website_data.id,
    website_data.widget_id,
    website_data.source_url,
    website_data.title,
    website_data.content,
    website_data.entity_type,
    website_data.metadata,
    website_data.short_description,
    website_data.image_urls,
    website_data.data_type,
    website_data.category_path,
    website_data.content_hash,
    1 - (website_data.embedding <=> query_embedding) AS similarity
  FROM website_data
  WHERE website_data.widget_id = ANY(filter_widget_ids)
    AND website_data.embedding IS NOT NULL
    AND 1 - (website_data.embedding <=> query_embedding) > match_threshold
  ORDER BY website_data.embedding <=> query_embedding
  LIMIT match_count;
$$;
