import { AlertTriangle } from "lucide-react";
import { ReactNode } from "react";

interface WarningBoxProps {
  title: string;
  children: ReactNode;
}

export const WarningBox = ({ title, children }: WarningBoxProps) => {
  return (
    <div className="warning-box">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
        <div>
          <h3 className="font-semibold text-destructive mb-2">{title}</h3>
          <div className="text-sm text-muted-foreground space-y-1">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
};
