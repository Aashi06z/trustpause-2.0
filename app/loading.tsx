export default function Loading() {
  return (
    <main className="loading-state" aria-live="polite">
      <div className="status-ring" aria-hidden="true" />
      <p>Loading your protection workspace...</p>
    </main>
  )
}
