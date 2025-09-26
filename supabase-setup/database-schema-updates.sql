-- Database Schema Updates for MR Management and Brochure Features
-- Run this in your Supabase SQL Editor

-- Add new columns to users table for MR management
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS address TEXT,
ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS can_upload_brochures BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS can_manage_doctors BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS can_schedule_meetings BOOLEAN DEFAULT true;

-- Add new columns to brochures table for better management
ALTER TABLE brochures 
ADD COLUMN IF NOT EXISTS file_name TEXT,
ADD COLUMN IF NOT EXISTS file_type VARCHAR(50),
ADD COLUMN IF NOT EXISTS uploaded_by UUID REFERENCES users(id),
ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS tags TEXT[],
ADD COLUMN IF NOT EXISTS version VARCHAR(20) DEFAULT '1.0';

-- Create MR permissions table for granular control
CREATE TABLE IF NOT EXISTS mr_permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    mr_id UUID REFERENCES users(id) NOT NULL,
    permission_type VARCHAR(50) NOT NULL,
    is_granted BOOLEAN DEFAULT false,
    granted_by UUID REFERENCES users(id),
    granted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE,
    notes TEXT,
    UNIQUE(mr_id, permission_type)
);

-- Create brochure categories table
CREATE TABLE IF NOT EXISTS brochure_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    color VARCHAR(7) DEFAULT '#8b5cf6',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default brochure categories
INSERT INTO brochure_categories (name, description, color) VALUES
('Cardiology', 'Heart and cardiovascular system related brochures', '#ef4444'),
('Neurology', 'Brain and nervous system related brochures', '#8b5cf6'),
('Oncology', 'Cancer treatment and prevention brochures', '#f59e0b'),
('Pediatrics', 'Children health and treatment brochures', '#10b981'),
('General Medicine', 'General health and wellness brochures', '#6b7280')
ON CONFLICT (name) DO NOTHING;

-- Update brochures table to reference categories
ALTER TABLE brochures 
ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES brochure_categories(id);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_permissions ON users USING GIN (permissions);
CREATE INDEX IF NOT EXISTS idx_mr_permissions_mr_id ON mr_permissions(mr_id);
CREATE INDEX IF NOT EXISTS idx_mr_permissions_type ON mr_permissions(permission_type);
CREATE INDEX IF NOT EXISTS idx_brochures_category_id ON brochures(category_id);
CREATE INDEX IF NOT EXISTS idx_brochures_uploaded_by ON brochures(uploaded_by);

-- Update the updated_at trigger for new columns
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers to new tables
CREATE TRIGGER update_mr_permissions_updated_at 
    BEFORE UPDATE ON mr_permissions 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_brochure_categories_updated_at 
    BEFORE UPDATE ON brochure_categories 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
