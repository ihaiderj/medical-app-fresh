import 'react-native-url-polyfill/auto'
import { createClient } from '@supabase/supabase-js'

// Simple in-memory storage for Expo Go compatibility
const MemoryStorage = {
  _storage: {},
  getItem: function(key) {
    return Promise.resolve(this._storage[key] || null)
  },
  setItem: function(key, value) {
    this._storage[key] = value
    return Promise.resolve()
  },
  removeItem: function(key) {
    delete this._storage[key]
    return Promise.resolve()
  },
}

const supabaseUrl = 'https://ijgevkvdlevkcdjcgmyg.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlqZ2V2a3ZkbGV2a2NkamNnbXlnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgwMjI5NDEsImV4cCI6MjA3MzU5ODk0MX0.BJvG7JfSg67XwawPf027qyrdfQeVlPcu_QqECjXLf58'

// Service role key for admin operations (bypasses RLS)
export const supabaseServiceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlqZ2V2a3ZkbGV2a2NkamNnbXlnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1ODAyMjk0MSwiZXhwIjoyMDczNTk4OTQxfQ.Z003CYWtd5PbORw2Tma2AyjCSE5THVgtA_7SoFVzOHc'

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    storage: MemoryStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})

// Admin client for privileged operations (file uploads, etc.)
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})