# QR3D

A 3D-printable sculpture that is two pictures at once. Look straight down and
it is a scannable QR code. Look at it edge-on and it is whatever you asked for
— a cat, a rocket, your own uploaded image.

Type a link, type a prompt, get an STL.

## How it works

The print is **two solids sharing one base plate**: a code tile at module
resolution, and a sculpture at a much finer pitch standing on it.

That split is the whole design, and it took three attempts to arrive at.

### Why the sculpture is not carved from the code

The obvious approach is to make the sculpture *be* the code — intersect a shape
with the QR and print what survives. It cannot work, and the reason is worth
stating precisely:

> Anything above the code plane occludes the code. So material may only stand
> over a dark module, **at any height**. Two parts of such a sculpture can
> therefore touch only where their modules are face-adjacent in the code — no
> horizontal bridging is possible anywhere, ever.

A QR always contains isolated modules, so this shatters the shape. Measured on
real codes, a carved sculpture came out in **86 to 362 disconnected pieces**.
The only ways to print that are thin connecting rods, or filling every column
down to the plate — and filling propagates each column's width downward, which
flattens the model into a relief and destroys exactly the detail that made it
recognisable. Both were tried; both are dead ends.

### What buys the way out

Error correction. A QR at ECC Q or H reads through roughly a fifth of its area
being obscured — the same allowance that lets a logo sit in the middle of a
printed code. So the sculpture does not need to *be* the code. It can simply
**stand on** it and hide part of it.

That single change removes every constraint from the sculpture at once:

- **Not masked**, so nothing shreds its detail.
- **Not grounded**, so it keeps undercuts — a cap over a stalk, a canopy over a
  trunk, a teapot's handle.
- **Not on the module grid**, so its resolution is set by what the printer can
  hold, not by the size of a QR module. At the default it is ~80 voxels across
  at 0.5 mm each.

The allowance is measured, not assumed: `probeMaxSpan` binary-walks the real
decoder against the actual code, because the headroom depends on the version,
the mask pattern and which blocks a given region spans — not just the ECC
level's nominal rate. The app clamps the sculpture to that measured limit rather
than shipping something that does not scan.

### The models

Composed from signed-distance primitives — cones, frustums, capsules, boxes,
tapered blades — and voxelised. Because they are free-standing, they can have
the things that make an object recognisable: a rocket has a flared engine bell,
a stage band, a porthole and four swept fins; a cat has ears, a muzzle, front
legs, paws and a curled tail; a tree has a trunk under a lumpy canopy.

Models are normalised into their footprint using the bounds their primitives
carry, so authored coordinates need not be calibrated by hand and every model
fills the space it is given, with its height following from its own proportions.

Two things keep voxelisation honest. Samples are accepted slightly outside the
surface, which rescues features thinner than the voxel pitch — a fin, an ear, a
railing post — for one evaluation instead of the eight that supersampling would
cost. And because that tolerance can strand a speck a voxel or two across near
the rim of a subtracted cavity, only the largest connected body is kept, with
the discarded fraction reported so a genuine modelling error (a limb that fails
to meet the body) is surfaced rather than quietly deleted.

### Printability

- **One piece**, asserted for every model in the suite.
- **Overhangs are allowed** and counted; the sculpture needs supports, the tile
  does not.
- **A base plate**, which gives a scanner its contrast — light plate, dark code.
- **Greedy quad meshing**, cutting a naive six-quads-per-voxel mesh by an order
  of magnitude without changing the shape.

### Supplying the subject

1. **A prompt**, matched against the model library.
2. **An uploaded image**, turned on a lathe — a real solid rather than a slab.
3. **A word**, cast as raised lettering. The one extruded case, because
   extruded lettering is what 3D text actually *is*.

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

**The occlusion limit is measured against the real decoder, in both
directions.** The suite asserts not only that the chosen footprint decodes, but
that one module *past* the probe's answer stops decoding — otherwise the probe
would be reporting headroom that is not there.

**"Prints in one piece" is not a claim you can eyeball.** Every model is
asserted to come out at exactly one connected body (6-connected: voxels meeting
at an edge or a corner are not a printable weld). This caught three real
modelling errors — a mushroom cap that only touched its stalk, a whale's flukes
abutting rather than overlapping the peduncle, and a whale stand that stopped
short of the body.

**Detail is asserted to be independent of the code.** Raising the sculpture's
resolution must change its voxel count without touching the code's module
count — that separation is the entire point of standing the figure on the tile
rather than carving it from it.

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
npm run models       # ASCII-render every sculpture, with piece and overhang counts
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
  voxelize.ts     lathe and lettering adapters for 2D input
  voxel.ts        tile, figure, occlusion, and the decode-limit probe
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
