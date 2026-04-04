/* eslint-disable @next/next/no-html-link-for-pages */

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-950 text-white">
      <div className="text-center space-y-6 px-6">
        <h1 className="text-8xl font-bold text-[#00FFB2]">404</h1>
        <h2 className="text-3xl font-semibold">Admin Page Not Found</h2>
        <p className="text-neutral-400 text-lg max-w-md mx-auto">
          The requested admin page does not exist.
        </p>
        <a
          href="/"
          className="inline-block rounded-lg bg-[#00FFB2] px-8 py-3 font-semibold text-black transition-all hover:bg-[#00FFB2]/90"
        >
          Back to Admin
        </a>
      </div>
    </div>
  );
}
