-- Medical Representative App Database Schema
-- Run this in your Supabase SQL Editor

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create custom types
CREATE TYPE user_role AS ENUM ('admin', 'mr');
CREATE TYPE meeting_status AS ENUM ('scheduled', 'completed', 'cancelled', 'rescheduled');
CREATE TYPE brochure_status AS ENUM ('active', 'inactive', 'archived');
CREATE TYPE assignment_status AS ENUM ('active', 'inactive', 'transferred');

-- Users table (for both Admin and MRs)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role user_role NOT NULL DEFAULT 'mr',
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    profile_image_url TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Doctors table
CREATE TABLE doctors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(20),
    specialty VARCHAR(100) NOT NULL,
    hospital VARCHAR(255) NOT NULL,
    location VARCHAR(255),
    profile_image_url TEXT,
    notes TEXT,
    relationship_status VARCHAR(50) DEFAULT 'active',
    meetings_count INTEGER DEFAULT 0,
    last_meeting_date TIMESTAMP WITH TIME ZONE,
    next_appointment TIMESTAMP WITH TIME ZONE,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Brochures table
CREATE TABLE brochures (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL,
    description TEXT,
    file_url TEXT NOT NULL,
    thumbnail_url TEXT,
    pages INTEGER,
    file_size VARCHAR(50),
    status brochure_status DEFAULT 'active',
    assigned_by UUID REFERENCES users(id),
    download_count INTEGER DEFAULT 0,
    view_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Meetings table
CREATE TABLE meetings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    mr_id UUID REFERENCES users(id) NOT NULL,
    doctor_id UUID REFERENCES doctors(id) NOT NULL,
    brochure_id UUID REFERENCES brochures(id),
    title VARCHAR(255) NOT NULL,
    scheduled_date TIMESTAMP WITH TIME ZONE NOT NULL,
    duration_minutes INTEGER DEFAULT 30,
    status meeting_status DEFAULT 'scheduled',
    location VARCHAR(255),
    notes TEXT,
    follow_up_required BOOLEAN DEFAULT false,
    follow_up_date TIMESTAMP WITH TIME ZONE,
    presentation_slides JSONB,
    comments JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Doctor-MR Assignments table
CREATE TABLE doctor_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    doctor_id UUID REFERENCES doctors(id) NOT NULL,
    mr_id UUID REFERENCES users(id) NOT NULL,
    assigned_by UUID REFERENCES users(id) NOT NULL,
    status assignment_status DEFAULT 'active',
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    transferred_at TIMESTAMP WITH TIME ZONE,
    notes TEXT,
    UNIQUE(doctor_id, mr_id, status) -- Prevent duplicate active assignments
);

-- System Settings table
CREATE TABLE system_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    setting_key VARCHAR(100) UNIQUE NOT NULL,
    setting_value TEXT NOT NULL,
    description TEXT,
    updated_by UUID REFERENCES users(id),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Activity Logs table
CREATE TABLE activity_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID,
    details JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_doctors_specialty ON doctors(specialty);
CREATE INDEX idx_doctors_hospital ON doctors(hospital);
CREATE INDEX idx_brochures_category ON brochures(category);
CREATE INDEX idx_brochures_status ON brochures(status);
CREATE INDEX idx_meetings_mr_id ON meetings(mr_id);
CREATE INDEX idx_meetings_doctor_id ON meetings(doctor_id);
CREATE INDEX idx_meetings_status ON meetings(status);
CREATE INDEX idx_meetings_scheduled_date ON meetings(scheduled_date);
CREATE INDEX idx_doctor_assignments_doctor_id ON doctor_assignments(doctor_id);
CREATE INDEX idx_doctor_assignments_mr_id ON doctor_assignments(mr_id);
CREATE INDEX idx_activity_logs_user_id ON activity_logs(user_id);
CREATE INDEX idx_activity_logs_created_at ON activity_logs(created_at);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_doctors_updated_at BEFORE UPDATE ON doctors FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_brochures_updated_at BEFORE UPDATE ON brochures FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_meetings_updated_at BEFORE UPDATE ON meetings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_system_settings_updated_at BEFORE UPDATE ON system_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert default admin user (password: admin123)
INSERT INTO users (email, password_hash, role, first_name, last_name) 
VALUES ('admin@medpresent.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'admin', 'System', 'Administrator');

-- Insert default system settings
INSERT INTO system_settings (setting_key, setting_value, description) VALUES
('app_name', 'MedPresent', 'Application name'),
('max_file_size', '10485760', 'Maximum file size in bytes (10MB)'),
('allowed_file_types', 'pdf,jpg,jpeg,png', 'Allowed file types'),
('meeting_duration_default', '30', 'Default meeting duration in minutes'),
('notification_enabled', 'true', 'Enable system notifications'),
('backup_frequency', 'daily', 'Backup frequency'),
('session_timeout', '3600', 'Session timeout in seconds');

