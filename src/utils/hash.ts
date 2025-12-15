/**
 * Hash Utility
 * Simple hash function for generating idempotency keys
 */

/**
 * Generate a simple hash from a string
 * Uses a simple djb2-like hash algorithm
 */
export function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * Generate idempotency key from record data
 * Format: hash(record_id + operation_type + table_name + data_hash)
 */
export function generateIdempotencyKey(
  recordId: string,
  operationType: string,
  tableName: string,
  data: any
): string {
  const dataStr = JSON.stringify(data);
  const dataHash = simpleHash(dataStr);
  const combined = `${recordId}|${operationType}|${tableName}|${dataHash}`;
  return simpleHash(combined);
}

