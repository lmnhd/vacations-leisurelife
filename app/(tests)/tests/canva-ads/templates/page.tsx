import Link from 'next/link';
import { TemplateRegistryWorkbench } from './template-registry-workbench';

const templateChecklist = [
  'Create the visual design in Canva, then import it into Templated.io.',
  'Rename every replaceable layer in Templated.io to a stable variable name.',
  'Generate one manual render in Templated.io to prove the layer names work.',
  'Collect the template id, dimensions, format, visual flavor, layout description, and slot rules.',
  'Add the entry to lib/ads/template-registry/templates.json.',
  'Run Copy Forge from /tests/canva-ads and verify the quality gate before promoting the template.',
];

const metadataFields = [
  { field: 'workflow', example: 'group_campaign', note: 'Top-level registry bucket. Current values: group_campaign or cb_deal.' },
  { field: 'visualFlavor', example: 'travel_nostalgia', note: 'Creative family. This is reusable style language, not the campaign niche.' },
  { field: 'format', example: 'story_reel', note: 'Ad placement shape. Current values: story_reel, ig_square, fb_google_display, carousel.' },
  { field: 'templated_id', example: 'b7e3e02a-aa6f-4c56-a95d-70ecf8c03f2e', note: 'Templated.io template id from the editor URL.' },
  { field: 'dimensions', example: '{ "width": 1080, "height": 1920 }', note: 'Pixel dimensions of the rendered output.' },
  { field: 'pages', example: '4', note: 'Only needed for carousel or multi-page templates.' },
  { field: 'layout.description', example: 'Vertical film strip collage...', note: 'One plain-English anatomy sentence used by Copy Forge.' },
];

const textSlotFields = [
  { field: 'name', example: 'headline', note: 'Must exactly match the Templated.io variable layer.' },
  { field: 'type', example: 'text', note: 'Use text for headline, subhead, microcopy, cta, labels, etc.' },
  { field: 'visualOrder', example: '8', note: 'Reading/composition order from earliest/smallest cue to final sales message.' },
  { field: 'zone', example: 'overlay', note: 'One of header, hero, tile_grid, body, footer, overlay.' },
  { field: 'maxChars', example: '18', note: 'Hard limit for the specific visual box.' },
  { field: 'maxWords', example: '3', note: 'Prevents awkward wrapping even when character count passes.' },
  { field: 'maxLines', example: '2', note: 'Maximum safe lines in the visual layer.' },
  { field: 'copyRole', example: 'Large red emotional hook', note: 'What this slot is supposed to do creatively.' },
  { field: 'copyInstruction', example: 'Use 1-2 punchy words. No logistics.', note: 'Specific instruction sent to Copy Forge.' },
  { field: 'disallow', example: '["date", "port", "ship", "route"]', note: 'Terms or content classes that must not appear in this slot.' },
];

const imageSlotFields = [
  { field: 'name', example: 'hero_image', note: 'Must exactly match the Templated.io variable layer.' },
  { field: 'type', example: 'image', note: 'Use image for all URL-backed image layers.' },
  { field: 'visualOrder', example: '3', note: 'Composition order, not necessarily layer stack order.' },
  { field: 'zone', example: 'hero', note: 'One of header, hero, tile_grid, body, footer, overlay.' },
  { field: 'copyRole', example: 'Primary human niche moment', note: 'Narrative purpose of this image slot.' },
  { field: 'copyInstruction', example: 'Prioritize a person doing the niche activity.', note: 'Guides Copy Forge image directives.' },
  { field: 'preferredAssetTypes', example: '["hero", "scene_image", "still"]', note: 'Asset pools the renderer should prefer for this slot.' },
];

const slotNames = [
  'headline',
  'subhead',
  'microcopy',
  'cta',
  'background-image',
  'hero_image',
  'tile_image_1',
  'tile_image_2',
  'tile_image_3',
  'tile_image_4',
];

const sampleJson = `{
  "story_reel": {
    "templated_id": "PASTE_TEMPLATE_ID_HERE",
    "templated_id_previous": null,
    "dimensions": { "width": 1080, "height": 1920 },
    "layout": {
      "description": "Vertical film strip collage: left stacked image strip, full-canvas atmospheric background, large hero image, oversized short theme headline on gray overlay, compact theme promise beneath, tiny sensory label near the lower overlay.",
      "slotDescriptors": [
        {
          "name": "headline",
          "type": "text",
          "visualOrder": 8,
          "zone": "overlay",
          "maxChars": 18,
          "maxWords": 3,
          "maxLines": 2,
          "copyRole": "Large emotional hook.",
          "copyInstruction": "Use 1-2 punchy words. No dates, ports, ship names, or route names.",
          "disallow": ["date", "port", "ship", "route"]
        },
        {
          "name": "hero_image",
          "type": "image",
          "visualOrder": 3,
          "zone": "hero",
          "copyRole": "Primary human niche moment.",
          "copyInstruction": "Prioritize a person doing or preparing for the niche activity.",
          "preferredAssetTypes": ["hero", "scene_image", "still"]
        }
      ]
    }
  }
}`;

function FieldTable({
  rows,
}: {
  rows: Array<{ field: string; example: string; note: string }>;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/70">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-900/90 text-xs uppercase tracking-[0.18em] text-slate-500">
          <tr>
            <th className="px-4 py-3">Field</th>
            <th className="px-4 py-3">Example</th>
            <th className="px-4 py-3">Why It Matters</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {rows.map((row) => (
            <tr key={row.field} className="align-top">
              <td className="px-4 py-3 font-mono text-cyan-200">{row.field}</td>
              <td className="px-4 py-3 font-mono text-[12px] text-emerald-200">{row.example}</td>
              <td className="px-4 py-3 leading-relaxed text-slate-300">{row.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function CanvaTemplateGuidePage() {
  return (
    <main className="mx-auto max-w-6xl space-y-8 px-6 py-10 text-slate-100">
      <header className="overflow-hidden rounded-3xl border border-cyan-400/20 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.20),transparent_32%),linear-gradient(135deg,rgba(15,23,42,0.96),rgba(2,6,23,0.98))] p-7 shadow-2xl shadow-cyan-950/30">
        <div className="mb-5 flex flex-wrap gap-3 text-xs font-semibold uppercase tracking-[0.22em] text-cyan-200">
          <Link href="/tests" className="rounded-full border border-cyan-400/30 px-3 py-1 hover:bg-cyan-400/10">
            Test Lab
          </Link>
          <Link href="/tests/canva-ads" className="rounded-full border border-cyan-400/30 px-3 py-1 hover:bg-cyan-400/10">
            Canva Ads Audition
          </Link>
        </div>
        <p className="text-sm uppercase tracking-[0.35em] text-cyan-200/80">Canva / Templated Registry Workbench</p>
        <h1 className="mt-3 max-w-4xl text-4xl font-black tracking-tight text-white md:text-5xl">
          Everything needed before adding a new template to templates.json.
        </h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-slate-300">
          Design the template visually first. Then use this page to collect the metadata Copy Forge and Render Pack need:
          layout anatomy, text budgets, image roles, asset preferences, and the exact Templated.io slot names.
        </p>
      </header>

      <TemplateRegistryWorkbench />

      <section className="grid gap-4 md:grid-cols-3">
        {[
          ['1. Design', 'Build the Canva layout and import it into Templated.io.'],
          ['2. Describe', 'Write the plain-English layout sentence and slot-by-slot creative roles.'],
          ['3. Register', 'Add the template id and slot descriptors to templates.json, then audition it.'],
        ].map(([title, body]) => (
          <div key={title} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <h2 className="text-lg font-bold text-white">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">{body}</p>
          </div>
        ))}
      </section>

      <section className="rounded-3xl border border-amber-400/20 bg-amber-950/20 p-6">
        <h2 className="text-xl font-bold text-amber-100">Important Production Reality</h2>
        <p className="mt-3 text-sm leading-7 text-amber-50/85">
          The registry can grow to many templates, but today the code primarily looks up a template by
          <span className="mx-1 font-mono text-amber-100">(workflow, visualFlavor, format)</span>.
          For the orchestrator to independently choose among several viable templates for the same format, we should add
          a selector step that scores templates by campaign niche, available image inventory, platform need, and template
          metadata. In other words: your assumption is directionally right, but it needs an explicit template-selection
          layer before it is truly autonomous.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Template Creation Checklist</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {templateChecklist.map((item, index) => (
            <div key={item} className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4">
              <span className="font-mono text-xs text-cyan-300">STEP {index + 1}</span>
              <p className="mt-2 text-sm leading-6 text-slate-300">{item}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Registry Metadata</h2>
        <FieldTable rows={metadataFields} />
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Text Slot Fields</h2>
        <FieldTable rows={textSlotFields} />
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Image Slot Fields</h2>
        <FieldTable rows={imageSlotFields} />
      </section>

      <section className="grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-3xl border border-slate-800 bg-slate-950/80 p-6">
          <h2 className="text-xl font-bold text-white">Recommended Layer Names</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Use boring, stable names. The visual design can be fabulous; the variable names should be predictable.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            {slotNames.map((name) => (
              <span key={name} className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 font-mono text-xs text-cyan-100">
                {name}
              </span>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-800 bg-slate-950/80 p-6">
          <h2 className="text-xl font-bold text-white">Description Formula</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            One sentence is enough if it explains the composition clearly. Do not mention the campaign niche unless the
            template truly only works for that niche.
          </p>
          <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-900 p-4 font-mono text-sm leading-6 text-emerald-200">
            [overall layout]: [major image areas], [text hierarchy], [where the primary promise lands], [special visual rhythm].
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Starter JSON</h2>
        <pre className="overflow-x-auto rounded-3xl border border-slate-800 bg-black/80 p-5 text-xs leading-6 text-slate-200">
          <code>{sampleJson}</code>
        </pre>
      </section>
    </main>
  );
}
