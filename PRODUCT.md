# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

A security team working a SOC: analysts on shifts who triage alerts and investigate attackers, and administrators (the Operator role) who run the honeypot fleet and change its configuration. Analysts use the Viewer role, which is read-only: they see no write controls.

## Product Purpose

APIARY (Automated Payload Intelligence & Attacker Response) runs a fleet of honeypot sensors. This dashboard is where the team works with what the fleet captures, and it carries three jobs with equal weight:

- **Investigate:** drill from an event to its source, session, payload, campaign and attacker identity, and understand what an attacker did.
- **Watch the fleet live:** see at a glance whether every sensor is still feeding, what is happening now, and get alerted.
- **Produce intelligence:** reports, indicators and findings the team can hand on.

Success: an analyst gets from "something happened" to "what it was, who did it, and what to do" without leaving the dashboard.

## Positioning

The dashboard reads one deployment's own captured attack traffic: real sessions, commands, credentials and payloads from its own decoys, enriched by its own analysis pipeline (sandbox, Ghidra, CAPE, RevDeck, ML and LLM analysis). It is an operations and investigation tool for that fleet, not a generic SIEM or a threat-intel feed.

## Operating Context

- Used at a desk on laptops, desktops and 4K monitors; sometimes on a phone to check alerts.
- Internal only, behind Keycloak sign-in; there is no public or marketing surface.
- What it shows is also shown to others: demos, screenshots and generated PDF reports reach outsiders.
- Pages render attacker-controlled content (commands, payload previews, event details), so escaping and the Content-Security-Policy are product constraints, not polish.

## Capabilities and Constraints

- Clean-room rewrite of the running APIARY dashboard on TanStack Start, Bun and Astryx; the running implementation is the behavioral reference, not a component source.
- Built on Astryx, Meta's design system: its guidelines are binding (the Astryx block in `AGENTS.md`, `bunx astryx docs <topic>`). Components for everything they cover, semantic tokens for every value, color only in the theme.
- Current stage: every page reads the APIARY backend through the real server-function, session and security layer; there is no mock backend (dash#324), and pages are tested against production with the live checks (`e2e/live/`).
- Roles: Operator (admin) and Analyst (viewer); the server enforces every permission, the UI only hides what a role cannot do.
- Reads go through Elasticsearch, never straight from sensor logs (canonical rule).
- Public repository: test data uses documentation IP ranges and example.test; the live checks take the dashboard's URL from the environment; no real deployment addresses, credentials or tokens.
- Undecided: the cutover from the running dashboard (#7).

## Brand Commitments

- Name APIARY and the tagline exactly: "Automated Payload Intelligence & Attacker Response".
- The canonical visual system lives in the APIARY repository's `branding/` folder (bee-and-honeycomb mark, copper accent on charcoal and ivory) and `Xore/theme`; the dashboard's palettes are imported from that theme.
- Logo rules from `branding/README.md`: horizontal lockup primary, emblem below 420 px, never recolored or stretched.

## Evidence on Hand

- Logo, favicon and social assets: APIARY repository, `branding/assets/`.
- Brand guide PDF: APIARY repository, `branding/pdf/APIARY-brand-guide.pdf`.
- Route, function and field inventories of the running dashboard: `docs/migration/`.
- No customer list, testimonials or public metrics exist; do not invent them.

## Product Principles

- Every view is a step in an investigation: anything shown links to the entity behind it.
- One fleet, one truth: the same number agrees on every page that shows it.
- The page shows its shape at once; data fills it in. Nothing blocks on a spinner.
- Safe by default with hostile content: attacker bytes are displayed, never executed.
- What leaves the dashboard (screenshots, PDFs, demos) must read on its own.

## Accessibility & Inclusion

WCAG 2.1 A/AA, enforced by the axe check of the live checks (`e2e/live/a11y.ts`, `docs/baselines/accessibility.json`) on every palette's default theme; high-contrast variants of every palette are offered in Settings.
