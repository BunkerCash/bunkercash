import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-black text-white">
      <div className="text-center space-y-6 px-6">
        <h1 className="text-9xl font-bold text-[#00FFB2]">404</h1>
        <h2 className="text-3xl font-semibold">Page Not Found</h2>
        <p className="text-neutral-400 text-lg max-w-md mx-auto">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <Link 
          href="/"
          className="inline-block bg-[#00FFB2] text-black px-8 py-3 rounded-lg font-semibold hover:bg-[#00FFB2]/90 transition-all"
        >
          Go Home
        </Link>
      </div>
    </div>
  )
}

