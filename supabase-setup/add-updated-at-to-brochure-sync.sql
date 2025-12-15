-- Add updated_at column to brochure_sync table on Supabase
-- This is optional but recommended for consistency with local database

-- Add updated_at column if it doesn't exist
ALTER TABLE brochure_sync 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Create trigger to automatically update updated_at on row updates
CREATE OR REPLACE FUNCTION update_brochure_sync_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if it exists and recreate it
DROP TRIGGER IF EXISTS trigger_update_brochure_sync_updated_at ON brochure_sync;

CREATE TRIGGER trigger_update_brochure_sync_updated_at
    BEFORE UPDATE ON brochure_sync
    FOR EACH ROW
    EXECUTE FUNCTION update_brochure_sync_updated_at();

-- Update existing records to set updated_at = last_modified (or created_at if last_modified is NULL)
UPDATE brochure_sync 
SET updated_at = COALESCE(last_modified, created_at, NOW())
WHERE updated_at IS NULL;

-- Add comment for documentation
COMMENT ON COLUMN brochure_sync.updated_at IS 'Timestamp when the brochure_sync record was last updated';

