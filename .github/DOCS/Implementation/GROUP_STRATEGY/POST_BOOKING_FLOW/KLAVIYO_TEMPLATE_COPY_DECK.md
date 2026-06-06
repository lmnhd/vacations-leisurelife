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

## What Klaviyo Fills Automatically

Use merge tags for facts that should change by campaign or lead. The app already sends these:

### URL Field Rule

When a CTA points to an event URL, paste the full Liquid expression into the Klaviyo button/link URL field.
Do not type the bare property name. For the waitlist confirmation button, the URL field must be:

```text
{{ event.verification_url }}
```

If the URL field is entered as `event.verification_url`, Klaviyo treats it as literal text and rewrites it into
`http://event.verification_url/` with tracking parameters. That link will never reach the Leisure Life verification route.

| Field                                    | Use                                     |
| ---------------------------------------- | --------------------------------------- |
| `{{ person.first_name }}`                | Greeting                                |
| `{{ event.campaign_name }}`              | Campaign title                          |
| `{{ event.campaign_description }}`       | Campaign theme / niche context          |
| `{{ event.threshold_percent }}`          | Progress update                         |
| `{{ event.threshold_remaining_cabins }}` | Day 7 urgency / low-inventory reminder  |
| `{{ event.share_invite_copy }}`          | Invite-a-friend language                |
| `{{ event.verification_url }}`           | Waitlist verification button            |
| `{{ event.booking_link_url }}`           | Cruise Brothers booking and payment CTA |
| `{{ event.booking_reference }}`          | Booking confirmation                    |
| `{{ person.landing_page_url }}`          | Campaign page / dashboard CTA           |
| `{{ person.community_channel_url }}`     | Campaign chat / community CTA           |
| `{{ person.ship_name }}`                 | Travel / countdown references           |
| `{{ person.sail_date }}`                 | Countdown references                    |
| `{{ person.departure_port }}`            | Travel prep references                  |
| `{{ event.packing_list_url }}`           | Countdown / final details CTA           |
| `{{ event.final_itinerary_url }}`        | Final itinerary CTA                     |
| `{{ event.photo_share_url }}`            | Post-cruise photo CTA                   |
| `{{ event.survey_url }}`                 | Survey CTA                              |
| `{{ event.adjacent_campaigns_url }}`     | Expired-campaign redirect CTA           |
| `{{ event.target_landing_url }}`         | Alumni invite landing page              |
| `{{ event.tour_conductor_name }}`        | TC announcement                         |
| `{{ event.target_campaign_name }}`       | Alumni invite target                    |
| `{{ event.target_pitch }}`               | Alumni invite pitch                     |
| `{{ event.alumni_window }}`              | Alumni access window                    |

## Template Index

| #   | Stage                       | Job                                               | Primary CTA                     |
| --- | --------------------------- | ------------------------------------------------- | ------------------------------- |
| 1   | `waitlist_confirmation`     | Confirm entry and explain the threshold model     | Return to campaign page         |
| 2   | `nurture_day3`              | Deepen the niche and invite participation         | Open campaign chat              |
| 3   | `nurture_day7`              | Create momentum without pressure                  | Invite one friend               |
| 4   | `threshold_met`             | Announce the threshold and send the booking link once readiness is verified | Open booking link when verified |
| 5   | `booking_link_ready`        | Legacy / fallback booking handoff only           | Use only if threshold email could not safely carry the link |
| 6   | `campaign_expired`          | Close the loop and redirect interest              | Browse nearby sailings          |
| 7   | `booking_confirmed`         | Welcome booked guests                             | Open Your Trip dashboard        |
| 8   | `travel_prep`               | Help guests get to the ship                       | Open travel checklist           |
| 9   | `final_countdown`           | Build excitement and readiness                    | Open final details              |
| 10  | `final_itinerary_published` | Share the onboard plan                            | View final itinerary            |
| 11  | `tour_conductor_announced`  | Introduce the human host                          | Meet the Tour Conductor         |
| 12  | `post_cruise_welcome_home`  | Capture the post-trip high                        | Share photos                    |
| 13  | `post_cruise_survey`        | Collect feedback while the trip is fresh          | Take survey                     |
| 14  | `alumni_rebooking_invite`   | Give past guests first access to the next sailing | View alumni invite              |

---

## 1) Waitlist Confirmation

**Stage:** `waitlist_confirmation`

**Goal:** Verify the email, confirm the waitlist entry, and explain that the entry only counts after confirmation.

**Subject lines:**

- `You're on the list for {{ event.campaign_name }}`
- `Verify your email to join {{ event.campaign_name }}`

**Preheader:**

- `Verify your email to unlock the waitlist experience.`

**Suggested body copy:**

Hi {{ person.first_name }},

Verify your email to join the waitlist for {{ event.campaign_name }}.

Your spot is saved, but your entry will not count toward the group until you confirm your email.

No payment has been taken yet. We will keep you updated as the group fills and the next booking stage opens.

If you added a phone number for alerts, we may also text you when the group reaches threshold.

**Module notes:**

- Verification note
- Threshold / next-stage note
- SMS alert note when phone is present

**Primary CTA:**

- `Confirm your email` → `{{ event.verification_url }}`

**Klaviyo button setup:**

- Button text: `Confirm your email`
- URL field: `{{ event.verification_url }}`
- Expected rendered shape: `https://leisurelifeinteractive.net/api/groups/campaign/<slug>/verify?email=<email>&token=<token>`
- Broken shape to avoid: `http://event.verification_url/?_kx=...`

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

This is not a mass-market cruise crowd. It is a room full of people who are signing up for {{ event.campaign_description }} and want the same kind of experience from the trip.

Picture the first conversation on the ship. Picture the people who actually get your reference. Picture the version of the trip where the theme is not decoration, but the reason everyone is there.

If you want to help shape that energy, drop an idea in the campaign chat. Even a small suggestion helps define the room, whether that is a meetup, a ritual, a photo moment, or one small detail that makes the theme feel alive.

**Module notes:**

- Theme story block
- Guest idea prompt
- Sample onboard ritual block

**Primary CTA:**

- `Open campaign chat` → `{{ person.community_channel_url }}`

---

## 3) Momentum Check

**Stage:** `nurture_day7`

**Goal:** Show progress, create urgency without pressure, and make the waitlist feel active once the campaign reaches four sign-ups.

**Subject lines:**

- `A quick status check on {{ event.campaign_name }}`
- `Where this sailing stands right now`

**Preheader:**

- `Once the campaign reaches the next milestone, here is the real status and what happens next.`

**Suggested body copy:**

Hi {{ person.first_name }},

Here is where things stand on {{ event.campaign_name }}.

A few more people have joined the list, which is a good sign. We are at {{ event.threshold_percent }}% of the target and only {{ event.threshold_remaining_cabins }} cabins away from the next step.

This is the moment where the concept starts to feel like a real sailing. Once the campaign reaches four sign-ups, we use this check-in to keep the room moving. If this trip matters to you, now is the moment to invite one likely guest or tell us you are still in.

Small moves matter here, because they help turn the campaign into the group it is trying to become. If it helps, you can share this exact line: {{ event.share_invite_copy }}

**Module notes:**

- Threshold progress block
- Social proof / current count block
- Next-step options block

**Primary CTA:**

- `Invite one guest` → `{{ person.landing_page_url }}`

---

## 4) Threshold Met

**Stage:** `threshold_met`

**Goal:** Celebrate the threshold after readiness is verified and send the direct booking CTA in the same email.

**Subject lines:**

- `It's happening: {{ event.campaign_name }} reached the threshold`
- `The group is real - next step inside`

**Preheader:**

- `The internal demand threshold has been reached. The booking path is ready.`

**Suggested body copy:**

Hi {{ person.first_name }},

The internal demand threshold has been reached for {{ event.campaign_name }}.

That means the group has enough interest to move into the booking path, and we have already verified that the booking link is live.

Your next step is to continue into booking now. The link will take you to the Cruise Brothers booking and payment page, and it usually takes about 10 minutes to finish, so it helps to open it when you have a little time to complete the steps without rushing.

**Module notes:**

- Celebration card
- Readiness check passed
- Direct booking CTA
- What happens next block

**Primary CTA:**

- `Open booking link` → `{{ event.booking_link_url }}`

**Copy rule:**

- Only send this version after the inventory and booking-link check passes. If the booking path is not ready yet, hold the send and use `booking_link_ready` later instead.

---

## 5) Booking Link Ready

**Stage:** `booking_link_ready (optional fallback)`

**Goal:** Fallback booking handoff only. Use this stage only if the threshold email could not safely carry the booking link.

**Subject lines:**

- `Your booking path is ready`
- `Ready to book {{ event.campaign_name }}?`

**Preheader:**

- `The path is live. Open the booking link when you are ready.`

**Suggested body copy:**

Hi {{ person.first_name }},

Your booking path for {{ event.campaign_name }} is ready.

This is the point where the campaign moves from planning into action. If you are ready to lock in your place, use the link below to open the Cruise Brothers booking and payment page. It usually takes about 10 minutes to complete, so it helps to open it when you have a little time and can finish the steps without rushing.

If you have questions about the difference between the group path and an independent booking, use the support link before you finalize anything.

**Module notes:**

- Booking path explanation
- Group vs independent clarification
- Support path block
- Time-to-complete expectation

**Primary CTA:**

- `Open booking link` → `{{ event.booking_link_url }}`

**Copy rule:**

- Do not send this stage if the threshold email already carried the booking link. Use it only as a fallback when the threshold send had to be held back.

---

## 6) Campaign Expired

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

- `Browse nearby sailings` → `{{ event.adjacent_campaigns_url }}`

**Fallback rule:**

- If `{{ event.adjacent_campaigns_url }}` is available, use it.
- If no adjacent-campaign link has been generated yet, fall back to `{{ person.landing_page_url }}` so the guest still has a main Leisure Life destination.

---

## 7) Booking Confirmed

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

Open your dashboard whenever you want the next few steps in one place: checklist, community link, travel prep, and the rest of the trip details as they come together. Your booking reference is {{ event.booking_reference }}.

**Module notes:**

- Confirmation banner with booking reference
- What happens next block
- Community link
- Travel checklist preview
- Merch preview

**Primary CTA:**

- `Open Your Trip dashboard` → `{{ person.landing_page_url }}`

---

## 8) Travel Prep

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

Start with the checklist, then handle the travel details that apply to you. If your profile already has a ship name, sail date, or departure port, use those details to make the plan feel real: {{ person.ship_name }}, {{ person.sail_date }}, {{ person.departure_port }}.

**Module notes:**

- Departure port tip block
- Document reminder block
- Hotel / flight referral links
- Insurance reminder

**Primary CTA:**

- `Open travel checklist` → `{{ person.landing_page_url }}#travel`

**Anchor target:** `#travel` resolves to the "Travel Essentials" section on the campaign landing page (`components/campaign-landing/guest-portal.tsx`). The section renders four blocks that mirror the module list above (departure port, documents, flights & hotel, insurance) and pulls departure port + sail date from the campaign facts. Do not rename the anchor id without updating this email.

---

## 9) Final Countdown

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

At this point, the goal is simple: make sure you know what to bring, where to go, and what time to be ready. If there is a packing list linked below, use it. If not, treat this as your cue to make your final checks and clear out any loose ends for {{ event.campaign_name }}.

The trip is almost here. The better prepared you are now, the smoother the first day feels, especially if your sail date is close: {{ person.sail_date }}.

**Module notes:**

- Packing list block
- Boarding reminder
- Community prompt
- Merch last call when relevant

**Primary CTA:**

- `Open final details` → `{{ event.packing_list_url }}`

---

## 10) Final Itinerary Published

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

That means the shared rhythm of the trip is now mapped out: the key meetups, the social moments, and the parts of the sailing where the group is meant to come together. Ship operations can still shift timing, but the plan is now visible.

If you want to know where the group energy lives onboard, this is the email to open carefully. The full version is here: {{ event.final_itinerary_url }}

**Module notes:**

- Daily rhythm preview
- Featured meetup block
- Who hosts what block
- Small caveat that ship operations may adjust timing

**Primary CTA:**

- `View final itinerary` → `{{ event.final_itinerary_url }}`

---

## 11) Tour Conductor Announced

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

This is your host for the sailing: the friendly human who helps the group find its rhythm, keep the energy together, and make sure the plan feels coherent once you are actually on the ship.

The Tour Conductor is there to guide the group experience, not to replace cruise line support. If you need the cruise line for operational issues, you still use the ship's normal channels.

**Module notes:**

- TC intro block
- What the TC does
- What the TC does not do
- Community etiquette block

**Primary CTA:**

- `Meet the Tour Conductor` → `{{ person.community_channel_url }}`

---

## 12) Post Cruise Welcome Home

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

- `Share photos` → `{{ event.photo_share_url }}`

---

## 13) Post Cruise Survey

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

Tell us what worked, what surprised you, and what would make the next themed sailing even better. This is not a long survey. It is the fast version: the one that helps us learn while the details are still clear.

If you enjoyed the trip, your feedback also helps us build the next one for the right kind of people. We especially want to hear what felt most true to {{ event.campaign_name }}.

**Module notes:**

- Short survey promise
- Favorite moment prompt
- Improvement prompt
- Testimonial capture note

**Primary CTA:**

- `Take survey` → `{{ event.survey_url }}`

---

## 14) Alumni Rebooking Invite

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

Use the link below to see the new sailing, the pitch, and the first access window before the broader audience sees it. The pitch is: {{ event.target_pitch }}

**Module notes:**

- Alumni-only access block
- Target campaign pitch
- Access window block
- Soft reunion tone

**Primary CTA:**

- `View alumni invite` → `{{ event.target_landing_url }}`

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
