# NagarSetu — DESIGN.md (Heritage Modern × Swiss Minimalism)

Design tokens and rules for the NagarSetu responsive website. Source of truth for the Tailwind
theme in `web/`. If the Stitch export differs, Stitch screens are the visual reference and this
file is the token reference; keep them in sync.

## Brand
- Name: NagarSetu (wordmark lowercase "nagarsetu"), caption "CIVIC INFRASTRUCTURE • SANGLI"
- College prototype. No government emblems, seals or logos.
- Feel: trustworthy, calm, institutional, elegant, accessible. Light theme.

## Colour tokens
| Token | Hex | Use |
|---|---|---|
| forest-900 (Midnight Forest) | #142B28 | navigation, hero panels, headings, dark surfaces |
| teal-700 (Deep Teal) | #285347 | primary buttons/links/active controls on LIGHT surfaces, focus outline |
| sage-400 (Muted Sage) | #8B9B83 | decorative only (never text/icons on light) |
| sage-600 (Sage Deep) | #5B6B55 | sage-coloured text/icons on light surfaces |
| sage-100 (Sage Tint) | #DCE6D9 | selected surfaces, icon tiles; text on it = charcoal |
| ivory-50 (Warm Ivory) | #F4F1E8 | app background |
| white | #FFFFFF | cards, forms, modals, tables |
| charcoal-900 (Deep Charcoal) | #222B28 | primary text |
| graphite-600 (Graphite Grey) | #65716A | secondary text (on white/ivory only) |
| stone-300 (Stone Grey) | #D5D0C4 | dividers, card borders |
| field-border | #837D70 | input / select / checkbox borders |
| brass-400 (Antique Brass) | #B49A68 | on dark surfaces: eyebrow text, stats, primary button; on light: thin decorative rules only |
| brass-700 (Brass Deep) | #7D6A3E | brass text/icons on light surfaces |
| clay-600 (Earthy Clay) | #B65C40 | Garbage category accent |

Semantic: success #286443 · warning #946116 · error #A63C38 · info #285A91 · neutral #5D6872.
Badges use a light tint of the colour as background with the full colour as text + icon.

### Contrast rules (checked, WCAG 2.2 AA)
- On white/ivory: charcoal, teal, graphite, sage-600, brass-700, all semantic colours pass for text.
- On forest-900: ivory, sage-100, brass-400 pass. Teal does NOT (1.7:1) — never use teal on dark.
- Primary button on dark = brass-400 background + forest-900 text (5.5:1).
- Primary button on light = teal-700 background + white text (8.7:1).
- Never communicate meaning by colour alone; always text + icon.

## Status badges (filled, tinted)
Reported #566573 · Acknowledged #45508F · In Progress #946116 · Resolved #286443 · Rejected #A63C38 · Withdrawn #65716A

## Flag chips (outlined, transparent, leading icon)
Suspicious (warning) · Possible duplicate (info) · Pending review (neutral) · Escalated (error) · Disputed (warning)

## Priority pills
Low (sage-600) · Medium (info) · High (warning) · Critical (error, bold)

## AI verdict chips — always labelled "AI suggestion"
Valid (success) · Invalid (error) · Uncertain (warning)

## Category accents
Roads #285347 · Garbage #B65C40 · Streetlight #7D6A3E (line icons on tinted rounded tile)

## Typography
- Latin: Inter. Devanagari (Hindi, Marathi): Noto Sans Devanagari. Stack: `Inter, "Noto Sans Devanagari", system-ui, sans-serif`.
- Scale (px / line-height): display 32/40 · h1 24/32 · h2 20/28 · h3 17/24 · body 16/24 · label 14/20 · caption 13/18 · eyebrow 12/16 uppercase tracking 0.08em.
- Weights 400 / 500 / 600 / 700. No thin weights, no decorative fonts. Devanagari needs ≥1.5 line height.

## Shape, spacing, elevation
- Radius: cards & hero panels 16px · buttons & inputs 10px · pills/badges full.
- Spacing scale 4px base: 4, 8, 12, 16, 24, 32, 48, 64.
- Borders 1px stone-300; elevation minimal (one soft shadow for modals/bottom sheets only).
- Min touch target 44×44px. Focus: 2px teal-700 outline, 2px offset (ivory outline on dark surfaces).

## Layout patterns
- Hero panel: forest-900 card, brass eyebrow, ivory headline, ivory body, brass primary button + ivory text link, thin divider, two stats (ivory / brass) with sage-100 labels.
- Issue row/card on ivory: sage-100 icon tile, charcoal title, graphite metadata, status pill right, thin teal progress bar on stone track.
- Mobile-first for citizen & contractor; desktop layout (sidebar + content) for admin.
- Line icons only (e.g. Lucide). No emoji, gradients, glassmorphism or illustrations.

## Do / Don't
- Do keep brass sparse; Don't make gold the dominant colour.
- Do show statuses, flags and AI verdicts with text labels; Don't rely on colour.
- Do keep all UI strings translatable (en / hi / mr); Don't hardcode text in images.
