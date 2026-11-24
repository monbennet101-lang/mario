# Super Mario Bros. Wonder 2.5D Engine — PROTOTYPE REPORT

Generated: Deterministic Headless + Interactive Browser Benchmark Suite
Status: **PASS (12/12 Acceptance Checks)**

## 1. Automated Verification Scorecard

| Check | Target | Measured | Result |
| :--- | :--- | :--- | :--- |
| Visual-Collision Parity (All 8 Rooms) | 0 mismatches | 17331 tiles · 0 err | PASS |
| Standing Jump Apex | 4.10t ± 0.15t | 4.06t | PASS |
| Tap Jump (2f Release) | ≥ 1.00t (< 2.50t) | 1.67t | PASS |
| Walk Jump (3-Tile Gap) | Clear ≥ 3.0t gap | Landed x=26.7t | PASS |
| Sprint Jump (≥ 6-Tile Gap) | Clear ≥ 6.0t gap | Landed x=60.4t | PASS |
| Coyote Time Grace (5f/6f) | 5f PASS · 6f FAIL | 5f:PASS · 6f:EXPIRED | PASS |
| Jump Input Buffer (6f/7f) | 6f PASS · 7f FAIL | 6f:PASS · 7f:IGNORED | PASS |
| Wall-Jump Climb (3-Wide Shaft) | Reach ≥ 16.0t deck | Peak Y=17.55t | PASS |
| Butt-Slide Velocity & Goomba KO | vx ≥ 6.0 t/s & KO ≥ 1 | 14.50 t/s · KO=3 | PASS |
| Warp Pipe Suction & 1t Crawl | Enter -> Exit Crouched -> Clear | Pipe:true Exit:true Clear:true | PASS |
| Live Feel Preset Switch (Zero Reset) | Wonder / NSMBU / Arcade, Δpos=0 | NSMBU:true Arcade:true Δpos=0.000 | PASS |
| Gauntlet Full Replay (Sections A–I) | Clear Goal & 0 Desync | 2963f (49.4s) · Hash=0-DESYNC | PASS |

## 2. Full Gauntlet Course (Room 8, Sections A–I) Replay Telemetry

- **Course Cleared**: YES
- **Deterministic Replay Parity**: 0 Desync (Exact FNV-1a Bit Match)
- **Completion Time**: 2963 frames (49.38s @ 60 Hz)
- **Coins / Score**: 26 coins / 3000 pts
- **Terminal FNV-1a Hash**: `0xcb20d49a`

## 3. Calibrated Live Feel Presets

| Preset | Start Pop | Ground Accel | g_rise | Apex Float | Crouch Squash | 3/4 Yaw |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Wonder Momentum | 1.25 t/s | 18.50 t/s² | 42.80 | 6f | 50% | 20° |
| NSMBU Classic | 0.00 t/s | 16.00 t/s² | 43.30 | 3f | 28% | 0° |
| Snappy Arcade | 2.00 t/s | 24.00 t/s² | 42.80 | 6f | 50% | 20° |

## 4. Architecture Summary (10/10 Stages Complete)

- **Deterministic Physics**: Pure 60 Hz (`Δt = 1/60s`) axis-separated swept AABB collision against 64×64 grid + analytical slopes + dynamic moving platforms.
- **2.5D Hybrid Rendering**: 9-slice grassland autotiler + multi-layer parallax canvas compositing a WebGL Three.js 27-clip skeletal Mario/Luigi rig tilted 20° toward the camera.
- **Tactile Game Feel**: Frame-1 pop (`1.25 t/s`), asymmetric jump (`4.10t`), coyote (`5f`) & input buffer (`6f`), `0.25t` corner nudge, `1080°` Spin Twirl, Wall-Jump chimney (`8f` lockout), Ground Pound (`0.65` trauma), Butt-Slide, Power-Ups & 3f/6f Combat Hitstop, Warp Pipe suction, and 1-click Gauntlet Verification.
