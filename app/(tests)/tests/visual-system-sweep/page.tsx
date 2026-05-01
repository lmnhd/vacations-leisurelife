import { buildDesignedAdRenderSpecs } from "@/lib/campaigns/design-system/ad-templates";
import type { NicheTokens } from "@/lib/campaigns/design-system/types";

const MOCK_BASE: Omit<NicheTokens, "system"> = {
  headline: "The Sea, in 33\u2153",
  italicWord: "33\u2153",
  subhead: "Eleven nights, six listening rooms, one analog cruise.",
  vesselName: "M.S. Cote du Son",
  route: "Eastern Caribbean",
  departure: "2026-11-07",
  issueLabel: "Voyage 01",
  sectionLabels: [
    "Sailaway Set",
    "Vinyl Lounge",
    "After Hours",
    "Dance Deck",
    "Backbeat Notes",
  ],
  quote: "A cruise for people who still flip the record.",
  quoteCite: "Resident DJ",
  cta: "Reserve a cabin",
  accentHex: "#ff5a3d",
  nicheVocabulary: [
    "vinyl",
    "analog",
    "listening",
    "after hours",
    "sailaway",
  ],
  energyProfile: "energetic",
  energyMode: "nostalgic_kinetic",
  visualTempo: "upbeat, after-hours, amber-lit, sea-air social energy",
  propSignals: ["record sleeve", "guitar pick", "retro sunglasses"],
  momentSignals: [
    "music heard from nearby deck",
    "after-hours lounge energy",
    "vinyl listening table by the sea",
  ],
  antiMood: ["spa retreat", "breakfast balcony"],
  alignmentSummary: "Energetic music cruise with analog culture.",
};

const SYSTEMS: { key: NicheTokens["system"]; label: string; desc: string }[] = [
  {
    key: "system_1_editorial",
    label: "System 1 — Editorial Magazine",
    desc: "Premium, intellectual niches. Masthead, serif typography, editorial restraint.",
  },
  {
    key: "system_2_nostalgia",
    label: "System 2 — Travel Nostalgia",
    desc: "Warm, sentimental niches. Postcard borders, stamps, handwritten notes, paper artifacts.",
  },
  {
    key: "system_3_zine",
    label: "System 3 — Indie Zine",
    desc: "Subcultural, fandom niches. Polaroid collages, masking tape, marker scribbles.",
  },
  {
    key: "system_4_modular",
    label: "System 4 — Modern Brand",
    desc: "Base system. Dark mode, type-driven, minimal photography, confident sans.",
  },
];

function SpecCard({
  kind,
  width,
  height,
  tags,
  sourceImage,
}: {
  kind: string;
  width: number;
  height: number;
  tags: string[];
  sourceImage?: boolean;
}) {
  const aspect = width / height;
  const aspectLabel =
    aspect > 1.8
      ? "Wide"
      : aspect > 1.1
        ? "Landscape"
        : aspect < 0.6
          ? "Portrait"
          : "Square";

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-slate-200">{kind}</span>
        <span className="text-[10px] text-slate-400">
          {width}×{height}
        </span>
      </div>
      <div
        className="rounded border border-slate-600 bg-slate-900 mb-2"
        style={{ aspectRatio: `${width} / ${height}` }}
      />
      <div className="flex flex-wrap gap-1">
        {tags.slice(1).map((t) => (
          <span
            key={t}
            className="text-[9px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-300"
          >
            {t}
          </span>
        ))}
      </div>
      <div className="mt-1.5 text-[10px] text-slate-500">
        {aspectLabel} · {sourceImage ? "needs source image" : "text only"}
      </div>
    </div>
  );
}

function SystemSection({
  system,
  label,
  desc,
}: {
  system: NicheTokens["system"];
  label: string;
  desc: string;
}) {
  const tokens: NicheTokens = { ...MOCK_BASE, system };
  const specs = buildDesignedAdRenderSpecs(tokens, [], []);

  return (
    <div className="mb-12">
      <div className="flex items-baseline gap-3 mb-2">
        <h2 className="text-lg font-semibold text-slate-100">{label}</h2>
        <span className="text-xs text-slate-500">
          {specs.length} template(s)
        </span>
      </div>
      <p className="text-sm text-slate-400 mb-4">{desc}</p>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {specs.map((spec) => (
          <SpecCard
            key={spec.assetId}
            kind={spec.kind}
            width={spec.width}
            height={spec.height}
            tags={spec.tags}
            sourceImage={!!spec.sourceImage}
          />
        ))}
      </div>
    </div>
  );
}

export default function VisualSystemSweepPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-6">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-xl font-bold mb-1">
          Visual System Template Sweep
        </h1>
        <p className="text-sm text-slate-400 mb-8">
          Preview the template spec set generated for each visual system family.
        </p>

        {SYSTEMS.map((s) => (
          <SystemSection
            key={s.key}
            system={s.key}
            label={s.label}
            desc={s.desc}
          />
        ))}
      </div>
    </div>
  );
}
