import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface AuthState {
  token: string | null
  userType: 'seller' | 'admin' | null
  restaurantId: string | null
  restaurantSlug: string | null
  setAuth: (token: string, userType: 'seller' | 'admin', restaurantId?: string, restaurantSlug?: string) => void
  clearAuth: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      userType: null,
      restaurantId: null,
      restaurantSlug: null,
      setAuth: (token, userType, restaurantId, restaurantSlug) =>
        set({ token, userType, restaurantId, restaurantSlug }),
      clearAuth: () =>
        set({ token: null, userType: null, restaurantId: null, restaurantSlug: null }),
    }),
    { name: 'kantin-auth' }
  )
)