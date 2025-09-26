# Supabase Backend Setup Guide for Medical Representative App

This guide will help you set up a complete Supabase backend for your Medical Representative App with all admin action APIs.

## Prerequisites

1. **Supabase Account**: Create an account at [supabase.com](https://supabase.com)
2. **Node.js**: Install Node.js for running scripts
3. **React Native Environment**: Set up React Native development environment

## Step 1: Create Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign in
2. Click "New Project"
3. Choose your organization
4. Enter project details:
   - **Name**: `medical-representative-app`
   - **Database Password**: Choose a strong password
   - **Region**: Select closest to your users
5. Click "Create new project"
6. Wait for the project to be created (2-3 minutes)

## Step 2: Get Project Credentials

1. In your Supabase dashboard, go to **Settings** → **API**
2. Copy the following:
   - **Project URL**: `https://your-project-id.supabase.co`
   - **Anon Key**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`

## Step 3: Set Up Database Schema

1. In your Supabase dashboard, go to **SQL Editor**
2. Copy and paste the contents of `database-schema.sql`
3. Click **Run** to execute the schema
4. Verify tables are created in **Table Editor**

## Step 4: Set Up API Functions

1. In **SQL Editor**, copy and paste the contents of `api-functions.sql`
2. Click **Run** to execute the functions
3. Verify functions are created in **Database** → **Functions**

## Step 5: Set Up Row Level Security

1. In **SQL Editor**, copy and paste the contents of `row-level-security.sql`
2. Click **Run** to execute the RLS policies
3. Verify policies are active in **Authentication** → **Policies**

## Step 6: Set Up Storage Buckets

1. Go to **Storage** in your Supabase dashboard
2. Create the following buckets:
   - **brochures**: For medical brochure files
   - **profiles**: For user profile images
   - **thumbnails**: For brochure thumbnails

### Storage Bucket Policies

Run this SQL to set up storage policies:

```sql
-- Brochures bucket policies
CREATE POLICY "Anyone can view brochures" ON storage.objects
FOR SELECT USING (bucket_id = 'brochures');

CREATE POLICY "Authenticated users can upload brochures" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'brochures' AND 
  auth.role() = 'authenticated'
);

CREATE POLICY "Admins can delete brochures" ON storage.objects
FOR DELETE USING (
  bucket_id = 'brochures' AND
  EXISTS (
    SELECT 1 FROM users 
    WHERE id = auth.uid() AND role = 'admin'
  )
);

-- Profiles bucket policies
CREATE POLICY "Anyone can view profiles" ON storage.objects
FOR SELECT USING (bucket_id = 'profiles');

CREATE POLICY "Users can upload their own profile" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'profiles' AND 
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can update their own profile" ON storage.objects
FOR UPDATE USING (
  bucket_id = 'profiles' AND 
  auth.uid()::text = (storage.foldername(name))[1]
);
```

## Step 7: Install React Native Dependencies

In your React Native project, install the required packages:

```bash
npm install @supabase/supabase-js
npm install @react-native-async-storage/async-storage
npm install react-native-url-polyfill
```

## Step 8: Configure Supabase Client

1. Create a new file `src/services/supabase.js`:

```javascript
import 'react-native-url-polyfill/auto'
import { createClient } from '@supabase/supabase-js'
import AsyncStorage from '@react-native-async-storage/async-storage'

const supabaseUrl = 'YOUR_SUPABASE_URL'
const supabaseKey = 'YOUR_SUPABASE_ANON_KEY'

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})
```

2. Replace `YOUR_SUPABASE_URL` and `YOUR_SUPABASE_ANON_KEY` with your actual credentials

## Step 9: Update Your App Components

### Update AdminDashboardScreen

```javascript
import { AdminService } from '../services/supabase'

// In your component
const [stats, setStats] = useState(null)

useEffect(() => {
  loadDashboardStats()
}, [])

const loadDashboardStats = async () => {
  const result = await AdminService.getDashboardStats()
  if (result.success) {
    setStats(result.data)
  }
}
```

### Update LoginScreen

```javascript
import { AuthService } from '../services/supabase'

const handleLogin = async (email, password) => {
  const result = await AuthService.signIn(email, password)
  if (result.success) {
    // Navigate to appropriate dashboard
    if (result.profile.role === 'admin') {
      navigation.navigate('AdminDashboard')
    } else {
      navigation.navigate('MRTabs')
    }
  } else {
    Alert.alert('Error', result.error)
  }
}
```

## Step 10: Test the Setup

### Test Admin Login
- Email: `admin@medpresent.com`
- Password: `admin123`

### Test API Functions
1. Go to **SQL Editor** in Supabase
2. Run: `SELECT get_admin_dashboard_stats();`
3. You should see dashboard statistics

## Available API Endpoints

### Admin APIs
- `get_admin_dashboard_stats()` - Get dashboard statistics
- `get_all_mrs()` - Get all medical representatives
- `create_mr()` - Create new MR
- `get_all_brochures()` - Get all brochures
- `create_brochure()` - Create new brochure
- `get_all_doctors()` - Get all doctors
- `create_doctor()` - Create new doctor
- `assign_doctor_to_mr()` - Assign doctor to MR
- `get_all_meetings()` - Get all meetings

### MR APIs
- `get_mr_doctors()` - Get MR's assigned doctors
- `get_mr_meetings()` - Get MR's meetings
- `create_meeting()` - Create new meeting
- `update_doctor()` - Update doctor information

### System APIs
- `get_system_settings()` - Get system settings
- `update_system_setting()` - Update system setting
- `log_activity()` - Log user activity

## Database Schema Overview

### Tables Created
1. **users** - Admin and MR accounts
2. **doctors** - Doctor information
3. **brochures** - Medical brochures
4. **meetings** - Meeting records
5. **doctor_assignments** - Doctor-MR assignments
6. **system_settings** - System configuration
7. **activity_logs** - User activity tracking

### Key Features
- **Row Level Security** - Users can only access their own data
- **Real-time Updates** - Subscribe to data changes
- **File Storage** - Upload brochures and profile images
- **Activity Logging** - Track all user actions
- **Role-based Access** - Admin vs MR permissions

## Security Considerations

1. **Password Hashing**: Implement proper password hashing (bcrypt)
2. **API Keys**: Keep your Supabase keys secure
3. **RLS Policies**: Review and test all RLS policies
4. **File Upload**: Validate file types and sizes
5. **Input Validation**: Validate all user inputs

## Troubleshooting

### Common Issues

1. **RLS Blocking Queries**: Check if RLS policies are correctly set
2. **Authentication Issues**: Verify user roles and permissions
3. **File Upload Errors**: Check storage bucket policies
4. **Function Errors**: Ensure all functions are created properly

### Debug Steps

1. Check Supabase logs in **Logs** section
2. Test queries in **SQL Editor**
3. Verify RLS policies in **Authentication** → **Policies**
4. Check storage policies in **Storage** → **Policies**

## Next Steps

1. **Implement File Upload**: Add brochure upload functionality
2. **Add Real-time Updates**: Subscribe to data changes
3. **Implement Notifications**: Add push notifications
4. **Add Analytics**: Track usage statistics
5. **Deploy to Production**: Set up production environment

## Support

For issues with this setup:
1. Check Supabase documentation
2. Review the provided SQL files
3. Test individual components
4. Check Supabase community forums

---

**Note**: This setup provides a complete backend for your Medical Representative App. All admin actions are now supported with proper database structure, API functions, and security policies.
