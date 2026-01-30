import { Layout } from "@/components/layout/Layout";
import { StatCard } from "@/components/ui/StatCard";
import { Info, TrendingUp, Flame, DollarSign } from "lucide-react";

const liquidityHistory = [
  { date: "2024-01-15", type: "addition", amount: 10000 },
  { date: "2024-01-10", type: "addition", amount: 15000 },
  { date: "2024-01-05", type: "addition", amount: 8500 },
  { date: "2024-01-02", type: "addition", amount: 5000 },
];

const burnHistory = [
  { date: "2024-01-14", amount: 2500 },
  { date: "2024-01-12", amount: 1800 },
  { date: "2024-01-08", amount: 3200 },
  { date: "2024-01-03", amount: 950 },
];

const PoolStatus = () => {
  const poolLiquidity = 38500;

  return (
    <Layout>
      <div className="container mx-auto px-4 py-12">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="text-center mb-10 animate-fade-in">
            <h1 className="text-3xl font-bold text-foreground mb-4">
              Liquidity Pool Status
            </h1>
          </div>

          {/* Main Stats */}
          <div className="grid md:grid-cols-2 gap-6 mb-8">
            <div
              className="animate-slide-up"
              style={{ animationDelay: "0.1s" }}
            >
              <StatCard
                label="Available Pool Liquidity"
                value={
                  <span className="text-primary">
                    ${poolLiquidity.toLocaleString()} USDC
                  </span>
                }
                note="Current liquidity available for optional sell registrations"
                className="glow-primary h-full"
              />
            </div>

            <div
              className="animate-slide-up"
              style={{ animationDelay: "0.15s" }}
            >
              <div className="glass-card p-6 h-full">
                <p className="stat-label mb-2">
                  Indicative Liquidity-Based Course Support
                </p>
                <p className="text-lg text-muted-foreground mb-3">
                  Currently based on available liquidity
                </p>
                <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/30">
                  <Info className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-muted-foreground">
                    This value is not a promise, forecast, or guarantee. It is a
                    purely informational snapshot based on current liquidity.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* History Section */}
          <div className="grid md:grid-cols-2 gap-6">
            {/* Liquidity Additions */}
            <div
              className="glass-card p-6 animate-slide-up"
              style={{ animationDelay: "0.2s" }}
            >
              <div className="flex items-center gap-2 mb-6">
                <DollarSign className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold">Liquidity Additions</h2>
              </div>
              <div className="space-y-3">
                {liquidityHistory.map((item, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between py-3 border-b border-border/50 last:border-0"
                  >
                    <span className="text-sm text-muted-foreground">
                      {item.date}
                    </span>
                    <span className="text-sm font-medium text-primary">
                      +${item.amount.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Token Burns */}
            <div
              className="glass-card p-6 animate-slide-up"
              style={{ animationDelay: "0.25s" }}
            >
              <div className="flex items-center gap-2 mb-6">
                <Flame className="h-5 w-5 text-destructive" />
                <h2 className="text-lg font-semibold">Token Burns</h2>
              </div>
              <div className="space-y-3">
                {burnHistory.map((item, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between py-3 border-b border-border/50 last:border-0"
                  >
                    <span className="text-sm text-muted-foreground">
                      {item.date}
                    </span>
                    <span className="text-sm font-medium text-destructive">
                      -{item.amount.toLocaleString()} BNKR
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default PoolStatus;
