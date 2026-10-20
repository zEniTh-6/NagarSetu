---
name: Heritage Civic Modernism
colors:
  surface: '#fcf9f0'
  surface-dim: '#dddad1'
  surface-bright: '#fcf9f0'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f6f3ea'
  surface-container: '#f1eee5'
  surface-container-high: '#ebe8df'
  surface-container-highest: '#e5e2da'
  on-surface: '#1c1c17'
  on-surface-variant: '#414845'
  inverse-surface: '#31312b'
  inverse-on-surface: '#f4f1e8'
  outline: '#717975'
  outline-variant: '#c0c8c4'
  surface-tint: '#3c665a'
  primary: '#0e3c31'
  on-primary: '#ffffff'
  primary-container: '#285347'
  on-primary-container: '#98c5b6'
  inverse-primary: '#a2d0c0'
  secondary: '#4b635f'
  on-secondary: '#ffffff'
  secondary-container: '#cee8e3'
  on-secondary-container: '#516965'
  tertiary: '#443209'
  on-tertiary: '#ffffff'
  tertiary-container: '#5d491f'
  on-tertiary-container: '#d4b984'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#beecdc'
  primary-fixed-dim: '#a2d0c0'
  on-primary-fixed: '#002019'
  on-primary-fixed-variant: '#234e42'
  secondary-fixed: '#cee8e3'
  secondary-fixed-dim: '#b2ccc7'
  on-secondary-fixed: '#071f1c'
  on-secondary-fixed-variant: '#344b48'
  tertiary-fixed: '#fddfa7'
  tertiary-fixed-dim: '#dfc38e'
  on-tertiary-fixed: '#261900'
  on-tertiary-fixed-variant: '#57441a'
  background: '#fcf9f0'
  on-background: '#1c1c17'
  surface-variant: '#e5e2da'
typography:
  headline-lg:
    fontFamily: Inter, 'Noto Sans Devanagari', sans-serif
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Inter, 'Noto Sans Devanagari', sans-serif
    fontSize: 26px
    fontWeight: '700'
    lineHeight: 34px
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Inter, 'Noto Sans Devanagari', sans-serif
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 30px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Inter, 'Noto Sans Devanagari', sans-serif
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 26px
  body-lg:
    fontFamily: Inter, 'Noto Sans Devanagari', sans-serif
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter, 'Noto Sans Devanagari', sans-serif
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 22px
  body-sm:
    fontFamily: Inter, 'Noto Sans Devanagari', sans-serif
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  label-lg:
    fontFamily: Inter, 'Noto Sans Devanagari', sans-serif
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.01em
  label-md:
    fontFamily: Inter, 'Noto Sans Devanagari', sans-serif
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Inter, 'Noto Sans Devanagari', sans-serif
    fontSize: 11px
    fontWeight: '700'
    lineHeight: 14px
    letterSpacing: 0.04em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-desktop: 1.5rem
  margin: 1rem
  margin-tablet: 2rem
  margin-desktop: 3rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

## Brand & Style

This design system establishes a high-trust, institutional, yet deeply rooted civic interface for municipal engagement in Sangli, India. Balancing the clarity and rigorous spatial discipline of Swiss Modernism with subtle, tactile architectural cues drawn from regional Maharashtrian heritage (such as wada stone foundations and brass metalcraft), the visual voice avoids sterile bureaucracy and decorative software trends alike.

The interface evokes four core tenets:
- **Quiet Authority:** Uncompromising clarity, measured typographic rhythm, and institutional permanence.
- **Civic Dignity:** An interface that treats every citizen issue—from sanitation to water distribution—with seriousness and transparency.
- **Frictionless Utility:** High legibility under bright sunlight, robust touch accessibility for all demographics, and rapid cognitive scanning.
- **Contextual Warmth:** Rejection of cold tech grays and blurs in favor of stone, brass, forest, and warm ivory tones that feel indigenous to public works.

## Colors

The palette is rooted in natural pigments, architectural materials, and legible high-contrast values to guarantee outdoor readability on varied mobile displays.

### Role Allocations

- **Header / App Bar (`#142B28` Midnight Forest):** Serves as an unshakeable structural anchor across primary mobile views and key municipal badges.
- **Primary Action (`#285347` Deep Teal):** Directs primary flows, action triggers, links, and confirmed progress states.
- **Heritage Accents (`#B49A68` Antique Brass, `#7D6A3E` Brass Deep):** Used strictly for municipal seals, status highlights, verification markers, and structural borders on highlighted cards.
- **Sage Accents:**
  - `#DCE6D9` (Sage Tint) for softly tinted state containers and badge fills.
  - `#8B9B83` (Muted Sage) for non-critical decorative accents.
  - `#5B6B55` (Sage Deep) for accessible secondary iconography and metadata badges.
- **Surfaces & Grounds:**
  - `#F4F1E8` (Warm Ivory) sets the foundation canvas, preventing retinal glare.
  - `#FFFFFF` (Pure White) defines interactive cards, sheets, and elevated input modules.
- **Text & Stroke Contrast:**
  - `#222B28` (Deep Charcoal) for primary narrative and data hierarchy.
  - `#65716A` (Graphite Grey) for labels, timestamps, and secondary operational details.
  - `#D5D0C4` (Stone Grey) for structural gridlines, dividing rules, and panel frames.
  - `#837D70` (Field Border) ensures robust, WCAG AAA-compliant boundary contrast for interactive form inputs.
- **Civic Status & Alerts:**
  - **Critical / Danger:** `#A63C38` (Tint: `#FDF3F2`, Border: `#F5C6C4`)
  - **Resolved / Success:** `#286443`
  - **Pending / Warning:** `#946116`
  - **In Review / Info:** `#285A91`

## Typography

Typography prioritizes bilingual clarity across English and Marathi (Devanagari). Inter is paired symmetrically with Noto Sans Devanagari as the direct fallback, matching x-height and optical stroke weight.

Rules of engagement:
- **No Light or Thin Weights:** Weights below 400 are prohibited to preserve legibility in ambient outdoor lighting.
- **Devanagari Metrics:** Generous line-height (`1.4` to `1.5` ratio) accommodates upper matras and conjuncts without clipping.
- **Tabular Numerals:** Issue tracking codes, grievance IDs, timestamps, and GPS coordinates must employ OpenType tabular figures (`tnum`).

## Layout & Spacing

A structured Swiss grid drives all screens, prioritizing vertical hierarchy and disciplined horizontal alignments.

- **Mobile Canvas (<640px):** Single-column, 4-column sub-grid with a 16px (`1rem`) canvas margin and 16px gutter. Content modules stretch edge-to-edge within safety padding.
- **Tablet / Desktop (≥768px):** The mobile web shell locks into an 8-column layout or a constrained 480px–640px central application viewport for ergonomic reporting workflows.
- **Touch Target Enclosure:** All interactive controls (buttons, selection chips, toggle triggers, media attachments) enforce a mandatory minimum target box of 44 × 44px regardless of visual label size.

## Elevation & Depth

This system avoids floating drop shadows, blurred overlays, or neomorphic depths. Elevation is rendered strictly through physical layering and crisp structural boundaries:

- **Level 0 (Ground Canvas):** `#F4F1E8` (Warm Ivory). Continuous, non-elevated background.
- **Level 1 (Structural Cards / Panels):** `#FFFFFF` (Pure White) with a `1px solid #D5D0C4` border. No drop shadow. Depth is communicated purely through value contrast between the Warm Ivory canvas and the White tile.
- **Level 2 (Persistent Navigation & Alerts):** Top navigation bars and alert modals use `#142B28` or pure white with an anchored, high-density hairline bottom divider: `1px solid rgba(20, 43, 40, 0.12)`.
- **Level 3 (Modal Bottom Sheets / Action Drawers):** Grounded overlay with a dark neutral backdrop (`#142B28` at 60% opacity) and an ambient settling drop: `0 -4px 16px rgba(20, 43, 40, 0.08)`.

## Shapes

Corner geometry enforces an intentional hierarchy between contextual containment, functional triggers, and metadata chips:

- **16px Radius (`rounded-lg`):** Reserved exclusively for major environmental enclosures: civic cards, hero metric boards, camera capture previews, and bottom sheet dialogs.
- **10px Radius (`rounded-md` equivalent):** Dedicated to functional controls: primary call-to-actions, secondary action buttons, text inputs, dropdown triggers, and textareas.
- **Full Pill (`rounded-full`):** Exclusively applied to category tags, civic status indicators (e.g., "In Progress", "Verified"), filter chips, and badge counters.

## Components

### Buttons
- **Primary:** Deep Teal (`#285347`) background, `#FFFFFF` text, 10px corner radius, minimum height 48px, horizontal padding 20px. Font: `label-lg`. Active state shifts to Midnight Forest (`#142B28`).
- **Secondary / Heritage:** Outlined with a 1.5px border of Antique Brass (`#B49A68`), text in Deep Charcoal (`#222B28`), background transparent.
- **Destructive:** Error red (`#A63C38`) border or fill with crisp white text.

### Form Inputs & Textareas
- Height: 48px standard for inputs; generous auto-expanding textareas for issue narration.
- Default Border: `1.5px solid #837D70` on `#FFFFFF` ground.
- Focus State: `2px solid #285347` with no offset or fuzzy glow.
- Error State: `1.5px solid #A63C38` with error helper text directly below in `#A63C38`.

### Status & Category Chips
- Geometry: Fully rounded pill shape (`9999px`).
- In-Progress State: Sage Tint (`#DCE6D9`) fill with Sage Deep (`#5B6B55`) text and a 2px inner indicator dot.
- Verified / Official Badge: Antique Brass tint (`#FAF6EE`) with Brass Deep (`#7D6A3E`) label and border.
- Touch Target: Chip height 32px surrounded by an invisible 44px touch bounding box.

### Civic Issue Cards
- Surface: `#FFFFFF` card background with 16px radius, bordered by `1px solid #D5D0C4`.
- Padding: `space-md` (16px) internally.
- Header row includes grievance ID in tabular numbers, timestamp in `#65716A`, and status chip right-aligned.
- Footer features location marker (Ward/Prabhag name) with an integrated category icon.

### Checkboxes & Radio Controls
- Minimum 24 × 24px visual box centered within a 44 × 44px tap target.
- Radio indicators utilize a solid concentric ring in Deep Teal (`#285347`).
- Checkboxes feature a clean 2px check stroke with 4px corner rounding.

### Civic Location & Evidence Module
- Specialized capture card incorporating a camera viewfinder trigger and offline geolocation coordinate pill.
- Coordinate display uses `label-md` tabular numbers against a Sage Tint (`#DCE6D9`) panel to confirm verified civic accuracy.
