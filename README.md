# QR3D

A 3D-printable sculpture that is two pictures at once. Look straight down and
it is a scannable QR code. Look at it edge-on and it is whatever you asked for
— a cat, a rocket, your own uploaded image.

Type a link, type a prompt, get an STL.

## How it works

The sculpture is **carved out of the code**, so from directly above the print is
just a QR — no object sitting on it, nothing blocking it. Look at it from any
other angle and it is a solid 3D model.

### The constraint

For the code to survive intact from overhead, no material may stand over a light
module — at any height. That single rule is what makes the camouflage work, and
it is brutal:

> Two parts of the sculpture can touch only where their modules are
> face-adjacent in the code. No horizontal bridging is possible anywhere.

A QR's dark modules are scattered, so carving a shape out of them shatters it.
Measured on real codes, a carved sculpture comes apart into **20–120 fragments**.

### What makes it work anyway

The code does not have to be *perfect*, only decodable. Darkening one light
module is one module of error, and a QR carries error correction to spare.

So the fragments are joined by darkening as few modules as possible. Every
fragment is grown outward at once, and where two fronts meet, the two paths back
to their sources are the cheapest link between them — only those cells are
darkened, and union-find keeps each merge to the first, shortest meeting. It
costs about **one module per fragment**: 25–65 extra dark modules scattered
among thousands, which is **under 1% of the pattern** and indistinguishable from
it.

That is the whole trick. A handful of modules of deliberate error buys a
sculpture that is one connected piece and keeps its real shape.

### Supports, and why there are so few

A bridge also has to carry material at the heights its neighbours occupy. Joining
fragments only in plan leaves them still adrift in space — a mushroom cap
floating a dozen layers above the bridge meant to hold it. Filling the bridge
column through those heights dropped the number of props needed from **22–121
per model to 0–17**, and the material they add from up to 18% down to under 3%.

Whatever still floats gets exactly **one** column reaching the tile, not all of
them. Filling every column — which is what grounding does — turns a canopy into
a solid mass and costs a tree most of its shape; filling one gives it a trunk.

### Detail is not limited by the code

The code constrains **where** material may stand, not **how finely** it may be
shaped. A sub-voxel lies wholly inside one module, so if that module is dark the
projection is still legal — and the tile already raises every dark module, so
one the sculpture only partly covers still reads dark from above.

So the sculpture is shaped several times finer than the code across, and it
costs the code nothing: sharpening cells from 2.6 mm to 0.65 mm leaves pattern
drift unchanged at about 1%. The module grid decides the sculpture's *outline*;
its surface can be as smooth as the printer can hold.

The sculpture takes the whole data area by default — finder patterns included,
only the quiet zone left flat. Confined to a centre square it reads as a lump
dropped onto a flat pattern; spanning the lot, the code and the sculpture are
one object. Blocky subjects clamp back a little, because a dense footprint
fragments into more pieces and the bridges cost more error budget than the code
can spare.

### Printing

Raising the code version is tempting, and it is exactly what produces something
no FDM printer can hold. At 65 modules the tile had 143 single-module islands
and 453 pairs of modules touching only at a corner, with each module just 4
nozzle widths across.

The answer is not smaller modules but **a wider sculpture on a coarser code**,
shaped finely within it. A span of 0.72 on a 41-module code gives a 30-module
sculpture at 2.6 mm — 6.5 nozzle widths — against 36 modules at 1.6 mm on a
65-module one. The tile comes out about the same size either way, because module
count and module size trade off at a fixed footprint.

The app reports this rather than deciding it: nozzle width, modules per nozzle
pass, the sculpture's own cell size in nozzle widths, layer count, island and
corner-contact counts, and a verdict, all recomputed as the controls move. The
defaults land on the comfortable side of it. Surface detail finer than one
extrusion is flagged as *will print smoother than it looks* — it is not a
structural risk, since these are facets of a solid rather than standalone posts.

Bridges cost error-correction budget, which scales with the code's area while
the bridges scale with the sculpture's. So the span is fitted the same way the
rest of this is: ask for what was requested, and step back only if the decoder
actually objects.

### The models

Composed from signed-distance primitives — cones, frustums, capsules, boxes,
tapered blades — and normalised into their footprint using the bounds their
primitives carry. A rocket has a flared engine bell, a stage band, a porthole and
four swept fins; a cat has ears, a muzzle, front legs, paws and a curled tail; a
tree has a trunk under a lumpy canopy.

### Staying responsive

A build is voxelisation plus a QR decode. Edits are debounced so a slider drag
coalesces into one build, and builds run in a worker — inlined into the bundle
(`?worker&inline`) because the app also ships as one self-contained HTML file,
where a separate worker chunk would have nothing to load from. Only the newest
request is kept. Model closures cannot cross a worker boundary, so the input
names the *source* — a library id, or the bitmap behind a lathe or a word.

### Supplying the subject

1. **A prompt**, matched against the model library.
2. **An uploaded image**, turned on a lathe — a real solid rather than a slab,
   held together by a slim axial spine so an outline with a gap in it does not
   revolve into floating parts.
3. **A word**, cast as raised lettering on a plinth, because separate letters
   are separate solids and a word without one prints as loose glyphs. This is
   the only extruded case, since extruded lettering is what 3D text actually
   *is*.

## Verification

Two things about this problem punish the obvious test.

**Decoding is not enough to prove orientation.** jsQR decodes mirrored codes
happily, so "it decoded" says nothing about whether the *printed* object reads
correctly. The QR bitmap is image space — row 0 at the top of the picture —
but the voxel grid is physical space, and an observer looking down with `+x`
to their right necessarily sees `+y` going *up* their view. Laying row 0 at
`y = 0` produces a print that is a vertical mirror of the intended code, and a
mirrored QR is not a rotated QR: no amount of turning the print fixes it. The
suites assert on finder-pattern corners instead, which are asymmetric by
construction — a QR has them at top-left, top-right and bottom-left, and never
at bottom-right.

**The camouflage is asserted, not assumed.** The suite compares what the print
shows from overhead against the plain code and requires under 4% of modules to
differ — in practice it is 0.8–1.7%. It separately asserts that *no voxel
anywhere stands over a light module*, which is the property the camouflage
actually rests on, and that the image verified is the image printed.

**"Prints in one piece" is not a claim you can eyeball.** Every model is
asserted to come out at exactly one connected body (6-connected: voxels meeting
at an edge or a corner are not a printable weld), with the supports adding under
8% material. This caught three real modelling errors — a mushroom cap that only
touched its stalk, a whale's flukes abutting rather than overlapping the
peduncle, and a whale stand that stopped short of the body.

**Detail is asserted to cost the code nothing.** Sharpening the sculpture must
not move the pattern: the suite requires cells four times finer to leave drift
within half a percentage point, and the tile exactly the same size. It also
asserts that at full span the sculpture covers every module while the quiet zone
stays completely clear.

**A build is asserted to terminate, whatever the settings.** The suite drives
the largest code at full span and maximum detail and requires it to finish
promptly, with detail — not size or version — being what gave way. The browser
suite drags every slider to its maximum and requires the page to settle rather
than sit on "Rebuilding", which is the failure a user actually hits.

**Self-supporting is asserted to mean what it says**: zero cells overhanging
steeper than 45°, still one piece, still scanning, and with the code bit-for-bit
unchanged by the shaving.

**Printability is asserted at the defaults.** The suite requires the shipped
settings to come out "comfortable", requires a fine-grained alternative to be
flagged rather than silently shipped, and checks that a nozzle too coarse for
the modules is caught. It also pins the trade itself: a coarse code must match a
fine one for sculpture detail while the tile stays about the same size.

**Finder patterns are matched in full, not sampled.** A QR carries them at
top-left, top-right and bottom-left and never at bottom-right, which is what
makes them a mirror test. Sampling a corner's centre is not enough: a lone dark
module turns up at the empty corner about half the time, so that check passed or
failed by luck depending on the code. The whole 7×7 is matched instead — in the
flat projection and, by locating the base plate first, in the rendered 3D
geometry too.

**Responsiveness is a controlled comparison, not a threshold.** The suite
measures the worst gap between animation frames while idle, then again during a
build, and asserts the second is not far above the first. An absolute number
would measure the test environment's software WebGL renderer — a uniform ~200 ms
per frame at 2× scale — rather than anything about the app. This distinction
mattered: an earlier version of the check timed Playwright's own `fill` calls,
which wait for the page to be actionable and so blocked on each build, reporting
a 10-second stall that was entirely the test's own doing.

**2D input has to become a printable solid.** A word is separate letters and an
uploaded outline may have a gap in it; both voxelise into disconnected pieces,
which pruning would then silently reduce to a single surviving letter. The
suite asserts both come out whole — lettering on a plinth, a lathe on a spine.

**A triangle count says nothing about whether a mesh is printable.** The mesh
is checked by signed volume via the divergence theorem, which for a closed
outward-wound surface equals the true volume exactly. A hole makes it wrong and
inverted winding makes it negative, so one number covers watertightness and
orientation together.

Beyond that, `verify.ts` decodes the model's real projected top view — computed
by projecting the finished voxel grid, not by re-rendering the input — so a
pass means the geometry that will be printed is the geometry that scans. Export
is disabled unless it passes.

```
npm install
npm run dev          # the app
npm test             # geometry, orientation, mesh, STL, prompt matching
npm run test:e2e     # browser: decodes the actual painted pixels (dev server must be running)
npm run models       # ASCII-render every sculpture
npm run carve        # bridge, support and decode figures for every model
npm run views        # ASCII-render both projections of a build
```

The browser suite runs at `deviceScaleFactor: 2` on purpose — HiDPI is where
canvas-sizing bugs hide, and one of them had already pushed the model
off-screen on every retina display.

## Printing it

The app computes these for your actual settings, under *How to print it*:

- **No supports.** The artwork is self-supporting above the plinth, and the
  welding posts are deliberate.
- **One filament change**, at the top of the base plate. Light below, dark and
  matte above. Matte matters — specular highlights are what usually defeat a
  scanner on a printed code.
- **Modules at 1.2 mm or larger.** Below that a printed QR generally stops
  scanning, whatever the geometry says. The app warns.
- **Pick a layer height that divides the voxel layer height evenly**, so the
  artwork's steps land on layer boundaries. The app suggests which common
  heights fit.
- **Scan from directly above, in diffuse light.** It is only a QR code from
  one direction.

## Supplying the artwork

Three ways, in the order the app tries them:

1. **A prompt.** Matched against a library of 26 hand-authored silhouettes,
   scoring whole words above substrings so "startup rocket" is not beaten by an
   incidental match inside another word.
2. **An uploaded image.** Thresholded to a silhouette; transparent PNGs work
   directly, and there is an invert toggle for light-on-dark art.
3. **A word.** If nothing matches, the first word of the prompt is extruded,
   shrunk to fit rather than clipped.

Shapes are authored as SVG paths and rasterised by a scanline filler written
for this project rather than by canvas, so the pipeline is identical in the
browser and in Node tests, and deterministic — there is no antialiasing to
threshold. Even-odd fill means inner contours become holes, which is how the
skull gets its eye sockets.

## Layout

```
src/lib/
  sdf.ts          3D distance primitives, combinators, bounds-culled union
  models3d.ts     the sculptures, and the prompt matcher
  carve.ts        carving, bridging, speck-dropping, minimal supports
  printability.ts what an FDM printer will make of it
  voxelize.ts     lathe and lettering adapters for 2D input
  voxel.ts        voxel grids, projection, connectivity
  bitmap.ts       binary rasters, fitting, projection helpers
  qr.ts           QR module matrix, quiet zone included
  path.ts         SVG path parser and bezier flattener
  raster.ts       supersampled scanline polygon fill; image thresholding
  mesh.ts         greedy quad meshing and the base plate
  stl.ts          binary STL and OBJ
  verify.ts       decodes the model's own top-down projection
  pipeline.ts     input -> design, with warnings and printing notes
src/components/   three.js viewer, exact projection canvas, model thumbnails
```

The viewer's camera is orthographic, and that is not a style choice: the
illusion is defined for parallel projection. Under perspective the rays
diverge, modules near the edge of the code are seen past, and the QR smears.
