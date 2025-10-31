'use client'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-black text-white">
      <div className="text-center space-y-6 px-6">
        <h1 className="text-9xl font-bold text-red-500">500</h1>
        <h2 className="text-3xl font-semibold">Something went wrong!</h2>
        <p className="text-neutral-400 text-lg max-w-md mx-auto">
          An error occurred while processing your request.
        </p>
        <button
          onClick={reset}
          className="inline-block bg-[#00FFB2] text-black px-8 py-3 rounded-lg font-semibold hover:bg-[#00FFB2]/90 transition-all"
        >
          Try Again
        </button>
      </div>
    </div>
  )
}

