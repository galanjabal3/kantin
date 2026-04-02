import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AuthState {
  token: string | null;
  userType: "seller" | "admin" | null;
  restaurantId: string | null;
  restaurantSlug: string | null;
  setAuth: (
    token: string,
    userType: "seller" | "admin",
    restaurantId?: string,
    restaurantSlug?: string,
  ) => void;
  clearAuth: () => void;
  isTokenExpired: () => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      userType: null,
      restaurantId: null,
      restaurantSlug: null,

      setAuth: (token, userType, restaurantId, restaurantSlug) =>
        set({ token, userType, restaurantId, restaurantSlug }),

      clearAuth: () =>
        set({
          token: null,
          userType: null,
          restaurantId: null,
          restaurantSlug: null,
        }),

      isTokenExpired: () => {
        const token = get().token;
        if (!token) return true;
        try {
          // Decode JWT payload tanpa library
          const payload = JSON.parse(atob(token.split(".")[1]));
          const exp = payload.exp * 1000; // convert ke milliseconds
          return Date.now() > exp;
        } catch {
          return true;
        }
      },
    }),
    { name: "kantin-auth" },
  ),
);
