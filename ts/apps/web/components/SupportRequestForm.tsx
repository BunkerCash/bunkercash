"use client";

import { FormEvent, useState } from "react";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...form,
          source: initialSource,
          pageUrl:
            typeof window === "undefined" ? "/support" : window.location.href,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(getErrorMessage(data, "Failed to submit support request"));
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
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-medium text-white">Full name</label>
          <Input
            value={form.fullName}
            onChange={(event) =>
              setForm((current) => ({ ...current, fullName: event.target.value }))
            }
            placeholder="Jane Doe"
            autoComplete="name"
            required
            disabled={submitting}
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-white">Email</label>
          <Input
            type="email"
            value={form.email}
            onChange={(event) =>
              setForm((current) => ({ ...current, email: event.target.value }))
            }
            placeholder={supportEmail}
            autoComplete="email"
            required
            disabled={submitting}
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-white">Phone number</label>
          <Input
            value={form.phone}
            onChange={(event) =>
              setForm((current) => ({ ...current, phone: event.target.value }))
            }
            placeholder="+1 555 123 4567"
            autoComplete="tel"
            disabled={submitting}
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-white">
            Country or region
          </label>
          <Input
            value={form.country}
            onChange={(event) =>
              setForm((current) => ({ ...current, country: event.target.value }))
            }
            placeholder="Italy"
            autoComplete="country-name"
            disabled={submitting}
          />
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-white">Subject</label>
        <Input
          value={form.subject}
          onChange={(event) =>
            setForm((current) => ({ ...current, subject: event.target.value }))
          }
          placeholder="How can we help?"
          required
          disabled={submitting}
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-white">Message</label>
        <textarea
          value={form.message}
          onChange={(event) =>
            setForm((current) => ({ ...current, message: event.target.value }))
          }
          placeholder="Share the issue, your jurisdiction, and any details we should review."
          rows={7}
          required
          disabled={submitting}
          className="flex min-h-[180px] w-full rounded-md border border-input bg-background px-3 py-3 text-sm text-white placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>

      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      {success ? (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          {success}
        </div>
      ) : null}

      <Button
        type="submit"
        size="lg"
        className="w-full sm:w-auto"
        disabled={submitting}
      >
        {submitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Sending request
          </>
        ) : (
          <>
            <Send className="h-4 w-4" />
            Submit request
          </>
        )}
      </Button>
    </form>
  );
}
