/**
 * Doctor validation utilities
 */

export interface ValidationResult {
  isValid: boolean
  errors: string[]
}

export interface DoctorFormData {
  first_name: string
  last_name: string
  specialty: string
  hospital: string
  phone: string
  email: string
  location: string
  notes: string
}

export class DoctorValidation {
  /**
   * Validate email format
   */
  static validateEmail(email: string): { isValid: boolean; error?: string } {
    if (!email.trim()) {
      return { isValid: true } // Email is optional
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email.trim())) {
      return { isValid: false, error: 'Please enter a valid email address' }
    }

    return { isValid: true }
  }

  /**
   * Validate phone number format
   */
  static validatePhone(phone: string): { isValid: boolean; error?: string } {
    if (!phone.trim()) {
      return { isValid: true } // Phone is optional
    }

    // Remove all non-numeric characters for validation
    const cleanPhone = phone.replace(/\D/g, '')
    
    // Check if it's a valid length (7-15 digits for international numbers)
    if (cleanPhone.length < 7 || cleanPhone.length > 15) {
      return { isValid: false, error: 'Phone number must be 7-15 digits long' }
    }

    return { isValid: true }
  }

  /**
   * Format phone number for display
   */
  static formatPhone(phone: string): string {
    if (!phone.trim()) return ''
    
    const cleanPhone = phone.replace(/\D/g, '')
    
    // Format based on length
    if (cleanPhone.length === 10) {
      // US format: (123) 456-7890
      return `(${cleanPhone.slice(0, 3)}) ${cleanPhone.slice(3, 6)}-${cleanPhone.slice(6)}`
    } else if (cleanPhone.length === 11 && cleanPhone.startsWith('1')) {
      // US with country code: +1 (123) 456-7890
      return `+1 (${cleanPhone.slice(1, 4)}) ${cleanPhone.slice(4, 7)}-${cleanPhone.slice(7)}`
    } else {
      // International format: +XX XXX XXX XXXX
      return `+${cleanPhone}`
    }
  }

  /**
   * Validate required fields
   */
  static validateRequired(formData: DoctorFormData): ValidationResult {
    const errors: string[] = []

    if (!formData.first_name.trim()) {
      errors.push('First name is required')
    }

    if (!formData.last_name.trim()) {
      errors.push('Last name is required')
    }

    if (!formData.specialty.trim()) {
      errors.push('Specialty is required')
    }

    if (!formData.hospital.trim()) {
      errors.push('Hospital/Clinic is required')
    }

    return {
      isValid: errors.length === 0,
      errors
    }
  }

  /**
   * Validate all fields
   */
  static validateAll(formData: DoctorFormData): ValidationResult {
    const errors: string[] = []

    // Check required fields
    const requiredValidation = this.validateRequired(formData)
    errors.push(...requiredValidation.errors)

    // Validate email if provided
    if (formData.email.trim()) {
      const emailValidation = this.validateEmail(formData.email)
      if (!emailValidation.isValid && emailValidation.error) {
        errors.push(emailValidation.error)
      }
    }

    // Validate phone if provided
    if (formData.phone.trim()) {
      const phoneValidation = this.validatePhone(formData.phone)
      if (!phoneValidation.isValid && phoneValidation.error) {
        errors.push(phoneValidation.error)
      }
    }

    // Validate name lengths
    if (formData.first_name.trim().length > 50) {
      errors.push('First name must be less than 50 characters')
    }

    if (formData.last_name.trim().length > 50) {
      errors.push('Last name must be less than 50 characters')
    }

    if (formData.specialty.trim().length > 100) {
      errors.push('Specialty must be less than 100 characters')
    }

    if (formData.hospital.trim().length > 200) {
      errors.push('Hospital name must be less than 200 characters')
    }

    return {
      isValid: errors.length === 0,
      errors
    }
  }

  /**
   * Check for potential duplicates based on multiple criteria
   */
  static checkForDuplicates(
    formData: DoctorFormData, 
    existingDoctors: any[], 
    excludeDoctorId?: string
  ): { isDuplicate: boolean; warnings: string[] } {
    const warnings: string[] = []
    let isDuplicate = false

    const newDoctor = {
      name: `${formData.first_name.trim()} ${formData.last_name.trim()}`.toLowerCase(),
      email: formData.email.trim().toLowerCase(),
      phone: formData.phone.replace(/\D/g, ''), // Clean phone for comparison
      hospital: formData.hospital.trim().toLowerCase()
    }

    for (const doctor of existingDoctors) {
      // Skip if this is the same doctor being edited
      if (excludeDoctorId && doctor.doctor_id === excludeDoctorId) {
        continue
      }

      const existingDoctor = {
        name: `${doctor.first_name || ''} ${doctor.last_name || ''}`.trim().toLowerCase(),
        email: (doctor.email || '').trim().toLowerCase(),
        phone: (doctor.phone || '').replace(/\D/g, ''),
        hospital: (doctor.hospital || '').trim().toLowerCase()
      }

      // Check for exact name match
      if (newDoctor.name === existingDoctor.name) {
        isDuplicate = true
        warnings.push(`A doctor named "${formData.first_name} ${formData.last_name}" already exists`)
      }

      // Check for email match (if both have emails)
      if (newDoctor.email && existingDoctor.email && newDoctor.email === existingDoctor.email) {
        isDuplicate = true
        warnings.push(`A doctor with email "${formData.email}" already exists`)
      }

      // Check for phone match (if both have phones)
      if (newDoctor.phone && existingDoctor.phone && newDoctor.phone === existingDoctor.phone) {
        isDuplicate = true
        warnings.push(`A doctor with phone number "${formData.phone}" already exists`)
      }

      // Check for similar name + same hospital (potential duplicate)
      if (newDoctor.hospital === existingDoctor.hospital) {
        const nameSimilarity = this.calculateNameSimilarity(newDoctor.name, existingDoctor.name)
        if (nameSimilarity > 0.8) { // 80% similarity threshold
          warnings.push(`Similar doctor "${existingDoctor.name}" found at the same hospital`)
        }
      }
    }

    return { isDuplicate, warnings }
  }

  /**
   * Calculate name similarity (simple Levenshtein-based approach)
   */
  private static calculateNameSimilarity(name1: string, name2: string): number {
    const longer = name1.length > name2.length ? name1 : name2
    const shorter = name1.length > name2.length ? name2 : name1
    
    if (longer.length === 0) return 1.0
    
    const distance = this.levenshteinDistance(longer, shorter)
    return (longer.length - distance) / longer.length
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  private static levenshteinDistance(str1: string, str2: string): number {
    const matrix = []

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i]
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1]
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1,     // insertion
            matrix[i - 1][j] + 1      // deletion
          )
        }
      }
    }

    return matrix[str2.length][str1.length]
  }
}
