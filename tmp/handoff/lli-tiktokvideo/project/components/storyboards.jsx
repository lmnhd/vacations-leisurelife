/* global React, ReactDOM, ShotFrame */
const { createRoot: createStoryRoot } = ReactDOM;

// Storyboard frame: shows visual + on-screen text overlay + spec rows
function StoryFrame({ idx, tc, motif, overlay, overlayStyle, motion, audio, prompt }) {
  return (
    <div className="frame">
      <div className="frame__visual">
        <div className="ph" data-label="" style={{
          backgroundImage: 'repeating-linear-gradient(45deg, oklch(0.22 0.006 250) 0 6px, oklch(0.16 0.006 250) 6px 12px)'
        }}></div>
        <svg className="frame__chrome" viewBox="0 0 90 160" preserveAspectRatio="none">
          {motif === 'hand-tile' && (<>
            <rect x="10" y="55" width="70" height="70" fill="none" stroke="oklch(0.55 0.005 95)" strokeWidth="0.8" strokeDasharray="2 2"/>
            <rect x="34" y="78" width="16" height="16" fill="oklch(0.90 0.20 122)" opacity="0.75"/>
            <path d="M0 130 L30 108 L48 116 L54 140 L46 160 L0 160 Z" fill="oklch(0.10 0 0)" opacity="0.85"/>
          </>)}
          {motif === 'porthole-board' && (<>
            <circle cx="60" cy="40" r="20" fill="none" stroke="oklch(0.55 0.005 95)" strokeWidth="0.8"/>
            <circle cx="60" cy="40" r="17" fill="oklch(0.40 0.06 220)" opacity="0.5"/>
            <rect x="10" y="80" width="70" height="50" fill="oklch(0.30 0.03 60)" opacity="0.5"/>
            <rect x="20" y="92" width="14" height="14" fill="oklch(0.90 0.20 122)" opacity="0.7"/>
            <rect x="40" y="100" width="14" height="14" fill="oklch(0.96 0.005 95)" opacity="0.7"/>
          </>)}
          {motif === 'dice-macro' && (<>
            <rect x="22" y="60" width="22" height="22" fill="oklch(0.96 0.005 95)" opacity="0.9"/>
            <rect x="46" y="68" width="22" height="22" fill="oklch(0.96 0.005 95)" opacity="0.9"/>
            <circle cx="33" cy="71" r="2" fill="oklch(0.10 0 0)"/>
            <circle cx="57" cy="79" r="2" fill="oklch(0.10 0 0)"/>
          </>)}
          {motif === 'crowd' && (<>
            {[...Array(10)].map((_, i) => (
              <circle key={i} cx={5 + i*9} cy={60 + (i%3)*10} r="7" fill="oklch(0.10 0 0)" opacity={0.25 + (i%3)*0.18}/>
            ))}
            <rect x="0" y="100" width="90" height="60" fill="oklch(0.10 0 0)" opacity="0.55"/>
          </>)}
          {motif === 'glass-light' && (<>
            <rect x="38" y="70" width="18" height="40" rx="1" fill="oklch(0.85 0.05 80)" opacity="0.5"/>
            <ellipse cx="47" cy="70" rx="9" ry="2.5" fill="oklch(0.85 0.05 80)" opacity="0.7"/>
            <line x1="0" y1="35" x2="90" y2="15" stroke="oklch(0.90 0.20 122)" strokeWidth="0.6" opacity="0.4"/>
            <circle cx="20" cy="20" r="2" fill="oklch(0.85 0.05 80)" opacity="0.6"/>
          </>)}
          {motif === 'over-shoulder' && (<>
            <path d="M0 80 Q 20 50, 60 60 L 90 65 L 90 160 L 0 160 Z" fill="oklch(0.10 0 0)" opacity="0.85"/>
            <rect x="14" y="85" width="64" height="44" fill="none" stroke="oklch(0.55 0.005 95)" strokeWidth="0.6"/>
            <rect x="22" y="95" width="10" height="10" fill="oklch(0.90 0.20 122)" opacity="0.7"/>
            <rect x="38" y="100" width="10" height="10" fill="oklch(0.96 0.005 95)" opacity="0.7"/>
            <rect x="54" y="98" width="10" height="10" fill="oklch(0.65 0.22 25)" opacity="0.6"/>
          </>)}
          {motif === 'logo' && (<>
            <rect x="18" y="18" width="54" height="42" fill="oklch(0.18 0.005 250)" stroke="oklch(0.90 0.20 122)" strokeWidth="0.8"/>
            <text x="45" y="45" fontSize="11" fill="oklch(0.90 0.20 122)" textAnchor="middle" fontFamily="ui-monospace, monospace" fontWeight="600">L/L</text>
          </>)}
          {motif === 'cards-fan' && (<>
            <rect x="20" y="80" width="20" height="32" rx="1" fill="oklch(0.96 0.005 95)" opacity="0.9" transform="rotate(-12 30 96)"/>
            <rect x="35" y="78" width="20" height="32" rx="1" fill="oklch(0.96 0.005 95)" opacity="0.9"/>
            <rect x="50" y="80" width="20" height="32" rx="1" fill="oklch(0.96 0.005 95)" opacity="0.9" transform="rotate(12 60 96)"/>
            <rect x="38" y="84" width="14" height="3" fill="oklch(0.65 0.22 25)" opacity="0.7"/>
          </>)}
          {motif === 'wake' && (<>
            <rect x="0" y="80" width="90" height="80" fill="oklch(0.30 0.05 220)" opacity="0.5"/>
            <path d="M0 95 Q 45 88, 90 95" stroke="oklch(0.85 0.02 220)" strokeWidth="0.5" fill="none" opacity="0.6"/>
            <path d="M0 110 Q 45 102, 90 110" stroke="oklch(0.85 0.02 220)" strokeWidth="0.5" fill="none" opacity="0.4"/>
            <line x1="0" y1="80" x2="90" y2="80" stroke="oklch(0.55 0.005 95)" strokeWidth="0.3"/>
          </>)}
          {motif === 'meeples-row' && (<>
            {[...Array(6)].map((_, i) => (
              <g key={i} transform={`translate(${10 + i*13}, 75)`}>
                <circle cx="6" cy="6" r="4" fill={['oklch(0.65 0.22 25)','oklch(0.90 0.20 122)','oklch(0.85 0.05 80)','oklch(0.96 0.005 95)','oklch(0.50 0.10 280)','oklch(0.65 0.10 200)'][i]} opacity="0.85"/>
                <rect x="3" y="9" width="6" height="14" fill={['oklch(0.65 0.22 25)','oklch(0.90 0.20 122)','oklch(0.85 0.05 80)','oklch(0.96 0.005 95)','oklch(0.50 0.10 280)','oklch(0.65 0.10 200)'][i]} opacity="0.85"/>
              </g>
            ))}
          </>)}
          {motif === 'suitcase' && (<>
            <rect x="20" y="75" width="50" height="40" rx="2" fill="oklch(0.35 0.04 60)" opacity="0.85"/>
            <rect x="40" y="68" width="10" height="9" fill="none" stroke="oklch(0.55 0.005 95)" strokeWidth="0.8"/>
            <rect x="26" y="82" width="14" height="14" fill="oklch(0.90 0.20 122)" opacity="0.7"/>
            <rect x="44" y="84" width="20" height="6" fill="oklch(0.96 0.005 95)" opacity="0.7"/>
            <rect x="44" y="92" width="14" height="6" fill="oklch(0.65 0.22 25)" opacity="0.7"/>
          </>)}
          {motif === 'lounge-night' && (<>
            <rect x="0" y="0" width="90" height="160" fill="oklch(0.18 0.02 60)"/>
            <circle cx="20" cy="40" r="2" fill="oklch(0.85 0.05 80)" opacity="0.8"/>
            <circle cx="50" cy="35" r="2" fill="oklch(0.85 0.05 80)" opacity="0.8"/>
            <circle cx="75" cy="42" r="2" fill="oklch(0.85 0.05 80)" opacity="0.8"/>
            <rect x="10" y="80" width="70" height="40" fill="oklch(0.30 0.03 60)" opacity="0.6"/>
            {[...Array(5)].map((_,i)=>(
              <circle key={i} cx={15+i*15} cy={75} r="5" fill="oklch(0.10 0 0)" opacity="0.7"/>
            ))}
          </>)}
        </svg>
        <div className="frame__tc">{tc}</div>
        <div className="frame__idx">{String(idx).padStart(2,'0')}</div>
        <div className={`frame__overlay ${overlayStyle || ''}`} dangerouslySetInnerHTML={{__html: overlay}}/>
      </div>
      <div className="frame__body">
        <div className="frame__row"><dt>MOTION</dt><dd>{motion}</dd></div>
        <div className="frame__row"><dt>AUDIO</dt><dd>{audio}</dd></div>
        {prompt && <div className="frame__row"><dt>PROMPT</dt><dd className="mono" style={{fontSize:'10.5px'}}>{prompt}</dd></div>}
      </div>
    </div>
  );
}

const STORIES = [
  {
    num: '01',
    id: 'POV-TEXT · RELIEF',
    title: '"nobody on this ship is going to ask what i do for a living"',
    blurb: 'The flagship video. Confession-style hook, single sustained mood, hard text close.',
    meta: { format: 'POV-TEXT', length: '14s', frame: '9:16', cta: 'comment GAMES' },
    frames: [
      { tc: '00:00', motif: 'hand-tile',
        overlay: 'nobody on this ship is going to <em>ask what i do for a living</em>',
        overlayStyle: 'frame__overlay--centered',
        motion: 'A single hand enters from bottom-right, slowly placing a wooden meeple on a hex tile. Subtle handheld jitter.',
        audio: 'Soft wooden click of meeple landing. Distant lounge murmur. No music yet.',
        prompt: 'tight overhead crop, fingers entering frame, placing meeple, shallow depth, warm tungsten' },
      { tc: '00:03', motif: 'porthole-board',
        overlay: 'and that is the whole point',
        motion: 'Slow horizon drift outside porthole. Cards on the foreground table stay still.',
        audio: 'Music in: low warm pulse, ~70bpm. Faint shuffle of cards.',
        prompt: 'foreground board game pieces, background porthole with ocean drift, golden hour' },
      { tc: '00:06', motif: 'dice-macro',
        overlay: 'i packed three expansions',
        motion: 'Dice tumble forward, settle. Slight rack focus from one die to the other.',
        audio: 'Sharp dice clatter. Music swells.',
        prompt: 'macro shot, two dice tumbling on dark wood table, shallow focus' },
      { tc: '00:09', motif: 'crowd',
        overlay: 'and zero small talk',
        motion: 'Out-of-focus silhouettes lean over a table. Slight shoulder sway, motion blur.',
        audio: 'Crowd warmth: laughs, chair scrapes, a "yesss".',
        prompt: 'silhouettes around a lit table, soft motion blur, warm rim light, no faces visible' },
      { tc: '00:12', motif: 'logo',
        overlay: '<span style="display:block;font-size:10px;letter-spacing:0.18em;color:oklch(0.55 0.005 95);margin-bottom:6px;">BOARD GAMES AT SEA · NOV 2026</span>comment GAMES for the link',
        overlayStyle: 'frame__overlay--centered frame__overlay--small',
        motion: 'Logo holds. Subtle film grain. Cursor blink on the comment line.',
        audio: 'Music tail. One last dice click as button.',
        prompt: 'static brand card, monospace label, dark slate background' },
    ],
    notes: {
      hook: 'Frame 1 lands the confession before any branding appears. The viewer recognizes the thought before they realize they\'re being sold to.',
      pacing: '5 frames in 14s. Avg 2.8s per frame. Text changes every cut — never the same line on screen for >3.5s.',
      cta: 'No "book now". The CTA is a comment trigger that boosts engagement signal.',
    },
  },
  {
    num: '02',
    id: 'LISTICLE · IDENTITY',
    title: 'things in my carry-on for a board game cruise',
    blurb: 'Tactile, fast-cut, satisfying. Each item is a beat. Builds toward an absurd reveal.',
    meta: { format: 'LISTICLE', length: '20s', frame: '9:16', cta: 'comment GAMES' },
    frames: [
      { tc: '00:00', motif: 'suitcase',
        overlay: 'things in my carry-on for a <em>board game cruise</em>',
        overlayStyle: 'frame__overlay--centered',
        motion: 'Suitcase lid lifts a quarter-inch and holds. Items inside catch light.',
        audio: 'Zipper unzip. Music in: bouncy, dry, ~110bpm.',
        prompt: 'overhead packed open suitcase, neatly arranged, warm soft light' },
      { tc: '00:02', motif: 'cards-fan',
        overlay: '1. wingspan + the european expansion',
        motion: 'Card box slides in from left, settles. Cards fan out beside it.',
        audio: 'Card shuffle. Music continues.',
        prompt: 'macro shot, board game box and fanned cards, dark wood surface' },
      { tc: '00:05', motif: 'meeples-row',
        overlay: '2. extra meeples (yes really)',
        motion: 'Six meeples slide in one by one, like a domino line.',
        audio: 'Wooden tap-tap-tap-tap-tap.',
        prompt: 'six wooden meeples in a row, top-down, slight reveal motion left to right' },
      { tc: '00:08', motif: 'dice-macro',
        overlay: '3. my lucky d20 (don\'t judge)',
        motion: 'Single die tumbles forward, lands on 20.',
        audio: 'Single sharp die clatter. Crowd "ooohh" sample.',
        prompt: 'single d20 tumbling on wood, lands face up' },
      { tc: '00:11', motif: 'glass-light',
        overlay: '4. an old fashioned (it\'s a cruise)',
        motion: 'Glass settles. Ice rotates slowly. Single drop slides down.',
        audio: 'Glass clink. Bar ambience.',
        prompt: 'amber cocktail with ice, warm bar light, condensation slowly forming' },
      { tc: '00:14', motif: 'porthole-board',
        overlay: '5. the actual entire ocean',
        motion: 'Camera holds. Slow wake outside porthole.',
        audio: 'Music drops to ambient. Wave wash.',
        prompt: 'porthole view of ocean wake, foreground game pieces' },
      { tc: '00:17', motif: 'logo',
        overlay: '<span style="display:block;font-size:10px;letter-spacing:0.18em;color:oklch(0.55 0.005 95);margin-bottom:6px;">LEISURE LIFE · BOARD GAMES AT SEA</span>comment GAMES for the link',
        overlayStyle: 'frame__overlay--centered frame__overlay--small',
        motion: 'Static. Subtle grain.',
        audio: 'Music tail.',
        prompt: 'brand card' },
    ],
    notes: {
      hook: 'Listicle hook = "you can predict the structure" + "but the last item is wild". Item 5 is the absurdity payoff.',
      pacing: '7 beats in 20s. Item 5 holds longer than the others (3s) for emotional weight.',
      cta: 'Same comment-trigger close. Absurdity of "the actual entire ocean" earns the click.',
    },
  },
  {
    num: '03',
    id: 'ASMR · AMBIENCE',
    title: 'no narration. just the sounds of game night at sea.',
    blurb: 'No text in first 3s. Pure sound. Text resolves the tension at 6s. Built for the For You scroll-stop.',
    meta: { format: 'ASMR-AMBIENCE', length: '18s', frame: '9:16', cta: 'silent — link in bio' },
    frames: [
      { tc: '00:00', motif: 'dice-macro',
        overlay: '',
        motion: 'Two dice tumble in slow motion. Land. Held silence after.',
        audio: 'Crisp dice clatter, then silence.',
        prompt: 'macro slow-motion two dice tumbling, dark wood, single warm light' },
      { tc: '00:03', motif: 'cards-fan',
        overlay: '',
        motion: 'Hand riffles cards. Each card flip is its own micro-cut.',
        audio: 'Pure card shuffle ASMR. No music.',
        prompt: 'macro hand shuffling cards, shallow focus, warm light' },
      { tc: '00:06', motif: 'glass-light',
        overlay: 'sound on.',
        overlayStyle: 'frame__overlay--centered',
        motion: 'Ice cube rotates in a glass. Single drop slides down outside.',
        audio: 'Ice clink. Glass settle. Faint ship hum underneath.',
        prompt: 'amber drink with ice, slow rotation, warm bar light' },
      { tc: '00:10', motif: 'porthole-board',
        overlay: '',
        motion: 'Wake passes outside porthole. Foreground board pieces still.',
        audio: 'Wave wash. Distant ship horn.',
        prompt: 'porthole over a board, ocean wake outside, golden hour' },
      { tc: '00:14', motif: 'logo',
        overlay: '<em>board games. at sea.</em><br/><span style="display:block;font-size:10px;letter-spacing:0.18em;color:oklch(0.55 0.005 95);margin-top:8px;">leisure life · november 2026</span>',
        overlayStyle: 'frame__overlay--centered',
        motion: 'Type-on text. Subtle grain.',
        audio: 'Final dice click. Silence.',
        prompt: 'brand card with type-on title' },
    ],
    notes: {
      hook: 'Dead silence in frame 1 forces a "wait, why is this here" pause. Audience leans in.',
      pacing: '5 frames, 18s. Slowest video in the set. Earns its slowness with sound.',
      cta: 'Soft close. This format is for awareness/saves, not direct conversion.',
    },
  },
  {
    num: '04',
    id: 'CONFESSION · RELIEF',
    title: 'one image. one sentence. one truth.',
    blurb: 'Lowest-effort, highest-conversion format. A single sustained pull-quote with one ambient clip behind.',
    meta: { format: 'CONFESSION', length: '9s', frame: '9:16', cta: 'comment GAMES' },
    frames: [
      { tc: '00:00', motif: 'over-shoulder',
        overlay: 'i don\'t want a vacation.',
        overlayStyle: 'frame__overlay--centered',
        motion: 'Held shot, very subtle camera breath. Cards on the table do nothing.',
        audio: 'Low warm pulse, ~60bpm. Faint lounge ambience.',
        prompt: 'over the shoulder of a player, warm dim lounge, board game in focus' },
      { tc: '00:03', motif: 'over-shoulder',
        overlay: 'i want <em>seventy people</em> who already get it.',
        overlayStyle: 'frame__overlay--centered',
        motion: 'Same shot. A new player\'s hand enters from the right, places a card.',
        audio: 'Card place. Faint laugh in distance. Music continues.',
        prompt: 'same composition, new hand entering with a card placement' },
      { tc: '00:07', motif: 'logo',
        overlay: '<span style="display:block;font-size:10px;letter-spacing:0.18em;color:oklch(0.55 0.005 95);margin-bottom:6px;">BOARD GAMES AT SEA</span>comment GAMES for the link',
        overlayStyle: 'frame__overlay--centered frame__overlay--small',
        motion: 'Type-on. Static.',
        audio: 'Music tail.',
        prompt: 'brand card' },
    ],
    notes: {
      hook: 'Two-line setup-payoff. The first line breaks the cruise-ad expectation. The second resolves it.',
      pacing: '3 frames, 9s. The shortest video in the set. Designed for repeat-watch.',
      cta: 'Same comment trigger. The brevity earns the ask.',
    },
  },
  {
    num: '05',
    id: 'POV-TEXT · IDENTITY',
    title: 'pov: it\'s 1am and we\'re still playing twilight imperium',
    blurb: 'Late-night, after-hours, electric. Plays directly to the proud-niche cohort. Highest comment-rate.',
    meta: { format: 'POV-TEXT', length: '15s', frame: '9:16', cta: 'comment GAMES' },
    frames: [
      { tc: '00:00', motif: 'lounge-night',
        overlay: 'pov: it\'s 1am and we\'re still <em>playing twilight imperium</em>',
        overlayStyle: 'frame__overlay--centered',
        motion: 'Slow ambient drift. Lounge lights bloom. Silhouettes barely move.',
        audio: 'Low lounge murmur, distant ship hum. Music in: warm synth pad.',
        prompt: 'dim lounge at night, silhouettes around a lit table, warm bar light, ship windows' },
      { tc: '00:04', motif: 'meeples-row',
        overlay: 'we are on turn fourteen',
        motion: 'A row of game pieces. One is moved by an unseen hand.',
        audio: 'Soft wooden click. Whispered "wait".',
        prompt: 'macro top-down board pieces, hand entering to move one piece' },
      { tc: '00:07', motif: 'glass-light',
        overlay: 'someone just ordered a fourth round',
        motion: 'Glass settles in front of a cards spread.',
        audio: 'Glass on wood. Distant bartender shake.',
        prompt: 'cocktail set down on a table next to game cards, warm light' },
      { tc: '00:10', motif: 'porthole-board',
        overlay: 'and the ocean is just <em>there</em>',
        motion: 'Wake drifts outside. A new card flips in the foreground.',
        audio: 'Wave wash. Card flip. Music swells slightly.',
        prompt: 'porthole with ocean wake, foreground game in progress' },
      { tc: '00:13', motif: 'logo',
        overlay: '<span style="display:block;font-size:10px;letter-spacing:0.18em;color:oklch(0.55 0.005 95);margin-bottom:6px;">LEISURE LIFE</span>comment GAMES for the link',
        overlayStyle: 'frame__overlay--centered frame__overlay--small',
        motion: 'Type-on close.',
        audio: 'Music tail. One final dice click.',
        prompt: 'brand card' },
    ],
    notes: {
      hook: 'Specificity wins. "Twilight Imperium" + "turn fourteen" pulls the exact cohort. Generic "board games" doesn\'t.',
      pacing: '5 frames, 15s. Slower middle, faster close.',
      cta: 'Same. The closing line "the ocean is just there" is the emotional close — comment is the rational close.',
    },
  },
];

function Storyboards() {
  return (
    <div>
      {STORIES.map((s, i) => (
        <article className="story" key={i}>
          <header className="story__head">
            <div className="story__id">
              <span className="num">{s.num}</span>
              <span className="id">{s.id}</span>
            </div>
            <div className="story__title">
              <h3>{s.title}</h3>
              <p>{s.blurb}</p>
            </div>
            <dl className="story__meta">
              <dt>FORMAT</dt><dd>{s.meta.format}</dd>
              <dt>LENGTH</dt><dd>{s.meta.length}</dd>
              <dt>RATIO</dt><dd>{s.meta.frame}</dd>
              <dt>CTA</dt><dd>{s.meta.cta}</dd>
            </dl>
          </header>
          <div className="story__frames">
            {s.frames.map((f, j) => <StoryFrame key={j} idx={j+1} {...f}/>)}
          </div>
          <dl className="story__foot">
            <div><dt>WHY THE HOOK WORKS</dt><dd>{s.notes.hook}</dd></div>
            <div><dt>PACING NOTES</dt><dd>{s.notes.pacing}</dd></div>
            <div><dt>CTA LOGIC</dt><dd>{s.notes.cta}</dd></div>
          </dl>
        </article>
      ))}
    </div>
  );
}

const storyRoot = createStoryRoot(document.getElementById('storyboards'));
storyRoot.render(<Storyboards/>);
