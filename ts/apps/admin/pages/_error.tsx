/* eslint-disable @next/next/no-html-link-for-pages */

import type { NextPageContext } from "next";

interface ErrorPageProps {
  statusCode?: number;
}

export default function CustomError({ statusCode }: ErrorPageProps) {
  const title = statusCode === 404 ? "Admin Page Not Found" : "Admin Error";

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-950 text-white">
      <div className="text-center space-y-6 px-6">
        <h1 className="text-8xl font-bold text-red-500">
          {statusCode ?? 500}
        </h1>
        <h2 className="text-3xl font-semibold">{title}</h2>
        <p className="text-neutral-400 text-lg max-w-md mx-auto">
          An error occurred while rendering the admin panel.
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

CustomError.getInitialProps = ({ res, err }: NextPageContext): ErrorPageProps => {
  const statusCode = res?.statusCode ?? err?.statusCode ?? 500;
  return { statusCode };
};
