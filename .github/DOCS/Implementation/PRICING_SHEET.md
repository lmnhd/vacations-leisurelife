# USA Pawn Holdings — Monthly Cost & Pricing Sheet

## 1) Cost assumptions

### Fixed monthly costs
- Render voice server: **$7.00**
- Twilio phone number: **$1.15**
- A2P 10DLC campaign: **$10.00**

**Fixed subtotal: $18.15/mo**

### Usage-based monthly costs (ranges)
- OpenAI Realtime API (voice): **$8–15**
- OpenAI Responses API (SMS/chat): **$1–4**
- Twilio SMS volume: **$5–20**
- AWS (Lambda/DynamoDB/API Gateway): **$0–2**
- Vercel allocation (optional shared overhead): **$0 or $20**

---

## 2) COGS scenarios (monthly)

| Scenario | Realtime | Responses | SMS | AWS | Fixed | Vercel alloc. | Total COGS |
|---|---:|---:|---:|---:|---:|---:|---:|
| Low | $8 | $1 | $5 | $0 | $18.15 | $0 | **$32.15** |
| Medium | $10 | $2 | $10 | $1 | $18.15 | $0 | **$41.15** |
| High | $15 | $4 | $20 | $2 | $18.15 | $0 | **$59.15** |

### If you allocate shared Vercel Pro cost (+$20)
| Scenario | Total COGS (with Vercel alloc.) |
|---|---:|
| Low | **$52.15** |
| Medium | **$61.15** |
| High | **$79.15** |

---

## 3) Price floor by target gross margin

Formula:

**Price = COGS / (1 - margin)**

### Price floor without Vercel allocation
| Scenario | COGS | 65% margin | 70% margin | 75% margin |
|---|---:|---:|---:|---:|
| Low | $32.15 | $92 | $108 | $129 |
| Medium | $41.15 | $118 | $138 | $165 |
| High | $59.15 | $169 | $198 | $237 |

### Price floor with Vercel allocation
| Scenario | COGS | 65% margin | 70% margin | 75% margin |
|---|---:|---:|---:|---:|
| Low | $52.15 | $149 | $174 | $209 |
| Medium | $61.15 | $175 | $204 | $245 |
| High | $79.15 | $227 | $264 | $317 |

(Values rounded up to nearest dollar.)

---

## 4) Recommended pricing strategy

For this PoC and local SMB positioning:

- **Starter:** **$129/mo**
  - Best for low usage / pilot clients
- **Core (recommended default):** **$149/mo**
  - Strong value-to-price fit for typical usage
- **Premium:** **$199/mo + $299 setup**
  - Includes onboarding, tuning, and launch support

### Why this works
- $149/mo sits above medium-case cost in most months while staying easy to sell.
- Setup fee covers onboarding time, A2P compliance friction, and initial configuration.
- You can move heavy-usage clients to $199 when volume regularly trends toward high-case COGS.

---

## 5) Quick rule for quoting

Use this shortcut during sales calls:

- **Expected COGS x 2.5 to 3.5 = Monthly price target**
- If custom onboarding is needed, add a **one-time setup fee ($299–$500)**.

---

## 6) One-time costs

- A2P brand registration: **~$4 one time**
