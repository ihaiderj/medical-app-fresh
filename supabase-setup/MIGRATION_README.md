# Migration: Create Supabase Auth Accounts for Existing MR Users

## Problem

Existing MR users were created in the `users` table without corresponding Supabase Auth accounts. This causes "No active session" errors when trying to upload files to Supabase Storage, because file uploads require a Supabase Auth session.

## Solution

This migration creates Supabase Auth accounts for existing MR users who don't have them.

## Prerequisites

1. **Service Role Key**: You need the Supabase **service_role** key (not the anon key)
   - Get it from: Supabase Dashboard → Settings → API → **service_role** key
   - ⚠️ **Keep this key secret!** It has admin privileges.

2. **Node.js**: Install Node.js if you don't have it
   ```bash
   node --version  # Should be v14 or higher
   ```

3. **Dependencies**: Install required packages
   ```bash
   npm install @supabase/supabase-js
   ```

## Step 1: Identify Users Needing Migration

Run this SQL in Supabase SQL Editor to see which users need auth accounts:

```sql
-- Run: supabase-setup/identify-users-without-auth-accounts.sql
```

Or use the SQL directly:
```sql
SELECT 
    u.id,
    u.email,
    u.first_name,
    u.last_name,
    CASE 
        WHEN au.id IS NULL THEN 'NEEDS_AUTH_ACCOUNT'
        ELSE 'HAS_AUTH_ACCOUNT'
    END AS auth_status
FROM users u
LEFT JOIN auth.users au ON u.id = au.id
WHERE u.role = 'mr' AND u.is_active = true
ORDER BY u.email;
```

## Step 2: Run the Migration Script

### Option A: JavaScript Version (Recommended - No compilation needed)

1. Set environment variables:
   ```bash
   export SUPABASE_URL=https://your-project-id.supabase.co
   export SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   ```

2. Run the script:
   ```bash
   node supabase-setup/migrate-users-to-supabase-auth.js
   ```

### Option B: TypeScript Version

1. Install TypeScript and ts-node:
   ```bash
   npm install -g typescript ts-node
   npm install dotenv
   ```

2. Create a `.env` file:
   ```
   SUPABASE_URL=https://your-project-id.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   ```

3. Run the script:
   ```bash
   npx ts-node supabase-setup/migrate-users-to-supabase-auth.ts
   ```

## Step 3: Provide Passwords

The script will prompt you for a password for each user. You have three options:

1. **Enter the actual password** (if you know it)
2. **Enter a temporary password** (user should change it on first login)
3. **Press Enter to skip** (user will need to reset password via Supabase Auth)

## What the Script Does

1. ✅ Fetches all active MR users from the `users` table
2. ✅ Checks which users don't have Supabase Auth accounts
3. ✅ Creates Supabase Auth accounts for each user (with the password you provide)
4. ✅ Auto-confirms email addresses (no email verification needed)
5. ✅ Sets user metadata (first_name, last_name, role)

## After Migration

Once the migration is complete:

1. ✅ Users can log in normally (via `tryCustomUserLogin` or `trySupabaseLogin`)
2. ✅ File uploads will work (Supabase Auth session will be created)
3. ✅ No more "No active session" errors

## Troubleshooting

### Error: "User already exists"
- The user already has a Supabase Auth account
- The script will skip them automatically

### Error: "Invalid password"
- Make sure the password meets Supabase requirements (min 6 characters)
- Try a different password

### Error: "Service role key invalid"
- Verify you're using the **service_role** key, not the anon key
- Check that the key is correct in your environment variables

### Users can't log in after migration
- If you used a temporary password, users need to use that password
- Users can reset their password via Supabase Auth if needed

## Security Notes

⚠️ **Important Security Considerations:**

1. **Service Role Key**: This key has admin privileges. Never commit it to version control.
2. **Passwords**: If you're entering passwords manually, do it in a secure environment.
3. **After Migration**: Consider rotating the service role key if it was exposed.

## Alternative: Manual Creation

If you prefer to create accounts manually:

1. Go to Supabase Dashboard → Authentication → Users
2. Click "Add User" → "Create new user"
3. Enter the user's email and a temporary password
4. Set the user ID to match the `users` table ID (important!)
5. Confirm the email

## Verification

After migration, verify that users have auth accounts:

```sql
SELECT 
    u.email,
    au.email AS auth_email,
    CASE 
        WHEN au.id IS NOT NULL THEN '✅ Has Auth Account'
        ELSE '❌ Missing Auth Account'
    END AS status
FROM users u
LEFT JOIN auth.users au ON u.id = au.id
WHERE u.role = 'mr' AND u.is_active = true
ORDER BY u.email;
```

All users should show "✅ Has Auth Account".

