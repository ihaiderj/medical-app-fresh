# Manual Storage Setup for Brochures

Since you don't have database admin privileges, follow these steps to set up storage manually:

## Step 1: Create Storage Bucket via Dashboard

1. Go to your **Supabase Dashboard**
2. Navigate to **Storage** (left sidebar)
3. Click **"New bucket"**
4. Set the following:
   - **Name**: `brochures`
   - **Public**: ✅ **Enabled** (check this box)
   - **File size limit**: Leave empty (uses defaults)
   - **Allowed MIME types**: Leave empty (allows all)

5. Click **"Create bucket"**

## Step 2: Set Up Storage Policies

1. In the **Storage** section, click on the **brochures** bucket
2. Go to **"Policies"** tab
3. Click **"New policy"**
4. Choose **"Get started quickly"**
5. Select **"Enable read access for all users"**
6. Click **"Review"** then **"Save policy"**

7. Click **"New policy"** again
8. Choose **"Get started quickly"**
9. Select **"Enable insert access for authenticated users only"**
10. Click **"Review"** then **"Save policy"**

## Step 3: Verify Setup

After creating the bucket and policies:

1. Go back to your app
2. Try uploading the ZIP file again
3. If it still fails, use the "Fix Storage" button in the app to test the configuration

## Alternative: Use Simple SQL (if you have some permissions)

If the manual setup doesn't work, try running this minimal SQL:

```sql
-- Only create policies (no bucket manipulation)
CREATE POLICY IF NOT EXISTS "Allow authenticated uploads" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'brochures');

CREATE POLICY IF NOT EXISTS "Allow public downloads" ON storage.objects
    FOR SELECT TO public
    USING (bucket_id = 'brochures');
```

## Expected Result

✅ **Bucket created**: `brochures`  
✅ **Public access**: Enabled  
✅ **Upload permissions**: Authenticated users  
✅ **Download permissions**: Public access  

After setup, your 36.1MB ZIP file should upload successfully!

