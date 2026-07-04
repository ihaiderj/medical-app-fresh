/**
 * Storage health check via Django REST API
 */
import { FileStorageService } from '../services/fileStorageService'

export const fixStorageBucket = async () => {
  console.log('Checking backend file storage availability...')
  return FileStorageService.initializeBucket()
}

export const runStorageFix = fixStorageBucket
