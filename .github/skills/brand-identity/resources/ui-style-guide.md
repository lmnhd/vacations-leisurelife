# UI Style Guide - Component Library & Layout Standards

## Component Library Standard

**ENFORCE**: All UI components **MUST** come from the **shadcn/ui component library**. No custom implementations. No exceptions.

- Use shadcn/ui Card, Button, Input, Select, Badge, Separator, Tabs, Slider, RadioGroup, etc.
- Style shadcn/ui components using Tailwind classes
- Do not create custom component variants unless shadcn/ui doesn't provide the base
- Keep styling consistent by applying the same Tailwind patterns across all shadcn/ui usage

### Installation
```bash
npx shadcn@latest init
npx shadcn@latest add [component-name]
```

---

## Horizontal Layout Enforcement

**CRITICAL RULE**: Never allow a single component to stretch full-width across a page container.

### Requirements
- **Minimum Requirement**: Every vertical section must contain **at least 2 components side-by-side**
- **No Exception**: A lone button, textarea, dropdown, or card occupying the entire horizontal space is **prohibited**
- **Philosophy**: Horizontal space is precious; use it efficiently by grouping related elements together
- **Implementation**: Use `flex` with `gap-6`, `grid-cols-2+`, or similar patterns to create multi-element rows
- **More is Better**: 3-column layouts or 4-column grids are preferred over 2-column when content allows

### Examples

#### ❌ WRONG - Single Full-Width Component
```tsx
// PROHIBITED
<button className="w-full">Start Debate</button>
```

#### ✅ CORRECT - Two Equal-Width Boxes Side-by-Side
```tsx
// Required pattern
<div className="flex gap-6">
  <Card className="flex-1">Start Button</Card>
  <Card className="flex-1">Model Selection</Card>
</div>
```

#### ✅ CORRECT - Three-Column Layout
```tsx
<div className="grid grid-cols-3 gap-4">
  <Card>Believer</Card>
  <Card>Skeptic</Card>
  <Card>Judge</Card>
</div>
```

---

## Design Philosophy

**Maximize horizontal real estate with bold, blocky containers** - The design prioritizes sleek, minimalistic aesthetics with vibrant yet sophisticated color nuances. Every element serves the principle of elegant efficiency: maximum visual impact with minimal complexity.

---

## Color System

### Brand Agent Colors (Vibrant Yet Refined)
- **Primary Action**: `#0EA5E9` - Bright, trustworthy blue
- **Warning/Danger**: `#EF4444` - Bold, challenging red  
- **Success/Neutral**: `#8B5CF6` - Measured purple
- **Accent Highlight**: `#FBBF24` - Gold/amber for primary buttons

Use these colors consistently in labels, accents, and interactive elements.

### Background & Surface Palette (Dark, Sophisticated)
- **Primary Background**: `#0A0A0A` - Deep black, almost void-like
- **Secondary Surface**: `#171717` - Slightly elevated, card containers
- **Tertiary Surface**: `#262626` - Interactive hover states, nested containers
- **Border Accent**: `#404040` - Subtle but defined card edges

**Design Intent**: The dark palette creates dramatic contrast with vibrant text and accent colors, reducing visual fatigue while making interactive elements pop.

### Text & Foreground
- **Primary Text**: `#FAFAFA` - Off-white, clean and readable
- **Muted Text**: `#A3A3A3` - Secondary information, helper text, hints
- **Accent Highlight**: `#FBBF24` - Gold/amber for emphasis

---

## Spacing & Sizing System

### Container Padding
- **Standard Card Padding**: `p-6` (1.5rem) for main content areas
- **Compact Card Padding**: `p-5` (1.25rem) for nested or secondary panels
- **Minimal Padding**: `p-4` (1rem) for utility areas

### Gap Between Elements
- **Generous Gap**: `gap-6` (1.5rem) for major section separations
- **Standard Gap**: `gap-4` (1rem) for related elements
- **Tight Gap**: `gap-3` (0.75rem) for grouped controls or compact layouts
- **Minimal Gap**: `gap-2` (0.5rem) for tightly related elements like labels and icons

### Typography Scale

#### Headlines
- **Page Title**: `text-6xl` (3.75rem) - Bold, commanding presence
- **Section Header**: `text-lg` (1.125rem) - Clear hierarchy, `font-semibold`
- **Subsection**: `text-sm` (0.875rem) - Supporting headers, uppercase for emphasis

#### Body Text
- **Standard**: `text-sm` (0.875rem) - Primary reading content
- **Secondary/Helper**: `text-xs` (0.75rem) - Hints, labels, muted information
- **Compact Labels**: `text-xs` with `uppercase tracking-tight` - Sleek, condensed appearance

#### Interactive Elements
- **Button Text**: `text-lg` (1.125rem) - Prominent action buttons
- **Action Button Helper**: `text-xs` (0.75rem) - Secondary action guidance

---

## Layout Patterns

### Full-Width Container
- Maximum width: `max-w-6xl` for standard content areas
- Creates spacious, breathing layouts that leverage wide screens

### Compact Control Containers
- Maximum width: `max-w-2xl` (30% reduction from full-width) for consolidated input areas

### Component Organization
- **Cards for Grouping**: Use shadcn/ui `Card` component with `p-6` padding
- **Horizontal Lists**: Use flex with `gap-4` or `gap-6` for side-by-side elements
- **Grid Layouts**: Prefer `grid-cols-2`, `grid-cols-3`, or `grid-cols-4` over single-column

---

## shadcn/ui Component Usage

### Required Components
- **Card** - For all content grouping and containers
- **Button** - For all interactive actions
- **Input** - For text entry fields
- **Select** - For dropdown selections
- **Slider** - For range inputs (concept sliders)
- **RadioGroup** - For mutually exclusive selections
- **Tabs** - For multi-section navigation
- **Badge** - For status indicators and tags
- **Separator** - For visual section division

### Styling Pattern
```tsx
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

// Standard Card Pattern
<Card className="p-6 bg-neutral-900 border-neutral-700">
  <div className="flex gap-4">
    <Button variant="default">Primary Action</Button>
    <Button variant="outline">Secondary</Button>
  </div>
</Card>

// Horizontal Layout with Multiple Cards
<div className="grid grid-cols-3 gap-6">
  <Card className="p-6">Section 1</Card>
  <Card className="p-6">Section 2</Card>
  <Card className="p-6">Section 3</Card>
</div>
```

---

## Tailwind Configuration

Ensure your `tailwind.config.ts` includes these neutral color definitions:
```typescript
theme: {
  extend: {
    colors: {
      neutral: {
        900: '#171717',  // Secondary Surface
        800: '#262626',  // Tertiary Surface
        700: '#404040',  // Border Accent
        600: '#525252',
        400: '#A3A3A3',  // Muted Text
        50: '#FAFAFA',   // Primary Text
      },
      primary: '#0EA5E9',
      danger: '#EF4444',
      accent: '#FBBF24',
    }
  }
}
```

---

## Responsive Design

### Breakpoints
- **Mobile**: `sm:` (640px) - Stack columns vertically, reduce gaps
- **Tablet**: `md:` (768px) - 2-column layouts become viable
- **Desktop**: `lg:` (1024px) - Full 3-4 column layouts
- **Wide**: `xl:` (1280px) - Maximum spacing and breathing room

### Mobile Adaptations
```tsx
// Desktop: 3 columns, Mobile: 1 column
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
  <Card>Item 1</Card>
  <Card>Item 2</Card>
  <Card>Item 3</Card>
</div>
```

---

## Implementation Checklist

When building UI components, verify:

- [ ] All components use shadcn/ui (no custom implementations)
- [ ] No single component occupies full horizontal width
- [ ] At least 2 elements side-by-side in every section
- [ ] Consistent gap spacing (`gap-4` or `gap-6`)
- [ ] Card padding uses `p-6` or `p-5`
- [ ] Dark mode colors from neutral palette
- [ ] Typography follows size scale (text-sm, text-lg, etc.)
- [ ] Responsive breakpoints implemented for mobile/tablet
- [ ] Accent colors used for primary actions
- [ ] Muted colors used for secondary information

---

**Last Updated**: January 30, 2026
