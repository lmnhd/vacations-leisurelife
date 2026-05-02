/* global React, ReactDOM */
const { createRoot: createLintRoot } = ReactDOM;

const SCORECARD = [
  { txt: "Hook lands inside 1.5 seconds (text or image confession, not branding).", pts: 15 },
  { txt: "First frame contains hands, a board, or a porthole — never an empty room.", pts: 12 },
  { txt: "No face is the focal subject of any frame.", pts: 10 },
  { txt: "Text card every 1.5–3 seconds in the first 8 seconds.", pts: 10 },
  { txt: "All motion is in-frame (objects), not perspective change (camera).", pts: 10 },
  { txt: "Diegetic audio (dice, cards, glass) present in at least 2 frames.", pts: 8 },
  { txt: "No TTS narration in the first 6 seconds.", pts: 8 },
  { txt: "Ship appears as context only — never centered, never wide.", pts: 7 },
  { txt: "CTA is a comment trigger (\"comment GAMES\"), not \"link in bio\".", pts: 7 },
  { txt: "Total length 8–22 seconds. Cut anything longer.", pts: 5 },
  { txt: "No emoji in any text overlay.", pts: 4 },
  { txt: "No fade-to-black anywhere. Hard cuts only.", pts: 4 },
];

const REJECTIONS = [
  { what: "Empty pool deck, atrium, dining room, or pool", why: "Brochure energy. Reject at the source-image stage. Always." },
  { what: "Voiceover that says \"your people\" / \"discover\" / \"escape\"", why: "Cruise-ad clichés. Even ironic use reads as sincere on TikTok." },
  { what: "Centered face mid-laugh, mid-sip, mid-anything", why: "AI faces fail. The laugh is uncanny. The audience clocks it instantly." },
  { what: "Drone shot of the ship from outside", why: "Every cruise line. Also outside our pipeline\'s motion range." },
  { what: "Sunset over a railing as the emotional climax", why: "Dead. Buried. Save sunsets for background-of-a-hand-shot only." },
  { what: "Slow Ken Burns push on a single static photo > 4 seconds", why: "The wobble is the AI failure mode you\'re here to fix." },
  { what: "Same source image reused with a different zoom level", why: "TikTok pacing demands new visual information every 2-3s." },
  { what: "Logo card before second 25 of any video", why: "Brand reveal kills retention if the audience isn\'t hooked yet." },
  { what: "Aspirational adjective stack (\"luxurious cozy unforgettable\")", why: "Three adjectives in a row = ad. Pick one, or none." },
  { what: "Music that swells under narration to a sunset", why: "Hallmark of a 2014 cruise commercial. Burn it." },
];

function Lint() {
  return (
    <div className="lint">
      <div className="scorecard">
        <h3>Pre-publish scorecard</h3>
        <p style={{margin:'0 0 16px', fontSize:13, color:'var(--fg-mid)', lineHeight:1.5}}>
          Score each video before it leaves the pipeline. <strong>Below 70 = do not ship.</strong>
        </p>
        <ul>
          {SCORECARD.map((s, i) => (
            <li key={i}>
              <span className="check"></span>
              <span>{s.txt}</span>
              <span className="pts">+{s.pts}</span>
            </li>
          ))}
        </ul>
        <div className="total">
          <span>SHIP THRESHOLD</span>
          <span className="num">70/100</span>
        </div>
      </div>
      <div className="rejection">
        <h3>The hard never list</h3>
        <p style={{margin:'0 0 14px', fontSize:13, color:'var(--fg-mid)', lineHeight:1.5}}>
          If a video contains any of these, kill it. No exceptions. No "but this one is different."
        </p>
        <ul>
          {REJECTIONS.map((r, i) => (
            <li key={i}>
              <span className="x">×</span>
              <span><strong>{r.what}.</strong> {r.why}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

const lintRoot = createLintRoot(document.getElementById('lint'));
lintRoot.render(<Lint/>);
