"use client";

import { useState, useEffect } from "react";
import { Layout } from "@/components/layout/Layout";
import { BuyPrimaryInterface } from "@/components/BuyPrimaryInterface";
import { WithdrawInterface } from "@/components/WithdrawInterface";
import { DisclaimerBanner } from "@/components/ui/DisclaimerBanner";
import { PriceChart } from "@/components/PriceChart";
import { usePoolStats } from "@/hooks/usePoolStats";

function fmt(value: string | null) {
  if (value == null) return null;
  const n = parseFloat(value);
  return isNaN(n) ? null : n.toFixed(4);
}

function fmtNumber(value: number | null | undefined, digits = 4) {
  if (value == null || Number.isNaN(value)) return null;
  return value.toFixed(digits);
}

type ModalMode = null | "buy" | "sell";

export default function Home() {
  const { stats, loading } = usePoolStats();
  const [modal, setModal] = useState<ModalMode>(null);
  const price = loading ? null : fmtNumber(stats.pricePerToken);
  const nav = loading ? null : fmt(stats.navUsdc);
  const liquid = loading ? null : fmt(stats.treasuryUsdc);
  const pending = loading ? null : fmt(stats.pendingClaimsUsdc);

  // Close modal on ESC
  useEffect(() => {
    if (!modal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setModal(null);
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [modal]);

  return (
    <Layout>
      <div className="hp">
        {/* Background layers */}
        <div className="hp-grid" />
        <div className="hp-glow hp-glow--cyan" />
        <div className="hp-glow hp-glow--magenta" />
        <div className="hp-scanlines" />

        <div className="hp-inner">
          <DisclaimerBanner className="w-full" />

          {/* Price display */}
          <div className="hp-price">
            <div className="hp-price-label">
              <span className="hp-pulse" />
              <span>BUNKER CASH · LIVE FROM POOL</span>
            </div>

            <div className="hp-price-value">
              {price != null ? (
                <>
                  <span className="hp-price-currency">$</span>
                  <span className="hp-price-digits">{price}</span>
                </>
              ) : (
                <span className="hp-price-digits hp-price-digits--loading">
                  ————
                </span>
              )}
            </div>

            <div className="hp-price-sub">USDC per token</div>
          </div>


          {/* Action buttons */}
          <div className="hp-actions">
            <button
              className="hp-btn hp-btn--buy"
              onClick={() => setModal("buy")}
            >
              <span className="hp-btn-label">BUY</span>
              <span className="hp-btn-sub">Get BunkerCash</span>
              <span className="hp-btn-arrow">→</span>
            </button>

            <button
              className="hp-btn hp-btn--sell"
              onClick={() => setModal("sell")}
            >
              <span className="hp-btn-label">SELL</span>
              <span className="hp-btn-sub">Settle to USDC</span>
              <span className="hp-btn-arrow">→</span>
            </button>
          </div>

          <div className="hp-overview">
            <div className="hp-stats">
              <div className="hp-stat">
                <span className="hp-stat-label">Pool NAV</span>
                <span className="hp-stat-value">{nav != null ? `$${nav}` : "—"}</span>
              </div>
              <div className="hp-stat">
                <span className="hp-stat-label">Liquid USDC</span>
                <span className="hp-stat-value">
                  {liquid != null ? `$${liquid}` : "—"}
                </span>
              </div>
              <div className="hp-stat">
                <span className="hp-stat-label">Pending Claims</span>
                <span className="hp-stat-value">
                  {pending != null ? `$${pending}` : "—"}
                </span>
              </div>
            </div>
          </div>

                    {/* Price chart */}
          <PriceChart days={30} />

        </div>

        {/* Modal */}
        {modal && (
          <div
            className="hp-modal-backdrop"
            onClick={() => setModal(null)}
          >
            <div
              className="hp-modal"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
            >
              <div className="hp-modal-head">
                <div className="hp-modal-title">
                  <span
                    className={`hp-modal-dot hp-modal-dot--${modal}`}
                  />
                  {modal === "buy" ? "Buy BunkerCash" : "Sell BunkerCash"}
                </div>
                <button
                  className="hp-modal-close"
                  onClick={() => setModal(null)}
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>

              <div className="hp-modal-body">
                {modal === "buy" ? <BuyPrimaryInterface /> : <WithdrawInterface />}
              </div>
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        .hp {
          position: relative;
          min-height: calc(100vh - 96px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 2rem 1.25rem;
          overflow: hidden;
          background: #000;
        }

        /* Cyber grid */
        .hp-grid {
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(0, 255, 200, 0.06) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0, 255, 200, 0.06) 1px, transparent 1px);
          background-size: 56px 56px;
          mask-image: radial-gradient(ellipse at center, black 20%, transparent 75%);
          -webkit-mask-image: radial-gradient(ellipse at center, black 20%, transparent 75%);
          pointer-events: none;
          opacity: 0.35;
        }

        /* Neon glows */
        .hp-glow {
          position: absolute;
          border-radius: 50%;
          filter: blur(120px);
          opacity: 0.55;
          pointer-events: none;
          animation: float 14s ease-in-out infinite;
        }
        .hp-glow--cyan {
          width: 520px;
          height: 520px;
          left: -120px;
          top: -80px;
          background: rgba(0, 255, 178, 0.12);
        }
        .hp-glow--magenta {
          width: 480px;
          height: 480px;
          right: -100px;
          bottom: -100px;
          background: rgba(255, 255, 255, 0.05);
          animation-delay: -7s;
        }
        @keyframes float {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(30px, -20px) scale(1.08); }
        }

        /* Subtle scanlines */
        .hp-scanlines {
          position: absolute;
          inset: 0;
          background: repeating-linear-gradient(
            to bottom,
            transparent 0,
            transparent 3px,
            rgba(255, 255, 255, 0.012) 3px,
            rgba(255, 255, 255, 0.012) 4px
          );
          pointer-events: none;
          mix-blend-mode: overlay;
        }

        .hp-inner {
          position: relative;
          z-index: 1;
          width: 100%;
          max-width: 640px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2.5rem;
        }

        /* Price */
        .hp-price {
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.75rem;
        }
        .hp-price-label {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.4rem 0.9rem;
          border: 1px solid rgba(0, 229, 255, 0.3);
          background: rgba(0, 229, 255, 0.06);
          border-radius: 999px;
          font-size: 0.7rem;
          font-weight: 600;
          letter-spacing: 0.18em;
          color: #7cf0ff;
          text-transform: uppercase;
          backdrop-filter: blur(6px);
        }
        .hp-pulse {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #00ffa3;
          box-shadow: 0 0 10px #00ffa3, 0 0 20px rgba(0, 255, 163, 0.5);
          animation: pulse 1.6s ease-in-out infinite;
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.85); }
        }

        .hp-price-value {
          display: flex;
          align-items: flex-start;
          justify-content: center;
          font-family: ui-monospace, "SF Mono", "JetBrains Mono", Menlo, monospace;
          font-weight: 700;
          line-height: 1;
          color: #fff;
          text-shadow:
            0 0 24px rgba(0, 229, 255, 0.55),
            0 0 48px rgba(0, 229, 255, 0.25);
          letter-spacing: -0.02em;
        }
        .hp-price-currency {
          font-size: 2.25rem;
          margin-top: 0.75rem;
          margin-right: 0.15rem;
          color: #7cf0ff;
          opacity: 0.9;
        }
        .hp-price-digits {
          font-size: clamp(3.5rem, 11vw, 5.75rem);
          background: linear-gradient(180deg, #ffffff 0%, #a8e9ff 100%);
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .hp-price-digits--loading {
          opacity: 0.4;
          animation: blink 1.4s ease-in-out infinite;
        }
        @keyframes blink {
          0%, 100% { opacity: 0.35; }
          50% { opacity: 0.8; }
        }
        .hp-price-sub {
          font-size: 0.8rem;
          color: rgba(255, 255, 255, 0.45);
          letter-spacing: 0.22em;
          text-transform: uppercase;
          font-weight: 500;
        }

        /* Action buttons */
        .hp-actions {
          width: 100%;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1rem;
        }
        @media (max-width: 480px) {
          .hp-actions { grid-template-columns: 1fr; }
        }

        .hp-overview {
          width: 100%;
          display: flex;
          flex-direction: column;
          gap: 1rem;
          text-align: center;
        }
        .hp-overview-text {
          margin: 0;
          color: rgba(255, 255, 255, 0.56);
          font-size: 0.95rem;
          line-height: 1.7;
        }
        .hp-stats {
          width: 100%;
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 0.75rem;
        }
        .hp-stat {
          display: flex;
          flex-direction: column;
          gap: 0.45rem;
          padding: 0.95rem 1rem;
          border-radius: 14px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.025);
        }
        .hp-stat-label {
          font-size: 0.72rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: rgba(255, 255, 255, 0.42);
        }
        .hp-stat-value {
          font-size: 1rem;
          font-weight: 600;
          color: #fff;
          font-variant-numeric: tabular-nums;
        }
        @media (max-width: 640px) {
          .hp-stats { grid-template-columns: 1fr; }
        }

        .hp-btn {
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 0.25rem;
          padding: 1.5rem 1.5rem 1.35rem;
          border-radius: 16px;
          border: 1px solid transparent;
          background: rgba(10, 15, 28, 0.7);
          backdrop-filter: blur(12px);
          cursor: pointer;
          text-align: left;
          overflow: hidden;
          transition:
            transform 0.2s ease,
            box-shadow 0.25s ease,
            border-color 0.2s ease;
          font-family: inherit;
        }
        .hp-btn::before {
          content: "";
          position: absolute;
          inset: 0;
          border-radius: inherit;
          padding: 1px;
          background: linear-gradient(135deg, var(--grad-a), var(--grad-b));
          -webkit-mask:
            linear-gradient(#000 0 0) content-box,
            linear-gradient(#000 0 0);
          -webkit-mask-composite: xor;
                  mask-composite: exclude;
          pointer-events: none;
          transition: opacity 0.25s ease;
          opacity: 0.55;
        }
        .hp-btn::after {
          content: "";
          position: absolute;
          inset: 0;
          background: radial-gradient(
            120% 80% at 50% 120%,
            var(--grad-a) 0%,
            transparent 60%
          );
          opacity: 0;
          transition: opacity 0.3s ease;
          pointer-events: none;
        }
        .hp-btn:hover {
          transform: translateY(-3px);
          box-shadow:
            0 0 0 1px var(--grad-a),
            0 20px 50px -10px var(--shadow),
            0 0 60px -10px var(--shadow);
        }
        .hp-btn:hover::before { opacity: 1; }
        .hp-btn:hover::after { opacity: 0.22; }
        .hp-btn:active { transform: translateY(-1px); }

        .hp-btn--buy {
          --grad-a: #00e5ff;
          --grad-b: #00ffa3;
          --shadow: rgba(0, 229, 255, 0.55);
        }
        .hp-btn--sell {
          --grad-a: #ff2bd6;
          --grad-b: #ff4d4d;
          --shadow: rgba(255, 43, 214, 0.5);
        }

        .hp-btn-label {
          font-size: 1.75rem;
          font-weight: 800;
          letter-spacing: 0.05em;
          color: #fff;
          line-height: 1;
        }
        .hp-btn--buy .hp-btn-label {
          background: linear-gradient(180deg, #fff 0%, #a8fff0 100%);
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .hp-btn--sell .hp-btn-label {
          background: linear-gradient(180deg, #fff 0%, #ffc7ef 100%);
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .hp-btn-sub {
          font-size: 0.82rem;
          color: rgba(255, 255, 255, 0.55);
          font-weight: 500;
        }
        .hp-btn-arrow {
          position: absolute;
          top: 1.25rem;
          right: 1.25rem;
          font-size: 1.1rem;
          color: var(--grad-a);
          transition: transform 0.25s ease;
        }
        .hp-btn:hover .hp-btn-arrow {
          transform: translate(4px, -2px);
        }

        /* Modal */
        .hp-modal-backdrop {
          position: fixed;
          inset: 0;
          z-index: 100;
          background: rgba(2, 3, 8, 0.75);
          backdrop-filter: blur(10px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1.25rem;
          animation: fadeIn 0.2s ease;
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .hp-modal {
          position: relative;
          width: 100%;
          max-width: 440px;
          max-height: min(780px, calc(100vh - 2rem));
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          background: linear-gradient(180deg, #0b1220 0%, #070a14 100%);
          border: 1px solid rgba(0, 229, 255, 0.2);
          border-radius: 20px;
          box-shadow:
            0 0 0 1px rgba(0, 229, 255, 0.08),
            0 30px 80px rgba(0, 0, 0, 0.7),
            0 0 100px rgba(0, 229, 255, 0.15);
          overflow: hidden;
          animation: slideUp 0.25s cubic-bezier(0.2, 0.8, 0.2, 1);
        }
        @keyframes slideUp {
          from { transform: translateY(20px) scale(0.98); opacity: 0; }
          to { transform: translateY(0) scale(1); opacity: 1; }
        }
        .hp-modal-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 1.1rem 1.25rem;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        }
        .hp-modal-title {
          display: flex;
          align-items: center;
          gap: 0.625rem;
          font-weight: 700;
          letter-spacing: 0.02em;
          color: #fff;
          font-size: 1.05rem;
        }
        .hp-modal-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
        }
        .hp-modal-dot--buy {
          background: #00e5ff;
          box-shadow: 0 0 10px #00e5ff;
        }
        .hp-modal-dot--sell {
          background: #ff2bd6;
          box-shadow: 0 0 10px #ff2bd6;
        }
        .hp-modal-close {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.03);
          color: rgba(255, 255, 255, 0.7);
          cursor: pointer;
          font-size: 0.85rem;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.15s ease;
        }
        .hp-modal-close:hover {
          background: rgba(255, 255, 255, 0.08);
          color: #fff;
        }
        .hp-modal-body {
          flex: 1;
          overflow-y: auto;
          padding: 1rem;
        }
        @media (max-width: 640px) {
          .hp-modal-backdrop {
            padding: 0.75rem;
          }
          .hp-modal {
            max-width: 100%;
            max-height: calc(100vh - 1.5rem);
            border-radius: 18px;
          }
          .hp-modal-head {
            padding: 0.95rem 1rem;
          }
          .hp-modal-body {
            padding: 0.875rem;
          }
        }
      `}</style>
    </Layout>
  );
}
