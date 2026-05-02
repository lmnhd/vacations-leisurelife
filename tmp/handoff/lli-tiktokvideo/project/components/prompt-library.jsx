/* global React, ReactDOM */
const { createRoot: createPromptRoot } = ReactDOM;

const PROMPTS = [
  {
    stage: 'SOURCE IMAGE',
    fmt: 'ALL FORMATS',
    label: 'Hands + tile composition',
    body: `Tight overhead crop of human fingers entering frame from bottom-right, hovering over a hexagonal wooden game tile on a dark walnut surface. Shallow depth of field, focus on the tile. Warm tungsten 2700K key light from upper-left, soft fill. Visible wood grain on table. No face. No second hand. 9:16 portrait orientation.

Negative: faces, multiple hands, full bodies, plastic surfaces, fluorescent light, smooth tabletops, modern sleek aesthetic.`,
    note: 'Use for any "relief" or "identity" hook. Most reliable composition in the library.',
  },
  {
    stage: 'SOURCE IMAGE',
    fmt: 'POV-TEXT, CONFESSION',
    label: 'Porthole + foreground game',
    body: `Cinematic 9:16 frame: foreground (lower 60%) is a wooden table with a board game in mid-play — cards laid out, dice, two meeples. Background (upper 40%) is a circular brass porthole window showing soft ocean wake at golden hour. Warm bar lighting on the table. Slight haze through porthole. Composition: rule-of-thirds, porthole upper-right.

Negative: people, full ship interior, chandeliers, marble, sterile lighting.`,
    note: 'The "ship as punchline" shot. Use as scene-setter or hard cut destination.',
  },
  {
    stage: 'SOURCE IMAGE',
    fmt: 'ASMR-AMBIENCE, LISTICLE',
    label: 'Macro dice on dark wood',
    body: `Extreme macro photograph, 9:16. Two ivory-colored six-sided dice resting on a dark stained walnut table. Single warm key light from camera-right, deep shadows. Visible micro-texture: wood grain, dice edge bevels, subtle dust. Shallow depth of field — far die slightly out of focus. No background, just black falloff.

Negative: bright lighting, plastic dice, multiple dice colors, modern surfaces, busy backgrounds.`,
    note: 'The ASMR hero shot. Pair with sharp dice-clatter audio.',
  },
  {
    stage: 'SOURCE IMAGE',
    fmt: 'POV-TEXT (group energy)',
    label: 'Crowded silhouettes around a lit table',
    body: `9:16 cinematic frame, dim lounge interior. Six to eight human silhouettes leaning over a brightly lit central table, viewed from a low angle. Faces obscured by motion blur and shadow — only shoulders, leaning torsos, hands in soft focus. Table is the only illuminated element: warm Edison-bulb glow on cards and meeples. Background: dark wood paneling, tiny ambient ship-window highlights.

Negative: visible faces, sharp focus on people, neutral or cool lighting, empty rooms, well-lit interiors.`,
    note: 'For "social" frame outputs. The blur is the feature, not a bug.',
  },
  {
    stage: 'MOTION PROMPT',
    fmt: 'POV-TEXT',
    label: 'Hand-places-meeple micro-motion',
    body: `Animate this image: a single human hand enters frame from bottom-right at 0.5x speed, fingertips approach the wooden meeple, gently set it down on the hex tile. Total motion: 1.5 seconds. Subtle handheld camera breath (0.5 degree sway). Tile lights up slightly on contact. Everything else in frame holds completely still.

Avoid: full camera moves, perspective shifts, zoom, rotating, pan, dolly.`,
    note: 'The cleanest motion the AI can deliver. Single small in-frame action.',
  },
  {
    stage: 'MOTION PROMPT',
    fmt: 'LISTICLE, ASMR',
    label: 'Dice tumble + settle',
    body: `Animate this image: two dice tumble forward across the table over 0.8 seconds, lose momentum, settle. Slight bounce on landing. Dust particles puff briefly on impact, then settle. Camera holds completely still — no zoom, no pan. Soft shadows shift naturally with the motion.

Avoid: camera movement of any kind, multiple takes, slow-motion stretching beyond 1.2x.`,
    note: 'Hits hardest at the start of a beat. Pair with a sharp clack on frame 1.',
  },
  {
    stage: 'MOTION PROMPT',
    fmt: 'POV-TEXT, CONFESSION',
    label: 'Porthole horizon drift',
    body: `Animate this image: subtle horizontal drift of the ocean wake visible through the porthole — approximately 8 pixels of horizontal pan over 4 seconds. Foreground table and game pieces remain absolutely static. Brief glint on porthole brass every 2 seconds. No camera movement.

Avoid: foreground motion, zoom, camera shake, perspective change, shifting light.`,
    note: 'Sells "we are on a moving ship" without faking a perspective change.',
  },
  {
    stage: 'MOTION PROMPT',
    fmt: 'POV-TEXT (group)',
    label: 'Crowd lean-in (no faces)',
    body: `Animate this image: silhouetted figures around the lit table sway forward by ~3 pixels in unison, then back. Two of the figures' hands enter the frame and gesture toward the board. No face animation — keep all faces in shadow throughout. Lighting on the central table flickers warmly (1 cycle per 1.5s).

Avoid: face rendering, individual figure animation, lighting changes, perspective movement.`,
    note: 'High-risk shot — review every output for face leakage and reject 6/10 attempts.',
  },
  {
    stage: 'AUDIO',
    fmt: 'POV-TEXT, CONFESSION',
    label: 'Ambient bed: lounge + ship',
    body: `Layer 1: Distant low-frequency ship hum, ~80Hz, -28dB.
Layer 2: Faint lounge murmur and clink — pre-recorded restaurant ambience, EQ rolled off above 4kHz, -22dB.
Layer 3: Music — warm low synth pad, ~70bpm, sub-bass anchored, no melody. Fade in over 1.5s, hold, fade out 0.8s before close.
Layer 4: Diegetic punctuation — wooden click on every text-card cut, -8dB.

Avoid: voiceover, narration, dialogue, lyrics, brass, strings, percussion above hi-hat.`,
    note: 'No TTS in this format. ElevenLabs is your weakest link — keep it out of POV/Confession videos.',
  },
  {
    stage: 'AUDIO',
    fmt: 'ASMR-AMBIENCE',
    label: 'Pure diegetic ASMR',
    body: `No music. No narration.
Frame 1 (dice tumble): high-quality dice-on-wood foley, sharp transient, no reverb. -6dB.
Frame 2 (cards): card-shuffle ASMR foley, close-mic\'d, paper-on-paper texture. -8dB.
Frame 3 (glass): ice-in-glass clink, glass settling on wood. -10dB.
Frame 4 (porthole): low wave wash + distant ship horn (1 long, 1 short). -16dB.
Frame 5 (logo): one final wooden click. -4dB.

Total dynamic range: aim for -16 LUFS integrated, peak -3dB. Don\'t compress aggressively.`,
    note: 'The whole point of this format is that audio IS the script. Mix matters more than image.',
  },
  {
    stage: 'AUDIO',
    fmt: 'LISTICLE',
    label: 'Bouncy dry kit + foley',
    body: `Music: dry, sub-low-anchored, ~110bpm. No reverb tails. Each beat lands hard. Cut on the kick.
Foley per item: zipper (item 0), card shuffle (item 1), wooden taps x6 in time with cuts (item 2), single die clatter (item 3), glass + ice (item 4), wave wash (item 5).
No narration.

Avoid: TTS voiceover, lyrical music, atmospheric reverb, slow builds.`,
    note: 'Cut every text card on a downbeat. The rhythm IS the entertainment.',
  },
  {
    stage: 'TTS',
    fmt: 'ALL FORMATS — emergency only',
    label: 'When narration is unavoidable',
    body: `If a stakeholder demands a voiceover, follow these rules:

VOICE: ElevenLabs "Bella" or "Adam", warmth +25, stability 65, clarity 70.
PACE: 0.85x default speed. Add 200ms pause after every comma.
LENGTH: max 8 words on screen at once.
TONE: confessional, slightly tired, never excited.

PHRASING TEMPLATE:
"i think i [verb] / something specific / and that\'s the whole point"

EXAMPLES:
"i think i found my people. and that\'s the whole point."
"i packed three expansions. zero small talk. that was the goal."

NEVER: "join us for", "discover", "experience", "your dream vacation", "you deserve", "imagine".`,
    note: 'Default to no narration. Only use TTS if a stakeholder forces it. Even then, keep it under 8s total.',
  },
];

function PromptLibrary() {
  const stages = ['ALL', 'SOURCE IMAGE', 'MOTION PROMPT', 'AUDIO', 'TTS'];
  const [active, setActive] = React.useState('ALL');
  const filtered = active === 'ALL' ? PROMPTS : PROMPTS.filter(p => p.stage === active);
  return (
    <div>
      <div className="prompt-toc">
        {stages.map(s => (
          <span
            key={s}
            className={active === s ? 'is-active' : ''}
            style={{cursor:'pointer'}}
            onClick={() => setActive(s)}
          >{s}</span>
        ))}
      </div>
      <div className="prompts">
        {filtered.map((p, i) => (
          <div className="promptcard" key={i}>
            <header className="promptcard__head">
              <span className="stage">{p.stage}</span>
              <span className="fmt">· {p.fmt}</span>
              <span className="label">{p.label}</span>
            </header>
            <pre>{p.body}</pre>
            <div className="promptcard__note"><span className="mono small">NOTE</span>{p.note}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

const promptRoot = createPromptRoot(document.getElementById('prompt-library'));
promptRoot.render(<PromptLibrary/>);
