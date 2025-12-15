-- Add updated_at column to saved_brochures table on Supabase
-- This is optional but recommended for consistency with local database

-- Add updated_at column if it doesn't exist
ALTER TABLE saved_brochures 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Create trigger to automatically update updated_at on row updates
CREATE OR REPLACE FUNCTION update_saved_brochures_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if it exists and recreate it
DROP TRIGGER IF EXISTS trigger_update_saved_brochures_updated_at ON saved_brochures;

CREATE TRIGGER trigger_update_saved_brochures_updated_at
    BEFORE UPDATE ON saved_brochures
    FOR EACH ROW
    EXECUTE FUNCTION update_saved_brochures_updated_at();

-- Update existing records to set updated_at = saved_at (or NOW() if saved_at is NULL)
UPDATE saved_brochures 
SET updated_at = COALESCE(saved_at, NOW())
WHERE updated_at IS NULL;

-- Add comment for documentation
COMMENT ON COLUMN saved_brochures.updated_at IS 'Timestamp when the saved brochure record was last updated';

