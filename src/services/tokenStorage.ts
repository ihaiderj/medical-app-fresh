import * as SecureStore from 'expo-secure-store'

const ACCESS_TOKEN_KEY = 'fervid_access_token'
const REFRESH_TOKEN_KEY = 'fervid_refresh_token'

export class TokenStorage {
  static async saveTokens(accessToken: string, refreshToken: string): Promise<void> {
    await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken)
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken)
  }

  static async getAccessToken(): Promise<string | null> {
    return SecureStore.getItemAsync(ACCESS_TOKEN_KEY)
  }

  static async getRefreshToken(): Promise<string | null> {
    return SecureStore.getItemAsync(REFRESH_TOKEN_KEY)
  }

  static async clearTokens(): Promise<void> {
    await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY)
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY)
  }

  static async hasTokens(): Promise<boolean> {
    const token = await this.getAccessToken()
    return !!token
  }
}
