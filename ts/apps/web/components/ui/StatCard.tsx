import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string | ReactNode;
  note?: string | ReactNode;
  className?: string;
}

export const StatCard = ({ label, value, note, className }: StatCardProps) => {
  return (
    <div className={cn("glass-card p-6", className)}>
      <p className="stat-label mb-2">{label}</p>
      <div className="stat-value">{value}</div>
      {note && <p className="text-xs text-muted-foreground mt-2">{note}</p>}
    </div>
  );
};
