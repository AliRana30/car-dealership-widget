-- Create the widgets table in Supabase
CREATE TABLE IF NOT EXISTS widgets (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    provider TEXT NOT NULL CHECK (provider IN ('retell', 'vapi')),
    retell_api_key TEXT,
    retell_agent_id TEXT,
    vapi_api_key TEXT,
    vapi_assistant_id TEXT,
    config JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Enable Row Level Security (RLS)
ALTER TABLE widgets ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all operations from Next.js server-side route handlers
DROP POLICY IF EXISTS "Allow all access to server-side operations" ON widgets;
CREATE POLICY "Allow all access to server-side operations" ON widgets
    FOR ALL
    USING (true)
    WITH CHECK (true);
