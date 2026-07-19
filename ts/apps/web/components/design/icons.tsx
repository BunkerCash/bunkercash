// Inline icon set for the BunkerCash design system.
// All icons inherit `currentColor` and are aria-hidden decorative by default.

type IconProps = {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
};

export function CopyIcon({ size = 12, className, style }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
      className={className}
      style={style}
    >
      <rect
        x="4.5"
        y="4.5"
        width="8"
        height="8"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path
        d="M9.5 4.5v-1a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h1"
        stroke="currentColor"
        strokeWidth="1.2"
      />
    </svg>
  );
}

export function ExternalIcon({ size = 12, className, style }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
      className={className}
      style={style}
    >
      <path
        d="M6 3H4a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2h5a2 2 0 0 0 2-2V8"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <path
        d="M8.5 2h3.5v3.5M11.8 2.2 6.8 7.2"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function WarnIcon({ size = 13, className, style }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className={className}
      style={style}
    >
      <path
        d="M8 2 1.5 13h13L8 2Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path
        d="M8 6.5v3M8 11.4v.2"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ChevronDownIcon({ size = 10, className, style }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
      className={className}
      style={style}
    >
      <path
        d="m2.5 4.5 3.5 3.5L9.5 4.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CloseIcon({ size = 11, className, style }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
      className={className}
      style={style}
    >
      <path
        d="m2 2 8 8M10 2l-8 8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function CheckIcon({ size = 18, className, style }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 18 18"
      fill="none"
      aria-hidden="true"
      className={className}
      style={style}
    >
      <path
        d="m4 9.5 3.4 3.4L14 5.6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function RefreshIcon({ size = 13, className, style }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className={className}
      style={style}
    >
      <path
        d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2.5v2.6h-2.6"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SunIcon({ size = 15, className, style }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className={className}
      style={style}
    >
      <path
        d="M8 1.5v2M8 12.5v2M2.7 2.7l1.4 1.4M11.9 11.9l1.4 1.4M1.5 8h2M12.5 8h2M2.7 13.3l1.4-1.4M11.9 4.1l1.4-1.4"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <circle cx="8" cy="8" r="2.6" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

export function WalletIcon({ size = 20, className, style }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      className={className}
      style={style}
    >
      <rect
        x="2"
        y="5"
        width="16"
        height="11"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path d="M2 8h16" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="14.5" cy="12" r="1.1" fill="currentColor" />
    </svg>
  );
}

export function ArrowRightIcon({ size = 14, className, style }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className={className}
      style={style}
    >
      <path
        d="M2.5 8h11M9.5 4l4 4-4 4"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** BunkerCash logo mark: two skewed accent bars in a bordered tile. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      className={`flex h-7 w-7 flex-none flex-col items-center justify-center gap-[2.5px] rounded-lg border border-line-2 bg-surface-3 ${className ?? ""}`}
    >
      <span className="block h-[3.5px] w-3 -skew-x-[16deg] rounded-[1.5px] bg-mint" />
      <span className="block h-[3.5px] w-3 -skew-x-[16deg] rounded-[1.5px] bg-mint opacity-45" />
    </span>
  );
}

/** Spinning loader ring, size/colors via className (border colors). */
export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={`block animate-spin rounded-full border-2 border-line-2 border-t-mint ${className ?? "h-[13px] w-[13px]"}`}
    />
  );
}
