"use client";

import { useState } from "react";

interface RevealedDraft {
  metadata: Record<string, unknown>;
  dealSnapshot: Record<string, unknown>;
  contact: Record<string, unknown>;
  travelers: Record<string, unknown>[];
  cabins: Record<string, unknown>[];
  decisions: Record<string, unknown>;
  fallbackCallKey?: Record<string, unknown>;
}

interface GuestInfoPanelProps {
  draft: RevealedDraft;
}

function s(val: unknown): string {
  return typeof val === "string" ? val : val != null ? String(val) : "";
}

function Field({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="flex justify-between py-0.5">
      <span className="text-slate-500">{label}</span>
      <span className="text-slate-200 font-medium text-right">{value}</span>
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-slate-900 rounded-lg border border-slate-800 p-4">
      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">{title}</h3>
      <div className="space-y-0.5 text-xs">{children}</div>
    </div>
  );
}

export function GuestInfoPanel({ draft }: GuestInfoPanelProps) {
  const [copied, setCopied] = useState<string | null>(null);

  const contact = draft.contact;
  const deal = draft.dealSnapshot;
  const meta = draft.metadata;
  const travelers = draft.travelers;
  const decisions = draft.decisions;

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(label);
      setTimeout(() => setCopied(null), 1500);
    });
  };

  const firstName = s(contact.firstName);
  const email = s(contact.email);
  const phone = s(contact.phoneE164) || s(contact.phone);

  return (
    <div className="space-y-4">
      {/* Contact Info */}
      <SectionCard title="Guest Contact">
        <Field label="Name" value={firstName} />
        <div className="flex justify-between py-0.5 items-center">
          <span className="text-slate-500">Email</span>
          <div className="flex items-center gap-2">
            <span className="text-slate-200 font-medium">{email}</span>
            {email && (
              <button
                onClick={() => copyToClipboard(email, "email")}
                className="text-[10px] text-sky-400 hover:text-sky-300"
              >
                {copied === "email" ? "✓" : "copy"}
              </button>
            )}
          </div>
        </div>
        <div className="flex justify-between py-0.5 items-center">
          <span className="text-slate-500">Phone</span>
          <div className="flex items-center gap-2">
            <span className="text-slate-200 font-medium">{phone}</span>
            {phone && (
              <button
                onClick={() => copyToClipboard(phone, "phone")}
                className="text-[10px] text-sky-400 hover:text-sky-300"
              >
                {copied === "phone" ? "✓" : "copy"}
              </button>
            )}
          </div>
        </div>
        <Field label="Preferred Channel" value={s(contact.preferredChannel)} />
      </SectionCard>

      {/* Deal Info */}
      <SectionCard title="Deal / Cruise">
        <Field label="Cruise Line" value={s(deal.cruiseLine)} />
        <Field label="Ship" value={s(deal.ship)} />
        <Field label="Sailing Date" value={s(deal.sailingDateIso).slice(0, 10)} />
        <Field label="Nights" value={s(deal.nights)} />
        <Field label="Departure Port" value={s(deal.departurePort)} />
        <Field label="Itinerary" value={s(deal.itineraryLabel)} />
        <Field label="Deal Angle" value={s(deal.dealAngle)} />
        <Field label="Price Display" value={s(deal.priceDisplay)} />
        <Field label="Tax/Fee Basis" value={s(deal.taxFeeBasis)} />
        <Field label="Price Captured" value={s(deal.priceCapturedAtIso).slice(0, 10)} />
      </SectionCard>

      {/* Travelers */}
      {travelers.length > 0 && (
        <SectionCard title={`Travelers (${travelers.length})`}>
          {travelers.map((t, i) => {
            const isPrimary = t.isPrimary === true || s(t.isPrimary) === "true";
            const name = [s(t.legalFirstName), s(t.legalLastName)].filter(Boolean).join(" ") || s(t.firstName) || `Traveler ${i + 1}`;
            return (
              <div key={i} className="py-2 border-b border-slate-800 last:border-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-slate-200 font-medium text-sm">
                    {i + 1}. {name}
                  </span>
                  {isPrimary && (
                    <span className="text-[10px] bg-emerald-900/50 text-emerald-300 px-1.5 py-0.5 rounded">Primary</span>
                  )}
                </div>
                <div className="pl-4 space-y-0.5">
                  <Field label="DOB" value={s(t.dateOfBirth)} />
                  <Field label="Age at Sailing" value={s(t.ageAtSailing)} />
                  <Field label="Nationality" value={s(t.nationality)} />
                  <Field label="Title" value={s(t.title)} />
                  <Field label="Gender" value={s(t.supplierGender)} />
                  <Field label="Email" value={s(t.email)} />
                  <Field label="Phone" value={s(t.phone)} />
                  <Field label="Loyalty #" value={s(t.loyaltyNumber)} />
                  {s(t.accessibilityNeeds) && <Field label="Accessibility" value={s(t.accessibilityNeeds)} />}
                  {s(t.dietaryNeeds) && <Field label="Dietary" value={s(t.dietaryNeeds)} />}
                </div>
              </div>
            );
          })}
        </SectionCard>
      )}

      {/* Address (from primary traveler or metadata) */}
      {travelers.length > 0 && (
        <SectionCard title="Mailing Address">
          <Field label="Address" value={s(travelers[0].addressLine1)} />
          <Field label="Apt/Suite" value={s(travelers[0].addressLine2)} />
          <Field label="City" value={s(travelers[0].addressCity)} />
          <Field label="State" value={s(travelers[0].addressState)} />
          <Field label="ZIP" value={s(travelers[0].addressPostalCode)} />
          <Field label="Country" value={s(travelers[0].addressCountry) || s(travelers[0].residencyCountry)} />
        </SectionCard>
      )}

      {/* Insurance Callout — prominent when guest wants to discuss */}
      {(() => {
        const insurance = s(decisions.travelInsuranceDecision);
        if (!insurance) return null;
        const wantsDiscussion = insurance.toLowerCase().includes("discuss") || insurance.toLowerCase().includes("yes");
        return (
          <div className={`rounded-lg border p-4 ${wantsDiscussion ? "border-amber-700/50 bg-amber-950/30" : "border-slate-800 bg-slate-900"}`}>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: wantsDiscussion ? "#fbbf24" : "#94a3b8" }}>
                Insurance Request
              </span>
              {wantsDiscussion && (
                <span className="text-[10px] bg-amber-900/60 text-amber-300 px-1.5 py-0.5 rounded font-medium">
                  Ask about this on the call
                </span>
              )}
            </div>
            <p className="text-sm text-slate-200 font-medium">{insurance}</p>
          </div>
        );
      })()}

      {/* Decisions */}
      <SectionCard title="Decisions & Consents">
        <Field label="Packet Storage Consent" value={s(decisions.packetStorageConsent) === "true" ? "Yes" : "No"} />
        <Field label="Passenger Review Confirmed" value={s(decisions.passengerDataReviewConfirmed) === "true" ? "Yes" : "No"} />
        <Field label="Insurance Decision" value={s(decisions.travelInsuranceDecision)} />
        <Field label="Call Disclosure Ack" value={s(decisions.callDisclosureAcknowledgedAtIso).slice(0, 10)} />
      </SectionCard>

      {/* Draft Metadata */}
      <SectionCard title="Draft Status">
        <Field label="Draft ID" value={s(meta.bookingDraftId)} />
        <Field label="Status" value={s(meta.status)} />
        <Field label="Version" value={s(meta.version)} />
        <Field label="Packet Version" value={s(meta.packetVersion)} />
        <Field label="Created" value={s(meta.createdAtIso).slice(0, 10)} />
        <Field label="Last Guest Activity" value={s(meta.lastGuestActivityAtIso).slice(0, 10)} />
        <Field label="Call Key State" value={s(meta.callKeyState)} />
      </SectionCard>
    </div>
  );
}
