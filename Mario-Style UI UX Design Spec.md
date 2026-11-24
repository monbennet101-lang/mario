# Mario-Style UI/UX Design Spec

*Reference for agents and designers. Covers New Super Mario Bros. U (NSMBU), Super Mario 3D World (SM3DW), Super Mario Bros. Wonder (SMBW) and Super Mario Odyssey (SMO). Compiled 21 Nov 2026.*

## 0. How to read this spec

Nintendo publishes no pixel, timing or animation specs for these interfaces, and the forums and articles I searched mostly give *what* is on screen and *why*, not exact measurements. So every line below carries a tag:

- **\[S\]** Sourced: from Nintendo's own manuals or interviews, or the Super Mario Wiki.
- **\[C\]** Community: forum or blog observation. Plausible, not authoritative.
- **\[D\]** Derived: our design decision, inferred from the games. Treat numbers as starting values to tune against reference captures, never as facts about Nintendo's games.
- **\[V\]** Verify: believed true but not confirmed by a source I could open. Check against footage before relying on it.

Where sources conflict (for example, SMO corner placement of counters), the spec says so instead of picking one silently.

## 1. Philosophy: what the four games have in common

**P1. Information is for the next decision, not for completeness.** The Mario HUD has always been a thin, always-visible strip of the few numbers that matter, kept out of the play area (the original game fixed it to the top row and never moved it) \[S/C\]. Everything else lives one button-press away in a menu.

**P2. Failure is cheap and never walls the player.** SMO's director explained that lives were dropped because an exploration game has many restart points, lives were not essential, and a Game Over screen would be seen mostly by less experienced players and could put them off playing. Death costs 10 coins instead \[S\]. SM3DW's Game Over restarts the current course with five lives per player \[S\]. SMBW caps lives at 99 and takes only a quarter of flower coins (maximum 50) on Game Over \[S\]. Rule: a loss should sting a little and teach, never stop the session.

**P3. Surprise and delight are first-class UX.** SMBW's brief was a Mario full of hidden surprises, built around one core idea per course \[S\]. Interface moments (collect, goal, shop, badge equip) are rewards in themselves and get animation and sound, not just state changes.

**P4. One strong concept per game, expressed everywhere.** SMO is about travel, and fans read its HUD, captions and Power Moon titles as travel-journal styling (plain text, tidy lists, a brochure-like map) \[C\]. SMBW is about expressive characters and transformation, so its UI is chunky, friendly and animated. Pick one concept for *our* game and let the interface carry it.

**P5. Design for everyone at the couch.** SMBW was designed from the start for single player, local multiplayer and online play \[S\], and its multiplayer rules were built so other players can only help, not hinder \[S\]. Lives are shared in SM3DW and SMBW multiplayer \[S\]. Badges in SMBW let less confident players opt into assists \[S\].

**P6. Consistency is more important than novelty inside the interface.** Mario has used essentially one typeface family for HUDs, menus and logos since SM3D Land (2011) \[S\]. New games re-skin, not re-invent.

**P7. Non-diegetic HUD, diegetic delight.** Counters and meters sit outside the world (non-diegetic) \[S: Toptal/TNW classification\], while the world itself shows feedback: coins spin, flags glow, characters emote.

**P8. Different collectibles get different visual languages.** Yellow coins vs purple (regional or flower) coins vs big special collectibles are separated by colour, shape and counter, so players never have to read to tell them apart \[S\].

## 2. Per-game reference

### 2.1 NSMBU (2012, Wii U)

- **Course HUD** shows remaining lives, current coins, score, time remaining and the three Star Coin slots (collected vs not collected) \[S, manual\].
- **Star Coin ghosting:** if you collected Star Coins, passed a checkpoint and have not cleared the course, the coins collected so far appear translucent on replay \[S, manual\]. This is a good pattern for "progress saved but unbanked".
- **World map** is Super Mario World style: one large map, branching paths, free exploration, multiple exits per course \[S\]. Shows world and course names, remaining lives, Star Coin status and course state: unavailable, cleared, or flashing for uncleared \[S, manual\].
- **Saving:** automatic on clearing a tower or castle, plus a manual save from the map menu after the ending; three save files \[S, manual\].
- **Feel:** bright, flat-shaded, high-contrast, large readable numerals; a pre-HD heritage of a fixed top strip.

### 2.2 SM3DW (2013, Wii U)

- **Course HUD** shows remaining lives, coins, Green Stars (collected vs not yet), stored power-up item, time remaining, score, a stamp icon once the course's stamp is collected, and a free-camera icon \[S, manual\].
- **Timer** glows red below 100 seconds; SM3D Land and NSMB2 also beep each of the last 10 seconds, while SM3DW's style glows only \[S, wiki\].
- **World screen** shows current world and course, Green Stars, coins, lives, item storage and stamps; level flags show not cleared, cleared, or cleared by grabbing the very top of the goal pole \[S, manual\].
- **Item box:** stored power-up is used by a dedicated button or touch icon \[S, manual\].
- **Checkpoint rule:** touching a checkpoint as small Mario upgrades you to Super Mario \[S, manual\]. Checkpoints are rewards, not just save points.
- **Multiplayer:** end-of-course ranking and a crown that carries a score bonus into the next course \[S, manual\].

### 2.3 SMBW (2023, Switch)

- **Two currencies:** regular coins (extra lives at 100 \[D, 2026-11-21: confirmed at 100 Gold Shards, capped at 99 lives, `TOKENS.rules.coinsPerLife`\]) and purple flower coins with their own counter, capped at 999 \[S\]. Flower coins buy items, badges, standees and Wonder Seeds in Poplin shops \[S\].
- **Three large collectibles per course:** 10-flower coins, tracked per course and visible in the pause screen under the Wonder Seed count \[S\].
- **Coin variants by size:** large (worth 10), regular, small (worth a tenth, shown during Wonder effects); the displayed count rounds down after the effect \[S\]. This is a clever way to show a flood of rewards without breaking counter semantics.
- **Badges:** equipped before a course or after losing a life \[S\]. Loadout is a calm, pre-play moment, not an in-play menu.
- **Lives and multiplayer:** shared lives, max 99 \[S\].
- **Typography:** the modern Super Mario typeface, now with a lowercase set, for display text; the interface text uses the licensed DIN 2014 \[S, wiki\]. Kana uses licensed Japanese gothic faces \[S\].
- **No countdown timer** in courses \[D, 2026-11-21: Timer implemented as optional via `settings.timerEnabled`; defaults enabled for timed campaign courses with warning at `< 100s` and toggleable off for exploration play\].
- **Characters and enemies are unusually expressive** and a stated design goal, so UI avatars, lives icons and results screens should emote too \[S, Ask the Developer\].
- **Style:** chunky outlines, thick drop shadows, saturated flat colour, rounded shapes (a style other developers openly cite as influenced by it) \[C\].

### 2.4 SMO (2017, Switch)

- **Life meter:** three wedges, a Life-Up Heart adds three more and the extra meter appears in a distinct colour \[S, wiki\]. No lives, no Game Over; death costs 10 coins \[S\].
- **HUD contents:** life gauge with a compass beneath it, a count for the current kingdom's Power Moons, separate counters for gold coins and the kingdom's purple regional coins, and on-screen hints for the Power Moon quota needed to fly the ship onward \[S/C\]. The prototype HUD lacked button hints for map (−) and menu (+) and the compass; they were added for release \[S, wiki\].
- **Corner placement is disputed.** One community guide places coins top-left, moons top-right, life bottom-left; the wiki confirms only "compass under the life meter". Do **not** hard-code SMO's corner layout from this document; capture it from footage first \[V\] -> \[D, 2026-11-21: Conservative tokenised layout adopted in `TOKENS.layout.slots`: Top-Left = Survival (`LivesBadge`, `LifeMeter`, `ReserveItemBox`), Top-Centre = Objective (`CollectibleTracker`), Top-Right = Wealth (`Gold Shards`, `Prism Petals`) + Context (`Course Code`, optional `Timer`), Bottom corners = transient `Prompt`/`Toast` only\].
- **Look:** plain white type and simple circular gauges, called "stark" and generic by critics and "organised" by fans; the travel theme shows in lists and captions rather than ornament \[C\]. Odyssey uses its own geometric sans designed in 2017 for display text \[S, wiki\].
- **Menu (+):** Moons, map, outfits, hints \[C\].
- **Spend-and-reward loop:** coins are real currency (outfits, souvenirs, even Power Moons), which is why taking coins on death still feels meaningful \[S/C\].

## 3. Cross-game invariants (our design rules)

These are **\[D\]** unless marked. Numbers are starting values.

### 3.1 Layout

1. HUD occupies a thin border band only. Safe margin ≈ 4% of screen height on every edge; nothing interactive or critical inside the centre 70% of the screen.
2. Group by meaning: *survival* (life or lives) in one cluster, *wealth* (coins, special coins) in another, *objective* (stars, moons, flags) in a third, *context* (world, time) in a fourth. Never interleave.
3. Counters keep a fixed width so digits never shift neighbours.
4. Support splitscreen and four-player by replicating a compact per-player cluster, not by shrinking the single-player HUD.
5. Every HUD element can hide (fade, 200–300 ms) when idle for the exploration games and reappear on change; platformer HUDs stay persistent.

### 3.2 Typography

- One display face (heavy, geometric, rounded joins, outlined) for numbers, titles and logos; one neutral sans for body text and menus (SMBW pairs these). **Do not ship Nintendo's fonts.** Use open-licence stand-ins and match proportions: a heavy rounded geometric display face plus a DIN-style sans such as D-DIN or Barlow \[D\].
- Numerals are the hero: tabular, ≥ 5% of screen height in the HUD, with a 2–3 px (at 1080p) dark outline plus drop shadow so they read over any background.
- Lowercase appears only in body and dialogue; HUD labels are uppercase or icon-only.

### 3.3 Colour and shape

- Flat, saturated, high-contrast fills with a dark outline; rounded corners everywhere; a consistent light direction for shadows.
- Fixed colour semantics: gold = common currency, purple = level-specific special currency, green = extra life or health up, red = danger and timer urgency, blue = water or secondary meter, white = neutral text.
- Never rely on colour alone: pair it with shape or icon.

### 3.4 Motion and feedback

- Counters tick up with a short roll (≈ 250–400 ms) and a scale pop (≈ 120% then settle in ≈ 150 ms) on change.
- Damage: life meter shakes and pulses once, then flashes at one hit remaining.
- Timer under 100 s turns red and pulses; optional beeps only in the final 10 s.
- Collectible pickups fly toward their counter before the number changes, so cause and effect connect.
- Everything uses ease-out for entrances, ease-in for exits; no motion longer than 500 ms may delay input.

### 3.5 Audio hooks (specify, do not copy)

Every HUD state change has a distinct short sound: coin tick, special-coin chime, life-up, damage, low-health loop, timer warning, menu move, menu confirm, menu back. Use original assets only.

### 3.6 Menus and flow

- Pause is instant, dims the world, never changes game state, and shows the course's collectibles status.
- One-button entry and exit; back always works; focus wraps; confirm and cancel keep fixed positions.
- Pre-play pages (character, badges or loadout, file select) are calm and animated; in-play pages are minimal.
- Shops and loadouts show the price and what is gained *before* confirming; never hide a cost.
- World map: free movement, node states (locked, new and flashing, cleared, perfect-cleared), world and course name on focus, status chips on the node, path-unlock animations as rewards.

### 3.7 Failure and recovery

- No dead ends: death returns to the last checkpoint within ≈ 2 seconds of the failure animation.
- Game Over (if used) offers an immediate retry, with a soft penalty.
- Checkpoints give a small boon and a visible, audible acknowledgement.

### 3.8 Multiplayer and accessibility

- Shared lives, per-player colour and icon, no player-vs-player harm by default.
- Assist options reachable before play (an equivalent of SMBW badges) and never labelled as "easy mode".
- Minimum contrast ratio 4.5:1 for body text, 3:1 for outlined HUD numerals; text size scales with a user setting; no information carried only by sound.

## 4. Component library to build

For each component, implement: default, updating, empty, maximum, disabled, focused and pressed states.

1. **CounterChip** (icon + number, tick animation, max clamp)
2. **LifeMeter** (wedge-based, expandable, damage and low states)
3. **LivesBadge** (portrait + count; shared lives variant)
4. **CollectibleTracker** (3 slots: empty, collected, ghosted-from-checkpoint)
5. **Timer** (normal, warning, expired)
6. **ReserveItemBox** (empty, stored, activate)
7. **PauseMenu** (course status panel + options)
8. **WorldMapNode** and **MapHUD**
9. **ResultsScreen** (tally, ranking, crown or bonus)
10. **Shop and Loadout** (grid, detail pane, price, confirm)
11. **Toast and Prompt** (button hint, unlock notice)
12. **Transition** (course intro card, wipe, fade)
13. **TitleScreen and FileSelect**

## 5. Design tokens (minimum set)

Define once, reference everywhere: `color.*` (semantic list in 3.3), `font.display`, `font.body`, `size.hudNumber`, `size.margin`, `radius.chip`, `outline.width`, `shadow.offset`, `motion.tick`, `motion.pop`, `motion.fadeIdle`, `motion.pause`, `z.hud`, `z.pause`, `z.transition`. No component may hard-code a value that has a token.

## 6. Clean-room and IP rules

- Replicate *structure, behaviour and feel*, not assets. No Nintendo fonts, icons, logos, sounds, sprites, screen captures or trademarked names (Wonder Flower, Power Moon, Cappy and the like).
- Do not decompile or extract game files. Reference screenshots and footage may be studied privately to measure layout and timing, then recorded as derived numbers in this spec (tag **\[D\]**).
- Use original names and art for every collectible, character and menu label.

## 7. Acceptance checklist

- [ ] HUD stays inside the margin band; nothing blocks the centre of the screen.
- [ ] Every counter has a tick, a pop and a sound.
- [ ] Colour semantics are consistent and every colour is backed by a shape or icon.
- [ ] Pause works in under 100 ms and shows collectible status.
- [ ] Death never leads to a hard stop; retry takes two button presses or fewer.
- [ ] Four-player layout verified on a 16:9 and a 4:3 or ultrawide viewport.
- [ ] All text readable at 720p and at the largest user text scale.
- [ ] No third-party IP in the asset list.
- [ ] Tokens only: a grep for raw hex, px and ms values in components returns nothing.

## 8. Sources

- Nintendo electronic manuals for SM3DW and NSMBU / New Super Luigi U (HUD elements, flags, checkpoints, game over) \[S\].
- Nintendo "Ask the Developer", Super Mario Bros. Wonder: new engine, expressive characters, multiplayer philosophy; plus Tezuka and Mouri interviews (GameSpot, Game Informer, Inverse, MobileSyrup) on surprise-driven design \[S\].
- Super Mario Wiki: Odyssey, Wonder, flower coin, badge, time limit and font pages \[S\].
- Nintendo Life report of Game Informer's interview with SMO director Kenta Motokura on dropping lives \[S\].
- Toptal/TNW essay on diegetic and non-diegetic UI \[S\].
- Community: Ludo.guide SMO UI page, GameFAQs and Mario Boards threads on Odyssey's HUD style, Game Rant flower coin guide, DaFont forum on the Wonder font \[C\].
- **Gap:** no authoritative source found for pixel dimensions, easing curves, or SMBW and SMO exact HUD corner layout. Fill these by measuring reference captures, then update this spec.
- **Derived implementation values \[D, 2026-11-21\]:** Safe margin `4vh`, display face `Fredoka` Bold (SIL OFL 1.1) + body sans `Barlow` Medium/Bold (SIL OFL 1.1), HUD numerals `clamp(1.2rem, 4.6vh, 2.2rem) * --ui-text-scale`, outline `3px`, counter roll `320ms`, pop `1.20x` over `150ms`, idle fade `260ms`, pause open `80ms`, transition wipe/fade `380ms` (`<= 500ms`), ease-out `cubic-bezier(0.16, 1, 0.3, 1)`, ease-in `cubic-bezier(0.4, 0, 1, 1)`. Logged in `docs/UI_DECISIONS.md`.
