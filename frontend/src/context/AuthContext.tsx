import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { apiFetch, getToken, setToken, clearToken } from '../lib/api'

interface AuthUser {
  userId: string
  hotelId: string
  role: string
}

interface AuthContextValue {
  user: AuthUser | null
  /** True while the mount-time token validation (GET /api/me) is in flight.
   * Consumers (e.g. ProtectedRoute) must not make a redirect decision until
   * this is false — otherwise a genuinely valid stored token can cause an
   * incorrect bounce to /login during this async window. */
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function validateStoredToken() {
      if (!getToken()) {
        setIsLoading(false)
        return
      }
      try {
        const res = await apiFetch('/me')
        if (res.ok) {
          const me = (await res.json()) as AuthUser
          setUser(me)
        }
      } catch {
        // UnauthorizedError already cleared the token in apiFetch; NetworkError
        // means we can't validate right now — either way, treat as logged out.
        setUser(null)
      } finally {
        setIsLoading(false)
      }
    }
    void validateStoredToken()
  }, [])

  async function login(email: string, password: string): Promise<void> {
    // apiFetch throws UnauthorizedError itself on a 401 (wrong credentials) —
    // caught by the caller (Login.tsx) and shown as the generic invalid-
    // credentials message. A non-401 failure (429 rate-limited, 500) reaches
    // here instead; surface it as a distinct generic error, not mislabeled
    // as an auth failure.
    const res = await apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
    if (!res.ok) {
      throw new Error('Login request failed')
    }
    const { token } = (await res.json()) as { token: string }
    setToken(token)

    const meRes = await apiFetch('/me')
    const me = (await meRes.json()) as AuthUser
    setUser(me)
  }

  function logout(): void {
    clearToken()
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
