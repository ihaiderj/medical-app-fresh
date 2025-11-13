import * as Crypto from 'expo-crypto'

export function randomBytes(size: number): Uint8Array {
  return Crypto.getRandomBytes(size)
}

export default {
  randomBytes,
}

