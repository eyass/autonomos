# UI touch-up: landing page, marketing shell, app shell

Date: 2026-09-30. Scope agreed in chat: landing page and marketing shell first, then the app shell and shared app surfaces, in one visual system. Brand stays as the README defines it (teal, signal orange, Bricolage Grotesque, Instrument Sans, JetBrains Mono).

## References (Mobbin)

- Hero: centred headline, one-line subhead, two CTAs, mono trust line (Zaro), logo strip inside the hero (Intercom, Sana), the product shown large below the fold line (Sana, Retool).
- Story: "Context in, action out" rows with status pills (Runner); big numbered steps (Clay, Browserbase).
- Pricing: highlighted middle plan with a "Most popular" band, "Everything in X, plus" (Supabase, Reducto).
- Closing: dark rounded CTA panel above a multi-column footer (Voiceflow).
- App: setup checklist on the overview (Gorgias), KPI strip (n8n), template cards in empty lists (ElevenLabs), plan usage in the sidebar (Relevance AI).

## Problems today

1. Ten sections share one treatment (bordered cards on flat bands), so nothing leads.
2. The hero's product card is small; the logo wall is a separate, heavy grid of tiles.
3. The differentiator, "The model proposes. Code decides.", sits mid-page at h3 size.
4. Setup and How it works tell overlapping stories in two sections.
5. Pricing hides the free plan in a sentence; the footer is a single row of links.

## Landing page, top to bottom

1. **Hero (ink).** Centred. Eyebrow pill, h1 "Automate the recurring work. Safely." at up to 76px, subhead, Start free + See it work, mono trust line ("Free plan · No card · Sandbox first"). Below, a wide product stage: a browser-framed mini app with a run timeline (the existing refund run), the policy check and the approval, so the product reads at a glance. A slow, pausable logo marquee closes the hero; `prefers-reduced-motion` stops it.
2. **How it works.** One section replacing Setup + How it works: three alternating rows (Map the work, Pick what to automate, Deploy under control), large visual on one side, number, title, two-line body and one proof point on the other. The setup steps become a compact "Live in minutes" strip inside it.
3. **Workflows** ("Example", "One agent, many tools"). Kept; chains restyled with connectors and a hover lift.
4. **Control (ink).** Dark section for contrast. h2 "The model proposes. Code decides." Levels ladder, policy flow, six controls in a grid with icon tiles.
5. **The math.** Kept, card polish.
6. **By team.** Kept, card polish.
7. **Pricing.** Four plans from `PLANS`: Free, Starter, Growth ("Most popular" band), Larger teams; "Everything in X, plus" lists.
8. **Closing CTA.** Rounded ink panel with the level meter and orange Start free.
9. **Footer.** Four columns (Product, Solutions, Resources, Company) and a bottom bar.

Header: 64px, centred nav on desktop, stays light and sticky.

## App shell and shared surfaces

- Sidebar: stronger active state, section labels, plan usage meter at the foot where the data is already loaded.
- Page header, stat cards, empty states and cards: one type scale and spacing rhythm; stat cards as a KPI strip.
- No data-model, route or copy-meaning changes.

## Constraints

- Keep e2e contracts: h1 contains "Automate the recurring work", a "Start free" link to `/signup`, visible "Example" text, no horizontal overflow at 390px.
- Server components only on the marketing site; animation in CSS.
- Product copy never names the stack.

## Verification

`pnpm typecheck`, `pnpm lint`, `pnpm build`, screenshots at 1440 and 390 of every marketing page.
