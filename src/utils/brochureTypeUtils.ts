export interface BrochureFileInfo {
  file_type?: string
  file_url?: string
  file_name?: string
}

export function isZipBrochure(
  brochure: BrochureFileInfo,
  filePath?: string | null,
): boolean {
  const type = brochure.file_type?.toLowerCase() || ''
  if (type.includes('zip')) return true

  const path = (filePath || brochure.file_url || brochure.file_name || '').toLowerCase()
  return path.endsWith('.zip') || path.includes('.zip')
}

export function isPdfBrochure(
  brochure: BrochureFileInfo,
  filePath?: string | null,
): boolean {
  const type = brochure.file_type?.toLowerCase() || ''
  if (type.includes('pdf')) return true

  const path = (filePath || brochure.file_url || brochure.file_name || '').toLowerCase()
  return path.endsWith('.pdf') || path.includes('.pdf')
}

/**
 * Legacy local saves may append _<timestamp> to brochure_id for duplicate downloads.
 * The server expects the original brochure UUID.
 */
/** Local filesystem key for an MR's saved copy (slide data lives under brochures/{storageId}/). */
export function getSavedBrochureStorageId(record: {
  id: string
  storage_id?: string | null
}): string {
  return record.storage_id || record.id
}

export function resolveServerBrochureId(brochureId: string | undefined | null): string {
  if (!brochureId) return ''

  const lastUnderscore = brochureId.lastIndexOf('_')
  if (lastUnderscore === -1) return brochureId

  const suffix = brochureId.slice(lastUnderscore + 1)
  if (/^\d{10,13}$/.test(suffix)) {
    return brochureId.slice(0, lastUnderscore)
  }

  return brochureId
}
