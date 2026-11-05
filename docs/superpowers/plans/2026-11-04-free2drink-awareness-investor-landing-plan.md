# Free2Drink Awareness + Investor Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the existing Free2Drink 3D carton prototype into a polished landing page that explains the model to advertisers, water partners, and investors.

**Architecture:** Keep a single buildless `index.html` with semantic landing-page sections, inline CSS, and the existing Three.js module. Preserve the current preview logic and add only lightweight anchor navigation and CTA interactions.

**Tech Stack:** HTML, CSS, vanilla JavaScript, Three.js via jsDelivr import map.

---

### Task 1: Restructure the page shell and content

**Files:**
- Modify: `/Users/roy/Downloads/free2drink/index.html`

- [ ] Replace the current top-level body markup with a semantic header, hero, audience navigation, how-it-works, audience lanes, scale/investor section, demo section, final CTA, and footer while retaining the existing preview/editor markup in the demo section.
- [ ] Add anchor IDs `advertisers`, `partners`, `investors`, and `preview` and make the header and CTA buttons point to them.
- [ ] Use copy that describes the model clearly and avoids unsupported traction or financial claims.

### Task 2: Add the visual system and responsive layout

**Files:**
- Modify: `/Users/roy/Downloads/free2drink/index.html`

- [ ] Replace the current page-specific CSS with a cohesive landing-page system using warm paper, deep green, mint, and citrus accents.
- [ ] Add responsive grid behavior for the three audience cards, how-it-works steps, investor section, and existing 3D workspace.
- [ ] Add visible focus states and accessible hover states for navigation and CTA controls.

### Task 3: Preserve and connect the interactive prototype

**Files:**
- Modify: `/Users/roy/Downloads/free2drink/index.html`

- [ ] Keep the current Three.js carton preview, panel selection, image upload, rotation, reset, zoom, and download behavior intact.
- [ ] Add CTA behavior that updates the toast with a useful next step for advertiser, partner, or investor actions without pretending to submit a form.
- [ ] Ensure the existing demo controls remain usable on mobile and that `index.html` still opens directly.

### Task 4: Verify the static experience

**Files:**
- Test: `/Users/roy/Downloads/free2drink/index.html`

- [ ] Run a structural check for required sections, IDs, CTA labels, and the Three.js import.
- [ ] Serve the directory locally and inspect the page in a browser if available.
- [ ] Verify no placeholder copy, broken internal anchors, or console-blocking JavaScript errors were introduced.

