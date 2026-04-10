import Link from 'next/link';

interface TestLink {
  label: string;
  href: string;
  description: string;
  badge?: string;
}

interface TestGroup {
  title: string;
  icon: string;
  color: string;
  borderColor: string;
  badgeColor: string;
  links: TestLink[];
}

const GROUPS: TestGroup[] = [
  {
    title: 'Campaign Discovery',
    icon: '🔍',
    color: 'text-sky-400',
    borderColor: 'border-sky-500/30',
    badgeColor: 'bg-sky-500/10 text-sky-300 border-sky-500/30',
    links: [
      {
        label: 'Groups Discovery',
        href: '/tests/groups/discovery',
        description: 'Phase B campaign pipeline — pricing status, launch window assessment, campaign refs',
      },
    ],
  },
  {
    title: 'Brief & Creative Strategy',
    icon: '✍️',
    color: 'text-violet-400',
    borderColor: 'border-violet-500/30',
    badgeColor: 'bg-violet-500/10 text-violet-300 border-violet-500/30',
    links: [
      {
        label: 'Brief Studio',
        href: '/tests/brief-studio',
        description: 'Generate, validate, auto-fix and approve campaign briefs via the Brief Engine orchestrator',
      },
      {
        label: 'Trinity Agent',
        href: '/tests/trinity',
        description: 'Designer → Builder → Reviewer agent pipeline — test structured brief generation & revision',
      },
      {
        label: 'Production Bible',
        href: '/tests/production-bible',
        description: 'Generate storyboard, shot sequence, still library and production bible for a campaign',
      },
      {
        label: 'Aesthetic Devising',
        href: '/tests/aesthetic-devising',
        description: 'Aesthetic concept generation pipeline (archived — superseded by Brief Studio)',
        badge: 'ARCHIVED',
      },
    ],
  },
  {
    title: 'Media Generation',
    icon: '🎬',
    color: 'text-emerald-400',
    borderColor: 'border-emerald-500/30',
    badgeColor: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
    links: [
      {
        label: 'Media Generation',
        href: '/tests/media-generation',
        description: 'Full campaign media pipeline — stills, clips, merch, music. Approval controls inline',
      },
      {
        label: 'Video Model Lab',
        href: '/tests/video-model-lab',
        description: 'Compare video models (RunwayML etc.) on the same source frame — promote winner to shared preference',
      },
      {
        label: 'RunwayML Direct',
        href: '/tests/runway-test',
        description: 'Direct RunwayML image→video generation test outside the full media pipeline',
      },
      {
        label: 'Music Generation',
        href: '/tests/musicgen',
        description: 'Generate ambient/cinematic audio via Replicate from a custom prompt',
      },
      {
        label: 'Theme Music Library',
        href: '/tests/theme-music-library',
        description: 'Bulk upload, tag, and manage the shared theme music library for campaigns',
      },
    ],
  },
  {
    title: 'Distribution & Ads',
    icon: '📢',
    color: 'text-amber-400',
    borderColor: 'border-amber-500/30',
    badgeColor: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
    links: [
      {
        label: 'Social Distribution',
        href: '/tests/distribution',
        description: 'Plan and dispatch campaign posts across platforms — simulate or live mode',
      },
      {
        label: 'TikTok Submission',
        href: '/tests/tiktok-submission',
        description: 'TikTok ad submission — provider auth status, video upload, ad creation',
      },
      {
        label: 'Campaign Landing Preview',
        href: '/tests/campaign-landing',
        description: 'Preview a campaign landing page by slug — append /[slug] to the URL',
        badge: 'NEEDS SLUG',
      },
    ],
  },
  {
    title: 'Chat & Voice',
    icon: '🎙️',
    color: 'text-cyan-400',
    borderColor: 'border-cyan-500/30',
    badgeColor: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30',
    links: [
      {
        label: 'Hero Chat',
        href: '/tests/hero-chat',
        description: 'Full Hero Chat UI — text-based cruise assistant with tool calls',
      },
      {
        label: 'Chat Pipeline',
        href: '/tests/chat-pipeline',
        description: 'Chat pipeline test bench — model selector, context dropdown, raw pipeline output',
      },
      {
        label: 'Hybrid Voice',
        href: '/tests/voice-hybrid',
        description: 'Realtime API STT → /api/chat reasoning → TTS playback. WebRTC mic required',
      },
      {
        label: 'Voice Pipeline',
        href: '/tests/voice-pipeline',
        description: 'End-to-end mic → WebRTC → STT → pipeline → TTS validation. No Hero Chat canvas',
      },
      {
        label: 'Voice Tool Simulator',
        href: '/tests/voice-simulator',
        description: 'Inject messages directly into the Realtime data channel — no mic needed',
      },
      {
        label: 'Chat Simulator Viewer',
        href: '/tests/sim-viewer',
        description: 'Run automated chat simulation across multiple GPT models, compare tool call behaviour',
      },
    ],
  },
  {
    title: 'Dev Utilities',
    icon: '🛠️',
    color: 'text-rose-400',
    borderColor: 'border-rose-500/30',
    badgeColor: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
    links: [
      {
        label: 'Prompt Preview',
        href: '/tests/prompt-preview',
        description: 'Inspect the fully-assembled system prompt for a given session ID and channel',
      },
      {
        label: 'Package Card Builder',
        href: '/tests/package-builder',
        description: 'Render and test the PackageCard chat UI component with custom JSON payload',
      },
    ],
  },
];

export default function TestsIndexPage() {
  return (
    <div className="max-w-5xl mx-auto px-6 py-10 space-y-10">
      {/* Page header */}
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-white tracking-tight">Test Lab Index</h1>
        <p className="text-sm text-slate-400">
          All {GROUPS.flatMap((g) => g.links).length} test pages organised by workflow stage.
        </p>
      </div>

      {/* Groups */}
      {GROUPS.map((group) => (
        <section key={group.title} className="space-y-3">
          {/* Group header */}
          <div className="flex items-center gap-2 pb-1 border-b border-white/5">
            <span className="text-base">{group.icon}</span>
            <h2 className={`text-sm font-semibold uppercase tracking-widest ${group.color}`}>
              {group.title}
            </h2>
          </div>

          {/* Links grid */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {group.links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`group flex flex-col gap-2 rounded-xl border ${group.borderColor} bg-slate-900/60 p-4 hover:bg-slate-800/70 transition-colors`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className={`text-sm font-semibold ${group.color} group-hover:underline`}>
                    {link.label}
                  </span>
                  {link.badge && (
                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${group.badgeColor}`}>
                      {link.badge}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">{link.description}</p>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
