# Opinionated Style Guide — Premium Web & App Design

**Version:** 1.0  
**Last Updated:** February 17, 2026  
**Designed for:** High-fidelity, production-grade applications with elite aesthetic direction

---

## Philosophy

This style guide encapsulates a mature, opinionated approach to building beautiful, functional web interfaces. It is **framework-agnostic** in philosophy but **prescriptive** in execution:

- **Component-first architecture** using **shadcn/ui** (required for ALL projects)
- **Premium motion & interactivity** when strategically applied
- **Dark-first design** with thoughtful light mode support
- **Typography-centric** with distinctive, carefully-chosen fonts
- **Aceternity UI** for elite moments (Bento grids, Hero carousels) — used sparingly and intentionally
- **Tailwind CSS** for all styling (via CSS variables for theming)
- **Radix UI** primitives as the foundation (inherited through shadcn/ui)

### Core Design Principles

1. **Intentionality > Decoration** — Every animation, color, and spacing choice has a purpose. No "trendy" or generic aesthetics.
2. **Density with Breathing Room** — Information-dense but never cramped. Generous negative space. Strategic use of whitespace.
3. **Hierarchy Through Contrast** — Bold typography, clear priority, visual distinction between elements.
4. **Motion for Meaning** — Animations signal state changes, guide attention, or delight — never gratuitous.
5. **Accessible Boldness** — High contrast colors, legible fonts at all sizes, keyboard navigation first.
6. **Mobile as Primary** — Design mobile-first. 44px minimum touch targets. Thumb-zone optimization.

---

## Framework Stack (Non-Negotiable)

### Required Frameworks

| Tool | Purpose | Rule |
|:---|:---|:---|
| **Next.js 15+** | Frontend framework (App Router) | SSR, streaming, optimized images|
| **React 19+** | Component library & state | Hooks-first, server components where possible |
| **TypeScript** | Type safety | Strict mode, explicit types everywhere |
| **Tailwind CSS 3+** | Utility CSS framework | CSS variables for theming, `@apply` for components |
| **shadcn/ui** | Component library | **EVERY component must be shadcn/ui or shadcn-based** |
| **Radix UI** (via shadcn) | Headless UI primitives | Accessibility, unstyled foundation |
| **Framer Motion** or **Motion** | Animation library | Orchestrated, purposeful animations |
| **class-variance-authority (CVA)** | Component variants | Type-safe, maintainable prop-based styling |

### Optional But Encouraged

| Tool | When to Use |
|:---|:---|
| **Aceternity UI** | Hero carousels, Bento grids, testimonials (use sparingly, only for premium moments) |
| **Tabler Icons** | Icon set (consistent, professional) |
| **next-themes** | Dark/light mode toggle & persistence |
| **clsx / tailwind-merge** | CSS class composition & utilities |

### Explicitly Forbidden

- ❌ **Component libraries other than shadcn/ui**: No Material-UI, Chakra, Shadui variants, or other pre-styled libraries
- ❌ **Generic fonts**: No Inter, Roboto, Arial, or system fonts as primary choices
- ❌ **Simple `<div>` components**: Every interactive element should use shadcn primitives
- ❌ **CSS-in-JS** (Styled Components, Emotion, etc.): Use Tailwind + CSS variables only
- ❌ **Inline styles**: All styling via Tailwind classes and CSS variables
- ❌ **Custom HTML form elements**: Use shadcn `Input`, `Select`, `Textarea`, `Checkbox`

---

## Typography

### Font Strategy

**Principle**: Use one display font + one body font + one monospace. Each serves a distinct purpose.

### Display Font (Headings, 24pt+)
- **Primary Options** (choose ONE): **Playfair Display**, **Cinzel**, **Abril Fatface**, **Cormorant Garamond**, **EB Garamond**
- **Characteristics**: Serif, elegant, distinctive, authoritative
- **Use For**: Page titles, section headings (H1–H3), prominent CTAs, brand messaging
- **Fallback**: `serif` or `Georgia`
- **Weight**: 600, 700, or 900 (bold emphasis)

### Body Font (Paragraph, UI text, 14pt–18pt)
- **Primary Options** (choose ONE): **Outfit**, **DM Sans**, **Inter** (only if necessary), **Plus Jakarta Sans**, **Sohne**
- **Characteristics**: Warm sans-serif, highly legible, friendly but professional
- **Use For**: All body text, descriptions, navigation labels, form labels
- **Fallback**: `system-ui` or `-apple-system`
- **Weight**: 400 (regular), 500 (medium for emphasis), 600 (semi-bold for stronger emphasis)
- **Line Height**: 1.6+ for body text, 1.4 for UI labels

### Monospace Font (Data, prices, code)
- **Primary Options** (choose ONE): **JetBrains Mono**, **Fira Code**, **IBM Plex Mono**, **Source Code Pro**
- **Characteristics**: Clean, evenly-spaced, highly readable for numeric/code data
- **Use For**: Prices, product codes, technical data, timestamps, inline code
- **Fallback**: `monospace` or `Courier New`
- **Weight**: 400 (regular), 500 (medium for emphasis)

### Implementation

```tsx
// globals.css or layout.tsx
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700;900&family=Outfit:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');

// tailwind.config.js
theme: {
  extend: {
    fontFamily: {
      display: ['"Playfair Display"', 'serif'],
      body: ['Outfit', 'sans-serif'],
      mono: ['"JetBrains Mono"', 'monospace'],
    }
  }
}

// Usage
<h1 className="font-display text-4xl font-bold">Heading</h1>
<p className="font-body text-base leading-relaxed">Body text</p>
<span className="font-mono text-sm">$2,050.00</span>
```

### Font Size Hierarchy

```
Display (36–72pt): H1, page titles, hero text
Heading (24–32pt): Section titles (H2–H3)
Subheading (18–20pt): H4, emphasis
Body (14–16pt): Paragraph text, descriptions
Label (12–14pt): Form labels, captions, metadata
Small (11–12pt): Timestamps, footnotes
```

---

## Color System

### Philosophy

Colors are defined as **CSS variables** scoped to `:root` and `.light` (or theme class). This allows:
- **Runtime theme switching** (dark/light)
- **Brand consistency** across all components
- **Override ability** (per-component or per-element via CSS cascade)

### Color Categories

#### 1. **Primary/Accent Color** (Brand-defining)
- **Use**: Main CTAs, focus states, highlights, brand identity
- **Characteristics**: Bold, confident, instantly recognizable
- **Example Palette**: Deep blue, teal, purple, amber (brand-dependent)
- **CSS Variable**: `--primary` (shadcn/ui) + brand-specific override

#### 2. **Text Colors** (Hierarchy)
- **Primary Text**: Default paragraph and UI text
- **Secondary Text**: Muted descriptions, metadata, hints
- **Muted Text**: Disabled fields, placeholders, low-priority info
- **Inverted Text**: Text on colored backgrounds (primary color)
- **CSS Variables**: `--foreground`, `--muted-foreground`, custom `--text-*`

#### 3. **Background Surfaces** (Depth)
- **Page Background** (`--background`): Deepest layer
- **Card Background** (`--card`): Mid-layer (cards, panels, containers)
- **Surface/Elevated** (`--accent`): Popover/tooltip backgrounds
- **Input Background** (`--input`): Form fields, searchbars
- **CSS Variables**: Use shadcn's semantic tokens

#### 4. **Semantic Colors** (Intent)
- **Success**: `#2ECC71` or similar green (confirmations, completed state)
- **Warning**: `#F39C12` or similar amber (caution, requires attention)
- **Danger/Destructive**: `#CC0000` or similar red (errors, destructive actions)
- **Info**: Same as primary accent (informational highlights)
- **Shadow**: Carefully chosen dark color with transparency for depth

#### 5. **Borders & Dividers**
- **Default Border**: Subtle, muted color (usually `--border`)
- **Accent Border**: Brand-colored border for focus, hover, or emphasis
- **Transparent/Ghost Border**: Used for hover overlays or subtle separation

### CSS Variable Implementation

```css
:root {
  /* Primary accent */
  --primary: 210.6 65.3% 57.1%;        /* HSL format for shadcn */
  --primary-foreground: 0 0% 100%;

  /* Text hierarchy */
  --foreground: 0 0% 100%;
  --muted-foreground: 215.5 23.4% 63.1%;

  /* Backgrounds */
  --background: 220 55.1% 9.6%;
  --card: 216.3 43.4% 19.4%;
  --input: 216.7 40% 22%;

  /* Semantic */
  --destructive: 0 100% 40%;

  /* Brand-specific (optional) */
  --brand-gold: #4A90D9;
  --brand-gold-light: #5BA0E8;
  --brand-red: #CC0000;
  --brand-surface: #142238;
}

.light {
  /* Override for light theme */
  --foreground: 216 60% 9.8%;
  --background: 211 100% 96.5%;
  --card: 0 0% 100%;
  /* ... etc */
}
```

### Color Constraints

1. **Contrast**: Minimum WCAG AA (4.5:1 for text, 3:1 for graphics)
2. **Consistency**: No random hex values in code — always use CSS variables
3. **Theme-aware**: All colors must support both dark AND light mode
4. **Semantic meaning**: Color should reinforce intent (red = danger, green = success)

---

## Component Architecture

### Foundational Principle: shadcn/ui Everything

**Every interactive or structured element must be built on shadcn/ui components.**

### Required shadcn Components

| Component | Purpose | When to Use |
|:---|:---|:---|
| **Button** | Primary CTA, secondary actions | Every interactive button |
| **Input** | Text input, email, tel, etc. | All form fields except special types |
| **Select** | Dropdown selections | Categorical choices |
| **Checkbox** | Boolean toggles | Multiple independent choices |
| **Radio** | Single choice from group | Mutually exclusive options |
| **Label** | Form field labels | Every form input |
| **Card** | Container/grouping | Sections, panels, modal bodies |
| **Dialog/Modal** | Modal overlays | Forms, confirmations, expanded content |
| **Textarea** | Multi-line text input | Long text, descriptions |
| **Progress** | Progress indicators | Loading, file upload, step progress |
| **Tabs** | Tabbed content | Multiple view modes |
| **Accordion** | Collapsible sections | FAQs, expandable details |
| **Tooltip** | Hover hints | Abbreviated labels, explanations |
| **ScrollArea** | Scrollable region | Long lists, code blocks |
| **Separator** | Visual divider | Section breaks |
| **Badge** | Status/category tag | Status labels, category chips |
| **Alert** | Alert message | Warnings, errors, info, success |
| **Skeleton** | Loading placeholder | Data skeleton loaders |
| **Slider** | Range input | Numeric ranges |
| **Sheet** (Drawer) | Side panel | Mobile nav, filters, side menu |

### NOT allowed: DIV-based "custom" components

❌ **Bad**: Hand-coded dropdown, custom button styling, bespoke input  
✅ **Good**: shadcn Select, Button with CVA variants, shadcn Input

### Component Composition Pattern

```tsx
// Good: Using CVA for variants
import { cva } from "class-variance-authority";

const myComponentVariants = cva("base-classes", {
  variants: {
    size: {
      sm: "text-sm px-2 py-1",
      md: "text-base px-4 py-2",
      lg: "text-lg px-6 py-3",
    },
    variant: {
      primary: "bg-primary text-primary-foreground",
      secondary: "bg-secondary text-secondary-foreground",
    },
  },
  defaultVariants: { size: "md", variant: "primary" },
});

export function MyComponent({ size, variant, ...props }) {
  return <div className={myComponentVariants({ size, variant })} {...props} />;
}

// Type-safe variant usage
<MyComponent size="lg" variant="primary" />
```

---

## Layout & Spacing

### Spacing System

Use Tailwind's default spacing scale (4px base):
- **2px, 4px**: Micro-spacing (borders, hairlines)
- **8px** (`gap-2`): Tight grouping
- **12px** (`gap-3`): Component padding
- **16px** (`gap-4`): Standard spacing
- **24px** (`gap-6`): Generous spacing
- **32px** (`gap-8`): Section breaks
- **48px** (`gap-12`): Major section spacing
- **64px+** (`gap-16`+): Hero/full-width section gaps

### Grid & Flex Layouts

```tsx
// 3-column grid (responsive)
<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
  {/* items */}
</div>

// Flex row with gap
<div className="flex items-center justify-between gap-4">
  {/* items */}
</div>

// Flex column
<div className="flex flex-col gap-6">
  {/* items */}
</div>
```

### Container Sizes

- **Page max-width**: `max-w-7xl` (80rem) for content
- **Narrow container**: `max-w-3xl` (48rem) for forms, text-primary
- **Full-bleed hero**: No container, stretch edge-to-edge
- **Sidebar layout**: Use CSS Grid: `grid-cols-[240px_1fr]` or Tailwind's `md:flex`

### Padding Patterns

```tsx
// Standard card
<div className="p-6 rounded-lg border bg-card">...</div>

// Section padding
<section className="px-4 py-12 md:px-8 md:py-20">...</section>

// Hero section (generous, full-bleed)
<div className="relative w-full py-20 md:py-32 px-4">...</div>
```

---

## Motion & Animation

### Philosophy

Motion should **signal, guide, or delight** — never distract.

### Allowed Use Cases

| Use Case | Implementation | Duration |
|:---|:---|:---|
| **Page transitions** | Next.js page animation | 300–500ms cubic-bezier(0.25, 0.46, 0.45, 0.94) |
| **Focus/Hover states** | Button scale, color change, underline | 150–200ms ease-out |
| **Entrance animations** | `animation-delay` stagger on initial load | 200–400ms ease-out |
| **Modal/Dialog appear** | Fade-in + slight scale (0.95 → 1) | 250ms ease-out |
| **Loading spinner** | Continuous rotation (2–3s) | Linear |
| **Success/Error toast** | Slide-in, glow pulse, auto-dismiss | 300ms ease-out, 3–5s display |
| **Scroll reveal** | Elements fade in when scrolled into view | 400–600ms ease-out |
| **Hover interactive** | Lift, glow, rotate icons slightly | 200ms ease-out |
| **Drag/Gesture feedback** | Spring physics for responsive feel | momentum-based |

### Implementation: Framer Motion / Motion.js

```tsx
import { motion } from "framer-motion";

// Page transition
export const pageTransition = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
  transition: { duration: 0.3, ease: "easeOut" },
};

// Staggered children entrance
<motion.div initial="initial" animate="animate" variants={{
  initial: { opacity: 0 },
  animate: {
    opacity: 1,
    transition: { staggerChildren: 0.1, delayChildren: 0.2 },
  },
}}>
  {items.map((item) => (
    <motion.div key={item.id} variants={{
      initial: { opacity: 0, y: 20 },
      animate: { opacity: 1, y: 0 },
    }}>
      {item.name}
    </motion.div>
  ))}
</motion.div>

// Hover button
<motion.button
  whileHover={{ scale: 1.05 }}
  whileTap={{ scale: 0.98 }}
  transition={{ type: "spring", stiffness: 400 }}
>
  Click me
</motion.button>
```

### CSS-Only Animations (Preferred for Simple Cases)

```css
/* In tailwind.config.js */
theme.extend.keyframes = {
  fadeIn: { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
  slideUp: { "0%": { transform: "translateY(10px)", opacity: "0" }, "100%": { transform: "translateY(0)", opacity: "1" } },
};

theme.extend.animation = {
  fadeIn: "fadeIn 0.3s ease-out",
  slideUp: "slideUp 0.4s ease-out",
};

// Usage
<div className="animate-fadeIn">Content</div>
```

### Animation Constraints

- ❌ **Avoid**: Animations > 500ms (feels slow)
- ❌ **Avoid**: Simultaneous animations on all elements (visual chaos)
- ❌ **Avoid**: Looping animations outside of spinners/loaders
- ✅ **Do**: Keep animations purposeful and tied to state changes
- ✅ **Do**: Use `prefers-reduced-motion` for accessibility

```tsx
// Respect user preferences
export const useReducedMotion = () => {
  const [prefersReduced, setPrefersReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReduced(mq.matches);
    mq.addEventListener("change", (e) => setPrefersReduced(e.matches));
  }, []);
  return prefersReduced;
};
```

---

## Aceternity UI — Elite Moments

### Philosophy

Aceternity UI components (Bento grids, Hero carousels, testimonials) are **premium**, **attention-grabbing**, and **expensive** in terms of visual noise. Use them **sparingly and intentionally** for flagship moments.

### When to Use Aceternity

✅ **DO USE FOR**:
- Hero section (homepage, landing pages)
- Feature showcase (premium product cards in a grid)
- Testimonials/social proof section
- Interactive statistics dashboard
- Premium pricing comparison
- Call-to-action section (before main CTA)

❌ **DON'T USE FOR**:
- Routine data tables
- Simple listing pages
- Form views
- Navigation menus
- Modals or overlays
- Repeated elements throughout the page

### Bento Grid (Premium Card Grid)

Use for displaying 3–9 featured items (features, products, services).

```tsx
import { BentoGrid, BentoGridItem } from "@/components/ui/bento-grid";
import { IconDiamond, IconCamera } from "@tabler/icons-react";

<BentoGrid className="max-w-4xl mx-auto">
  <BentoGridItem
    title="Feature One"
    description="Description of the feature"
    header={<div className="h-full bg-gradient-to-br from-primary/20 to-primary/10 rounded-lg" />}
    icon={<IconDiamond className="w-8 h-8 text-primary" />}
    href="/feature-one"
    className="md:col-span-2"
  />
  <BentoGridItem
    title="Feature Two"
    description="Another feature"
    header={<img src="/image.jpg" alt="" className="w-full h-full object-cover" />}
    icon={<IconCamera className="w-8 h-8 text-primary" />}
    href="/feature-two"
  />
</BentoGrid>
```

### Hero Parallax (Hero Carousel)

Use for homepage hero with image carousel and parallax scroll effect.

```tsx
import { HeroParallax } from "@/components/ui/hero-parallax";

const images = [
  { title: "Item 1", link: "/", thumbnail: "/image1.jpg" },
  { title: "Item 2", link: "/", thumbnail: "/image2.jpg" },
  // ... up to 10 images
];

<HeroParallax products={images}>
  <div className="relative flex flex-col items-center justify-center h-screen">
    <h1 className="font-display text-6xl font-bold text-center">
      Welcome to Our Store
    </h1>
    <p className="font-body text-xl text-muted-foreground mt-4">
      Discover amazing products
    </p>
  </div>
</HeroParallax>
```

### Constraint: One "Premium" Section Per Page

Limit Aceternity usage to **one or two strategic sections** per page. If you use Bento grids **and** Hero parallax, they must be separated by standard content (text, forms, etc.) to avoid visual fatigue.

---

## Dark & Light Modes

### Strategy

1. **Dark mode is default** — Modern web design trends and reduced eye strain
2. **Light mode is an option** — Must be fully functional, not afterthought
3. **Theme toggle** — Persistent via `next-themes` (or localStorage)

### Implementation

```tsx
// app/layout.tsx
import { ThemeProvider } from "@/components/ThemeProvider";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}

// ThemeProvider.tsx (custom wrapper)
"use client";
import { ThemeProvider as NextThemesProvider } from "next-themes";

export function ThemeProvider({ children, ...props }) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}

// Toggle component
import { useTheme } from "next-themes";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
      {theme === "dark" ? "☀️ Light" : "🌙 Dark"}
    </button>
  );
}
```

### CSS Variable Strategy for Themes

Define all color variables in `:root` (dark) and `.light` (light):

```css
:root {
  /* Dark mode defaults */
  --background: 220 55.1% 9.6%;
  --foreground: 0 0% 100%;
  --primary: 210.6 65.3% 57.1%;
  /* ... */
}

.light {
  /* Light mode overrides */
  --background: 211 100% 96.5%;
  --foreground: 216 60% 9.8%;
  --primary: 213.9 68% 33.1%;
  /* ... */
}
```

---

## Buttons & CTAs

### Button Hierarchy

| Variant | Use Case | Prominence |
|:---|:---|:---|
| **Primary** | Main call-to-action | Highest (filled, brand color) |
| **Secondary** | Alternative action | Medium (outline or muted fill) |
| **Outline** | Tertiary action | Low (border only) |
| **Ghost** | Minimal action | Lowest (text only, hover underline) |
| **Destructive** | Delete/dangerous action | High (red/warning color) |
| **Link** | Navigation link | Low (text, underline on hover) |

### Button Sizes

| Size | Padding | Font | Use For |
|:---|:---|:---|:---|
| `sm` | `h-8 px-3` | text-xs | Small actions, compact UI |
| `md` (default) | `h-9 px-4` | text-sm | Standard buttons |
| `lg` | `h-10 px-8` | text-base | Primary CTAs, prominent buttons |
| `icon` | `h-9 w-9` | — | Icon-only buttons |

### Button Implementation

```tsx
import { Button } from "@/components/ui/button";

// Primary
<Button variant="default" size="lg">Save Changes</Button>

// Secondary
<Button variant="secondary">Cancel</Button>

// Destructive
<Button variant="destructive">Delete</Button>

// Outline
<Button variant="outline">Learn More</Button>

// Ghost (minimal)
<Button variant="ghost">Skip</Button>

// Icon button
<Button variant="ghost" size="icon">
  <IconSearch className="w-5 h-5" />
</Button>

// Custom with motion
<motion.button
  whileHover={{ scale: 1.05 }}
  whileTap={{ scale: 0.98 }}
  className={buttonVariants({ variant: "default" })}
>
  Click Me
</motion.button>
```

### CTA Best Practices

1. **One primary CTA per section** — Avoid button fatigue
2. **Semantic variant** — Use `destructive` for delete, not just red color
3. **Micro-copy** — Button text = action (`Save`, `Submit`, `Delete`) not `OK` or `Confirm`
4. **Touch targets** — Minimum 44px height on mobile
5. **Loading state** — Disable button and show spinner during async action
6. **Hover/focus** — Visual feedback (color change, scale, outline)

---

## Forms & Inputs

### Field Anatomy

Every form field should have:
1. **Label** (`<Label>`) — Clear, descriptive
2. **Input/Select/Textarea** (shadcn component)
3. **Error message** (conditional, under field)
4. **Helper text** (optional, under label)

### Form Field Implementation

```tsx
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

<div className="space-y-2">
  <Label htmlFor="email">Email Address</Label>
  <Input 
    id="email"
    type="email"
    placeholder="you@example.com"
    required
  />
  {error && <p className="text-xs text-destructive">{error}</p>}
  <p className="text-xs text-muted-foreground">We'll never share your email</p>
</div>

// Select field
<div className="space-y-2">
  <Label htmlFor="category">Category</Label>
  <Select>
    <SelectTrigger id="category">
      <SelectValue placeholder="Choose a category..." />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="electronics">Electronics</SelectItem>
      <SelectItem value="jewelry">Jewelry</SelectItem>
    </SelectContent>
  </Select>
</div>
```

### Form Layout Patterns

**Single column (mobile-optimized)**:
```tsx
<form className="space-y-6">
  <div className="space-y-2">{/* field */}</div>
  <div className="space-y-2">{/* field */}</div>
  <Button type="submit" className="w-full">Submit</Button>
</form>
```

**Multi-column (desktop)**:
```tsx
<form className="space-y-6">
  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
    <div className="space-y-2">{/* field */}</div>
    <div className="space-y-2">{/* field */}</div>
  </div>
  <Button type="submit">Submit</Button>
</form>
```

### Input Placeholder & Validation

- **Placeholder**: Short hint, lighter color
- **Error state**: Red border + error icon + message below
- **Success state**: Green checkmark, optional green border
- **Disabled state**: Reduced opacity, no interaction

---

## Cards & Containers

### Card Variants

| Type | Purpose | Padding | Border |
|:---|:---|:---|:---|
| **Elevated** | Main content container | p-6 | Subtle shadow |
| **Outlined** | Secondary container, form | p-4–6 | Visible border |
| **Ghost** | Minimal, background-blended | p-4 | No border |
| **Interactive** | Clickable card (with hover effect) | p-6 | Hover highlight |

### Card Implementation

```tsx
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";

// Standard card
<Card>
  <CardHeader>
    <CardTitle>Card Title</CardTitle>
    <CardDescription>Subtitle or description</CardDescription>
  </CardHeader>
  <CardContent>
    {/* Content */}
  </CardContent>
</Card>

// Interactive card (clickable)
<motion.div
  whileHover={{ scale: 1.02, y: -4 }}
  className="cursor-pointer"
>
  <Card className="transition-shadow hover:shadow-lg">
    <CardContent className="p-4">
      {/* Content */}
    </CardContent>
  </Card>
</motion.div>
```

---

## Modals & Dialogs

### Dialog Pattern

```tsx
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function MyDialog() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)}>Open Dialog</Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dialog Title</DialogTitle>
            <DialogDescription>
              Additional context or instructions
            </DialogDescription>
          </DialogHeader>

          {/* Form or content */}
          <div className="space-y-4">
            {/* ... */}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 mt-6">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => setOpen(false)}>
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

### Sheet (Drawer) Pattern

Use for side panels, mobile nav, filters:

```tsx
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

<Sheet>
  <SheetTrigger asChild>
    <Button variant="outline">Open Menu</Button>
  </SheetTrigger>
  <SheetContent side="left">
    <SheetHeader>
      <SheetTitle>Menu</SheetTitle>
    </SheetHeader>
    {/* Navigation or content */}
  </SheetContent>
</Sheet>
```

---

## Tables & Data Display

### Table Structure

```tsx
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

<div className="overflow-x-auto">
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead>Column 1</TableHead>
        <TableHead>Column 2</TableHead>
        <TableHead className="text-right">Price</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      {data.map((item) => (
        <TableRow key={item.id} className="hover:bg-muted">
          <TableCell>{item.name}</TableCell>
          <TableCell>{item.description}</TableCell>
          <TableCell className="text-right font-mono text-primary">
            ${item.price}
          </TableCell>
        </TableRow>
      ))}
    </TableBody>
  </Table>
</div>
```

### Data Styling

- **Numbers**: Use monospace font (`font-mono`)
- **Currency**: Highlight in brand color, right-aligned
- **Status badges**: Use `Badge` component with semantic color
- **Timestamps**: Show human-readable format with native date (title tooltip)

---

## Icons

### Icon Library

Use **Tabler Icons** (or alternative consistent library):
- **Size**: `w-4 h-4` (inline), `w-5 h-5` (buttons), `w-6 h-6` (large), `w-8 h-8` (hero)
- **Color**: Inherit from text color or explicit `text-primary`
- **Stroke**: 1.5–2 for clarity

### Icon Usage

```tsx
import { IconSearch, IconMenu, IconX } from "@tabler/icons-react";

// Inline icon
<Button variant="ghost" size="icon">
  <IconSearch className="w-5 h-5" />
</Button>

// Icon with text
<Button variant="outline" className="gap-2">
  <IconMenu className="w-4 h-4" />
  Menu
</Button>

// Semantic coloring
<div className="flex items-center gap-2 text-success">
  <IconCheck className="w-5 h-5" />
  <span>Complete</span>
</div>
```

---

## Accessibility

### Core Principles

1. **Keyboard Navigation**: Tab through all interactive elements in logical order
2. **Screen Reader**: Semantic HTML, ARIA labels where needed
3. **Color Contrast**: WCAG AA minimum (4.5:1 for text, 3:1 for graphics)
4. **Focus Indicators**: Always visible, never hidden
5. **Mobile Touch**: 44px minimum target size
6. **Motion Sensitivity**: Respect `prefers-reduced-motion`

### Implementation Checklist

- ✅ **Buttons/links are `<button>` or `<a>`, not `<div>`**
- ✅ **Form fields have associated `<Label>`**
- ✅ **Images have `alt` text**
- ✅ **Color is not the only indicator** (use text + icon + color)
- ✅ **Focus rings visible** (Tailwind `focus-visible:ring-2`)
- ✅ **Landmark HTML5 tags** (`<nav>`, `<main>`, `<aside>`, `<footer>`)
- ✅ **Semantic heading hierarchy** (don't skip H levels)
- ✅ **Sufficient text contrast** (test with WebAIM)
- ✅ **No auto-playing sound/video**
- ✅ **Responsive at 200% zoom**

### Focus & Active States

```tsx
<Button className="focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
  Accessible Button
</Button>

<a href="#" className="focus-visible:outline-2 outline-offset-2 outline-primary">
  Accessible Link
</a>
```

---

## Responsive Design

### Mobile-First Breakpoints

| Breakpoint | Tailwind | Width | Use For |
|:---|:---|:---|:---|
| **Mobile** | — (default) | < 640px | Single column, thumb-friendly |
| **Tablet** | `sm` | ≥ 640px | 2-column layouts |
| **Tablet Large** | `md` | ≥ 768px | 2–3 column layouts |
| **Desktop** | `lg` | ≥ 1024px | Full 3+ column layouts |
| **Desktop XL** | `xl` | ≥ 1280px | Sidebar + main + aside |

### Responsive Patterns

```tsx
// Hide/show based on screen size
<div className="hidden md:block">Desktop only</div>
<div className="block md:hidden">Mobile only</div>

// Column span
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
  {/* items */}
</div>

// Padding
<section className="px-4 py-8 md:px-8 md:py-12 lg:px-12">
  {/* content */}
</section>

// Font size
<h1 className="text-2xl md:text-4xl lg:text-5xl">Title</h1>

// Grid columns
<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-[200px_1fr_200px] gap-4">
  {/* sidebar | main | sidebar */}
</div>
```

### Touch-Friendly Design

- **Button height**: Minimum 44px (Tailwind `h-11` or explicit padding)
- **Touch target spacing**: 8–16px gap between interactive elements
- **Thumb zone**: Bottom 2/3 of screen is most natural reach (place CTAs here on mobile)
- **Mobile nav**: Sheet/drawer pattern (not hamburger dropdown)

---

## Performance Optimization

### Image Optimization

```tsx
import Image from "next/image";

// Always use next/image for optimization
<Image
  src="/image.jpg"
  alt="Description"
  width={800}
  height={600}
  className="w-full h-auto"
  priority={false}  // true only for hero images
  quality={75}      // default 75, adjust based on need
/>
```

### CSS & JS Optimization

- **CSS**: Use utility-first Tailwind (not custom CSS where possible)
- **Components**: Lazy load heavy components (`React.lazy`, `Suspense`)
- **Fonts**: Load only necessary weights/subsets
- **Animations**: Use CSS over JS where possible
- **Bundle**: Code split by route (Next.js App Router does this automatically)

### Lighthouse Targets

- **Performance**: > 90
- **Accessibility**: > 95
- **Best Practices**: > 90
- **SEO**: > 95

---

## Code Organization

### Directory Structure

```
src/
├── components/
│   ├── ui/                 # shadcn/ui components
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── bento-grid.tsx  # Aceternity
│   │   ├── hero-parallax.tsx # Aceternity
│   │   └── ...
│   ├── sections/           # Large page sections
│   │   ├── HeroSection.tsx
│   │   ├── FeaturesSection.tsx
│   │   └── ...
│   ├── NavBar.tsx          # Layout components
│   ├── ChatWidget.tsx      # Complex features
│   └── ...
├── app/
│   ├── layout.tsx
│   ├── page.tsx
│   ├── (routes)/
│   │   ├── appraise/
│   │   ├── inventory/
│   │   └── ...
│   └── api/                # API routes
├── lib/
│   ├── utils.ts            # Tailwind merge, helpers
│   └── constants.ts
├── hooks/
│   └── useCustomHook.ts
└── styles/
    └── globals.css         # Tailwind directives, CSS vars
```

### Component Composition

```tsx
// Good: Compound component pattern
export function FormField({ label, error, children }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

// Usage
<FormField label="Email" error={errors.email}>
  <Input type="email" />
</FormField>
```

### TypeScript Patterns

```tsx
// Explicit prop types
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline";
  size?: "sm" | "md" | "lg";
}

export function Button({ variant = "primary", size = "md", ...props }: ButtonProps) {
  // ...
}

// Use discriminated unions for complex state
type FormState = 
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: FormData }
  | { status: "error"; error: string };
```

---

## Theming & Brand Customization

### Creating a New Theme

1. **Define color palette** (at least 5 colors: primary, secondary, muted, destructive, success)
2. **Map to CSS variables** in `:root` and `.light`
3. **Test contrast** with WebAIM Contrast Checker
4. **Update Tailwind config** if custom colors needed

### Example: Custom Brand Palette

```css
:root {
  /* Brand: Emerald Green + Gold */
  --primary: 142.4 71.8% 29.2%;           /* emerald-700 HSL */
  --primary-foreground: 0 0% 100%;

  --secondary: 42.3 96.2% 50.4%;          /* amber-400 HSL */
  --secondary-foreground: 0 0% 0%;

  --destructive: 0 100% 40%;              /* red HSL */

  --background: 220 55.1% 9.6%;           /* dark navy HSL */
  --foreground: 0 0% 100%;

  --border: hsl(142.4 71.8% 29.2% / 0.2);
}

.light {
  --primary: 142.4 71.8% 29.2%;           /* same primary color */
  --primary-foreground: 0 0% 100%;
  --secondary: 42.3 96.2% 50.4%;
  --secondary-foreground: 0 0% 0%;
  
  --background: 211 100% 96.5%;           /* light cream */
  --foreground: 216 60% 9.8%;             /* dark navy text */
  
  --border: hsl(142.4 71.8% 29.2% / 0.15);
}
```

---

## Complete Example: Landing Page

```tsx
// app/page.tsx
"use client";

import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BentoGrid, BentoGridItem } from "@/components/ui/bento-grid";
import { HeroParallax } from "@/components/ui/hero-parallax";
import { IconCheck, IconDiamond, IconRocket } from "@tabler/icons-react";

const heroImages = [
  { title: "Feature 1", link: "/", thumbnail: "/img1.jpg" },
  { title: "Feature 2", link: "/", thumbnail: "/img2.jpg" },
];

const features = [
  {
    title: "Fast",
    description: "Lightning-quick performance",
    icon: <IconRocket className="w-8 h-8 text-primary" />,
  },
  {
    title: "Reliable",
    description: "Built to last and scale",
    icon: <IconDiamond className="w-8 h-8 text-primary" />,
  },
];

export default function Home() {
  return (
    <main>
      {/* Hero with parallax */}
      <HeroParallax products={heroImages}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="relative flex flex-col items-center justify-center h-screen text-center"
        >
          <h1 className="font-display text-5xl md:text-7xl font-bold mb-4">
            Welcome to Premium Design
          </h1>
          <p className="font-body text-xl text-muted-foreground mb-8 max-w-2xl">
            Built with shadcn/ui, Tailwind, and Framer Motion
          </p>
          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
            <Button size="lg" className="gap-2 h-12 px-8 text-base">
              <IconCheck className="w-5 h-5" />
              Get Started
            </Button>
          </motion.div>
        </motion.div>
      </HeroParallax>

      {/* Features section */}
      <section className="py-20 px-4 max-w-7xl mx-auto">
        <h2 className="font-display text-4xl font-bold mb-12 text-center">
          Why Choose Us
        </h2>
        <BentoGrid>
          {features.map((feature) => (
            <BentoGridItem
              key={feature.title}
              title={feature.title}
              description={feature.description}
              icon={feature.icon}
              className="md:col-span-1"
            />
          ))}
        </BentoGrid>
      </section>

      {/* CTA section */}
      <section className="py-20 px-4 bg-card border-t">
        <div className="max-w-3xl mx-auto text-center space-y-6">
          <h2 className="font-display text-3xl font-bold">
            Ready to get started?
          </h2>
          <p className="font-body text-muted-foreground">
            Join thousands of users building beautiful experiences.
          </p>
          <Button size="lg">Start Free Trial</Button>
        </div>
      </section>
    </main>
  );
}
```

---

## Troubleshooting & Common Issues

### Issue: Colors don't match theme toggle

**Solution**: Ensure CSS variables are defined in both `:root` and `.light` (or your theme class). Verify `next-themes` is properly configured.

### Issue: Buttons look broken when styled

**Solution**: Always use `buttonVariants()` from shadcn or CVA. Don't apply Tailwind classes directly.

### Issue: Animations are janky

**Solution**: Use `whileHover={{ scale: 1.05 }}` instead of keyframe animations for interactive elements. Avoid animating `layout` properties; use `transform` instead.

### Issue: Responsive layout breaks on mobile

**Solution**: Use mobile-first approach: define base styles for mobile, then add `md:`, `lg:` prefixes for larger screens. Never hide content on mobile unless absolutely necessary.

### Issue: Focus indicators not visible

**Solution**: Add `focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2` to interactive elements.

---

## Checklist Before Launch

- ✅ Dark mode tested and functional
- ✅ Light mode tested and functional
- ✅ All interactive elements use shadcn components (no custom divs)
- ✅ All CTAs use Button component
- ✅ Typography uses defined display/body/mono fonts
- ✅ Colors use CSS variables (no hardcoded hex)
- ✅ Responsive design tested at 375px, 768px, 1024px+
- ✅ Keyboard navigation works (Tab through all elements)
- ✅ Focus indicators visible
- ✅ Color contrast meets WCAG AA
- ✅ Images optimized with `next/image`
- ✅ No unused CSS (Tailwind auto-purges unused utilities)
- ✅ Lighthouse score > 90 (all metrics)
- ✅ Mobile touch targets are 44px+
- ✅ No console errors or warnings
- ✅ Aceternity components used sparingly (1–2 sections max)

---

## Final Thoughts

This style guide is a **living document** — evolve it as your project grows. The core principle remains: **intentional, opinionated design that prioritizes clarity, accessibility, and beauty.**

Build components you're proud of. Use shadcn/ui as the foundation. Let typography and motion tell the story.

---

**Questions?** Refer back to the principles section or consult the next.js and Tailwind docs.

**Version Control**: Keep this file in your `.github/` folder and update it as the team agrees on new standards.
