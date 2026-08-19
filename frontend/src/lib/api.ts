const BASE_URL: string = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api'
const TOKEN_KEY = 'auth_token'

export class NetworkError extends Error {}
export class UnauthorizedError extends Error {}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

/**
 * Central fetch wrapper. Attaches the stored Bearer token when present, and
 * on ANY 401 response clears the stored token — this is the single
 * enforcement point for "an invalid/expired token must not be trusted
 * blindly," rather than leaving 401-handling to scatter across call sites.
 */
export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = getToken()
  const headers = new Headers(options.headers)
  headers.set('Content-Type', 'application/json')
  if (token) headers.set('Authorization', `Bearer ${token}`)

  let response: Response
  try {
    response = await fetch(`${BASE_URL}${path}`, { ...options, headers })
  } catch {
    throw new NetworkError('Unable to reach the server')
  }

  if (response.status === 401) {
    clearToken()
    throw new UnauthorizedError('Session expired or invalid')
  }

  return response
}
