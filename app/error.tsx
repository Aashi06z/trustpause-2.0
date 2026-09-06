'use client'

import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('TrustPause application error', error)
  }, [error])

  return (
    <main className="error-state">
      <p className="eyebrow">TRUSTPAUSE</p>
      <h1>Something interrupted protection.</h1>
      <p className="muted">The dashboard could not finish loading. Try again to restore the session.</p>
      <button className="primary" onClick={() => reset()}>Try again</button>
    </main>
  )
}
