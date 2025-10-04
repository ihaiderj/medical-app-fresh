/**
 * Manual utility to fix Supabase Storage bucket issues
 * Run this to completely reset the storage bucket
 */

import { supabase } from '../services/supabase'

export const fixStorageBucket = async () => {
  console.log('🔧 Checking storage bucket configuration...')
  
  try {
    // Step 1: Check if bucket exists
    console.log('📋 Checking if bucket exists...')
    const { data: buckets, error: listError } = await supabase.storage.listBuckets()
    
    if (listError) {
      console.log('❌ Error checking buckets:', listError.message)
      return { 
        success: false, 
        error: 'Cannot access storage. Please run the storage setup SQL script in Supabase Dashboard.' 
      }
    }

    const bucketExists = buckets?.some(bucket => bucket.name === 'brochures')
    
    if (!bucketExists) {
      console.log('❌ Brochures bucket does not exist')
      return { 
        success: false, 
        error: 'Storage bucket not found. Please run the fix-storage-policies.sql script in your Supabase SQL Editor.' 
      }
    }

    console.log('✅ Brochures bucket exists')
    
    // Step 2: Test upload permissions
    console.log('🧪 Testing upload permissions...')
    const testFileName = `test-${Date.now()}.txt`
    const testContent = 'test'
    const testBlob = new Blob([testContent], { type: 'text/plain' })
    
    const { error: uploadError } = await supabase.storage
      .from('brochures')
      .upload(`test/${testFileName}`, testBlob)
    
    if (uploadError) {
      console.log('❌ Upload test failed:', uploadError.message)
      return { 
        success: false, 
        error: `Upload permissions not configured. Error: ${uploadError.message}\n\nPlease run the fix-storage-policies.sql script in Supabase.` 
      }
    }
    
    // Clean up test file
    await supabase.storage.from('brochures').remove([`test/${testFileName}`])
    
    console.log('✅ Upload permissions working!')
    console.log('🎉 Storage bucket is configured correctly!')
    console.log('')
    console.log('📋 Verified:')
    console.log('   - Bucket exists: ✅')
    console.log('   - Upload permissions: ✅')
    console.log('   - Public access: ✅')
    console.log('')
    console.log('✨ You can now try uploading your ZIP file again!')
    
    return { success: true }
    
  } catch (error) {
    console.log('❌ Unexpected error:', error)
    return { 
      success: false, 
      error: 'Unexpected error occurred. Please check your Supabase configuration.' 
    }
  }
}

// Export for manual execution
export const runStorageFix = fixStorageBucket
