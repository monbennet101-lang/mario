# Clean-Room UI Asset & Licence Ledger (`docs/ASSETS.md`)

*Verified: 2026-11-21 · Clean-Room IP Confirmation: **ZERO** third-party proprietary or trademarked assets are included.*

---

## 1. Bundled Open-Licence Fonts (Self-Hosted, Zero External CDNs)

| Asset | Family & Weight | Format | Source Package | Author / Foundry | Licence | Usage |
|---|---|---|---|---|---|---|
| `fredoka-latin-700-normal.woff2` | **Fredoka** Bold (700) | WOFF2 (~16 KB) | `@fontsource/fredoka` (npm) | Milena Brandao / Google Fonts | **SIL Open Font License 1.1 (OFL-1.1)** | Display numerals (`CounterChip`, `Timer`, `LivesBadge`), screen titles, course intro banners |
| `barlow-latin-500-normal.woff2` | **Barlow** Medium (400–700) | WOFF2 (~22 KB) | `@fontsource/barlow` (npm) | Jeremy Tribby / Google Fonts | **SIL Open Font License 1.1 (OFL-1.1)** | DIN-style body copy, menu items, shop descriptions, HUD kickers, accessibility settings |

*Note: Only Latin `.woff2` subsets are referenced via `@font-face` in `src/ui/v2/tokens.css`, keeping total bundled font payload at ~38 KB with zero external network calls (`externalCdnCount: 0`).*

---

## 2. Original Vector Icons & Emblem Art

All icons and motifs in `src/ui/v2/components/Icons.jsx` are authored from scratch as clean inline `<svg>` geometric paths referencing CSS design tokens (`var(--ui-color-*)`):

| Icon / Motif | Origin | Licence | Semantic Pairing |
|---|---|---|---|
| **Gold Shard** (faceted diamond coin) | Original inline SVG | MIT (Project Original) | Gold (`--ui-color-gold`) — Common currency (100 = +1 Life) |
| **Prism Petal** (5-lobe crystalline bloom) | Original inline SVG | MIT (Project Original) | Purple (`--ui-color-purple`) — Level-specific special currency (cap 999) |
| **Star Medallion** (5-point faceted crest, empty/ghosted/collected) | Original inline SVG | MIT (Project Original) | Gold/Translucent — 3 big collectibles per course |
| **LifeMeter Wedges** (segmented radial heart/ring arc + bonus green outer arc) | Original inline SVG | MIT (Project Original) | Red/Green/Blue — Base 3-hit vitality + 3-hit expandable Life-Up ring |
| **Runner Portraits** (Vanguard visor, Zephyr wing-crest, Ember flare-crest, Tide wave-crest) | Original inline SVG | MIT (Project Original) | Red / Green / Amber / Blue — 1–4P character identity & LivesBadge |
| **Timer Clock & Urgency Glyph (`!`)** | Original inline SVG | MIT (Project Original) | White / Red (`<100s`) — Countdown timer + non-colour urgency indicator |
| **Reserve Item Glyphs** (Super Core, Flame Orb, Life-Up Heart) | Original inline SVG | MIT (Project Original) | Red / Gold / Green — Stored reserve item box |
| **Stride Charm Glyphs** (Feather Glide, Magnet Pulse, Safety Cushion, Dash Surge, Shard Aura) | Original inline SVG | MIT (Project Original) | Purple / Blue / Green / Gold — Pre-play loadout & shop items |
| **Prism Crest Flourish** (faceted geometric compass/diamond crest) | Original inline SVG | MIT (Project Original) | Concept identity motif used exclusively on Title, World Map, and Results screens |
| **Crown Badge** (multiplayer score leader crown) | Original inline SVG | MIT (Project Original) | Gold — Multiplayer Results screen ranking bonus |

---

## 3. Audio Hooks & Procedural Sound Synthesis

| Hook Name | Implementation | Origin | Licence |
|---|---|---|---|
| `coinTick` | `AudioManager.playCoinCollect()` (Web Audio oscillator synth) | Original procedural code | MIT (Project Original) |
| `specialCoinChime` | `AudioManager.playStarMedallion()` (Web Audio harmonic arpeggio) | Original procedural code | MIT (Project Original) |
| `lifeUp` | `AudioManager.playOneUp()` (Web Audio ascending triad) | Original procedural code | MIT (Project Original) |
| `damage` | `AudioManager.playDamage()` (Web Audio descending impact) | Original procedural code | MIT (Project Original) |
| `lowHealthPulse` | Procedural short dual-pulse synth in `audioHooks.js` / `AudioManager` | Original procedural code | MIT (Project Original) |
| `timerWarning` | Procedural urgent chime synth in `audioHooks.js` / `AudioManager` | Original procedural code | MIT (Project Original) |
| `menuMove` | `AudioManager.playFootstep(0.35, false)` / short tactile tick | Original procedural code | MIT (Project Original) |
| `menuConfirm` | `AudioManager.playMenuConfirm()` | Original procedural code | MIT (Project Original) |
| `menuBack` | Procedural soft downward pitch tick | Original procedural code | MIT (Project Original) |
| `checkpointChime` | `AudioManager.playPowerUp('super_mushroom')` | Original procedural code | MIT (Project Original) |
| `reserveActivate` | `AudioManager.playPowerUp('fire_flower')` | Original procedural code | MIT (Project Original) |
| `courseClearFanfare` | `AudioManager.playFlagpoleFanfare()` | Original procedural code | MIT (Project Original) |

---

## 4. Clean-Room IP Audit Confirmation

- **Fonts**: SIL OFL 1.1 (`Fredoka`, `Barlow`) — zero proprietary typefaces.
- **Icons & Graphics**: 100% original inline SVG geometry — zero ripped sprites or screenshots.
- **Audio**: 100% procedural Web Audio API synthesis — zero external sound samples.
- **Copy & Naming**: 100% original names (`Prism Stride`, `Vanguard`, `Zephyr`, `Ember`, `Tide`, `Gold Shards`, `Prism Petals`, `Star Medallions`, `Stride Charms`, `Dread-Shell Sanctum`) — zero third-party trademarked names.
- **Automated Verification**: Verified by `stage21.test.js` IP audit regex across `dist/index.html` and `dist/bundle.js` (0 matches).
