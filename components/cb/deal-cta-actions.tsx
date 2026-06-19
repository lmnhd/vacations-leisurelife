"use client";

import { useState } from "react";
import type { CSSProperties, FormEvent } from "react";

import { ExternalLink, Loader2, Mail, Phone } from "lucide-react";

const palette = {
  cream: "#F5EFE6",
  navy: "#0F3042",
  navyHover: "#16435C",
  border: "#E8E1D5",
  text: "#1A2530",
  muted: "#5B6873",
  gold: "#8C6A3C",
  white: "#FFFFFF",
} as const;

type Tone = "hero" | "light" | "dark" | "mobile";

interface DealCtaActionsProps {
  dealId: string;
  bookingUrl: string;
  primaryLabel: string;
  tone?: Tone;
  align?: "left" | "center";
}

type LinkState = "idle" | "form" | "submitting" | "sent" | "not_sent" | "error";
type CallbackState = "idle" | "form" | "submitting" | "done" | "error";

function buttonBase(tone: Tone, primary: boolean): CSSProperties {
  const onDark = tone === "hero" || tone === "dark";
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: tone === "mobile" ? 44 : 58,
    borderRadius: 3,
    border: primary
      ? "1px solid transparent"
      : `1px solid ${onDark ? "rgba(245,239,230,0.36)" : palette.border}`,
    background: primary
      ? onDark
        ? palette.cream
        : palette.navy
      : onDark
        ? "rgba(245,239,230,0.08)"
        : palette.white,
    color: primary
      ? onDark
        ? palette.navy
        : palette.cream
      : onDark
        ? "rgba(245,239,230,0.86)"
        : palette.navy,
    fontWeight: 600,
    fontSize: tone === "mobile" ? 13 : 14,
    letterSpacing: tone === "mobile" ? "0.04em" : "0.06em",
    textTransform: "uppercase",
    padding: tone === "mobile" ? "12px 14px" : "17px 24px",
    textDecoration: "none",
    cursor: "pointer",
    boxSizing: "border-box",
    whiteSpace: "nowrap",
  };
}

function inputStyle(tone: Tone): CSSProperties {
  const onDark = tone === "hero" || tone === "dark";
  return {
    width: "100%",
    border: `1px solid ${onDark ? "rgba(245,239,230,0.24)" : palette.border}`,
    borderRadius: 3,
    background: onDark ? "rgba(255,255,255,0.08)" : palette.white,
    color: onDark ? palette.cream : palette.text,
    padding: "12px 13px",
    fontSize: 15,
    boxSizing: "border-box",
    outline: "none",
  };
}

function panelStyle(tone: Tone): CSSProperties {
  const onDark = tone === "hero" || tone === "dark";
  return {
    width: "min(100%, 420px)",
    border: `1px solid ${onDark ? "rgba(245,239,230,0.24)" : palette.border}`,
    borderRadius: 4,
    background: onDark ? "rgba(255,255,255,0.08)" : palette.white,
    color: onDark ? palette.cream : palette.text,
    padding: 18,
    boxSizing: "border-box",
    backdropFilter: onDark ? "blur(12px)" : undefined,
    textAlign: "left",
  };
}

function helperColor(tone: Tone): string {
  return tone === "hero" || tone === "dark" ? "rgba(245,239,230,0.72)" : palette.muted;
}

export function DealCtaActions({
  dealId,
  bookingUrl,
  primaryLabel,
  tone = "light",
  align = "left",
}: DealCtaActionsProps) {
  const [linkState, setLinkState] = useState<LinkState>("idle");
  const [linkEmail, setLinkEmail] = useState("");
  const [linkError, setLinkError] = useState("");
  const [callbackState, setCallbackState] = useState<CallbackState>("idle");
  const [callbackName, setCallbackName] = useState("");
  const [callbackEmail, setCallbackEmail] = useState("");
  const [callbackPhone, setCallbackPhone] = useState("");
  const [callbackNotes, setCallbackNotes] = useState("");
  const [callbackError, setCallbackError] = useState("");

  const isMobile = tone === "mobile";
  const stackActions = isMobile;

  async function handleEmailLinkSubmit(event: FormEvent) {
    event.preventDefault();
    if (!linkEmail.trim()) {
      setLinkError("Please enter an email address.");
      return;
    }

    setLinkError("");
    setLinkState("submitting");
    try {
      const res = await fetch("/api/deals/link-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dealId, email: linkEmail.trim() }),
      });
      const data = (await res.json()) as { ok: boolean; emailDelivered?: boolean; emailError?: string; error?: string };
      if (!data.ok) {
        setLinkError(data.error ?? "We couldn't prepare that link right now.");
        setLinkState("error");
        return;
      }
      if (!data.emailDelivered) {
        setLinkError(data.emailError ?? "We couldn't send that email right now.");
        setLinkState("not_sent");
        return;
      }
      setLinkState("sent");
    } catch {
      setLinkError("We couldn't send that link right now.");
      setLinkState("error");
    }
  }

  async function handleCallbackSubmit(event: FormEvent) {
    event.preventDefault();
    if (!callbackEmail.trim() && !callbackPhone.trim()) {
      setCallbackError("Please enter an email address or phone number.");
      return;
    }

    setCallbackError("");
    setCallbackState("submitting");
    try {
      const res = await fetch("/api/deals/callback-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dealId,
          name: callbackName.trim() || undefined,
          email: callbackEmail.trim() || undefined,
          phone: callbackPhone.trim() || undefined,
          notes: callbackNotes.trim() || undefined,
        }),
      });
      const data = (await res.json()) as { ok: boolean; requestId?: string; error?: string };
      if (!data.ok) {
        setCallbackError(data.error ?? "We couldn't save that request right now.");
        setCallbackState("error");
        return;
      }
      setCallbackState("done");
    } catch {
      setCallbackError("We couldn't save that request right now.");
      setCallbackState("error");
    }
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: align === "center" ? "center" : "flex-start",
        gap: 12,
        width: isMobile ? "100%" : undefined,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: stackActions ? "column" : "row",
          flexWrap: stackActions ? "nowrap" : "wrap",
          alignItems: "center",
          justifyContent: align === "center" ? "center" : "flex-start",
          gap: 10,
          width: isMobile ? "100%" : undefined,
        }}
      >
        <a
          href={bookingUrl || "#pricing"}
          target={bookingUrl ? "_blank" : undefined}
          rel={bookingUrl ? "noreferrer" : undefined}
          style={{ ...buttonBase(tone, true), width: isMobile ? "100%" : undefined }}
        >
          <ExternalLink size={16} aria-hidden="true" />
          {primaryLabel}
        </a>
        <button
          type="button"
          onClick={() => setLinkState(linkState === "form" ? "idle" : "form")}
          disabled={linkState === "submitting"}
          style={{ ...buttonBase(tone, false), width: isMobile ? "100%" : undefined }}
        >
          {linkState === "submitting" ? <Loader2 size={16} aria-hidden="true" /> : <Mail size={16} aria-hidden="true" />}
          {linkState === "sent" ? "Link sent" : linkState === "not_sent" ? "Email not sent" : "Email me the link"}
        </button>
        <button
          type="button"
          onClick={() => setCallbackState(callbackState === "form" ? "idle" : "form")}
          disabled={callbackState === "submitting"}
          style={{ ...buttonBase(tone, false), width: isMobile ? "100%" : undefined }}
        >
          {callbackState === "submitting" ? <Loader2 size={16} aria-hidden="true" /> : <Phone size={16} aria-hidden="true" />}
          {callbackState === "done" ? "Request received" : "Request callback"}
        </button>
      </div>

      {linkState === "form" || linkState === "submitting" ? (
        <form onSubmit={handleEmailLinkSubmit} style={{ ...panelStyle(tone), alignSelf: align === "center" ? "center" : "flex-start" }}>
          <p style={{ margin: "0 0 10px", fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: helperColor(tone) }}>
            Email me the booking link
          </p>
          <input
            type="email"
            value={linkEmail}
            onChange={(event) => setLinkEmail(event.target.value)}
            placeholder="Email address"
            style={inputStyle(tone)}
          />
          {linkError ? <p style={{ margin: "9px 0 0", fontSize: 13, color: "#C2410C" }}>{linkError}</p> : null}
          <button type="submit" disabled={linkState === "submitting"} style={{ ...buttonBase(tone, true), width: "100%", marginTop: 12 }}>
            {linkState === "submitting" ? <Loader2 size={16} aria-hidden="true" /> : <Mail size={16} aria-hidden="true" />}
            {linkState === "submitting" ? "Sending" : "Send link"}
          </button>
        </form>
      ) : null}

      {callbackState === "form" || callbackState === "submitting" ? (
        <form onSubmit={handleCallbackSubmit} style={{ ...panelStyle(tone), alignSelf: align === "center" ? "center" : "flex-start" }}>
          <p style={{ margin: "0 0 10px", fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: helperColor(tone) }}>
            Request an agent callback
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <input type="text" value={callbackName} onChange={(event) => setCallbackName(event.target.value)} placeholder="Your name (optional)" style={inputStyle(tone)} />
            <input type="email" value={callbackEmail} onChange={(event) => setCallbackEmail(event.target.value)} placeholder="Email address" style={inputStyle(tone)} />
            <input type="tel" value={callbackPhone} onChange={(event) => setCallbackPhone(event.target.value)} placeholder="Phone (optional)" style={inputStyle(tone)} />
            <textarea value={callbackNotes} onChange={(event) => setCallbackNotes(event.target.value)} placeholder="Anything helpful for the agent? (optional)" rows={3} style={{ ...inputStyle(tone), resize: "vertical", fontFamily: "inherit" }} />
          </div>
          {callbackError ? <p style={{ margin: "9px 0 0", fontSize: 13, color: "#C2410C" }}>{callbackError}</p> : null}
          <button type="submit" disabled={callbackState === "submitting"} style={{ ...buttonBase(tone, true), width: "100%", marginTop: 12 }}>
            {callbackState === "submitting" ? <Loader2 size={16} aria-hidden="true" /> : <Phone size={16} aria-hidden="true" />}
            {callbackState === "submitting" ? "Sending" : "Send request"}
          </button>
        </form>
      ) : null}

      {linkState === "sent" ? (
        <p style={{ margin: 0, fontSize: 14, color: tone === "hero" || tone === "dark" ? "#86EFAC" : "#047857" }}>
          Link sent to your email and opened in a new tab.
        </p>
      ) : null}
      {linkState === "not_sent" ? (
        <p style={{ margin: 0, fontSize: 14, color: tone === "hero" || tone === "dark" ? "#FCD34D" : "#A16207" }}>
          The email did not go out. Please try again or use Book Now.
        </p>
      ) : null}
      {callbackState === "done" ? (
        <p style={{ margin: 0, fontSize: 14, color: tone === "hero" || tone === "dark" ? "#86EFAC" : "#047857" }}>
          Request received. An agent will be in touch.
        </p>
      ) : null}
    </div>
  );
}


