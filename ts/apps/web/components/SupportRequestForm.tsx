"use client";

import { FormEvent, useState } from "react";
import { Spinner } from "@/components/design/icons";

interface SupportRequestFormProps {
  supportEmail: string;
  initialSource: "blocked-page" | "support-page";
  initialSubject: string;
}

function getErrorMessage(value: unknown, fallback: string): string {
  if (
    value &&
    typeof value === "object" &&
    "error" in value &&
    typeof value.error === "string"
  ) {
    return value.error;
  }
  return fallback;
}

const inputClass =
  "h-10 w-full rounded-lg border border-line bg-surface-2 px-3 text-[13.5px] text-ink placeholder:text-ink-3 focus:border-mint-line focus:outline-none disabled:opacity-50";

export function SupportRequestForm({
  supportEmail,
  initialSource,
  initialSubject,
}: SupportRequestFormProps) {
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    country: "",
    subject: initialSubject,
    message: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          source: initialSource,
          pageUrl:
            typeof window === "undefined" ? "/support" : window.location.href,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          getErrorMessage(data, "Failed to submit support request"),
        );
      }

      setSuccess(
        `Support request submitted. We will reply at ${form.email || supportEmail}.`,
      );
      setForm({
        fullName: "",
        email: "",
        phone: "",
        country: "",
        subject: initialSubject,
        message: "",
      });
    } catch (submissionError: unknown) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Failed to submit support request",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-[12.5px] font-medium text-ink-2">
            Full name
          </span>
          <input
            value={form.fullName}
            onChange={(e) =>
              setForm((c) => ({ ...c, fullName: e.target.value }))
            }
            placeholder="Jane Doe"
            autoComplete="name"
            required
            disabled={submitting}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[12.5px] font-medium text-ink-2">Email</span>
          <input
            type="email"
            value={form.email}
            onChange={(e) =>
              setForm((c) => ({ ...c, email: e.target.value }))
            }
            placeholder={supportEmail}
            autoComplete="email"
            required
            disabled={submitting}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[12.5px] font-medium text-ink-2">
            Phone number
          </span>
          <input
            value={form.phone}
            onChange={(e) =>
              setForm((c) => ({ ...c, phone: e.target.value }))
            }
            placeholder="+1 555 123 4567"
            autoComplete="tel"
            disabled={submitting}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[12.5px] font-medium text-ink-2">
            Country or region
          </span>
          <input
            value={form.country}
            onChange={(e) =>
              setForm((c) => ({ ...c, country: e.target.value }))
            }
            placeholder="Italy"
            autoComplete="country-name"
            disabled={submitting}
            className={inputClass}
          />
        </label>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-[12.5px] font-medium text-ink-2">Subject</span>
        <input
          value={form.subject}
          onChange={(e) =>
            setForm((c) => ({ ...c, subject: e.target.value }))
          }
          placeholder="How can we help?"
          required
          disabled={submitting}
          className={inputClass}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-[12.5px] font-medium text-ink-2">Message</span>
        <textarea
          value={form.message}
          onChange={(e) =>
            setForm((c) => ({ ...c, message: e.target.value }))
          }
          placeholder="Share the issue, your jurisdiction, and any details we should review."
          rows={6}
          required
          disabled={submitting}
          className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-[13.5px] text-ink placeholder:text-ink-3 focus:border-mint-line focus:outline-none disabled:opacity-50"
        />
      </label>

      {error && (
        <div className="rounded-lg border border-sell-line bg-sell-soft px-4 py-2.5 text-[13px] text-sell">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-lg border border-mint-line bg-mint-soft px-4 py-2.5 text-[13px] text-mint">
          {success}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-mint-btn text-[13.5px] font-semibold text-mint-ink transition-colors hover:bg-mint-btn-h disabled:opacity-50 sm:w-auto sm:px-6"
      >
        {submitting ? (
          <>
            <Spinner className="h-3.5 w-3.5" />
            Sending request
          </>
        ) : (
          "Submit request"
        )}
      </button>
    </form>
  );
}
