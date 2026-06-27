# UI Checkpoints

Do not send the operator to a broad dashboard when a narrower lab exists.

## Group

| Need | Surface | Tell the operator to inspect |
|---|---|---|
| Discovery and Phase B | `/tests/groups/discovery` | Campaign card, inventory badge, matched ship/date, booking mode |
| Brief review | `/tests/brief-studio` | Selected slug, core slogan/copy, visual direction, production bible, blockers, Approve/Re-Approve |
| Media generation/review | `/tests/media-generation?slug=<slug>` | References, heroes/concepts, flyers, scenes, warnings, generation result |
| Landing preview | `/tests/campaign-landing/<slug>` | Hero, gallery, pricing, CTA routing, itinerary |
| Landing image curation | `/tests/landing-studio` or current linked Landing Image Studio | Hero assignment and gallery selections |
| Public preview | `/groups/<slug>` | Final visitor experience |

Phrase the handoff like:

```text
Open /tests/brief-studio, choose <slug>, review the hero slogan and Production Bible scene list, then use Approve Brief if the direction is right.
```

## Deal

| Need | Surface | Tell the operator to inspect |
|---|---|---|
| Workbench intake/handoff | `/tests/deals-system` | Selected Deal, promo scope, generated angle fields, handoff warnings |
| Trip manifest | `/tests/deals-system/trip-manifestation` | Resolved package, package id, ship/date, prices, promo strategy |
| Copy review | `/tests/deals-system/copywriter` | Variants, promo usage, CTA, disclaimers, Select action |
| Funnel and images | `/tests/deals-system/funnel-synthesis` | Landing copy, carousel, package facts, image candidates, Use on page |
| Publish assembly/gates | `/tests/deals-system/publish` | Curated Deal, link health, expiration, blocking gates, approval |
| Meta ad synthesis | `/tests/deals-system/meta-ad-synthesis` | Chosen creative and Meta-specific output |
| Google Ads synthesis | `/tests/deals-system/google-ads-synthesis` | Search/display assets, targeting, placement inputs |
| Public preview | `/deals/<deal-id>` | Final visitor page and booking CTA |

## Checkpoint message template

```text
Complete:
- ...

Needs your decision:
- ...

Open:
<exact URL>

Inspect:
- <specific card/tab/control>

Recommendation:
<one clear recommendation>

Reply with:
<smallest useful answer>
```

If localhost has not been confirmed running, provide the URL but do not call it.
