"use client";

import { useState } from "react";
import { Percent, Info } from "lucide-react";

export function FeesCard() {
  const [depositFee, setDepositFee] = useState("");
  const [withdrawalFee, setWithdrawalFee] = useState("");
  const isValid = (value: string) => {
    if (value === "") return true;
    const num = Number(value);
    return !isNaN(num) && isFinite(num) && num >= 0 && num <= 100;
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-white">Fees</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Configure deposit and withdrawal fee percentages.
        </p>
      </div>

      <div className="rounded-xl border border-neutral-800/60 bg-neutral-900/40 p-6">
        <div className="mb-5 flex items-center gap-2">
          <Percent className="h-4 w-4 text-neutral-500" />
          <span className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">
            Fee Configuration
          </span>
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <div>
            <label htmlFor="depositFee" className="mb-2 block text-xs font-medium text-neutral-400">
              Deposit Fee %
            </label>
            <div className="relative">
              <input
                id="depositFee"
                type="number"
                min="0"
                max="100"
                step="0.01"
                placeholder="0.00"
                value={depositFee}
                onChange={(e) => setDepositFee(e.target.value)}
                className={`w-full rounded-lg border bg-neutral-950/60 px-4 py-3 pr-10 font-mono text-sm text-white placeholder-neutral-600 outline-none transition-colors focus:border-[#00FFB2]/50 focus:ring-1 focus:ring-[#00FFB2]/20 ${
                  !isValid(depositFee)
                    ? "border-red-500/50"
                    : "border-neutral-800"
                }`}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-neutral-500">
                %
              </span>
            </div>
            {!isValid(depositFee) && (
              <p className="mt-1 text-xs text-red-400">
                Must be between 0 and 100
              </p>
            )}
          </div>

          <div>
            <label htmlFor="withdrawalFee" className="mb-2 block text-xs font-medium text-neutral-400">
              Withdrawal Fee %
            </label>
            <div className="relative">
              <input
                id="withdrawalFee"
                type="number"
                min="0"
                max="100"
                step="0.01"
                placeholder="0.00"
                value={withdrawalFee}
                onChange={(e) => setWithdrawalFee(e.target.value)}
                className={`w-full rounded-lg border bg-neutral-950/60 px-4 py-3 pr-10 font-mono text-sm text-white placeholder-neutral-600 outline-none transition-colors focus:border-[#00FFB2]/50 focus:ring-1 focus:ring-[#00FFB2]/20 ${
                  !isValid(withdrawalFee)
                    ? "border-red-500/50"
                    : "border-neutral-800"
                }`}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-neutral-500">
                %
              </span>
            </div>
            {!isValid(withdrawalFee) && (
              <p className="mt-1 text-xs text-red-400">
                Must be between 0 and 100
              </p>
            )}
          </div>
        </div>

        <div className="mt-6">
          <button
            disabled
            className="rounded-lg bg-[#00FFB2] px-5 py-2.5 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-40"
          >
            Save Fees (Coming Soon)
          </button>
        </div>
      </div>

      <div className="mt-5 rounded-xl border border-neutral-800/60 bg-neutral-900/40 p-6">
        <div className="flex items-start gap-3">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#00FFB2]" />
          <div className="space-y-2 text-sm text-neutral-300">
            <p>
              These fee fields are for preview only and are{" "}
              <span className="text-white font-medium">
                not yet linked to the smart contract or backend.
              </span>{" "}
              Values are not persisted.
            </p>
            <p className="text-neutral-500">
              Once the on-chain fee parameters are implemented, this page will
              submit transactions to update the program state.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
