import { SettlementCard } from "@/components/settlement-card";
import { ClaimsTable } from "@/components/claims-table";

export default function ClaimsPage() {
  return (
    <div className="space-y-8">
      <SettlementCard />
      <ClaimsTable />
    </div>
  );
}
