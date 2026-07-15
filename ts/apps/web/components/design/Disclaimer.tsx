const TEXT =
  "The acquisition and use of digital tokens involves risks and may result in the total loss of the capital contributed. There is no guarantee of any performance, return, or increase in value. This digital token is a community-based token. It does not represent a deposit, equity interest, participation right, or any form of ownership, claim, or usage right. Contributed funds may be used at our sole discretion. The token is not tied to any specific projects and does not create any entitlement to financial performance, returns, or an increase in value. Access may be restricted in certain regions, including the European Union and the United States.";

export function Disclaimer() {
  return (
    <div className="relative w-full overflow-hidden border-b border-warn-line bg-warn-soft py-2">
      <div className="disclaimer-scroll flex whitespace-nowrap">
        <span className="inline-flex items-center gap-3 px-6 text-[12px] font-bold uppercase tracking-[0.04em] text-warn">
          <span className="flex-none text-[13px]">⚠</span>
          Disclaimer: {TEXT}
          <span className="mx-4 text-warn/40">│</span>
        </span>
        <span className="inline-flex items-center gap-3 px-6 text-[12px] font-bold uppercase tracking-[0.04em] text-warn" aria-hidden>
          <span className="flex-none text-[13px]">⚠</span>
          Disclaimer: {TEXT}
          <span className="mx-4 text-warn/40">│</span>
        </span>
      </div>
    </div>
  );
}
