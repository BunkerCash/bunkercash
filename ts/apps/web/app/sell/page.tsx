"use client";

import { useState } from "react";
import { Layout } from "@/components/layout/Layout";
import { WarningBox } from "@/components/ui/WarningBox";
import { StatCard } from "@/components/ui/StatCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const SellRegistration = () => {
  const [tokenAmount, setTokenAmount] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);

  const tokenBalance = 1250.5;

  const handleRegister = () => {
    if (parseFloat(tokenAmount) > 0) {
      setIsModalOpen(true);
    }
  };

  const handleConfirm = () => {
    setIsModalOpen(false);
    setIsConfirmed(false);
    setTokenAmount("");
    // Handle actual registration
  };

  return (
    <Layout>
      <div className="container mx-auto px-4 py-12">
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <div className="text-center mb-10 animate-fade-in">
            <h1 className="text-3xl font-bold text-foreground mb-4">
              Sell Registration
            </h1>
            <p className="text-muted-foreground">Liquidity Based</p>
          </div>

          {/* Warning Box */}
          <div
            className="mb-8 animate-slide-up"
            style={{ animationDelay: "0.1s" }}
          >
            <WarningBox title="Important Notice">
              <ul className="list-disc list-inside space-y-1">
                <li>Registering a sell is optional and irreversible.</li>
                <li>
                  Tokens registered for sell will be permanently removed from
                  circulation.
                </li>
                <li>
                  Tokens are destroyed (burned) and cannot be traded again.
                </li>
                <li>
                  Payouts, if any, depend entirely on available liquidity.
                </li>
                <li>
                  There is no obligation, no entitlement, and no guaranteed
                  timeframe.
                </li>
              </ul>
            </WarningBox>
          </div>

          {/* Balance Card */}
          <div
            className="mb-6 animate-slide-up"
            style={{ animationDelay: "0.15s" }}
          >
            <StatCard
              label="Your Token Balance"
              value={`${tokenBalance.toLocaleString()} BNKR`}
            />
          </div>

          {/* Registration Card */}
          <div
            className="glass-card p-6 animate-slide-up"
            style={{ animationDelay: "0.2s" }}
          >
            <h2 className="text-lg font-semibold mb-6">
              Register Tokens for Sell
            </h2>

            <div className="mb-6">
              <label className="stat-label block mb-2">Token Amount</label>
              <div className="relative">
                <Input
                  type="number"
                  placeholder="0.00"
                  value={tokenAmount}
                  onChange={(e) => setTokenAmount(e.target.value)}
                  max={tokenBalance}
                  className="pr-16 h-14 text-lg bg-transparent"
                />
                <button
                  onClick={() => setTokenAmount(tokenBalance.toString())}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-primary text-sm font-medium hover:underline"
                >
                  MAX
                </button>
              </div>
            </div>

            <Button
              onClick={handleRegister}
              className="w-full h-12 text-base font-semibold"
              disabled={!tokenAmount || parseFloat(tokenAmount) <= 0}
            >
              Register Sell
            </Button>
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-destructive">
              Confirm Sell Registration
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              By continuing, you understand and accept that:
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="text-destructive">•</span>
                Your tokens will be permanently destroyed
              </li>
              <li className="flex items-start gap-2">
                <span className="text-destructive">•</span>
                You will no longer participate in market price movements
              </li>
              <li className="flex items-start gap-2">
                <span className="text-destructive">•</span>
                Any payout depends solely on available liquidity
              </li>
              <li className="flex items-start gap-2">
                <span className="text-destructive">•</span>
                Payouts may be partial, delayed, or not occur at all
              </li>
            </ul>

            <div className="flex items-center gap-3 mt-6 p-3 rounded-lg bg-muted/30">
              <Checkbox
                id="confirm"
                checked={isConfirmed}
                onCheckedChange={(checked) =>
                  setIsConfirmed(checked as boolean)
                }
              />
              <label
                htmlFor="confirm"
                className="text-sm text-foreground cursor-pointer"
              >
                I understand and accept
              </label>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirm}
              disabled={!isConfirmed}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
};

export default SellRegistration;
