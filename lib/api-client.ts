export type ApiErrorBody = { error?: string; code?: string }

export async function fetchJson<T>(path: string, body: unknown, fallback: () => T): Promise<T> {
  try {
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: true,
    })

    if (!response.ok) {
      const errorBody = (await response.json().catch(() => ({}))) as ApiErrorBody
      throw new ApiRequestError(errorBody.error ?? `Request failed (${response.status})`, response.status)
    }

    return (await response.json()) as T
  } catch (error) {
    if (error instanceof ApiRequestError) {
      console.warn(`TrustPause API unavailable (${path}); using local fallback.`, error.message)
    } else {
      console.warn(`TrustPause API unavailable (${path}); using local fallback.`, error)
    }
    return fallback()
  }
}

export class ApiRequestError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message)
    this.name = 'ApiRequestError'
  }
}
