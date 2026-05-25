'use client';

import { useMemo, useState } from 'react';

type SlotKind = 'text' | 'image' | 'color';
type SlotZone = 'header' | 'hero' | 'tile_grid' | 'body' | 'footer' | 'overlay';
type AdFormat =
  | 'meta_feed_square'
  | 'meta_feed_portrait'
  | 'meta_story_reel'
  | 'meta_carousel_square'
  | 'google_display_landscape'
  | 'google_display_square'
  | 'google_display_vertical'
  | 'ig_square'
  | 'fb_google_display'
  | 'story_reel'
  | 'carousel';
type Workflow = 'group_campaign' | 'cb_deal';
type AssetType = 'scene_image' | 'ship_reference' | 'hero' | 'aesthetic_concept' | 'still' | 'merch';

interface SlotDraft {
  name: string;
  type: SlotKind;
  visualOrder: number;
  zone: SlotZone;
  maxChars?: number;
  maxWords?: number;
  maxLines?: number;
  copyRole?: string;
  copyInstruction?: string;
  disallow?: string[];
  preferredAssetTypes?: AssetType[];
}

interface TemplateAnalysis {
  layoutDescription: string;
  suggestedFormat?: AdFormat;
  suggestedDimensions?: { width: number; height: number };
  visualFlavorNotes?: string;
  slotDescriptors: SlotDraft[];
  warnings: string[];
}

const zones: SlotZone[] = ['header', 'hero', 'tile_grid', 'body', 'footer', 'overlay'];
const slotTypes: SlotKind[] = ['text', 'image', 'color'];
const assetTypes: AssetType[] = ['hero', 'scene_image', 'still', 'aesthetic_concept', 'ship_reference', 'merch'];

const formatOptions: Array<{ id: AdFormat; label: string; legacy?: boolean }> = [
  { id: 'meta_feed_square', label: 'Meta feed square 1:1' },
  { id: 'meta_feed_portrait', label: 'Meta feed portrait 4:5' },
  { id: 'meta_story_reel', label: 'Meta story/reel 9:16' },
  { id: 'meta_carousel_square', label: 'Meta carousel square cards 1:1' },
  { id: 'google_display_landscape', label: 'Google display landscape 1.91:1' },
  { id: 'google_display_square', label: 'Google display square 1:1' },
  { id: 'google_display_vertical', label: 'Google display vertical 9:16' },
  { id: 'story_reel', label: 'Legacy story_reel', legacy: true },
  { id: 'ig_square', label: 'Legacy ig_square', legacy: true },
  { id: 'fb_google_display', label: 'Legacy fb_google_display', legacy: true },
  { id: 'carousel', label: 'Legacy carousel', legacy: true },
];

const sizePresets: Array<{
  format: AdFormat;
  label: string;
  platform: string;
  ratio: string;
  width: number;
  height: number;
  note: string;
}> = [
  { format: 'meta_feed_square', label: 'Meta feed square', platform: 'Meta', ratio: '1:1', width: 1080, height: 1080, note: 'Use for Facebook/Instagram feed square placements.' },
  { format: 'meta_feed_portrait', label: 'Meta feed portrait', platform: 'Meta', ratio: '4:5', width: 1080, height: 1350, note: 'Use when you want more vertical feed real estate.' },
  { format: 'meta_story_reel', label: 'Meta story/reel', platform: 'Meta', ratio: '9:16', width: 1080, height: 1920, note: 'Full-screen Stories/Reels canvas.' },
  { format: 'meta_carousel_square', label: 'Meta carousel card', platform: 'Meta', ratio: '1:1', width: 1080, height: 1080, note: 'One square card in a carousel sequence.' },
  { format: 'google_display_landscape', label: 'Google display landscape', platform: 'Google', ratio: '1.91:1', width: 1200, height: 628, note: 'Responsive Display horizontal image.' },
  { format: 'google_display_square', label: 'Google display square', platform: 'Google', ratio: '1:1', width: 1200, height: 1200, note: 'Responsive Display square image.' },
  { format: 'google_display_vertical', label: 'Google display vertical', platform: 'Google', ratio: '9:16', width: 900, height: 1600, note: 'Responsive Display vertical image.' },
];

const starterSlot: SlotDraft = {
  name: 'headline',
  type: 'text',
  visualOrder: 1,
  zone: 'overlay',
  maxChars: 24,
  maxWords: 4,
  maxLines: 2,
  copyRole: 'Primary emotional hook.',
  copyInstruction: 'Use compact campaign-specific theme language. No logistics.',
  disallow: ['date', 'port', 'ship', 'route'],
};

function splitList(value: string): string[] | undefined {
  const items = value.split(',').map((item) => item.trim()).filter(Boolean);
  return items.length > 0 ? items : undefined;
}

function numberOrUndefined(value: FormDataEntryValue | null): number | undefined {
  const raw = String(value ?? '').trim();
  if (!raw) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function fileToBase64(file: File): Promise<{ base64: string; mimeType: string; previewUrl: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Unable to read image file.'));
    reader.onload = () => {
      const result = String(reader.result ?? '');
      const [, payload = ''] = result.split(',');
      resolve({ base64: payload, mimeType: file.type || 'image/png', previewUrl: result });
    };
    reader.readAsDataURL(file);
  });
}

function cleanSlot(slot: SlotDraft): SlotDraft {
  return {
    name: slot.name.trim(),
    type: slot.type,
    visualOrder: slot.visualOrder,
    zone: slot.zone,
    ...(slot.maxChars ? { maxChars: slot.maxChars } : {}),
    ...(slot.maxWords ? { maxWords: slot.maxWords } : {}),
    ...(slot.maxLines ? { maxLines: slot.maxLines } : {}),
    ...(slot.copyRole?.trim() ? { copyRole: slot.copyRole.trim() } : {}),
    ...(slot.copyInstruction?.trim() ? { copyInstruction: slot.copyInstruction.trim() } : {}),
    ...(slot.disallow?.length ? { disallow: slot.disallow } : {}),
    ...(slot.preferredAssetTypes?.length ? { preferredAssetTypes: slot.preferredAssetTypes } : {}),
  };
}

export function TemplateRegistryWorkbench() {
  const [workflow, setWorkflow] = useState<Workflow>('group_campaign');
  const [visualFlavor, setVisualFlavor] = useState('travel_nostalgia');
  const [format, setFormat] = useState<AdFormat>('meta_story_reel');
  const [templateId, setTemplateId] = useState('');
  const [width, setWidth] = useState(1080);
  const [height, setHeight] = useState(1920);
  const [pages, setPages] = useState<number | undefined>();
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [slots, setSlots] = useState<SlotDraft[]>([starterSlot]);
  const [image, setImage] = useState<{ base64: string; mimeType: string; previewUrl: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [mode, setMode] = useState<'append' | 'update'>('append');

  const registryEntry = useMemo(() => {
    const entry: Record<string, unknown> = {
      templated_id: templateId.trim(),
      templated_id_previous: null,
      dimensions: { width, height },
      layout: {
        description: description.trim(),
        slotDescriptors: slots.map(cleanSlot),
      },
    };
    if (pages && pages > 0) entry.pages = pages;
    return entry;
  }, [description, height, pages, slots, templateId, width]);

  const registryJson = useMemo(() => JSON.stringify({
    [format]: registryEntry,
  }, null, 4), [format, registryEntry]);

  async function handleFile(file: File | null) {
    if (!file) return;
    setError(null);
    setImage(await fileToBase64(file));
  }

  async function analyze() {
    if (!image) {
      setError('Upload or paste a template screenshot first.');
      return;
    }
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch('/api/ads/templates/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: { base64: image.base64, mimeType: image.mimeType },
          context: {
            templateId,
            format,
            dimensions: `${width}x${height}`,
            visualFlavor,
            notes,
          },
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? 'Analysis failed.');
      const analysis = payload.analysis as TemplateAnalysis;
      setDescription(analysis.layoutDescription);
      if (analysis.suggestedFormat) setFormat(analysis.suggestedFormat);
      if (analysis.suggestedDimensions) {
        setWidth(analysis.suggestedDimensions.width);
        setHeight(analysis.suggestedDimensions.height);
      }
      setSlots(analysis.slotDescriptors);
      setWarnings(analysis.warnings ?? []);
      setMessage(`Image analysis complete using ${payload.modelId}. Review before saving.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed.');
    } finally {
      setLoading(false);
    }
  }

  async function saveRegistry() {
    if (!templateId.trim()) {
      setError('Paste the Templated.io template id before saving. It is the UUID in the editor URL.');
      return;
    }
    if (!description.trim()) {
      setError('Add or generate a layout description before saving.');
      return;
    }
    if (slots.some((slot) => !slot.name.trim())) {
      setError('Every slot needs a layer name before saving.');
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch('/api/ads/templates/registry', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflow,
          visualFlavor,
          format,
          entry: registryEntry,
          mode,
        }),
      });
      const payload = await res.json();
      if (!res.ok) {
        const issueText = Array.isArray(payload.issues)
          ? ` ${payload.issues.map((issue: { path?: Array<string | number>; message?: string }) => {
              const path = issue.path?.join('.') ?? 'payload';
              return `${path}: ${issue.message ?? 'invalid'}`;
            }).join('; ')}`
          : '';
        throw new Error(`${payload.error ?? 'Save failed.'}${issueText}`);
      }
      setMessage(`${payload.mode === 'update' ? 'Updated' : 'Added'} ${workflow}.${visualFlavor}.${format} in templates.json.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  function updateSlot(index: number, patch: Partial<SlotDraft>) {
    setSlots((current) => current.map((slot, i) => (i === index ? { ...slot, ...patch } : slot)));
  }

  function removeSlot(index: number) {
    setSlots((current) => current.filter((_, i) => i !== index));
  }

  function applyPreset(preset: (typeof sizePresets)[number]) {
    setFormat(preset.format);
    setWidth(preset.width);
    setHeight(preset.height);
    if (preset.format !== 'meta_carousel_square') {
      setPages(undefined);
    }
  }

  return (
    <section
      className="space-y-6 rounded-3xl border border-cyan-400/20 bg-slate-950/80 p-6 shadow-2xl shadow-cyan-950/20"
      onPaste={(event) => {
        const pasted = Array.from(event.clipboardData.files).find((file) => file.type.startsWith('image/'));
        if (pasted) void handleFile(pasted);
      }}
    >
      <div>
        <p className="text-sm uppercase tracking-[0.3em] text-cyan-300">Interactive Registry Builder</p>
        <h2 className="mt-2 text-2xl font-black text-white">Paste a screenshot, let vision draft the registry, then approve the JSON.</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
          Paste or upload a Templated.io screenshot. The model proposes the layout description and slot descriptors. You edit the fields here, then append or update `templates.json` from this page.
        </p>
        <div className="mt-4 grid gap-3 text-sm md:grid-cols-2">
          <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-emerald-50">
            <strong className="text-emerald-100">Placeholder text is sizing evidence.</strong>
            <p className="mt-1 leading-6 text-emerald-50/80">
              Use nonsense or sample copy at the exact length you want final ads to hold. The analyzer uses visible wrapping and font size to estimate maxWords, maxChars, and maxLines.
            </p>
          </div>
          <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4 text-amber-50">
            <strong className="text-amber-100">Static layers should stay out of JSON.</strong>
            <p className="mt-1 leading-6 text-amber-50/80">
              Decorative shapes, page corners, masks, fixed overlays, and hidden/crossed-out layers are not registry slots unless they will be replaced by campaign data.
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-white">Exact P4 Canvas Presets</h3>
            <p className="mt-1 text-sm text-slate-400">
              Use these numbers inside Canva/Templated. Ignore misleading thumbnail sizes on the template gallery.
            </p>
          </div>
          <span className="rounded-full border border-cyan-400/30 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-cyan-100">
            width x height
          </span>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {sizePresets.map((preset) => (
            <button
              key={preset.format}
              type="button"
              onClick={() => applyPreset(preset)}
              className={`rounded-2xl border p-4 text-left transition ${format === preset.format && width === preset.width && height === preset.height
                ? 'border-cyan-300 bg-cyan-300/15'
                : 'border-slate-800 bg-slate-950/70 hover:border-cyan-400/40 hover:bg-cyan-400/10'
                }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-bold text-white">{preset.label}</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">{preset.platform} · {preset.ratio}</p>
                </div>
                <span className="font-mono text-sm font-bold text-cyan-200">{preset.width}x{preset.height}</span>
              </div>
              <p className="mt-3 text-xs leading-5 text-slate-400">{preset.note}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
        <div className="space-y-4">
          <label className="block rounded-2xl border border-dashed border-cyan-400/30 bg-cyan-400/5 p-5 text-sm text-slate-300">
            <span className="block font-semibold text-cyan-100">Upload or paste screenshot</span>
            <span className="mt-1 block text-xs text-slate-500">Best screenshot: canvas plus the Templated layer panel, like the editor screenshot with layer names and visibility eyeballs visible on the right.</span>
            <input
              type="file"
              accept="image/*"
              className="mt-4 block w-full text-xs text-slate-400 file:mr-3 file:rounded-full file:border-0 file:bg-cyan-400 file:px-3 file:py-2 file:text-xs file:font-bold file:text-slate-950"
              onChange={(event) => void handleFile(event.target.files?.[0] ?? null)}
            />
          </label>
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image.previewUrl} alt="Uploaded template screenshot" className="max-h-[360px] w-full rounded-2xl border border-slate-800 object-contain" />
          ) : (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-8 text-center text-sm text-slate-500">
              No screenshot yet. Click upload or paste from clipboard while this panel is focused.
            </div>
          )}
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Optional notes for the model: hidden layers to ignore, decorative layers like shape/page-corner, layer names I already know, intended placement, text-fit concerns..."
            className="min-h-28 w-full rounded-2xl border border-slate-800 bg-slate-950 p-3 text-sm text-slate-100 outline-none focus:border-cyan-400"
          />
          <button
            type="button"
            onClick={() => void analyze()}
            disabled={loading}
            className="w-full rounded-2xl bg-cyan-300 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? 'Analyzing Screenshot...' : 'Analyze Screenshot With Image LLM'}
          </button>
        </div>

        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Workflow
              <select value={workflow} onChange={(event) => setWorkflow(event.target.value as Workflow)} className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm normal-case tracking-normal text-white">
                <option value="group_campaign">group_campaign</option>
                <option value="cb_deal">cb_deal</option>
              </select>
            </label>
            <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Visual Flavor
              <input value={visualFlavor} onChange={(event) => setVisualFlavor(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm normal-case tracking-normal text-white" />
            </label>
            <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Format
              <select value={format} onChange={(event) => setFormat(event.target.value as AdFormat)} className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm normal-case tracking-normal text-white">
                {formatOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}{option.legacy ? ' (legacy)' : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Templated ID
              <input value={templateId} onChange={(event) => setTemplateId(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm normal-case tracking-normal text-white" />
            </label>
            <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Width
              <input type="number" value={width} onChange={(event) => setWidth(Number(event.target.value))} className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm normal-case tracking-normal text-white" />
            </label>
            <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Height
              <input type="number" value={height} onChange={(event) => setHeight(Number(event.target.value))} className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm normal-case tracking-normal text-white" />
            </label>
            <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Pages
              <input type="number" value={pages ?? ''} onChange={(event) => setPages(numberOrUndefined(event.target.value))} placeholder="carousel only" className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm normal-case tracking-normal text-white" />
            </label>
            <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Save Mode
              <select value={mode} onChange={(event) => setMode(event.target.value as 'append' | 'update')} className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm normal-case tracking-normal text-white">
                <option value="append">append new only</option>
                <option value="update">update existing</option>
              </select>
            </label>
          </div>

          <label className="block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Layout Description
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} className="mt-2 min-h-24 w-full rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm normal-case tracking-normal text-white" />
          </label>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-xl font-bold text-white">Slot Descriptors</h3>
          <button type="button" onClick={() => setSlots((current) => [...current, { ...starterSlot, visualOrder: current.length + 1 }])} className="rounded-full border border-cyan-400/30 px-3 py-1 text-xs font-bold text-cyan-100 hover:bg-cyan-400/10">
            Add Slot
          </button>
        </div>
        <div className="space-y-3">
          {slots.map((slot, index) => (
            <div key={`${slot.name}-${index}`} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
              <div className="grid gap-3 md:grid-cols-6">
                <input value={slot.name} onChange={(event) => updateSlot(index, { name: event.target.value })} placeholder="name" className="rounded-xl border border-slate-800 bg-slate-950 p-2 text-sm text-white md:col-span-2" />
                <select value={slot.type} onChange={(event) => updateSlot(index, { type: event.target.value as SlotKind })} className="rounded-xl border border-slate-800 bg-slate-950 p-2 text-sm text-white">
                  {slotTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
                <select value={slot.zone} onChange={(event) => updateSlot(index, { zone: event.target.value as SlotZone })} className="rounded-xl border border-slate-800 bg-slate-950 p-2 text-sm text-white">
                  {zones.map((zone) => <option key={zone} value={zone}>{zone}</option>)}
                </select>
                <input type="number" value={slot.visualOrder} onChange={(event) => updateSlot(index, { visualOrder: Number(event.target.value) })} className="rounded-xl border border-slate-800 bg-slate-950 p-2 text-sm text-white" />
                <button type="button" onClick={() => removeSlot(index)} className="rounded-xl border border-rose-400/30 px-3 py-2 text-xs font-bold text-rose-200 hover:bg-rose-400/10">Remove</button>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <input type="number" value={slot.maxChars ?? ''} onChange={(event) => updateSlot(index, { maxChars: numberOrUndefined(event.target.value) })} placeholder="maxChars" className="rounded-xl border border-slate-800 bg-slate-950 p-2 text-sm text-white" />
                <input type="number" value={slot.maxWords ?? ''} onChange={(event) => updateSlot(index, { maxWords: numberOrUndefined(event.target.value) })} placeholder="maxWords" className="rounded-xl border border-slate-800 bg-slate-950 p-2 text-sm text-white" />
                <input type="number" value={slot.maxLines ?? ''} onChange={(event) => updateSlot(index, { maxLines: numberOrUndefined(event.target.value) })} placeholder="maxLines" className="rounded-xl border border-slate-800 bg-slate-950 p-2 text-sm text-white" />
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <input value={slot.copyRole ?? ''} onChange={(event) => updateSlot(index, { copyRole: event.target.value })} placeholder="copyRole" className="rounded-xl border border-slate-800 bg-slate-950 p-2 text-sm text-white" />
                <input value={slot.copyInstruction ?? ''} onChange={(event) => updateSlot(index, { copyInstruction: event.target.value })} placeholder="copyInstruction" className="rounded-xl border border-slate-800 bg-slate-950 p-2 text-sm text-white" />
                <input value={(slot.disallow ?? []).join(', ')} onChange={(event) => updateSlot(index, { disallow: splitList(event.target.value) })} placeholder="disallow: date, port, ship" className="rounded-xl border border-slate-800 bg-slate-950 p-2 text-sm text-white" />
                <select multiple value={slot.preferredAssetTypes ?? []} onChange={(event) => updateSlot(index, { preferredAssetTypes: Array.from(event.target.selectedOptions).map((option) => option.value as AssetType) })} className="min-h-24 rounded-xl border border-slate-800 bg-slate-950 p-2 text-sm text-white">
                  {assetTypes.map((assetType) => <option key={assetType} value={assetType}>{assetType}</option>)}
                </select>
              </div>
            </div>
          ))}
        </div>
      </div>

      {warnings.length > 0 && (
        <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-100">
          <strong>Model warnings:</strong>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {warnings.map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
        </div>
      )}

      {error && <div className="rounded-2xl border border-rose-400/30 bg-rose-400/10 p-4 text-sm text-rose-100">{error}</div>}
      {message && <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-sm text-emerald-100">{message}</div>}

      <div className="grid gap-5 lg:grid-cols-[1fr_0.8fr]">
        <pre className="max-h-[520px] overflow-auto rounded-2xl border border-slate-800 bg-black/80 p-4 text-xs leading-6 text-slate-200">
          <code>{registryJson}</code>
        </pre>
        <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
          <h3 className="text-lg font-bold text-white">Save To templates.json</h3>
          <p className="text-sm leading-6 text-slate-400">
            This writes to <span className="font-mono text-cyan-200">lib/ads/template-registry/templates.json</span>. Use append for new templates and update when replacing an existing format entry.
          </p>
          <button
            type="button"
            onClick={() => void saveRegistry()}
            disabled={saving}
            className="w-full rounded-2xl bg-emerald-300 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? 'Saving...' : 'Append / Update Registry JSON'}
          </button>
        </div>
      </div>
    </section>
  );
}
