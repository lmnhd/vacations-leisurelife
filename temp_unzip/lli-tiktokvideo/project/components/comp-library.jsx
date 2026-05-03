/* global React, ReactDOM */
const { createRoot } = ReactDOM;

// SVG placeholder for a TikTok 9:16 frame, with a stripe direction + label
function ShotFrame({ tone, label, motif }) {
  // motif draws a tiny iconographic vocabulary inside the frame
  // (board outlines, hands as silhouettes, portholes) - all geometric
  return (
    <div className="shotcard__frame">
      <div className={`ph ph--${tone}`} data-label={label}></div>
      <svg className="frame__chrome" viewBox="0 0 90 160" preserveAspectRatio="none">
        {motif === 'hand-tile' && (
          <>
            <rect x="14" y="60" width="62" height="60" fill="none" stroke="oklch(0.55 0.005 95)" strokeWidth="0.8" strokeDasharray="2 2"/>
            <rect x="38" y="80" width="14" height="14" fill="oklch(0.90 0.20 122)" opacity="0.7"/>
            <path d="M0 130 L30 110 L46 116 L52 138 L42 160 L0 160 Z" fill="oklch(0.10 0 0)" opacity="0.85"/>
          </>
        )}
        {motif === 'over-shoulder' && (
          <>
            <path d="M0 90 Q 20 60, 60 70 L 90 75 L 90 160 L 0 160 Z" fill="oklch(0.10 0 0)" opacity="0.8"/>
            <rect x="20" y="95" width="60" height="40" fill="none" stroke="oklch(0.55 0.005 95)" strokeWidth="0.6"/>
            <circle cx="40" cy="115" r="2" fill="oklch(0.90 0.20 122)"/>
            <circle cx="60" cy="120" r="2" fill="oklch(0.90 0.20 122)"/>
          </>
        )}
        {motif === 'porthole' && (
          <>
            <circle cx="45" cy="80" r="32" fill="none" stroke="oklch(0.55 0.005 95)" strokeWidth="1"/>
            <circle cx="45" cy="80" r="28" fill="oklch(0.30 0.04 220)" opacity="0.5"/>
            <path d="M17 90 Q 45 70, 73 90" stroke="oklch(0.78 0.005 95)" strokeWidth="0.5" fill="none" opacity="0.5"/>
          </>
        )}
        {motif === 'dice-card' && (
          <>
            <rect x="20" y="90" width="50" height="34" fill="oklch(0.96 0.005 95)" opacity="0.85"/>
            <rect x="55" y="60" width="14" height="14" fill="oklch(0.96 0.005 95)" opacity="0.9"/>
            <circle cx="62" cy="67" r="1.5" fill="oklch(0.10 0 0)"/>
          </>
        )}
        {motif === 'glass-light' && (
          <>
            <rect x="40" y="80" width="14" height="30" rx="1" fill="oklch(0.85 0.05 80)" opacity="0.5"/>
            <ellipse cx="47" cy="80" rx="7" ry="2" fill="oklch(0.85 0.05 80)" opacity="0.7"/>
            <line x1="0" y1="50" x2="90" y2="20" stroke="oklch(0.90 0.20 122)" strokeWidth="0.5" opacity="0.4"/>
          </>
        )}
        {motif === 'crowd-blur' && (
          <>
            {[...Array(8)].map((_, i) => (
              <circle key={i} cx={10 + i*11} cy={70 + (i%2)*8} r="6" fill="oklch(0.10 0 0)" opacity={0.3 + (i%3)*0.15}/>
            ))}
            <rect x="0" y="100" width="90" height="60" fill="oklch(0.10 0 0)" opacity="0.5"/>
          </>
        )}
        {motif === 'empty-pool' && (
          <>
            <ellipse cx="45" cy="100" rx="38" ry="14" fill="oklch(0.40 0.05 220)" opacity="0.5"/>
            <line x1="0" y1="140" x2="90" y2="140" stroke="oklch(0.55 0.005 95)" strokeWidth="0.4"/>
          </>
        )}
        {motif === 'face' && (
          <>
            <circle cx="45" cy="80" r="22" fill="oklch(0.65 0.08 50)" opacity="0.5"/>
            <circle cx="38" cy="76" r="2" fill="oklch(0.20 0 0)"/>
            <circle cx="52" cy="76" r="2" fill="oklch(0.20 0 0)"/>
            <path d="M40 88 Q 45 92, 50 88" stroke="oklch(0.20 0 0)" strokeWidth="0.8" fill="none"/>
          </>
        )}
        {motif === 'drone' && (
          <>
            <path d="M5 60 L 85 60 L 75 100 L 15 100 Z" fill="none" stroke="oklch(0.55 0.005 95)" strokeWidth="0.5"/>
            <line x1="0" y1="0" x2="0" y2="160" stroke="oklch(0.55 0.005 95)" strokeWidth="0.3" opacity="0.5"/>
          </>
        )}
        {motif === 'chandelier' && (
          <>
            <line x1="45" y1="0" x2="45" y2="40" stroke="oklch(0.55 0.005 95)" strokeWidth="0.5"/>
            {[...Array(7)].map((_, i) => (
              <circle key={i} cx={28 + i*5} cy={45 + Math.abs(i-3)*3} r="1.5" fill="oklch(0.85 0.05 80)" opacity="0.7"/>
            ))}
          </>
        )}
        {motif === 'sunset' && (
          <>
            <rect x="0" y="0" width="90" height="80" fill="url(#sg)"/>
            <defs>
              <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="oklch(0.7 0.15 30)"/>
                <stop offset="1" stopColor="oklch(0.5 0.12 280)"/>
              </linearGradient>
            </defs>
            <line x1="0" y1="80" x2="90" y2="80" stroke="oklch(0.30 0.05 220)" strokeWidth="0.5"/>
          </>
        )}
        {motif === 'first-person' && (
          <>
            <path d="M0 130 L 25 100 L 35 105 L 45 130 Z" fill="oklch(0.65 0.08 50)" opacity="0.5"/>
            <path d="M90 135 L 65 105 L 55 110 L 45 135 Z" fill="oklch(0.65 0.08 50)" opacity="0.5"/>
            <rect x="25" y="125" width="40" height="20" fill="oklch(0.30 0.02 60)" opacity="0.7"/>
          </>
        )}
        {motif === 'logo' && (
          <>
            <rect x="20" y="60" width="50" height="40" fill="oklch(0.18 0.005 250)" stroke="oklch(0.90 0.20 122)" strokeWidth="0.6"/>
            <text x="45" y="84" fontSize="9" fill="oklch(0.90 0.20 122)" textAnchor="middle" fontFamily="ui-monospace, monospace">L/L</text>
          </>
        )}
      </svg>
    </div>
  );
}

const COMP_GOOD = [
  { title: "Tight crop on hands + tiles", desc: "Fingers entering frame, placing a wooden meeple. No face visible. AI animates a single in-frame motion.", tag: "PRIMARY GO-TO", motif: 'hand-tile' },
  { title: "Over-the-shoulder, head out of frame", desc: "Back of a shoulder, blurred. Board state in focus. Implies a person without rendering one.", tag: "RELIABLE", motif: 'over-shoulder' },
  { title: "Porthole / window with motion outside", desc: "The ship as context. Wake outside, board pieces inside. Subtle horizon motion sells 'at sea'.", tag: "PUNCHLINE", motif: 'porthole' },
  { title: "Dice + cards on a textured table", desc: "Macro-scale objects. Slight tumble or flip animation. Diegetic ASMR sound design lives here.", tag: "ASMR FORMAT", motif: 'dice-card' },
  { title: "Drink + warm light + game piece", desc: "After-hours mood. Glass condensation, golden bulb glow, a dice next to it. Sells 'time of day'.", tag: "MOOD BED", motif: 'glass-light' },
  { title: "Crowded table, motion blur, no faces", desc: "Six pairs of arms over a board. Reach blur. Implies a packed lounge without rendering humans.", tag: "GROUP ENERGY", motif: 'crowd-blur' },
];

const COMP_BAD = [
  { title: "Empty pool deck / atrium", desc: "The classic AI cruise output. Reads as ad in 0.4s. Reject at source-image stage.", tag: "INSTANT SCROLL", motif: 'empty-pool' },
  { title: "Centered face, mid-laugh", desc: "AI faces always read uncanny. The laugh is the worst part — expression locks weird.", tag: "UNCANNY", motif: 'face' },
  { title: "Drone reveal of the ship", desc: "Every cruise line has done it. Perspective change is also outside our pipeline's range.", tag: "BANNED", motif: 'drone' },
  { title: "Chandelier in a marble lobby", desc: "Brochure energy. No human, no game, no reason for the audience to keep watching.", tag: "BANNED", motif: 'chandelier' },
  { title: "Sunset over a railing", desc: "Emotional climax of every bad cruise ad. Save sunsets for the *background* of a hand shot.", tag: "OVERUSED", motif: 'sunset' },
  { title: "First-person with both arms visible", desc: "AI hands fail when both are in frame doing different things. One hand max, or neither.", tag: "TECHNICAL FAIL", motif: 'first-person' },
];

function CompLibrary() {
  return (
    <div className="complib">
      <div className="complib__col complib__col--good">
        <h3>Use these · The 6 compositions that work</h3>
        <div className="shotcards">
          {COMP_GOOD.map((s, i) => (
            <div className="shotcard" key={i}>
              <ShotFrame tone="good" label={`SHOT ${String(i+1).padStart(2,'0')}`} motif={s.motif}/>
              <div className="shotcard__body">
                <div className="shotcard__title">{s.title}</div>
                <div className="shotcard__desc">{s.desc}</div>
                <div className="shotcard__tag">{s.tag}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="complib__col complib__col--bad">
        <h3>Reject these · The 6 compositions that fail</h3>
        <div className="shotcards">
          {COMP_BAD.map((s, i) => (
            <div className="shotcard shotcard--bad" key={i}>
              <ShotFrame tone="bad" label={`REJECT ${String(i+1).padStart(2,'0')}`} motif={s.motif}/>
              <div className="shotcard__body">
                <div className="shotcard__title">{s.title}</div>
                <div className="shotcard__desc">{s.desc}</div>
                <div className="shotcard__tag">{s.tag}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

window.ShotFrame = ShotFrame;
const root = createRoot(document.getElementById('comp-library'));
root.render(<CompLibrary/>);
