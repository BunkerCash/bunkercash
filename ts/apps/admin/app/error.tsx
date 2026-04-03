"use client";

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-950 text-white">
      <div className="text-center space-y-6 px-6">
        <h1 className="text-8xl font-bold text-red-500">500</h1>
        <h2 className="text-3xl font-semibold">Admin Error</h2>
        <p className="text-neutral-400 text-lg max-w-md mx-auto">
          Something went wrong while loading the admin panel.
        </p>
        <button
          onClick={reset}
          className="inline-block rounded-lg bg-[#00FFB2] px-8 py-3 font-semibold text-black transition-all hover:bg-[#00FFB2]/90"
        >
          Try Again
        </button>
      </div>
    </div>
  );
}
