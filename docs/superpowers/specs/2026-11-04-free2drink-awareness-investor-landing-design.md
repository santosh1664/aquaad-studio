# Free2Drink Awareness + Investor Landing Page

## Goal

Reposition the existing Free2Drink prototype as a public-facing landing page that explains Free2Drink to three audiences: advertisers, water/carton partners, and investors. The page should make the business legible within seconds, feel credible for a new brand, and drive visitors toward a relevant conversation.

## Product story

Free2Drink turns everyday water cartons into useful, high-visibility advertising space. Brands bring the message, Free2Drink coordinates the packaging opportunity, and water partners help put the branded cartons into circulation. The business is presented as a scalable physical-media network, without claiming traction, revenue, or market size that has not been provided.

## Experience and content

1. **Header** — Free2Drink brand mark, concise navigation anchors, and a primary contact action.
2. **Hero** — “Turn every sip into a brand impression.” Supporting copy explains the concept in plain language. Three audience actions are visible: Advertise, Partner, and Invest.
3. **Interactive proof** — A simplified rotating carton/ad preview that demonstrates the concept visually. The current 3D prototype remains available as a secondary demo; its upload and rotate interactions should continue working.
4. **How it works** — A four-step flow: brand provides artwork, Free2Drink places the message, partners distribute cartons, people encounter the brand in real life.
5. **Three audience lanes** — Separate cards for advertisers, water/carton partners, and investors. Each card states the value proposition and has a focused CTA.
6. **Why now / built to scale** — Investor-friendly narrative around repeat consumption, useful packaging, repeatable inventory, city-by-city expansion, and network effects. No fabricated metrics.
7. **Trust section** — Explain that Free2Drink is building a new surface for physical-world media and that the current preview is a concept demonstration, not a print-ready dieline.
8. **Final CTA** — “Help us make every carton count.” Invite visitors to start a campaign, become a partner, or explore the opportunity.
9. **Footer** — Contact details, audience links, and a short concept disclaimer.

## Visual direction

Use a calm, premium water-inspired palette: warm off-white paper, deep green ink, mint surfaces, and a restrained citrus accent. The reference site informs the product-led, sustainability-adjacent mood, rounded cards, and editorial whitespace, but the layout and copy remain original to Free2Drink. Typography should feel modern and confident, with large, compact headlines and readable supporting text.

## Interaction and technical scope

- Keep the project buildless and self-contained in `index.html`.
- Preserve Three.js via the existing import map and keep the carton preview functional: drag to rotate, scroll to zoom, pause/reset, download, panel selection, and local image upload.
- Add lightweight section navigation with anchor links and audience CTA buttons that scroll to the relevant section or open an email/contact action.
- Avoid backend, authentication, billing, analytics, or cloud uploads.
- Uploaded artwork remains browser-local, as in the current prototype.
- Ensure responsive layouts for desktop, tablet, and mobile, with accessible button labels, focus states, and semantic sections.

## Success criteria

- A first-time visitor can explain what Free2Drink does after reading the hero.
- Advertisers, partners, and investors each have an obvious next step.
- The page makes the investment opportunity feel concrete through the business model and scalability narrative, without unsupported financial claims.
- The existing 3D concept remains usable and visually supports the story.
- The page works by opening `index.html` directly with an internet connection for Three.js.

