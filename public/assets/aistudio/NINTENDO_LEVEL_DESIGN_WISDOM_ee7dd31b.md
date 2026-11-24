# The Nintendo Platformer Design Codex: Distilled Level Design Wisdom

**Document Version:** 1.0.0 (Master Synthesis of Mainline Nintendo Platformer Architecture)  
**Primary Sources:**
1. *How Miyamoto Designed Every Super Mario Bros. Level* (Shigeru Miyamoto & Takashi Tezuka, 1985–Present)
2. *The Genius Design of New Super Mario Bros. U* (Core Principles of Player Expression & Mechanical Layering)
3. *How Mario Wonder Perfected Nintendo's Level Design* (Koichi Hayashida's Kishōtenketsu & The Anticipated Twist)
4. Companion Master Movement & Kinematics Specifications

---

## 1. Axiom 1: The Dual Mechanical Taxonomy (Transcendental vs. Per-Level)

Great platformer design does not invent rules at random. Every interaction in a Nintendo-caliber level falls strictly into one of two operational categories:

```
┌───────────────────────────────────────────────────────────────────────────────┐
│                          PLATFORMER MECHANICAL TAXONOMY                       │
├───────────────────────────────────────────────┬───────────────────────────────┤
│        TRANSCENDENTAL MECHANICS               │      PER-LEVEL MECHANICS      │
│        (Global / Invariant System)            │      (Local / Context Gimmick)│
├───────────────────────────────────────────────┼───────────────────────────────┤
│ • Player Kinematics (Jump, Run, Skid, Wall)   │ • Moving Water Geysers        │
│ • Universal Enemies (Goomba / Koopa Shells)   │ • Accordion / Puffy Lifts     │
│ • Basic Terrain (Solid, Semisolid, Slope)     │ • Matter-Eating Swarms        │
│ • Universal Blocks (Question, Brick, Coin)    │ • Mimic Enemies (Hoppycats)   │
│ • Gravity, Hitstop, Coyote Time, Buffers      │ • Stage-Specific Hazards      │
└───────────────────────────────────────────────┴───────────────────────────────┘
```

### The Law of Mechanical Synthesis
* **The Golden Rule:** A level must never introduce a Per-Level Mechanic in isolation. Masterful design occurs when a **Per-Level Mechanic is layered directly atop Transcendental Mechanics**.
  * *Example (NSMBU Water Spout Beach):* A water geyser (per-level) lifts a Koopa shell or Huckit crab (transcendental). The player must jump off the rising platform while calculating standard projectile arc trajectories.
  * *Example (NSMBU Slide Lift Tower):* A moving slide lift passes over a Dry Bones. The player uses the stomped Dry Bones as a bounce pad to slip under the rising lift before it crushes them.
* **Cognitive Grounding:** Transcendental mechanics provide player literacy and subconscious comfort; per-level mechanics provide novelty, freshness, and curiosity.

---

## 2. Axiom 2: The Evolved Kishōtenketsu (4-Act Level Architecture)

Derived from classic four-line Chinese and Japanese poetry and adapted into video game architecture by Koichi Hayashida, **Kishōtenketsu** ensures that every individual level functions as a complete, miniature, self-contained game.

```
Act 1: Ki (起) ───> Act 2: Shō (承) ───> Act 3: Ten (転) ───> Act 4: Ketsu (結)
  Introduction          Development            The Twist            Conclusion
(Safe Playground)   (Elevated Stakes)      (Paradigm Shift)       (Mastery Leap)
```

### Act 1: Ki (起) — Introduction (The Safe Classroom)
* **Design Mandate:** Introduce the level's central mechanic in an environment where **failure has zero fatal consequences**.
* **Visual Demonstration:** Show the mechanic acting before the player touches it (e.g., an enemy steps on an accordion platform and it collapses; water lifts a coin).
* **Affordance & Bait:** Use coins or non-threatening rewards to guide the player's intuition. If the player falls or fails, they land on solid safe ground immediately below to retry without death.

### Act 2: Shō (承) — Development (The Iterated Trial)
* **Design Mandate:** Deepen the mechanic now that the player understands its basic rules.
* **Removing Safety Nets:** Introduce real consequences (gaps, hazard spikes, moving enemies, or tighter timers).
* **Predictive Challenge:** Require the player to predict outcomes based on prior knowledge (e.g., predicting the bounce angle of a spiked ball off a collapsing lift).

### Act 3: Ten (転) — The Twist (The Anticipated Inversion)
* **Design Mandate:** Subvert the player's perspective without altering the underlying mechanical rules.
* **The Paradox of the Twist:** The twist must be **unpredictable in nature, yet predictable in logic**. All prior knowledge accumulated in Acts 1 and 2 must remain 100% valid during the twist.
  * *Good Twist (Perspective Inversion):* In Mario Wonder's Puffy Lifts, you spend Acts 1 and 2 standing on lifts while dodging spike balls. In Act 3, *you become the lift itself*, guiding the rolling spike balls to break blocks. The physics never changed; only your perspective did.
  * *Bad Twist (Disjointed Gimmick):* Introducing an unrelated minigame, a random time-slow, or a musical number that completely ignores the level's core physics.
* **Preemptive Anticipation:** Great games prepare the player to expect a twist (e.g., Wonder Flowers or distinct visual heralds). This builds eager anticipation rather than jarring difficulty spikes.

### Act 4: Ketsu (結) — Conclusion (Catharsis & Mastery)
* **Design Mandate:** Deliver a high-energy victory run that synthesizes the entire level's mechanics.
* **The Flagpole Climax:** The approach to the flagpole is not an afterthought; it is the final test of the level's mechanics (e.g., timing an explosive bounce off the final per-level lift to grab the top of the goal pole for maximum score).

---

## 3. Axiom 3: Player Expression & Multi-Tier Routing

A linear platformer becomes legendary only when it allows players of different skill levels to tackle the exact same obstacle in fundamentally different ways.

```
                     ┌─── High Route (Momentum Carry / High Risk / Star Coins) ───┐
Spawn ───────────────┤                                                            ├──── Goal
                     └─── Low Route (Methodical / Safe / Grounded Progression) ────┘
```

1. **The Floor and the Ceiling:**
   * **The Floor (Low-Skill / Safe):** Methodical, patient pacing. The player waits for platforms to cycle, stomps enemies one by one, and lands safely on ground.
   * **The Ceiling (High-Skill / Momentum):** Sustained dash speed ($v_x \ge 9.20\text{ tiles/s}$). High-altitude jumps across pipe tops, bouncing off enemies mid-air to skip terrain, chaining wall kicks, and shaving 15 seconds off the stage clock.
2. **The Incentive Rule:**
   * The harder path must **always carry an explicit incentive**: a Star Coin / Medallion, a 1-UP, a shortcut pipe, or an elevated advantage over the next hazard.
   * Never create a harder path that delivers identical reward to the safe path.

---

## 4. Axiom 4: Miyamoto's Rules of Subconscious Guidance

Derived from the frame-by-frame analysis of *Super Mario Bros.* World 1-1 through World 8-4:

### 1. The Rightward Vector (First Frame Psychology)
* From the moment the level loads, the environment must pull the player to the right:
  * Place the player on the left third of the screen with broad open space to the right.
  * Character rest pose faces right.
  * Clouds, foliage, or background geometry slope downward to the right, creating subconscious kinetic flow.

### 2. The Question Mark Bait & Self-Inflicted Teaching
* Never use text tutorials for physical mechanics. Place an alluring object (a glowing block, a coin) right in the player's path.
* In World 1-1, hitting the first question block spawns a mushroom moving right; it hits the pipe, rebounds left, and moves straight toward the player. Trapped between the block and the ground, the player collides with it—learning instantly that mushrooms make you grow.

### 3. Graduated Threat Pacing (The Gap Rule)
* Never introduce a maximum hazard immediately.
  * *SMB World 1-1 Pit Progression:*
    * **Pit 1:** 2 tiles wide, zero enemies, flat landing.
    * **Pit 2:** 3 tiles wide, Goomba waiting immediately on landing.
    * **Pit 3:** 3 tiles wide with an enemy overhead and tight ceiling clearance.

### 4. The Safeguard Ledge (Preventing Cheap Deaths)
* When enemies or hazards fall from above or emerge from blind spots, **they must first land on an intermediate buffer ledge**.
* In World 1-1, two Goombas drop from high bricks onto a mid-level platform before dropping to ground level. This gives the player 20–30 frames of visual recognition to react, completely eliminating unfair deaths.

### 5. Multi-Kill Projectile Math (The 6-Enemy Rule)
* When a projectile mechanic (like a kicked Koopa shell) is introduced, the designers intentionally line up **exactly 6 enemies in its rebound corridor**.
* Score escalation ($100 \to 200 \to 400 \to 800 \to 1000 \to 1\text{-UP}$) rewards the player with an extra life, creating a memorable feeling of explosive power.

### 6. Environmental Contrast Across Stages
* World 1-1: Wide open, airy, freedom of movement, high jumps.
* World 1-2: Underground, cramped ceilings, 1-block gaps, crouch slides, piranha plants denying pipe safety.
* *Rule:* Never make two consecutive levels share the same spatial density or pacing cadence. Alternate between expansive sprint courses and claustrophobic precision shafts.

---

## 5. Axiom 5: The Anatomy of a Masterpiece Level Checklist

Before any level design is approved for production, it must pass this **10-Point Nintendo Architectural Audit**:

- [ ] **1. Single-Concept Focus:** Can the level's identity be summarized in 3 words (e.g., "Water Spout Beach", "Hoplite Ricochet Cavern", "Accordion Puffy Lifts")?
- [ ] **2. Safe Introduction (Ki):** Is the core gimmick introduced where a failure drops the player onto safe terrain without death?
- [ ] **3. Transcendental Layering:** Is the gimmick combined with universal mechanics (stomp rebounds, shell kicks, wall slides)?
- [ ] **4. The Valid Twist (Ten):** Does the twist invert perspective or combine rules while keeping physical logic consistent?
- [ ] **5. Anticipated Herald:** Is the player given a clear, delightful visual trigger (Wonder trigger, alarm banner) before the twist begins?
- [ ] **6. Dual-Skill Routing:** Can an expert speedrunner sprint through without stopping, while a novice can methodically walk through?
- [ ] **7. Safeguarded Surprises:** Do aerial enemies or falling hazards give at least 24 frames of advance telegraph before entering the player's path?
- [ ] **8. Star Coin / Secret Incentives:** Are all 3 secret collectibles placed in locations requiring mastery of the level's specific mechanic?
- [ ] **9. Rewarding Climax (Ketsu):** Does the final jump to the flagpole require a triumphant application of the level's gimmick?
- [ ] **10. Zero Physics Drift:** Is every collision resolved against the strict, deterministic swept AABB tile grid with zero engine floatiness?
