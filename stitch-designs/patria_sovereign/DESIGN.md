# Design System Strategy: The Curated Ledger

## 1. Overview & Creative North Star
The "Creative North Star" for this design system is **The Curated Ledger**. 

In the world of family finance, "trust" is often misidentified as "rigidity." This system moves beyond the cold, spreadsheet-driven aesthetics of traditional banking. Instead, it adopts a **High-End Editorial** approach—combining the authority of a private wealth management firm with the warmth of a modern family home. 

We break the "template" look through intentional asymmetry, generous white space (breathing room), and a sophisticated layering of surfaces. The layout should feel like a series of physical, high-quality assets stacked on a desk, rather than a flat digital screen. We prioritize clarity through typography and tonal depth, not through boxes and lines.

---

## 2. Colors & Surface Philosophy
This design system utilizes a palette that balances high-energy "Action" tones with "Safe" grounding neutrals.

### The "No-Line" Rule
**Explicit Instruction:** Designers are prohibited from using 1px solid borders for sectioning or containment. 
Boundaries must be defined solely through background color shifts. For example, a `surface-container-low` section sitting on a `surface` background creates a clear but soft distinction. Lines are a crutch; tonal contrast is a skill.

### Surface Hierarchy & Nesting
Treat the UI as a physical stack of materials. 
- **Base Layer:** `surface` (#f6fafe) – The foundation of the app.
- **Content Zones:** `surface-container-low` (#f0f4f8) – For grouping related information.
- **Interaction Cards:** `surface-container-lowest` (#ffffff) – Used to "lift" primary content (like account balances) off the page.
- **Overlays:** Semi-transparent versions of `surface-bright` with a 20px backdrop-blur to create a "glass" effect for navigation bars.

### Signature Textures
To avoid a generic flat feel, use subtle gradients for primary actions. Instead of a flat `#FFCC00`, use a linear gradient from `primary` (#745b00) to `primary-container` (#FFCC00) at a 135-degree angle. This adds "soul" and a metallic, premium finish to the financial-grade interface.

---

## 3. Typography: The Editorial Voice
We use a dual-typeface strategy to balance character with high-fidelity readability.

*   **Display & Headlines (Manrope):** Our "Authoritative" voice. Use `display-lg` through `headline-sm` for hero numbers and section headers. Manrope’s geometric clarity feels modern and high-trust.
*   **Body & Labels (Inter):** Our "Utility" voice. All transactional data, helper text, and button labels use Inter. Medium weights (`500`) are preferred for labels to ensure they feel premium and grounded.

**The Typographic Scale Strategy:** 
Use extreme scale to create hierarchy. A `display-md` balance ($42,000.00) should sit confidently above a `label-md` descriptive text ("Total Family Savings"). This high contrast mimics high-end financial reporting.

---

## 4. Elevation & Depth
In this design system, depth is a functional tool for family hierarchy and financial safety.

### The Layering Principle
Achieve depth by stacking `surface-container` tiers. 
- Place a `surface-container-lowest` card on a `surface-container-low` background. 
- This creates a soft, natural "lift" that guides the eye without visual noise.

### Ambient Shadows
When an element must float (e.g., the FAB), use **Ambient Shadows**. 
- **Token:** `0px 8px 24px rgba(23, 28, 31, 0.06)`. 
- Shadows must never be pure black; they are tinted with `on-surface` (#171c1f) at ultra-low opacity to mimic natural light in a bright room.

### Glassmorphism
The **72px Bottom Navigation** and **56px FAB** should utilize glassmorphism. Use a `surface` color at 80% opacity with a heavy `blur(12px)`. This makes the navigation feel integrated into the family’s data, rather than a separate "footer" block.

---

## 5. Components

### Buttons
- **Primary:** 12px (`md`) radius. Background: `primary-container`. Text: `on-primary-container`.
- **Secondary:** 12px (`md`) radius. Background: `secondary-container`. Text: `on-secondary-container`.
- **Styling:** Use a subtle 1px "Ghost Border" (10% opacity `outline-variant`) to define the shape on very bright screens.

### Cards (The "Ledger" Card)
- **Radius:** 16px (`xl`).
- **Separation:** No dividers. Use `1.5rem` (6) of vertical spacing between items.
- **Header:** Use `title-sm` for category names and `display-sm` for currency values.

### Input Fields
- **Style:** Understated. Use `surface-container-high` for the input background with a 12px radius. 
- **Focus State:** Transition the background to `surface-container-lowest` and add a 2px `primary` bottom-stroke. This avoids the "boxy" look of traditional forms.

### Checkboxes & Radios
- **States:** Checked states use `tertiary` (#006D2F) to signal "Success/Safe" financial status. Unchecked states use `outline-variant` at 40% opacity.

### Navigation Components
- **Bottom Nav (72px):** Icons should be 24px, centered, with `label-sm` text. Use a `surface-container-lowest` background with a glass blur.
- **FAB (56px):** Floating Action Button for "Add Transaction" or "Transfer." Use `primary-container` with a high-diffusion ambient shadow.

---

## 6. Do’s and Don’ts

### Do
- **Do** use `2rem` (8) or `3rem` (12) padding for hero sections. Space is luxury.
- **Do** use `tertiary` (#006d2f) for all positive financial trends.
- **Do** use `secondary` (#49607c) for action-oriented dark blue elements (Warning/Action).
- **Do** align all currency decimals. Financial trust is built on precision.

### Don’t
- **Don’t** use a 1px solid border to separate list items. Use white space or a 4px `surface-variant` horizontal pill as a "soft divider."
- **Don’t** use pure black (#000000) for text. Always use `on-surface` (#171c1f) for better optical comfort.
- **Don’t** use 90-degree corners. Everything in a family-centric app should feel approachable (minimum 4px radius).
- **Don’t** use generic "Success Green." Stick to the `tertiary` tokens provided to maintain the sophisticated financial tone.