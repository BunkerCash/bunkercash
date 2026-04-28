import { TradePageContent } from "@/components/TradePageContent";

export default function BuyPage() {
  return (
    <TradePageContent
      title="Buy"
      description="Eligible users may buy protocol tokens through the interface below, subject to access restrictions and available protocol parameters."
      hiddenTabs={["withdraw"]}
      showDisclaimer={false}
    />
  );
}
