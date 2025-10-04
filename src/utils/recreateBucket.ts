/**
 * Utility script to recreate Supabase Storage bucket with new settings
 * Run this if you encounter file size limit issues
 */

import { FileStorageService } from '../services/fileStorageService'

export const recreateStorageBucket = async () => {
  console.log('🚀 Starting bucket recreation process...')
  
  try {
    const result = await FileStorageService.recreateBucket()
    
    if (result.success) {
      console.log('✅ Bucket recreated successfully!')
      console.log('📋 New bucket settings:')
      console.log('   - Max file size: 200MB')
      console.log('   - Public access: Yes')
      console.log('   - Allowed types: ZIP, PDF, Images')
      return { success: true }
    } else {
      console.log('❌ Failed to recreate bucket:', result.error)
      return { success: false, error: result.error }
    }
  } catch (error) {
    console.log('❌ Unexpected error:', error)
    return { success: false, error: 'Unexpected error occurred' }
  }
}

// Uncomment to run immediately
// recreateStorageBucket()

