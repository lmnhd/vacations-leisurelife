# Campaign Landing Page Redesign Instructions

**Context:**
We are exploring new visual directions for the `CampaignLandingPage` component. The current version (`landing-page.tsx`) suffers from two main issues:
1. The hero image is not exposed prominently enough.
2. The overall layout lacks symmetry and feels imbalanced.

**Task:**
Create a new, distinct variation of the `CampaignLandingPage` component. Name your component uniquely (e.g., `CampaignLandingPageClaude`, `CampaignLandingPageGemini`, etc.) and save it in the `components/campaign-landing/` directory.

**Crucial Constraints (Campaign Sufficiency):**
You are redesigning the *presentation*, not the *data*. You MUST utilize all the data provided in the `CampaignLandingViewModel`. A campaign cannot be launched if essential information is hidden.
- **Hero & Story:** `landing.heroSlogan`, `landing.subSlogan`, and `landing.story` elements must be clearly legible.
- **Hero Image:** `landing.heroImage.url` must be the focal point of the top section. Give it massive visual weight.
- **Campaign Facts:** The `landing.facts` array (sailing dates, ship name, etc.) must be rendered symmetrically.
- **Pricing & Availability:** `landing.pricing` and `landing.threshold` data must be clearly displayed, not buried.
- **Images:** Utilize the `landing.galleryImages` array to break up text, but avoid the "scattered polaroid" look of the current version if it breaks symmetry.
- **CTAs:** `landing.ctas.primary` and `landing.ctas.secondary` must be easily accessible.

**Design Directives:**
1. **Apply Uncodixify Skill:** Avoid generic "AI" UI patterns (e.g., floating glowing blobs, overly literal rounded glassmorphism without structure). Look for clean, structured, editorial, or high-end SaaS typography and spacing. Review `.github/skills/Uncodixify/SKILL.md`.
2. **Apply Brand Identity Loosely:** Use `.github/skills/brand-identity/SKILL.md` as a supporting framework for quality, polish, typography discipline, and overall tone, but do **not** let it force a house palette or rigid visual system when the campaign brief clearly suggests a stronger aesthetic direction.
3. **Campaign Brief Overrides Brand Defaults:** If the campaign brief implies a distinct mood, color story, atmosphere, or stylistic language, let that brief drive the visual treatment. Brand identity should act as a guardrail for coherence and quality, not a hard constraint that flattens campaign-specific aesthetics.
4. **Symmetry & Structure:** Build a balanced grid. If you use a split layout (e.g., 50/50), ensure the visual weight of the text side balances the image side. Consider a massive full-width hero section followed by symmetrical content columns.

**Implementation Details:**
- Use Tailwind CSS for all styling.
- Keep the component self-contained or import existing UI components from `@/components/ui/`.
- Ensure it is fully responsive (mobile, tablet, desktop).

**Provide only the code for the new component.**