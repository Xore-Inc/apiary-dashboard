---
name: APIARY Dashboard
description: Automated Payload Intelligence & Attacker Response — the SOC's honeypot dashboard
colors:
  hive-copper: "#af593f"
  hive-copper-night: "#d97757"
  copper-text-on-soft: "#a2472b"
  copper-soft: "rgba(199, 101, 72, 0.12)"
  text-on-copper: "#fffaf5"
  ivory-ground: "#f7f6f2"
  ivory-chrome: "#f0efeb"
  ivory-card: "#fbfaf7"
  ivory-raised: "#fffefa"
  ivory-muted: "#f4f2ed"
  charcoal-ground: "#20201f"
  charcoal-chrome: "#1e1e1c"
  charcoal-card: "#242422"
  charcoal-raised: "#383835"
  ink: "#2f2b27"
  ink-secondary: "#68615a"
  ink-faint: "#aaa49d"
  bone: "#e9e6df"
  bone-secondary: "#a8a49c"
  hairline: "rgba(34, 31, 28, 0.14)"
  moss-success: "#3f8764"
  ochre-warning: "#9b6b25"
  brick-danger: "#b34f4c"
  slate-info: "#487eaa"
typography:
  headline:
    fontFamily: "Figtree, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif"
    fontSize: "24px"
    fontWeight: 600
    lineHeight: 1.33
  title:
    fontFamily: "Figtree, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "Figtree, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.43
  label:
    fontFamily: "Figtree, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.45
  code:
    fontFamily: "ui-monospace, SF Mono, Monaco, Consolas, Liberation Mono, Courier New, monospace"
    fontSize: "14px"
    fontWeight: 400
rounded:
  radius-inner: "6px"
  radius-element: "10px"
  radius-container: "12px"
  radius-page: "28px"
  radius-full: "9999px"
spacing:
  spacing-1: "4px"
  spacing-2: "8px"
  spacing-3: "12px"
  spacing-4: "16px"
  spacing-6: "24px"
components:
  button-secondary:
    backgroundColor: "rgba(47, 43, 39, 0.04)"
    textColor: "{colors.ink}"
    rounded: "{rounded.radius-element}"
    padding: "8px 12px"
    height: "32px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.radius-element}"
    padding: "8px 12px"
    height: "28px"
  button-primary:
    backgroundColor: "{colors.hive-copper}"
    textColor: "{colors.text-on-copper}"
    rounded: "{rounded.radius-element}"
    padding: "8px 12px"
    height: "32px"
  card:
    backgroundColor: "{colors.ivory-card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.radius-container}"
    padding: "12px"
  nav-item-selected:
    backgroundColor: "{colors.copper-soft}"
    textColor: "{colors.copper-text-on-soft}"
    rounded: "{rounded.radius-element}"
    padding: "0 8px"
    height: "32px"
  token:
    rounded: "{rounded.radius-inner}"
    typography: "{typography.label}"
    padding: "0 8px"
    height: "20px"
  table-cell:
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    padding: "8px 12px"
---

# Design System: APIARY Dashboard

This dashboard is built on **Astryx** (Meta's design system) and follows its guidelines: `AGENTS.md` (the Astryx block) and `bunx astryx docs <topic>` are binding. This file names what the APIARY look *is*; Astryx decides *how* it is expressed. Where the two disagree, Astryx wins.

**How the frontmatter is meant:** the hex values above are what the default theme (the Claude palette, light) resolves to, recorded so the look can be described and compared. They are documentation, never code. App code reaches every value through Astryx: a component prop, a semantic token (`var(--color-*)`, `--spacing-*`, `--radius-*`, `--shadow-*`, `--text-*`), or a token-backed Tailwind utility. Colors live in the theme (`src/themes/`), never in `:root` overrides or components.

## Overview

**Creative North Star: "The Quiet Apiary"**

A hive is calm on the outside and busy within. The dashboard is the same: warm ivory and charcoal surroundings, hairline structure, and one copper voice, so that the thing that matters (an attacker's session, a payload, a failing sensor) is what draws the eye. Analysts sit in it for whole shifts; the frame stays low-fatigue so their attention goes to the evidence.

It is warm and crafted rather than clinical, and all of that warmth lives in the theme, not in the pages: APIARY's palettes (imported from `Xore/theme` into the neutral Astryx theme family), Figtree, and Astryx's own component anatomy. Pages stay theme-agnostic, so every palette, dark mode and high contrast work everywhere at once. Density is high where the work is (tables, timelines, raw records) and the chrome around it stays out of the way.

It is never hacker-movie neon, never a generic blue admin template, and never a wall of alarm: severity color appears only where it means something.

**Key Characteristics:**
- Warm ivory (light) and charcoal (dark) grounds; the chrome sits one step darker than the page.
- One accent, Hive Copper (`--color-accent`), for action and "you are here"; status tokens only for status.
- Flat by default, as Astryx prescribes: elevation encodes stacking, not decoration.
- Astryx components for everything they cover; tokens for every value; no hand-rolled CSS.
- Every palette in Settings is a whole theme; the values above are the default (Claude) palette.

## Colors

Warm neutrals with a single copper voice and muted, earthy status tones, all set by the theme and read through Astryx's semantic color tokens.

### Primary
- **Hive Copper** (`--color-accent`, `--color-icon-accent`; #af593f light, #d97757 dark): primary buttons, focus, selection. Filled copper is the one committing action on a view.
- **Copper on Soft** (`--color-text-accent`): accent text, the selected navigation item; tuned to stay at 4.5:1 on its own soft tint.
- **Copper Soft** (`--color-accent-muted`): the tint behind the selected nav item and accent chips.

### Neutral
- **Ivory / Charcoal Ground** (`--color-background-surface`): the content sheet.
- **Ivory / Charcoal Chrome** (`--color-background-body`): sidebar and top bar, one step darker than the page.
- **Ivory / Charcoal Card** (`--color-background-card`): Card widgets.
- **Ivory / Charcoal Raised** (`--color-background-popover`): menus, popovers, dialogs.
- **Muted** (`--color-background-muted`), **Neutral fill** (`--color-neutral`): quiet fills, secondary buttons, code backgrounds.
- **Ink / Bone** (`--color-text-primary`, `--color-icon-primary`): primary text and icons.
- **Ink / Bone Secondary** (`--color-text-secondary`, `--color-icon-secondary`): descriptions, metadata, column headers. Never `--color-text-disabled` for content.
- **Hairline** (`--color-border`, `--color-border-emphasized`): borders and dividers.

### Status
- **Moss** (`--color-success`), **Ochre** (`--color-warning`), **Brick** (`--color-error`), each with its `-muted` tint and `--color-on-*` text; the categorical `--color-background-*` / `--color-text-*` pairs (blue, orange, red…) carry severities and verdicts on Tokens. Chart series use `--color-data-categorical-*`.

### Named Rules
**The One Voice Rule.** Copper (`--color-accent`) is the only accent. It marks action and location; it is never decoration, never a chart series, never a severity.

**The Earned Red Rule.** Error color appears only on a severity, a failed state or a destructive action. A page full of red means the page is wrong, not the fleet.

**The Theme Owns Color Rule.** A palette is a whole theme member in `src/themes/`, changing every role at once. Pages and components never name a color; no hex, no `:root` override, no re-tinting only the accent.

## Typography

**Body and heading font:** Figtree (theme `typography.body` / `heading`, self-hosted), with the system sans fallbacks
**Code font:** the platform monospace (`--font-family-code`)

**Character:** one warm humanist sans for everything readable, and plain monospace for everything an attacker typed or a machine emitted. The contrast is the point: monospace means evidence.

### Hierarchy
Astryx's semantic type scale (base 14px, ratio 1.2), reached through `Heading` and `Text` rather than font sizes:
- **Headline** (`Heading level={1}`, `--text-heading-1-*`: 600, 24px, 1.33): page titles.
- **Title** (`Heading level={2}`, `--text-heading-2-*`: 600, 20px, 1.4): section and panel titles.
- **Body** (`Text`, `--font-size-base`: 400, 14px): table cells, descriptions, form text. Leave body copy at its defaults; demote by weight and color, not size.
- **Label** (`Text type="supporting"`, `--font-size-sm`: 12px): captions and metadata; Tokens carry their own label style.
- **Code** (`Text type="code"`, `CodeBlock`): commands, payloads, hashes, raw records.

### Named Rules
**The Evidence Is Mono Rule.** Anything captured from an attacker or produced by a machine (commands, credentials, hashes, JSON, decompiled code) is set as code (`Text type="code"` or `CodeBlock`, wrapped); product copy never is.

## Layout

Frame-first, as `astryx docs layout` prescribes. The frame is one `AppShell`: `SideNav` of sections on the left (drawer below 1280px), `TopNav` carrying the view tabs, time range, search, live state and alert bell, and one content region. Every page is one `PageFrame` (lists through `RecordList`, records through `EntityFrame`): the trail (where the page sits; on a record, back to the list it came from with its filters, and ‹ n of N ›), the title row with tokens and actions, the description, the key facts, and the filters, all pinned and fenced by a divider; the work scrolls under them. A form caps its work, never the frame, so every page shares one left edge. On a record's page, blocks are headed groups separated by space, not cards. Tables, charts and timelines fill their region; forms and settings cap their width. Structure with the weakest container that reads as a group: spacing first, then Divider, then Section (the default unit), and Card only for self-contained widgets (KPI tiles, charts) or a hard boundary. Collections are rows: Table or List, edge-to-edge with dividers. Interior spacing uses the spacing tokens and component `gap` props (4px base: `--spacing-1` to `--spacing-6` in daily use); raw px only for structural widths such as column widths and region budgets. Above 2560px the whole UI scales (1.1×, 1.25× from 3200px; 4K at 150 % reports exactly 2560 and is not scaled twice) so 4K stays readable. Every page renders its own skeleton layout first, then its data. The standing actions (evidence handling, runbook, report a problem) are icons in the SideNav's footer icon row; nothing floats over the content.

## Elevation & Depth

Flat by default, exactly as Astryx defines elevation: depth comes from tone (chrome darker than the page, cards on their own surface token, hairline borders), and shadow encodes only stacking order. A level is chosen by how far a surface sits above the page, through the `elevation` prop or `--shadow-*`, never a hand-written box-shadow.

### Shadow Vocabulary
- **None** (default): Cards in a grid, inline Banners, standard Buttons, tables. Part of the page.
- **Low** (`--shadow-low`): in-flow surfaces that need emphasis to read as distinct from the background, used sparingly.
- **Medium** (`--shadow-med`): surfaces floating over nearby content: popovers, menus.
- **High** (`--shadow-high`): the topmost layer over the whole UI: dialogs and the command palette (intrinsic, no prop).

### Named Rules
**The Stacking Not Decoration Rule.** If a surface does not overlap anything it is `none` (or `low` for emphasis), never `med` or `high`; one level per surface, and borders come from `--color-border`, not shadows.

## Shapes

Astryx's semantic radius scale, which the neutral theme multiplies slightly softer: `--radius-inner` for small inner elements (Tokens, checkboxes), `--radius-element` for interactive controls (buttons, inputs, selectors, nav items), `--radius-container` for cards, panels and dialogs, `--radius-page` only for the content sheet, `--radius-full` for pills and status dots. Card computes concentric inner radii itself. Never a hardcoded radius.

## Components

Astryx components for everything they cover (`bunx astryx component <Name>` before using one). App components compose them; they add no visual primitives of their own.

### Buttons
Refined and restrained, through `Button` / `IconButton` variants only.
- **Primary:** filled accent, one per region, for the committing action.
- **Secondary:** the soft neutral fill; the default for page actions (CSV, JSON, Payload report, Operator actions).
- **Ghost:** no fill until hover; toolbar and row actions, icon-only in table rows.
- **Destructive:** in confirm dialogs only (Discard, Delete).
- **Buttons act, links go** (Astryx: "don't use a button for navigation"). A Button changes something (Unblock, Acknowledge, Save) or starts a task (New definition, Generate a report). A link that only opens another page is `ActionLink`, an Astryx standalone `Link` in accent; links that are data stay inline `Link` (see `AGENTS.md`).
- **Clickable tiles are raised.** A `StatTile` with `href` is a `ClickableCard` at `elevation="low"`, Astryx's cue that the whole card opens something; a tile that opens nothing stays flat.
- **Code inside a link takes the link's color** (`color="inherit"` on the code text), so a hash or session ID that opens a page reads as a link.

### Status: Tokens and StatusDots
- **Token** for severities, verdicts and labels, colored by the categorical palette; **StatusDot** for live state (feeds, services). **Badge** only for counts (the alert bell, tab counts).

### Cards
- **When:** self-contained widgets only: KPI tiles, charts, the payload's summary blocks. Never a wrapper around list items or page sections, never Card inside Card.
- **Surface:** `--color-background-card`, `--color-border` hairline, `--radius-container`, elevation `none`.

### Inputs / Fields
- **Style:** Astryx `TextInput`, `Selector`, `FilterSelect` compositions; controlled (`value` + `onChange`), `--radius-element`.
- **Focus:** the theme's inset focus ring (`--shadow-inset-selected`).
- **Error:** `FieldStatus` text under the field, shown after the first attempt.

### Navigation
- **SideNav:** five groups by the analyst's work (Monitor, Detections, Activity, Attackers, Evidence & output), four to six items each, one icon per meaning; Administration and the account menu in the footer, the standing actions in its icon row. The selected item takes the accent tint (theme component override on `side-nav-item`). Collapses to icons; drawer below 1280px.
- **TopNav:** the APIARY compact mark (brand asset, light/dark artwork) and the tagline as subheading; view tabs (overflow into More), breadcrumbs on untabbed pages, time range, search (mod+K, shown per platform), live state, alert bell. Controls are `sm` on desktop and `lg` in the drawer layout, for touch.

### Dialogs
Every modal goes through `AppDialog` / `ConfirmDialog` (Astryx `Dialog`): scrim, Escape and the close button close it; unsaved input asks first; focus returns to the opener.

### Tables (signature)
The core of the product: Astryx `Table` (via `RecordList`), rows edge-to-edge with dividers, secondary-ink headers, hover tint; detail and captured values as code. Each row opens its entity; per-row tools are icon-only ghost buttons at the right edge.

## Do's and Don'ts

### Do:
- **Do** read `bunx astryx docs layout` and the component docs before building a page; start from `bunx astryx build "<idea>"`.
- **Do** reach every value through a component prop, a semantic token or a token-backed utility.
- **Do** keep copper to action and location; let status tokens speak for status.
- **Do** render collections as Table or List rows, and use Section before Card.
- **Do** set every attacker- or machine-produced value as code.
- **Do** add a palette as a theme member and check its text on its own tints stays at 4.5:1.

### Don't:
- **Don't** write hex colors, raw px spacing, hand-written shadows, `style={{…}}` or raw `<div>` layout in app code.
- **Don't** override `--color-*` in `:root` or tint components locally; color belongs to the theme.
- **Don't** wrap rows or page sections in Cards, or nest Cards.
- **Don't** elevate a surface that does not sit above other content.
- **Don't** use Badge for status, or the disabled text color for content.
- **Don't** use hacker-movie neon, a generic blue admin-template look, or a wall of red.
