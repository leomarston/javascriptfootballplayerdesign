# 3D Football Player — Technical Design & Analysis

A build specification for a procedurally-constructed, fully-rigged 3D football
(soccer) player in **JavaScript + Three.js**, targeting the look and motion
quality of a Konami eFootball / PES on-pitch character: realistic anatomy, a
professional kit, smooth keyframed animation, and arcade-leaning game physics.

This document is the *analysis* deliverable. It is intentionally concrete:
every dimension, ratio, joint, material value, and animation phase below is
meant to drop straight into code. Units are SI (meters, kilograms, seconds,
radians) unless noted. World convention is **Y-up, player faces +Z**.

---

## 0. Scope, conventions & target quality bar

| Concern | Decision |
|---|---|
| Engine | Three.js (r150+), WebGL2 |
| Model source | **Procedural geometry** (no imported GLB), so every dimension is parameter-driven |
| Rig | Hand-built `THREE.Group` bone hierarchy, FK only (no skinning/IK in v1) |
| Units | meters; 1 world unit = 1 m |
| Up axis | +Y |
| Facing | +Z (so "forward" sprint translates +Z); +X is player's left, -X player's right |
| Rotations | radians, applied as intrinsic Euler `YXZ` per bone unless stated |
| Frame budget | 60 fps; player ≈ 4–6k triangles, whole scene < 150k |
| Animation | time-driven procedural poses + eased keyframe blending; **no** baked clips |

The "eFootball look" decomposes into four measurable pillars: (1) **correct
human proportions**, (2) **a clean bone hierarchy that pivots like a skeleton**,
(3) **PBR materials with believable roughness**, and (4) **biomechanically
plausible animation timing**. The rest of this document treats each in turn.

---

## 1. Reference Analysis — How an eFootball player is built

### 1.1 The head-unit system

Game and film character artists size humans in **head-units** (the height of
one head from crown to chin). A naturalistic adult is ~7.5 heads; idealized
"heroic" game/comic proportions push to 8. A professional male footballer sits
in between — lean, long-legged, slightly stylized for readability at distance.

We target **7.8 heads** for a **1.80 m** athlete. That yields a head height of:

```
head_height = 1.80 m / 7.8 ≈ 0.2308 m  (round to 0.231 m)
```

eFootball deliberately enlarges the head a touch versus true anatomy (true pros
are closer to 8.0–8.3 heads) because a slightly larger head reads as more
expressive and "characterful" on screen at TV-camera distance. 7.8 is the sweet
spot: recognizably athletic, not bobble-headed.

### 1.2 Segment lengths for a 1.80 m athlete

These are derived from a blend of (a) classical artistic canon, (b)
anthropometric tables (Drillis & Contini segment ratios as fraction of stature
H), and (c) the readable-game adjustment. The **"H-ratio"** column is the
fraction of total standing height; the **meters** column is that ratio × 1.80 m.
These are *segment* lengths (joint-to-joint), not bounding boxes.

| # | Segment | Description | H-ratio | Length (m) | Heads |
|---|---|---|---|---|---|
| 1 | Head | crown → chin | 0.1282 | 0.231 | 1.00 |
| 2 | Neck | chin/C7 → shoulder line | 0.0500 | 0.090 | 0.39 |
| 3 | Torso (thorax+abdomen) | shoulder line → navel | 0.2200 | 0.396 | 1.72 |
| 4 | Pelvis | navel → hip joint (crotch) | 0.0950 | 0.171 | 0.74 |
| 5 | Upper arm (humerus) | shoulder → elbow | 0.1860 | 0.335 | 1.45 |
| 6 | Forearm (radius/ulna) | elbow → wrist | 0.1460 | 0.263 | 1.14 |
| 7 | Hand | wrist → fingertip | 0.1080 | 0.194 | 0.84 |
| 8 | Thigh (femur) | hip → knee | 0.2450 | 0.441 | 1.91 |
| 9 | Shin (tibia) | knee → ankle | 0.2460 | 0.443 | 1.92 |
| 10 | Foot | heel → toe (length) | 0.1520 | 0.274 | 1.19 |

**Vertical sanity check** (head + neck + torso + pelvis + thigh + shin + foot-height):

```
0.231 + 0.090 + 0.396 + 0.171 + 0.441 + 0.443 = 1.772 m  (joint chain, ankle to crown)
+ ankle height off ground (~0.085 m)                       → ≈ 1.857 m crown
```

After accounting for joint overlap (the hip and knee centers are *inside* the
flesh, not at segment seams) and natural standing flex, the rendered crown lands
at **1.80 ± 0.02 m**. Tune `ANKLE_HEIGHT` and standing knee flex (~5°) to hit
exactly 1.80.

### 1.3 Breadths (widths/depths)

Lengths alone don't make a footballer look athletic — **shoulder-to-hip taper**
(the "V") does. Pros have a wide deltoid line over a narrow waist.

| Breadth | H-ratio | Meters | Notes |
|---|---|---|---|
| Bi-acromial (shoulder) width | 0.245 | 0.441 | the deltoid-to-deltoid span; the silhouette's widest point |
| Bi-iliac (hip) width | 0.180 | 0.324 | hip-bone span |
| Waist width | 0.150 | 0.270 | narrowest torso point |
| Chest depth (front-back) | 0.105 | 0.189 | |
| Head width | 0.090 | 0.162 | ~0.70 × head height |
| Neck diameter | 0.066 | 0.119 | thick, athletic neck |
| Upper-arm diameter | 0.055 | 0.099 | |
| Forearm diameter | 0.045 | 0.081 | |
| Wrist diameter | 0.033 | 0.059 | |
| Thigh diameter | 0.090 | 0.162 | quad-dominant |
| Calf diameter (max) | 0.072 | 0.130 | |
| Ankle diameter | 0.040 | 0.072 | |

The **shoulder:waist ratio = 0.441 / 0.270 ≈ 1.63**, close to the "golden"
athletic V (~1.6). This single ratio does most of the visual heavy lifting for
"this is a fit athlete" — keep it ≥ 1.5.

### 1.4 Athletic muscle distribution & mass

A footballer is **lower-body dominant**: large quads/hamstrings/glutes, defined
but not bulky upper body, low body fat (~8–11%). Approximate body-mass for a
75 kg pro (Dempster segment-mass fractions):

| Region | % body mass | kg (of 75 kg) | Implication for model |
|---|---|---|---|
| Head + neck | 8.1% | 6.1 | — |
| Trunk (thorax+abdomen+pelvis) | 49.7% | 37.3 | dominant mass, drives CoM |
| Each upper arm | 2.8% | 2.1 | — |
| Each forearm | 1.6% | 1.2 | — |
| Each hand | 0.6% | 0.45 | — |
| Each thigh | 10.0% | 7.5 | **biggest single limb mass** |
| Each shin | 4.65% | 3.5 | — |
| Each foot | 1.45% | 1.1 | — |

**Center of mass (CoM):** for a person standing in anatomical position, the
whole-body CoM sits at roughly **55–57% of stature** from the ground —
i.e. ~**1.0 m** for our 1.80 m player, just anterior to S2 (about navel height,
slightly forward). The animation and physics layers track this point for balance
and for placing the kinematic capsule's reference.

### 1.5 What specifically makes it read as "eFootball" and not "generic mannequin"

- Slightly enlarged head (7.8 vs 8.0+ heads) → expressive, TV-readable.
- Strong shoulder V and thick thighs → unmistakably an athlete.
- Long shins relative to thighs (~1.0:1) → the leggy, fast silhouette.
- Boots that visibly **extend and taper** the foot (a real boot is ~0.28–0.30 m).
- Tight kit that follows the body taper, not a baggy tube.
- Subtle standing asymmetry (weight on one leg) so the idle is never a T-pose.

---

## 2. Skeleton / Rig

### 2.1 Hierarchy

FK rig. Each bone is a `THREE.Group` whose **local origin is the proximal joint
pivot**; child groups are offset along the bone by the parent segment length so
that rotating a parent sweeps the whole limb naturally. The mesh for a segment
is parented to the *proximal* node and pushed +half-length along the bone's axis
so the joint stays at the pivot.

```
ROOT (world transform: position + facing yaw)
└── pelvis            (CoM-ish anchor; pivot at hip-center height ~0.93 m)
    ├── spine_lower    → spine_upper(chest)
    │   └── chest
    │       ├── neck → head
    │       │            ├── jaw (optional micro-bone for talk/celebration)
    │       │            └── (eyes/brows are mesh, not bones)
    │       ├── clavicle_L → shoulder_L → upperArm_L → forearm_L → hand_L
    │       │                                                       ├── thumb_L (2 phalanx bones)
    │       │                                                       └── fingers_L (1 merged bone or 4×2)
    │       └── clavicle_R → shoulder_R → upperArm_R → forearm_R → hand_R
    │                                                               ├── thumb_R
    │                                                               └── fingers_R
    ├── hip_L → thigh_L → shin_L → foot_L → toe_L
    └── hip_R → thigh_R → shin_R → foot_R → toe_R
```

Total bones (v1): ~**30–38** depending on finger granularity. That is plenty for
PES-class motion; full mocap rigs run ~60+, but for procedural keyframing fewer,
well-chosen joints animate more cleanly.

### 2.2 Joint table — pivots, axes, DOF, limits

`L`/`R` mirror about the X axis. Angles are degrees for readability; convert to
radians in code. "DOF" = independent rotational degrees of freedom we actually
drive. ROM = anatomical range of motion (animation clamp).

| Joint | Local pivot location | DOF | Primary axis & motion | ROM (clamp) |
|---|---|---|---|---|
| pelvis (root rot) | hip-center, y≈0.93 | 3 | yaw (Y) steer, pitch (X) lean, roll (Z) hip sway | ±20° pitch, ±15° roll, free yaw |
| spine_lower | top of pelvis | 3 | flex/extend (X), side-bend (Z), twist (Y) | flex −30/+20°, bend ±20°, twist ±30° |
| chest | top of lower spine | 3 | same as spine, smaller | ±15° each |
| neck | base of skull line | 3 | nod (X), tilt (Z), turn (Y) | nod ±40°, tilt ±30°, turn ±60° |
| head | atop neck | 3 | fine nod/tilt/turn | ±20° each |
| clavicle | sternum side | 2 | shrug up (Z), protract (Y) | up 0–15°, protract ±10° |
| shoulder (glenohumeral) | deltoid center | 3 | flex/extend (X), abduct (Z), int/ext rot (Y) | flex −60/+180°, abduct 0/+170°, rot ±90° |
| elbow | distal humerus | 1 (+1) | flex (X) hinge; forearm pronation (Y) | flex 0/+145°, pron ±80° |
| wrist | distal forearm | 2 | flex/extend (X), deviation (Z) | flex ±70°, dev ±25° |
| fingers (merged) | knuckle line | 1 | curl (X) | 0/+90° |
| thumb | base | 2 | curl (X), oppose (Y) | 0/+60°, oppose 0/+45° |
| hip | femoral head | 3 | flex/extend (X), abduct (Z), rot (Y) | flex −20/+120°, abduct ±45°, rot ±40° |
| knee | distal femur | 1 | flex (X) hinge **only** | 0/+150° (never hyperextend past −5°) |
| ankle | talus | 2 | plantar/dorsiflex (X), inversion (Z) | dorsi −20/plantar +45°, inv ±20° |
| toe (MTP) | ball of foot | 1 | flex/extend (X) | −30/+60° |

**Axis conventions (critical, get these right once):**

- All hinge joints (knee, elbow, toe) rotate about **local +X**. Positive X
  rotation = flexion. Knee flexion bends the shin *backward* relative to the
  thigh — so the knee group's +X must point to the player's left in rest pose.
- Yaw/steer is about **local +Y**.
- Side-bend / abduction / roll is about **local +Z**.
- Apply Euler order `'YXZ'` so twist (Y) is outermost and doesn't gimbal with
  the dominant flexion (X). For shoulders, `'ZXY'` reads more naturally for
  abduction-led poses; pick per-joint and document in the rig config.

**Rest pose (bind pose):** *not* a T-pose. Use a relaxed **A-pose**: arms down
and ~10° abducted, elbows ~5° flexed, legs ~3° apart, knees ~5° flexed, slight
anterior pelvic tilt (~5°). An A-pose keeps the shoulder deltoid geometry from
looking pinched and gives every joint a non-zero baseline so eased animation
never snaps from a perfectly straight limb.

### 2.3 Why FK (not skinning/IK) for v1

Because the mesh is built from **discrete rigid pieces** (Section 3), each piece
is simply parented to its bone group and inherits the transform — there is *no
skin envelope to weight*, hence zero weight-painting, zero candy-wrapper
collapse at elbows/knees, and deterministic, debuggable poses. IK can be layered
later for foot-planting on uneven ground, but FK + good keyframes covers every
animation in Section 5.

---

## 3. Mesh & Geometry Approach

### 3.1 Primitive strategy

Limbs are **tapered cylinders** (`CylinderGeometry` with `radiusTop ≠
radiusBottom`) capped by **spheres at the joints**. This "sphere-at-the-joint"
trick is what lets rigid pieces rotate without gaps: the joint sphere fills the
volume the two cylinders would otherwise leave open as they pivot. The torso is
a rounded box / lathe form; the head is a modified sphere; hands are an
assembly; boots are a stretched, sculpted form.

| Body part | Primitive(s) | Key params (for 1.80 m model) |
|---|---|---|
| Head | `SphereGeometry` scaled (1.0, 1.15, 1.05) + jaw taper | r≈0.081, scaled to 0.231 tall |
| Face features | small spheres (eyes), extruded brow, low nose prism | eyes r≈0.013 |
| Neck | tapered cylinder | r 0.060→0.055, h 0.090 |
| Chest/torso | rounded box or lathe; tapers shoulder→waist | top 0.441w, waist 0.270w, depth 0.19 |
| Pelvis | rounded box | 0.324w × 0.171h × 0.17d |
| Upper arm | tapered cylinder | r 0.0495→0.041, h 0.335 |
| Forearm | tapered cylinder | r 0.041→0.030, h 0.263 |
| Hand | palm box + 4 finger chains + thumb | see 3.2 |
| Thigh | tapered cylinder | r 0.081→0.058, h 0.441 |
| Shin | tapered cylinder | r 0.065→0.036, h 0.443 |
| Joint spheres | sphere at knee/elbow/shoulder/hip/ankle/wrist | r = adjacent cylinder radius |
| Foot/boot | scaled/sculpted form (see 3.3) | length 0.28, width 0.10, height 0.075 |

Segment counts: cylinders 12–16 radial segments, spheres 16×12. This keeps the
player around **4–6k triangles** — smooth at TV distance, cheap at 60 fps.

### 3.2 Detailed hands

A footballer's hands are visible during throw-ins, celebrations and balance, so
do them properly rather than as mittens:

- **Palm:** rounded box ~0.090 (w) × 0.100 (l) × 0.030 (thick).
- **Fingers:** 4 chains of 2 phalanx bones each (proximal ~0.045, distal ~0.035),
  tapered cylinders + tiny knuckle spheres. For perf you may animate them as a
  single "curl" parameter that drives all four uniformly.
- **Thumb:** 2 phalanges off the radial side of the palm, with an opposition DOF
  so the hand can wrap a ball during a throw-in.
- Default relaxed pose: fingers ~10° curl, thumb slightly opposed.

### 3.3 Boots, head, face

- **Boots** read as the single most "footbally" detail. Build from a sculpted
  low-poly form: a sole plate (thin flattened box, slight upward toe curl ~8°),
  an upper that wraps the foot, a heel counter, and an ankle collar. Length
  ~0.28 m, low-cut. Optional stud nubs (8–10 tiny cylinders under the sole) only
  if the camera ever goes low.
- **Head:** sphere flattened at back, jaw tapered forward, slight occipital
  bulge. Add ears (half-spheres), a low-poly nose (triangular prism), brow ridge.
- **Hair:** a separate capped shell mesh (short crop) or a low alpha-card set;
  keep it a child of the head bone.
- **Eyes:** two small spheres set into shallow sockets; a darker iris disc.

### 3.4 Why rigid pieces avoid skin-weight artifacts

With a single skinned mesh, every vertex near a joint blends two bone transforms;
get the weights slightly wrong and the elbow **pinches** or the knee **balloons**
("candy wrapper" / volume loss). With rigid pieces:

- Each piece follows **exactly one** transform → no blending, no pinch.
- The **joint sphere** geometrically guarantees the seam never opens, because a
  sphere rotated about its own center occupies the same volume from every angle.
- It is trivially debuggable: a wrong pose is a wrong Euler on one named bone,
  not an invisible weight on a vertex.
- It is cheaper (no per-vertex skinning matrix palette) and 100% deterministic.

Trade-off: no soft skin sliding/bulging. At PES camera distance this is
imperceptible; the believability comes from **timing and proportion**, not from
dermal deformation. If v2 wants soft deformation, the same skeleton can later
drive a skinned mesh without changing the bone names or hierarchy.

### 3.5 Grouping, materials sharing & scene graph hygiene

- One **shared material per kit element** (skin, jersey, shorts, socks, boots),
  reused across all pieces → fewer draw calls. Merge static same-material pieces
  with `BufferGeometryUtils.mergeGeometries` *only when they share a bone*;
  never merge across bones (would break the rig).
- Name every bone group (`"thigh_L"`, etc.) for runtime lookup and debugging.
- Build the whole player under one top `THREE.Group` so it can be positioned,
  scaled, and dropped into the scene as a unit.

---

## 4. Materials, Textures & Graphics

### 4.1 PBR material values

Use `MeshStandardMaterial` (metalness/roughness workflow). Color is the base
albedo; metalness is 0 for everything except trim. Values below are starting
points calibrated for an ACES-filmic, physically-lit scene.

| Material | Base color (approx) | Roughness | Metalness | Notes |
|---|---|---|---|---|
| Skin | `#c79a7a` (mid) | 0.55 | 0.0 | slight subsurface fake via warm emissive ~0.02; clearcoat off |
| Jersey (fabric) | team primary | 0.80 | 0.0 | high roughness = matte cloth; faint normal/weave map |
| Jersey number/badge | white/team | 0.45 | 0.0 | slightly glossier print/flock |
| Shorts | team color | 0.82 | 0.0 | matte, like jersey |
| Socks | team color | 0.85 | 0.0 | most matte (ribbed knit) |
| Boots (leather/synthetic) | `#101013` typ. | 0.30 | 0.0 | semi-gloss; optional clearcoat 0.4 for patent look |
| Boot studs | dark gray | 0.5 | 0.1 | — |
| Ball (panels) | white + dark | 0.35 | 0.0 | semi-matte TPU; subtle normal map for panel seams |
| Skin (sweat sheen, optional) | — | lower to 0.40 on shoulders | 0.0 | for "match heat" look |
| Pitch grass | `#3a7d34` | 0.90 | 0.0 | very matte; stripes via albedo variation |
| Line markings | `#f2f2f2` | 0.7 | 0.0 | painted lime, slightly glossy when "wet" mode |
| Goal frame | white | 0.25 | 0.3 | metal posts |

Roughness intuition: **cloth is rough (0.8–0.85), skin is mid (0.55), leather is
semi-gloss (0.3), metal frame is low + metallic.** Getting these *relative*
values right matters more than the absolute albedo.

### 4.2 Textures (procedural-first)

We avoid heavy texture downloads; generate what we can on a `CanvasTexture`:

- **Jersey:** flat team color + procedurally drawn number, name, sponsor block,
  collar trim, sleeve cuffs. A subtle tiling weave normal map (generated noise)
  sells the fabric.
- **Skin:** base color + faint procedural variation; optional roughness map so
  shoulders/forehead are slightly shinier (sweat).
- **Ball:** classic 32-panel (or modern bonded) layout baked to a canvas; a
  matching normal map for seam relief.
- **Grass:** base green + lighter/darker mowing stripe bands; optional fine noise
  normal for blade microrelief. Stripe period below.

### 4.3 The pitch — FIFA/IFAB markings (exact dimensions)

Pitch is a textured plane; markings are either drawn into the grass
`CanvasTexture` or built as thin emissive line meshes slightly above the turf
(y ≈ +0.002 to avoid z-fighting). Use IFAB Laws-of-the-Game dimensions:

| Element | Dimension |
|---|---|
| Pitch length (touchline) | **105 m** |
| Pitch width (goal line) | **68 m** |
| Center circle radius | **9.15 m** |
| Center spot | dot at midfield |
| Penalty area | **40.32 m wide × 16.5 m deep** (16.5 m from goal line) |
| Goal area (6-yard box) | **18.32 m wide × 5.5 m deep** |
| Penalty spot | **11 m** from goal line, centered |
| Penalty arc (D) | arc of radius 9.15 m centered on the penalty spot, outside the box |
| Goal | **7.32 m wide × 2.44 m high** |
| Goal post / crossbar diameter | ≤ 0.12 m |
| Corner arc radius | 1 m |
| Line width | 0.10–0.12 m (use 0.12 for visibility) |
| Mowing stripe width | ~5–6 m bands (≈ 18–20 stripes across 105 m) |

Goal-area math check: 6-yard box width = goalpost span (7.32) + 2 × 5.5 m =
**18.32 m**. Penalty-area width = 7.32 + 2 × 16.5 = **40.32 m**. These are
load-bearing — derive them from the goal width and box depths, don't hardcode
blindly.

### 4.4 Lighting & post

Three-light rig plus post:

1. **Directional "sun"** — the key. Color slightly warm (`#fff3e0`), intensity
   ~3.0, positioned high and to one side (e.g. azimuth 135°, elevation 55°).
   `castShadow = true`.
2. **Hemisphere light** — sky `#bcd6ff` over ground `#3a5a2a`, intensity ~0.6.
   Provides free ambient occlusion-like fill and grounds the player in the scene.
3. **Soft ambient / second fill** — optional low directional from the opposite
   side, intensity ~0.4, no shadow, to lift shadow cores.

**Shadows:** PCFSoft shadow map, 2048² (4096² for hero shots). Tighten the
directional light's orthographic frustum to the play area (e.g. ±20 m around the
player) for crisp, non-pixelated contact shadows. Bias ~ -0.0005, normalBias
~0.02 to kill acne/peter-panning.

**Renderer / tone mapping:**

- `renderer.toneMapping = THREE.ACESFilmicToneMapping`, exposure ~1.0–1.1.
- `outputColorSpace = SRGBColorSpace`; all albedo textures flagged `SRGBColorSpace`,
  data maps (normal/rough) linear.
- `physicallyCorrectLights` / lighting in the modern unit system on.

**Post-processing (EffectComposer):**

- **Bloom** (`UnrealBloomPass`): threshold ~0.9, strength ~0.25, radius ~0.4 —
  just enough to bloom the white kit and stadium highlights; not a haze.
- Optional **SSAO** for grounding the player's contact points and creases.
- Optional subtle **vignette** + slight film grain for the broadcast feel.
- **FXAA/SMAA** or MSAA for clean kit edges and pitch lines.

The "eFootball graphics feel" = matte cloth + semi-gloss boots, crisp soft
contact shadow, ACES tone curve, and *restrained* bloom on the whites.

---

## 5. Animation Catalog

All animations are **time-driven procedural functions** of a phase `p ∈ [0,1)`
(for cycles) or a normalized `t ∈ [0,1]` (for one-shots), feeding eased joint
Euler targets. Cycles loop; one-shots blend in/out over ~0.12 s. Easing:
`easeInOutSine` for weight transfer, `easeOutCubic` for snappy contacts.

Notation: angles in degrees, `+` per the axis conventions in §2.2. "L/R lead"
alternates per stride. Each animation lists **duration**, **phase breakdown**,
and **key joint poses**.

### 5.1 Idle / standing

- **Duration:** breathing cycle ~4.0 s; weight-shift cycle ~6–8 s (slower,
  desynced from breath so it never looks metronomic).
- **Biomechanics:** weight rests mostly on one leg (contrapposto). Chest rises/
  falls with breath; pelvis lists toward the loaded leg; head makes small idle
  scans.
- **Poses:**
  - Breath: chest pitch ±1.5° and scale +1% over the cycle; shoulders rise ~1°.
  - Weight shift: pelvis roll ±4° and lateral translate ±0.02 m toward loaded leg
    every ~6 s; unloaded knee flexes +8°, that hip drops.
  - Arms hang with ~6° elbow flex, micro-sway ±2°.
  - Occasional head turn (±15° yaw) and a slow blink (if eyes modeled).
- **Goal:** never perfectly still; never a T-pose. Always a default to blend
  from.

### 5.2 Walk

- **Duration:** full cycle (two steps) ~1.0–1.1 s; cadence ~110–120 steps/min.
  Speed ~1.4 m/s.
- **Gait phases** per leg (classic gait cycle): **stance ~60%** (heel-strike →
  loading → midstance → terminal stance → toe-off) and **swing ~40%**.
- **Poses (one step, lead leg = L):**
  - Heel strike (p=0.00): L hip flex +25°, L knee near 0–5°, L ankle dorsiflexed;
    R leg in terminal stance behind, R hip extended −15°.
  - Loading/midstance (p≈0.15): L knee absorbs to +18°, pelvis lists over L,
    torso upright.
  - Toe-off (p≈0.30): L hip extends to −15°, L ankle plantarflexes +20° (push).
  - Swing (p 0.30–0.50): L knee flexes +45° to clear ground, hip swings forward.
  - Counter-rotation: shoulders rotate opposite the pelvis (~±8° twist); arms
    swing opposed to legs — left arm forward when right leg forward (shoulder
    flex ±25°, elbow +20°).
  - Vertical bob: pelvis rises ~0.03 m at midstance, dips at double-support.

### 5.3 Run (jog cycle)

- **Duration:** cycle ~0.65–0.75 s; speed ~4–5 m/s. Cadence ~165–180 spm.
- **Key difference from walk:** a **flight phase** (both feet off ground) and
  no double-support. Phases per leg: **contact → down → passing → up** (the
  classic 4-key run breakdown), then flight.
- **The 4 keys (lead = L):**
  - **Contact (p=0.00):** L foot strikes under/just ahead of CoM; L hip flex
    +30°, L knee +20°, L ankle neutral. R leg extended back in early swing.
    Torso leans forward ~8°.
  - **Down (p=0.12):** weight lowest; L knee flexes to +40° absorbing impact;
    pelvis dips ~0.04 m; opposite arm drives forward (shoulder +45°, elbow +90°).
  - **Passing (p=0.25):** support L leg passes vertical under CoM, begins
    extension; swing R knee tucks tight (+90°) and passes the support leg.
  - **Up (p=0.38):** L leg extends and pushes off (hip −10°, knee +10°, ankle
    plantarflex +25°) → launches into **flight (p 0.45–0.50)**; both feet
    airborne, CoM peaks.
  - Mirror for R lead over p 0.50–1.00.
- **Arms:** elbows held ~90°, drive forward/back ±40° shoulder, hands rise to
  chest height on the forward swing; minimal cross-body. Counter-rotating
  shoulders ±12°.

### 5.4 Sprint

- **Duration:** cycle ~0.50–0.58 s; speed ~7.5–9 m/s. Cadence ~200+ spm.
- **Biomechanics:** exaggerated version of run — greater forward lean (~14–18°
  from vertical), higher knee lift, more violent arm drive, longer flight phase,
  near-full hip extension at toe-off.
- **Poses:**
  - Torso pitch +15° forward, constant.
  - Front-side mechanics: swing-leg hip flex up to +75°, knee tucked to +110°
    (heel near glute), then a powerful "claw-back" extension at contact.
  - Back-side: support leg reaches near-full extension at toe-off (knee +5°, hip
    −25°, ankle plantarflex +30°).
  - Arms: shoulder swing ±55°, elbows fixed ~80–90°, hands travel from hip to
    chin level; vigorous, piston-like.
  - Flight phase ~15% of cycle.
- **Blend:** walk → run → sprint share the same key structure, so a single
  speed parameter can lerp poses and cycle duration between the three for a
  seamless locomotion blend tree.

### 5.5 Shoot (instep drive)

- **Duration:** one-shot ~0.7–0.9 s from approach to follow-through; contact
  event at ~55% of the clip.
- **Biomechanics phases:**
  1. **Approach/plant (t 0.0–0.35):** plant foot lands ~0.10–0.15 m beside the
     ball, knee flexed +25°, slightly ahead; torso leans over the ball; arms
     fling out for balance (plant-side arm abducts ~45°, kicking-side arm back).
  2. **Backswing/cock (t 0.35–0.50):** kicking hip extends (−30°) and knee
     flexes hard (+90°+) — winding the "double pendulum." Pelvis rotates away.
  3. **Acceleration → contact (t 0.50–0.58):** hip flexes explosively forward,
     knee snaps from +90° toward extension; **ankle locks plantarflexed (+25°)**
     to strike with the instep. **Emit `kickContact` event** at the frame the
     toe/instep passes the ball position (~t=0.55).
  4. **Follow-through (t 0.58–1.0):** knee extends through to near-straight, leg
     swings up high (hip flex +60–80°), often a small hop onto the plant foot;
     torso rotates through; arms counter-balance. Land and settle back to idle.
- **Power scaling:** contact event carries a `power ∈ [0,1]` from the
  windup amplitude → drives ball impulse (§6).

### 5.6 Pass (side-foot / push pass)

- **Duration:** one-shot ~0.45–0.6 s; contact at ~50%.
- **Biomechanics:** the kicking foot is **turned out ~90°** (external hip
  rotation) so the **inside of the foot** (medial arch) strikes the ball — much
  more controllable than the instep. Shorter backswing than a shot.
- **Poses:**
  - Plant foot beside ball, knee +20°, body slightly over ball, head down.
  - Kicking hip externally rotates ~45° and abducts; knee modest backswing +35°.
  - Contact: hip rotates the open foot through the ball; ankle firm/dorsiflexed,
    foot rigid. Emit `kickContact` with lower power and lower height.
  - Short follow-through (hip flex +25°), quick return to balanced stance.

### 5.7 Throw-in

- **Duration:** one-shot ~1.2–1.5 s.
- **Rules-driven biomechanics (must look legal):** ball delivered **with both
  hands**, **from behind and over the head**, with **both feet on the ground**
  at release (often a drag step, back foot toe down).
- **Phases:**
  1. **Wind-up (t 0–0.4):** both arms raise the ball overhead and behind
     (shoulders flex to +160–170°, elbows flex +60° so the ball drops behind the
     head); thoracic spine **extends backward ~20°**; pelvis pushes forward; back
     foot drags, both feet planted.
  2. **Throw (t 0.4–0.7):** explosive trunk flexion forward (spine flex +30°),
     shoulders swing the arms over the top, elbows extend; ball accelerates over
     the crown.
  3. **Release (t≈0.65):** arms extended forward/up ~+120° shoulder, wrists snap;
     **emit `throwRelease` event** with both-hands launch vector. Feet must still
     be grounded at this instant.
  4. **Follow-through (t 0.7–1.0):** arms continue down-forward, trunk flexes
     over, weight transfers to front foot, recover.
- **Hands:** fingers wrap the ball (use the thumb opposition DOF), then release
  open.

### 5.8 Slide tackle

- **Duration:** one-shot ~0.9–1.1 s.
- **Biomechanics:** player lowers CoM, extends one leg toward the ball, and
  slides on the hip/thigh of the trailing (folded) leg.
- **Phases:**
  - **Lower & launch (t 0–0.25):** rapid knee bend on take-off leg, torso pitches
    back, hands reach back toward ground.
  - **Extend (t 0.25–0.5):** lead leg extends fully (hip flex +30°, knee near 0)
    to poke the ball; trailing leg folds under (knee +120°, hip flex +60°). Body
    now near-horizontal, supported on outer thigh/hip; one or both hands brace.
  - **Slide (t 0.5–0.8):** sustain the extended pose, friction-decelerate along
    ground (physics handles translation; pose holds).
  - **Recover (t 0.8–1.0):** roll, plant hand, push up toward a crouch, back to
    idle (or to a "getting up" sub-clip).
- Emit a `tackleContact` event if the lead foot intersects the ball during the
  extend phase.

### 5.9 Fall / tumble

- **Duration:** one-shot ~1.0–1.4 s; trigger on big collision impulse or foul.
- **Biomechanics:** loss of balance → protective response. Procedurally pick a
  direction from the impact vector.
- **Phases:**
  - **Stumble (t 0–0.3):** arms windmill, trunk over-rotates toward fall
    direction, stepping leg fails to catch.
  - **Impact (t 0.3–0.55):** body rotates toward ground; lead arm/shoulder or hip
    contacts first (clamp so limbs don't interpenetrate ground); knees tuck.
  - **Tumble/settle (t 0.55–0.85):** roll a little, momentum bleeds out.
  - **Recover (t 0.85–1.0+):** push to hands and knees → rise (often a separate
    `getUp` clip ~1.5 s).
- Keep joint clamps active so no limb passes through the pitch; foot/hand y is
  floored at the contact height.

### 5.10 Jump header

- **Duration:** one-shot ~1.0–1.2 s; apex at ~50%.
- **Biomechanics:** approach → two-foot (or one-foot) plant → countermovement
  dip → explosive triple extension (hip+knee+ankle) → flight → head contact at
  apex → land and absorb.
- **Phases:**
  - **Countermovement (t 0–0.2):** dip: hips/knees flex (knee +50°, hip +40°),
    arms swing back.
  - **Drive (t 0.2–0.35):** triple extension; arms swing up; CoM accelerates up.
    Physics launches the body (vertical velocity from jump impulse, §6).
  - **Flight & contact (t 0.35–0.6):** at apex, **trunk extends then snaps
    forward** (the "neck/trunk whip"): spine extends −15° then flexes +25° to
    add power; neck firm; **emit `headerContact`** at apex when the head bone
    reaches the ball. Knees tuck slightly.
  - **Land (t 0.6–1.0):** legs reach for ground, knees flex +45° on contact to
    absorb, arms steady, return to idle.

### 5.11 Turn / pivot

- **Duration:** quick turn ~0.3–0.45 s; 180° spin ~0.5 s.
- **Biomechanics:** plant outside foot, rotate pelvis about the support leg,
  inside foot steps to the new heading; shoulders lead the eyes lead the turn
  ("eyes → head → shoulders → hips → feet" sequencing).
- **Poses:**
  - Anticipation: head turns toward new heading first (±30° before the body),
    weight shifts to the pivot foot, knee flexes +25° for grip.
  - Rotation: root yaw eased toward target heading; trunk counter-then-follows;
    free leg steps around (hip abduct/flex to reposition).
  - Settle: square up on the new heading, blend into idle or locomotion.
- **Controller link:** the kinematic turn-rate (§6) caps how fast yaw can change;
  the visual pivot pose is selected when |Δheading| per frame exceeds a
  threshold.

### 5.12 Celebration

- **Duration:** 1.5–3.0 s, often a short loop after the entry.
- **Examples & poses (pick/parametrize):**
  - **Arms-wide slide-knee run-off:** sprint pose transitions into arms abducted
    to +120°, head back (neck extend −20°), then a knee-slide (similar to slide
    tackle pose but face-forward, arms out).
  - **Both-arms-raised / fist pump:** shoulders flex +150°, elbows flex +90°,
    rhythmic pump ±20° looped; slight torso bounce.
  - **Point-to-sky / heart hands / shirt pull** as scripted micro-poses.
- Celebrations are where the **hand and face detail pays off**: open palms, a
  shouting jaw (if jaw bone modeled), expressive head tilt.

### 5.13 Animation timing summary

| Animation | Type | Duration (s) | Loop? | Key event |
|---|---|---|---|---|
| Idle | cycle | breath 4.0 / shift 6–8 | yes | — |
| Walk | cycle | 1.0–1.1 | yes | footstep ×2 |
| Run | cycle | 0.65–0.75 | yes | footstep ×2 |
| Sprint | cycle | 0.50–0.58 | yes | footstep ×2 |
| Shoot | one-shot | 0.7–0.9 | no | `kickContact` @~0.55 |
| Pass | one-shot | 0.45–0.6 | no | `kickContact` @~0.50 |
| Throw-in | one-shot | 1.2–1.5 | no | `throwRelease` @~0.65 |
| Slide tackle | one-shot | 0.9–1.1 | no | `tackleContact` (extend) |
| Fall | one-shot | 1.0–1.4 | no | impact @~0.4 |
| Jump header | one-shot | 1.0–1.2 | no | `headerContact` @apex |
| Turn/pivot | one-shot | 0.3–0.5 | no | — |
| Celebration | one-shot+loop | 1.5–3.0 | partial | — |

### 5.14 Blending & state machine

A small finite-state machine selects the active animation; transitions
cross-fade joint Eulers over a blend window (default 0.12 s, 0.08 s for
locomotion↔locomotion). Locomotion (idle/walk/run/sprint) is a **1-D blend
space** parametrized by `speed`, so the four cycles interpolate continuously.
One-shots interrupt locomotion, fire their event, then return to the locomotion
blend. A global additive **breathing/look layer** runs on top of everything so
even mid-action the chest and head have life.

---

## 6. Physics Model

Two loosely-coupled systems: a **kinematic character controller** (the player
is driven, not simulated, for responsive arcade feel) and a **rigid-body-ish
ball** (lightweight custom integrator — no full physics engine needed).

### 6.1 Kinematic character controller

The player's body is a capsule for collision (radius ~0.30 m, height 1.80 m)
but its motion is **kinematic**: we integrate velocity from intent, not from
forces, so control feels crisp.

| Parameter | Value | Notes |
|---|---|---|
| Walk max speed | 1.4 m/s | |
| Run max speed | 5.0 m/s | |
| Sprint max speed | 8.5 m/s | held-button / stamina-gated |
| Acceleration | 12 m/s² | time to reach run speed ~0.4 s |
| Deceleration (friction) | 18 m/s² | quick, responsive stop |
| Braking (active stop) | 28 m/s² | when input opposes velocity |
| Turn rate (walk) | 360°/s | |
| Turn rate (run) | 200°/s | faster you go, wider you turn |
| Turn rate (sprint) | 120°/s | momentum-limited, forces wide arcs |
| Idle→move threshold | 0.05 m/s | below this, snap to idle |

Update each frame:

```
desiredVel = inputDir * targetSpeedForState
accel = (inputMag > 0) ? ACCEL : -FRICTION
vel  = moveToward(vel, desiredVel, accel * dt)
// clamp yaw change by turnRate(speed)
heading = rotateToward(heading, desiredHeading, turnRate * dt)
position += vel * dt
// then resolve ground + boundary + ball collisions
```

The locomotion **animation speed parameter is driven by `|vel|`**, closing the
loop between physics and animation (foot speed matches ground speed → no foot
sliding, the classic "skating" artifact). Optionally scale cycle playback so
`stride_length × cadence == ground_speed`.

### 6.2 Ball physics

A real match ball (FIFA Size 5):

| Property | Value |
|---|---|
| Mass `m` | 0.43 kg (410–450 g) |
| Radius `r` | 0.11 m (circumference ~0.69 m) |
| Gravity `g` | 9.81 m/s² (−Y) |
| Restitution `e` (bounce) | ~0.6 (loses ~40% normal speed per bounce) |
| Rolling resistance | ~0.02 (decel coefficient on grass) |
| Sliding friction (μ) | ~0.5 (before it starts rolling) |
| Air drag `Cd` | ~0.25 (sphere); only matters at high speed |
| Air density `ρ` | 1.225 kg/m³ |

**Integration (semi-implicit Euler, fixed substep ~1/120 s for stability):**

```
F = gravity + drag + magnus
drag   = -0.5 * ρ * Cd * A * |v| * v        // A = π r²
magnus = k * (ω × v)                         // spin-induced sideways force (curve)
a = F / m
v += a * dt
pos += v * dt
```

**Ground collision:** when `pos.y - r < pitchY`:
- push out: `pos.y = pitchY + r`.
- reflect normal velocity with restitution: `v.y = -v.y * e` (only if moving
  into ground; if `|v.y|` tiny, clamp to 0 → rest).
- apply tangential friction: if airborne-impact, scrub horizontal speed; once
  grounded and slow, switch to **rolling**: apply rolling resistance decel and
  set `ω = v / r` (no-slip) so it rolls realistically and slows to a stop.

**Magnus / curve effect:** spin `ω` (set at kick time from foot-offset, §6.3)
produces a lateral force `F = k·(ω × v)`. This is what bends free-kicks and
crosses. `k` is tuned empirically (~0.0005–0.002 range scaled by `ρ·r³`);
expose it as a "curve" knob. Top-spin (ω about a horizontal axis ⟂ to motion)
dips the ball; side-spin bends it left/right.

### 6.3 Kick impulse from animation contact events

Animations emit events (§5); the physics layer converts them to ball impulses.

On `kickContact { footPos, footVel, power, contactOffset }`:

```
// 1. Direction: from foot to ball, plus the foot's swing direction
dir = normalize(blend(ballPos - footPos, footVelDir, 0.5))

// 2. Speed from power (windup amplitude) and animation type:
//    shot:   up to ~30 m/s   (108 km/h)
//    pass:   ~8–14 m/s
//    header: ~12–18 m/s
speed = lerp(minSpeed, maxSpeed, power)

// 3. Loft: instep-low contact → flat; under the ball → lofted
launchPitch = f(contactOffset.y)        // 0–35° typical

// 4. Spin: horizontal offset of contact from ball center → side-spin (curve)
ω = computeSpin(contactOffset, footVel)

// 5. Apply
ballVel = dirWithPitch * speed
ballSpin = ω
```

`contactOffset` is *where on the ball the foot struck* relative to center —
striking below center lofts it, striking off-side imparts curve. This single
mechanism gives shots, lofted passes, driven balls, and bending free-kicks from
one code path, parametrized by the animation and a small aim model.

Impulse form (if you prefer momentum): `Δv = J/m`, where `J` is the impulse
magnitude tuned so `power=1` shot reaches ~30 m/s. Because the ball is light
(0.43 kg) a modest impulse yields high speed — keep contacts crisp.

### 6.4 Ground & boundary collision (player and ball)

- **Pitch plane** at `y = 0`; player feet IK-floored (or pose-floored) to it;
  ball collides as in 6.2.
- **Goal frame:** thin box/cylinder colliders on posts and crossbar; ball
  reflects with high restitution (~0.7) and a clank. Net = a soft, high-drag,
  low-restitution zone that catches the ball.
- **Touchlines/goal-lines:** crossing triggers throw-in / goal-kick / corner
  game events (out-of-play detection), not a wall.
- **Player–ball:** if the player capsule overlaps the ball while not kicking, do
  a soft dribble push (small impulse away from feet) so the ball stays at the
  feet during dribbling rather than being trapped inside the capsule.

### 6.5 Fixed timestep & determinism

Run physics on a **fixed accumulator** (e.g. 120 Hz substeps) decoupled from the
render frame; interpolate render positions between the last two physics states.
This keeps the bouncy ball stable regardless of frame rate and makes contact
timing repeatable.

---

## 7. Implementation Roadmap (Three.js module structure)

### 7.1 Proposed module layout

```
/src
  /core
    Engine.js          // renderer, scene, camera, composer, clock, fixed-step loop
    Loop.js            // fixed-timestep accumulator + render interpolation
    PostFX.js          // EffectComposer: bloom, SSAO, FXAA, vignette
  /config
    proportions.js     // §1 tables: SEGMENTS, BREADTHS, HEAD_UNIT, derived from HEIGHT
    materials.js       // §4 PBR presets (skin, jersey, shorts, socks, boots, ball, grass)
    kit.js             // team colors, number, name → builds CanvasTextures
    rig.js             // §2 bone hierarchy spec: names, offsets, axes, Euler order, ROM clamps
  /player
    Skeleton.js        // builds the THREE.Group bone tree from rig.js
    MeshBuilder.js     // §3 tapered cylinders + joint spheres + torso/head/hands/boots
    Player.js          // assembles Skeleton + Mesh, exposes setPose(boneAngles)
  /anim
    poses.js           // per-animation keyframe pose tables (§5), in degrees
    easing.js          // easeInOutSine, easeOutCubic, etc.
    AnimController.js   // FSM, 1-D locomotion blend, one-shot interrupts, crossfade
    events.js          // kickContact / throwRelease / headerContact dispatch
    additive.js        // breathing + look-at layer applied on top
  /physics
    CharacterController.js  // §6.1 kinematic movement, turn-rate, accel/friction
    Ball.js                 // §6.2 integrator: gravity, drag, magnus, bounce, roll
    Collision.js            // ground, goal frame, boundaries, player–ball
    kicks.js                // §6.3 contact-event → impulse + spin
  /pitch
    Pitch.js           // §4.3 grass plane + stripe texture + line markings + goals
  /scene
    Lighting.js        // §4.4 sun + hemisphere + fill, shadow config
    Camera.js          // broadcast-style follow camera
  main.js              // wires everything; input → controller → anim → physics → render
```

### 7.2 Build order (milestones)

1. **M0 — Harness.** Engine, scene, camera, lighting, ACES + bloom, a ground
   plane, OrbitControls. Verify tone mapping and a soft shadow on a test sphere.
2. **M1 — Proportions & static mesh.** Implement `proportions.js`; build a
   **static, un-rigged** player from primitives in bind A-pose. Eyeball against
   the §1 tables and the 1.80 m / 7.8-head check. This is the make-or-break
   visual step — get the V-taper and leg length right here.
3. **M2 — Rig.** Wrap pieces in the §2 bone hierarchy; expose `setPose`. Validate
   each joint's axis by sweeping it ±ROM in isolation (a debug GUI with one
   slider per DOF). Confirm knees/elbows hinge the right way and joint spheres
   fill seams.
4. **M3 — Materials & kit.** Apply §4 materials; generate jersey/number/ball
   canvas textures. Confirm matte cloth vs semi-gloss boots under the lighting.
5. **M4 — Idle + locomotion.** Implement idle, walk, run, sprint as the §5
   procedural poses; build the 1-D speed blend in `AnimController`. Drive it with
   keyboard input via a stub controller. Tune until no foot-sliding.
6. **M5 — Character controller.** Real `CharacterController` (§6.1): accel,
   friction, turn-rate; couple `|vel|` → animation speed. Add the follow camera.
7. **M6 — Ball & kicks.** `Ball.js` integrator + collisions; wire `kickContact`
   from a Shoot/Pass one-shot to `kicks.js` impulses. Dribble push. Tune
   restitution/roll until the ball *feels* like a Size-5.
8. **M7 — Full action set.** Throw-in, slide tackle, jump header (+ jump
   impulse), turn/pivot, fall, celebration; their contact events.
9. **M8 — Pitch & polish.** Full FIFA-marked pitch, goals with net, mowing
   stripes; SSAO/vignette; performance pass (merge static geometry, shadow
   frustum tightening, draw-call audit).

### 7.3 Data-driven principle

Everything quantitative in this document — segment lengths, breadths, ROM
limits, material PBR values, animation phase tables, physics constants — lives
in `/config` and `/anim/poses.js` as **plain data**, so the model can be
re-proportioned (different player height/build), re-kitted, or re-tuned without
touching builder or controller logic. Derive, don't hardcode: every dimension is
a ratio × `HEIGHT`, every box width is computed from goal width + depths, every
animation angle is named and editable.

---

## Appendix A — Key constants quick reference

```js
const HEIGHT      = 1.80;          // m
const HEAD_UNITS  = 7.8;
const HEAD_H      = HEIGHT / HEAD_UNITS;   // 0.231 m
const MASS_PLAYER = 75;            // kg
const COM_HEIGHT  = 0.56 * HEIGHT; // ~1.01 m

// Ball
const BALL_MASS   = 0.43;          // kg
const BALL_R      = 0.11;          // m
const G           = 9.81;          // m/s²
const BALL_E      = 0.6;           // restitution
const ROLL_RES    = 0.02;

// Locomotion
const V_WALK = 1.4, V_RUN = 5.0, V_SPRINT = 8.5;   // m/s
const ACCEL = 12, FRICTION = 18, BRAKE = 28;        // m/s²

// Pitch (IFAB)
const PITCH_L = 105, PITCH_W = 68;     // m
const CENTER_R = 9.15;
const PEN_DEPTH = 16.5, GOALAREA_DEPTH = 5.5;
const PEN_SPOT = 11.0;
const GOAL_W = 7.32, GOAL_H = 2.44;
const PEN_AREA_W = GOAL_W + 2*PEN_DEPTH;   // 40.32
const GOAL_AREA_W = GOAL_W + 2*GOALAREA_DEPTH; // 18.32
```

## Appendix B — Glossary

- **Head-unit:** the height of one head; the unit for sizing the figure (7.8 here).
- **A-pose / bind pose:** the neutral rest pose all animations blend from.
- **FK (forward kinematics):** posing by setting each joint's rotation directly.
- **PBR:** physically-based rendering (roughness/metalness albedo workflow).
- **Magnus effect:** lateral force on a spinning ball that makes it curve.
- **Restitution:** bounciness, the ratio of rebound to incoming normal speed.
- **Stance / swing / flight:** phases of a gait cycle (flight = both feet airborne).
- **Contrapposto:** standing with weight on one leg, hips/shoulders tilted —
  the basis of a natural idle.
```
