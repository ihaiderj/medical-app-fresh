/**
 * Global error handler utilities
 */

// Safe string operations to prevent charAt errors
export const safeString = (value: any): string => {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  return String(value)
}

export const safeToLowerCase = (value: any): string => {
  return safeString(value).toLowerCase()
}

export const safeIncludes = (text: any, searchTerm: any): boolean => {
  const safeText = safeString(text)
  const safeSearch = safeString(searchTerm)
  return safeText.includes(safeSearch)
}

// Safe array operations
export const safeFilter = <T>(array: T[] | null | undefined, predicate: (item: T) => boolean): T[] => {
  if (!Array.isArray(array)) return []
  try {
    return array.filter(predicate)
  } catch (error) {
    console.error('Filter operation failed:', error)
    return []
  }
}

// Safe object property access
export const safeGet = (obj: any, path: string, defaultValue: any = ''): any => {
  try {
    const keys = path.split('.')
    let result = obj
    for (const key of keys) {
      if (result === null || result === undefined) return defaultValue
      result = result[key]
    }
    return result === null || result === undefined ? defaultValue : result
  } catch (error) {
    console.error('Safe get failed:', error)
    return defaultValue
  }
}
