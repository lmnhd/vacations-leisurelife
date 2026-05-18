# Klaviyo Template Copy Deck

Copy-ready drafts for the 15 lifecycle emails in the current Klaviyo flow,
plus a short appendix for the separate `booking_change` branch.

## Copy Rules

- Keep one primary CTA per email.
- Use `{{ person.first_name }}` when available, but write the body so it still reads cleanly if the name is missing.
- Never imply the group is fully secured before booking is actually live.
- Keep the voice warm, specific, and lightly cinematic.
- Use the campaign theme as the center of gravity, not generic cruise language.
- If a template has a deadline or action, say it directly.

## Template Index

| # | Stage | Job | Primary CTA |
|---|---|---|---|
| 1 | `waitlist_confirmation` | Confirm entry and explain the threshold model | Return to campaign page |
| 2 | `nurture_day3` | Deepen the niche and invite participation | Open campaign chat |
| 3 | `nurture_day7` | Create momentum without pressure | Invite one friend |
| 4 | `threshold_met` | Announce the campaign hit threshold | Continue to manifest / booking path |
| 5 | `manifest_requested` | Collect traveler details | Finish manifest |
| 6 | `manifest_reminder` | Nudge incomplete manifests | Finish manifest |
| 7 | `booking_link_ready` | Make booking actionable | Open booking link |
| 8 | `campaign_expired` | Close the loop and redirect interest | Browse nearby sailings |
| 9 | `booking_confirmed` | Welcome booked guests | Open Your Trip dashboard |
| 10 | `travel_prep` | Help guests get to the ship | Open travel checklist |
| 11 | `final_countdown` | Build excitement and readiness | Open final details |
| 12 | `final_itinerary_published` | Share the onboard plan | View final itinerary |
| 13 | `tour_conductor_announced` | Introduce the human host | Meet the Tour Conductor |
| 14 | `post_cruise_welcome_home` | Capture the post-trip high | Share photos |
| 15 | `post_cruise_survey` | Collect feedback while the trip is fresh | Take survey |
| 16 | `alumni_rebooking_invite` | Give past guests first access to the next sailing | View alumni invite |

---

## 1) Waitlist Confirmation

**Stage:** `waitlist_confirmation`

**Goal:** Confirm the signup, explain the threshold model, and make the campaign feel real.

**Subject lines:**
- `You're on the list for {{ event.campaign_name }}`
- `Your spot is saved - now let's see if this sailing becomes real`

**Preheader:**
- `You are officially on the list. If the campaign hits threshold, we move into the next step together.`

**Suggested body copy:**

Hi {{ person.first_name }},

You are on the list for {{ event.campaign_name }}.

That means you have joined a sailing that is being built around a specific kind of guest and a specific kind of trip. If the campaign reaches the internal threshold, we move from interest to action and open the next step for everyone on the list.

For now, your spot is saved. You do not need to do anything else right this second. If you want to help shape the room, you can share the campaign with one person who would actually belong on this sailing.

**Module notes:**
- Threshold progress block
- What happens next block
- Share / invite block

**Primary CTA:**
- `Return to campaign`

---

## 2) Day 3 Niche Deepener

**Stage:** `nurture_day3`

**Goal:** Expand the emotional value of the theme and help the guest picture the room.

**Subject lines:**
- `The kind of people this sailing is being built for`
- `This is not a generic cruise crowd`

**Preheader:**
- `Three days in, here is the kind of energy this trip is designed for.`

**Suggested body copy:**

Hi {{ person.first_name }},

A quick note about who this sailing is really for.

This is not a mass-market cruise crowd. It is a room full of people who picked the same theme, liked the same idea, and want the same kind of experience from the trip. That is the part that makes the group feel different before anyone even boards.

Picture the first conversation on the ship. Picture the people who actually get your reference. Picture the version of the trip where the theme is not just decoration, it is the reason everyone is there.

If you want to help shape that energy, drop an idea in the campaign chat. Even a small suggestion helps define the room.

**Module notes:**
- Theme story block
- Guest idea prompt
- Sample onboard ritual block

**Primary CTA:**
- `Open campaign chat`

---

## 3) Day 7 Momentum Check

**Stage:** `nurture_day7`

**Goal:** Show progress, create urgency without pressure, and make the waitlist feel active.

**Subject lines:**
- `A quick status check on {{ event.campaign_name }}`
- `Where this sailing stands right now`

**Preheader:**
- `A week in, here is the real status of the campaign and what happens next.`

**Suggested body copy:**

Hi {{ person.first_name }},

Here is where things stand on {{ event.campaign_name }}.

A few more people have joined the list, which is a good sign, but the bigger question is still the same: do we have enough of the right people to make the sailing happen as a real group experience?

If this trip matters to you, now is the moment to either invite one likely guest or tell us you are still in. Small moves matter here, because they help turn a concept into a confirmed sailing.

**Module notes:**
- Threshold progress block
- Social proof / current count block
- Next-step options block

**Primary CTA:**
- `Invite one guest`

---

## 4) Threshold Met

**Stage:** `threshold_met`

**Goal:** Celebrate the threshold without overclaiming and move the guest into the booking path.

**Subject lines:**
- `It's happening: {{ event.campaign_name }} reached the threshold`
- `The group is real - next step inside`

**Preheader:**
- `The internal demand threshold has been reached. Here is what happens next.`

**Suggested body copy:**

Hi {{ person.first_name }},

The internal demand threshold has been reached for this campaign.

That means the group has enough interest to move into booking coordination. It does not mean the cruise line space is permanently secured yet, but it does mean the trip is now active and moving forward.

Your next step is to complete the manifest or continue into the booking path when it opens. Either way, we are past the "maybe" stage.

**Module notes:**
- Celebration card
- Safe-claim explanation
- What happens next block

**Primary CTA:**
- `Continue to next step`

---

## 5) Manifest Requested

**Stage:** `manifest_requested`

**Goal:** Collect the traveler details that make the booking path possible.

**Subject lines:**
- `Next step: tell us who's sailing with you`
- `Your traveler details are needed for {{ event.campaign_name }}`

**Preheader:**
- `We only need the basics here. This is the step that keeps the booking path moving.`

**Suggested body copy:**

Hi {{ person.first_name }},

We need a few traveler details to keep the booking path moving for {{ event.campaign_name }}.

This is not a payment step. It is the information we need to keep the guest record clean, line up the correct booking path, and make sure nothing gets lost when the trip moves forward.

If you have special requirements, name changes, or accessibility notes, this is the place to tell us now so we can account for them early.

**Module notes:**
- Why we need the info
- Privacy reassurance
- Deadline block
- What happens after submission

**Primary CTA:**
- `Finish manifest`

---

## 6) Manifest Reminder

**Stage:** `manifest_reminder`

**Goal:** Nudge incomplete manifests without sounding generic or spammy.

**Subject lines:**
- `Quick reminder: manifest still open for {{ event.campaign_name }}`
- `One step left to keep your booking path moving`

**Preheader:**
- `If you already finished this, you can ignore the reminder.`

**Suggested body copy:**

Hi {{ person.first_name }},

This is a quick reminder that your manifest for {{ event.campaign_name }} is still open.

If you already submitted it, thank you and you can safely ignore this note. If not, this is the step that keeps the booking path moving and helps us avoid delays later.

If anything about your traveler information is unusual or needs review, it is better to note it now than to wait until the last minute.

**Module notes:**
- Deadline block
- What remains unfinished block
- Help line for edge cases

**Primary CTA:**
- `Finish manifest`

---

## 7) Booking Link Ready

**Stage:** `booking_link_ready`

**Goal:** Make booking actionable and clarify what the link does.

**Subject lines:**
- `Your booking path is ready`
- `Ready to book {{ event.campaign_name }}?`

**Preheader:**
- `The path is live. Open the booking link when you are ready.`

**Suggested body copy:**

Hi {{ person.first_name }},

Your booking path for {{ event.campaign_name }} is ready.

This is the point where the campaign moves from planning into action. If you are ready to lock in your place, use the link below to open the booking path and follow the steps from there.

If you have questions about the difference between the group path and an independent booking, use the support link before you finalize anything.

**Module notes:**
- Booking path explanation
- Group vs independent clarification
- Support path block

**Primary CTA:**
- `Open booking link`

---

## 8) Campaign Expired

**Stage:** `campaign_expired`

**Goal:** Close the loop honestly and redirect interest into adjacent sailings.

**Subject lines:**
- `This one won't sail as a group - but here's what's next`
- `An update on {{ event.campaign_name }}`

**Preheader:**
- `This campaign is closing out. If the fit was right, we will point you toward the next best option.`

**Suggested body copy:**

Hi {{ person.first_name }},

We need to close the loop on {{ event.campaign_name }}.

This one will not sail as a group, so there is no further action required from you and no charge to worry about. If you were excited about the theme, we do not want to leave you stranded with just a dead end.

We pulled together a few adjacent sailings that stay close to the same energy, and if one of them feels right we will point you there next.

**Module notes:**
- Honest close block
- No-charge reassurance
- Adjacent campaigns block

**Primary CTA:**
- `Browse nearby sailings`

---

## 9) Booking Confirmed

**Stage:** `booking_confirmed`

**Goal:** Turn a transaction into membership and show what happens next.

**Subject lines:**
- `You're in - welcome aboard {{ event.campaign_name }}`
- `Booked: your place in {{ event.campaign_name }} is confirmed`

**Preheader:**
- `Your booking is confirmed. Here is the dashboard for the next part of the journey.`

**Suggested body copy:**

Hi {{ person.first_name }},

You are in.

{{ event.campaign_name }} is no longer just an idea on a list. You have a confirmed place, a booking reference, and a real trip to look forward to.

Open your dashboard whenever you want the next few steps in one place - checklist, community link, travel prep, and the rest of the trip details as they come together.

**Module notes:**
- Confirmation banner with booking reference
- What happens next block
- Community link
- Travel checklist preview
- Merch preview

**Primary CTA:**
- `Open Your Trip dashboard`

---

## 10) Travel Prep

**Stage:** `travel_prep`

**Goal:** Help guests get to the ship without becoming their travel agency.

**Subject lines:**
- `A few smart travel moves before {{ event.campaign_name }}`
- `Flights, hotels, documents - your pre-cruise checklist`

**Preheader:**
- `We are not booking your trip for you, but we can make the prep easier.`

**Suggested body copy:**

Hi {{ person.first_name }},

Now that you are booked, let us make the stretch between today and the port feel easy.

This is the part where people usually start thinking about flights, hotels, documents, insurance, and how they are actually getting to the ship. We cannot book those pieces for you, but we can point you toward the right next move so you are not scrambling later.

Start with the checklist, then handle the travel details that apply to you.

**Module notes:**
- Departure port tip block
- Document reminder block
- Hotel / flight referral links
- Insurance reminder

**Primary CTA:**
- `Open travel checklist`

---

## 11) Final Countdown

**Stage:** `final_countdown`

**Goal:** Build excitement and readiness in the final stretch.

**Subject lines:**
- `Two weeks out: what to pack for {{ event.campaign_name }}`
- `Seven days until the group meets onboard`
- `Final details before you sail`
- `Tomorrow: see you at the ship`

**Preheader:**
- `The trip is close enough now that the small details matter.`

**Suggested body copy:**

Hi {{ person.first_name }},

You are close enough now that the details matter more than the idea.

At this point, the goal is simple: make sure you know what to bring, where to go, and what time to be ready. If there is a packing list linked below, use it. If not, treat this as your cue to make your final checks and clear out any loose ends.

The trip is almost here. The better prepared you are now, the smoother the first day feels.

**Module notes:**
- Packing list block
- Boarding reminder
- Community prompt
- Merch last call when relevant

**Primary CTA:**
- `Open final details`

---

## 12) Final Itinerary Published

**Stage:** `final_itinerary_published`

**Goal:** Show the guest the onboard rhythm and make the group schedule feel real.

**Subject lines:**
- `Your group itinerary is ready`
- `Here's the plan for {{ event.campaign_name }} onboard`

**Preheader:**
- `The shared moments are mapped out. Here is what the group plan looks like.`

**Suggested body copy:**

Hi {{ person.first_name }},

The group itinerary for {{ event.campaign_name }} is ready.

That means the shared rhythm of the trip is now mapped out - the key meetups, the social moments, and the parts of the sailing where the group is meant to come together. Ship operations can still shift timing, but the plan is now visible.

If you want to know where the group energy lives onboard, this is the email to open carefully.

**Module notes:**
- Daily rhythm preview
- Featured meetup block
- Who hosts what block
- Small caveat that ship operations may adjust timing

**Primary CTA:**
- `View final itinerary`

---

## 13) Tour Conductor Announced

**Stage:** `tour_conductor_announced`

**Goal:** Introduce the human host and clarify their role.

**Subject lines:**
- `Meet your Tour Conductor for {{ event.campaign_name }}`
- `The friendly face helping the group connect onboard`

**Preheader:**
- `This is the person helping the group stay connected while you are at sea.`

**Suggested body copy:**

Hi {{ person.first_name }},

Meet the person helping the group connect onboard: {{ event.tour_conductor_name }}.

This is your host for the sailing - the friendly human who helps the group find its rhythm, keep the energy together, and make sure the plan feels coherent once you are actually on the ship.

The Tour Conductor is there to guide the group experience, not to replace cruise line support. If you need the cruise line for operational issues, you still use the ship's normal channels.

**Module notes:**
- TC intro block
- What the TC does
- What the TC does not do
- Community etiquette block

**Primary CTA:**
- `Meet the Tour Conductor`

---

## 14) Post Cruise Welcome Home

**Stage:** `post_cruise_welcome_home`

**Goal:** Warm close, memory capture, and keep the community alive.

**Subject lines:**
- `Welcome home from {{ event.campaign_name }}`
- `That was a real one`

**Preheader:**
- `The sailing may be over, but the good part does not end at disembarkation.`

**Suggested body copy:**

Hi {{ person.first_name }},

Welcome home.

The sailing is over, but the good part does not end at disembarkation. If you had a favorite moment, a photo worth sharing, or a scene that still feels unreal, this is the moment to put it into the group memory.

We would love to keep the conversation going and see what the trip looked like from your side.

**Module notes:**
- Photo share invite
- Community channel link
- Warm afterglow copy

**Primary CTA:**
- `Share photos`

---

## 15) Post Cruise Survey

**Stage:** `post_cruise_survey`

**Goal:** Collect structured feedback while the trip is still fresh.

**Subject lines:**
- `Tell us what made the sailing work`
- `Five quick questions about {{ event.campaign_name }}`

**Preheader:**
- `Your answers help shape the next sailing, and they are most useful while the trip is still fresh.`

**Suggested body copy:**

Hi {{ person.first_name }},

We would love a few honest minutes from you while the trip is still fresh.

Tell us what worked, what surprised you, and what would make the next themed sailing even better. This is not a long survey. It is the fast version - the one that helps us learn while the details are still clear.

If you enjoyed the trip, your feedback also helps us build the next one for the right kind of people.

**Module notes:**
- Short survey promise
- Favorite moment prompt
- Improvement prompt
- Testimonial capture note

**Primary CTA:**
- `Take survey`

---

## 16) Alumni Rebooking Invite

**Stage:** `alumni_rebooking_invite`

**Goal:** Give past guests first access to the next same or adjacent niche campaign.

**Subject lines:**
- `Alumni first look: the next {{ event.target_campaign_name }} sailing`
- `Want first pick on the next group cruise?`

**Preheader:**
- `You already know the format. This is the first look for people who have sailed with us before.`

**Suggested body copy:**

Hi {{ person.first_name }},

You already know what a good themed sailing feels like.

That is why you are getting the first look at this next one. If the new campaign matches your taste, you can jump in early while the alumni window is still open.

Use the link below to see the new sailing, the pitch, and the first access window before the broader audience sees it.

**Module notes:**
- Alumni-only access block
- Target campaign pitch
- Access window block
- Soft reunion tone

**Primary CTA:**
- `View alumni invite`

---

## Appendix: Booking Change Branch

**Stage:** `booking_change`

This is the separate severity-based notification branch, not part of the 15-email lifecycle count.

**Copy rules:**
- Say exactly what changed.
- Put the previous value and new value side by side.
- State whether action is required.
- For critical changes, surface support contact immediately.
- Never hide cancellation language.

**Subject pattern:**
- `Update on {{ event.campaign_name }}`
- `Important change to your sailing`
- `Action required: {{ event.change_type }}`

**Body pattern:**

Hi {{ person.first_name }},

We need to update you on {{ event.campaign_name }}.

What changed:
- Before: {{ event.previous_value }}
- Now: {{ event.new_value }}

If action is required, say so directly and include `{{ event.action_deadline }}`.
If no action is required, say that plainly.

If you need help, use the support contact below.

**Primary CTA:**
- `Review update`
