# Claude Design: TikTok Video Aesthetic — Let's Figure Out What Actually Works

Hey — I need your help developing a marketing look and strategy for our TikTok videos. The primary goal here is to find something that **actually converts**, not something that looks pretty but gets scrolled past.

Let me give you the context, and then I'd love to go back and forth on directions until we land on something that feels right.

---

## What We Sell

**Leisure Life** = group cruises for people who share a niche interest. Our current campaign is **"Board Games at Sea"** — 30-80 board game people on a real cruise ship, playing Azul and Catan at sea, organized meetups, no awkward small talk because you already have something in common.

The audience is 25-45, urban/suburban, nostalgic for game nights, wants social travel without the "so what do you do?" networking energy. Vibe: cozy, competitive-but-friendly, after-hours electric, indie-not-corporate.

## What's Broken Right Now

Our AI pipeline spits out TikToks that feel like **bad cruise commercials**. Here's what they look like:

- Empty pool decks and atriums — beautiful ship spaces, zero people, zero board games, zero activity. Hotel brochure energy.
- Shaky "Ken Burns" pans — AI image-to-video wobbles across static photos. Nothing intentional.
- No human presence — when people do appear, they're stock-photo ghosts standing still. No laughing, no reaching for tiles, no reactions.
- Same image wiggling for 40 seconds — we reuse one source photo with slightly different zooms.
- Narration over b-roll — voiceover says "your people" while the screen shows an empty dining room.

## What I Think the Problem Is

We're treating this like a TV commercial: wide shot → medium shot → voiceover → call to action. TikTok doesn't work like that.

What I need is a **marketing strategy and visual system** that makes someone stop scrolling and think *"I want to be in that room with those people."* Not "that ship looks nice."

## What We Can Actually Build (Constraints)

I want to be upfront about what our AI pipeline can and cannot do, so whatever we design is actually implementable:

- **Source images first** → animate with RunwayML/Fal image-to-video
- **Composite clips** with ffmpeg (cuts, cross-dissolve)
- **ElevenLabs TTS** for narration
- **Text overlays** via image processing
- **Cannot do**: film real people, complex multi-character interactions, true camera perspective changes

So: image composition, motion prompts, and assembly logic are what we control. The design has to make the most of those levers.

---

## Where I'd Love to Start the Conversation

I have some instincts about what might work, but I want your take first. Before I bias you, here are the questions I'm grappling with:

### 1. What's the right marketing frame?

Are we selling:
- **"Group travel for board game people"** (nicce-forward, identity-driven)
- **"A cruise where the people are the point"** (social experience, anti-luxury)
- **"Finally, a vacation where you don't have to explain your hobby"** (relief/frustration hook)
- Something else entirely?

I want to pick the frame that **actually makes people click** on TikTok, not the one that feels most elegant.

### 2. How do we show "people" when we can't film people?

AI image-to-video struggles with realistic human faces and interactions. But TikTok rewards human presence — reactions, hands, laughter, eye contact. 

How do we compose our source images so the AI animation *implies* human energy even if it can't fully render it? Do we focus on:
- Hands on boards (no faces needed)
- Over-the-shoulder shots where the subject is out of frame
- Crowded tables with motion blur suggesting activity
- First-person POV (your hands, your view)

Or is there a completely different approach I'm not seeing?

### 3. What does "native to TikTok" actually mean here?

The best travel TikToks I see right now are:
- POV formats ("POV: you finally found your people")
- "Day in my life on a group cruise" — rapid cuts, text-first storytelling
- Reaction-driven ("Things nobody tells you about cruise meetups")
- Text-overlay-first where the video is just illustration for the text

Which of these feels most achievable and most effective for our product? Or is there a format we should invent that fits the constraints better?

### 4. What's the role of the ship?

Right now our videos are **ship-forward** (empty decks, chandeliers, pools). I'm pretty sure that's wrong — the ship is the container, not the product. The product is the people.

But the ship is also a real differentiator (you're at sea, this is special). How do we show the ship as **context** without letting it dominate? Should the ship only appear in transitional moments? As a background layer? Or should we lean into the absurdity: "Yes, we're playing board games on a cruise ship"?

### 5. Motion: what should the AI actually be asked to do?

Our current motion prompts are generic garbage: "gentle atmospheric motion, slow push forward." The AI interprets this as wobbly zooms on empty rooms.

If we want purposeful movement, what should the prompts actually say? For example:
- A tight push-in on hands placing a winning tile
- A tracking shot following someone walking through a crowded lounge
- A rack-focus from a player's face to the board state
- A dolly-out revealing the full table from a close-up

But we can't change perspective. So which of these can image-to-video actually deliver? And how do we prompt for them?

### 6. Text as the primary creative layer?

I'm wondering if text overlays should do the heavy lifting. TikTok users read while they watch. What if the video is secondary — just atmosphere and motion — and the text tells the story?

For example: a 4-second clip of hands on a board, with bold text "72 hours of board games, sunset decks, and nobody asking 'so what do you do?'"

Is this a stronger strategy than narration-first? Should text and clips be 1:1 (every clip has a text card)? Or should some clips breathe without text?

### 7. Audio: what should this sound like?

TikTok is audio-forward. Our current approach is narration over music over b-roll. That's YouTube, not TikTok.

What if the audio is:
- Ambient game-night sounds (dice clatter, card shuffles, cheers, groans)
- Low-level ship ambience (seagulls, distant waves, lounge chatter)
- Music that pulses with cuts, not underscores narration
- Minimal narration, or narration as a TikTok-native "storytime" voice

Or should we go full ASMR? Full music-video? What actually works for this niche?

### 8. What must these videos NEVER do?

I want a hard avoid-list. Off the top of my head:
- No empty ship photography (no chandeliers, no pools without people)
- No generic cruise luxury signifiers (no sunsets over railings as the emotional climax)
- No slow pans across anything
- no "dream vacation" voiceover tone
- No stock-photo people smiling at camera

What else? What are the tropes that scream "I skipped this ad"?

---

## The Real Goal

I'm not asking for a style guide. I'm asking for a **marketing strategy** — a way to make TikTok videos that sell group cruises to board game people. The aesthetic is the delivery mechanism. The conversion is the goal.

So: what direction do you think we should explore first? I'm happy to iterate back and forth, test ideas, go deep on whichever thread feels most promising. I just don't want to build another dead cruise commercial.

