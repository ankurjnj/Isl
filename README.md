# QR3D

A 3D-printable sculpture that is two pictures at once. Look straight down and
it is a scannable QR code. Look at it edge-on and it is whatever you asked for
— a cat, a rocket, your own uploaded image.

Type a link, type a prompt, get an STL.

## How it works

### The constraint everything follows from

Anything above the code plane occludes the code. So material may only ever
stand over a dark module, **at any height**. Which means two parts of the
sculpture can touch only where their modules are face-adjacent in the code —
no horizontal bridging is possible anywhere, ever.

A QR always contains isolated modules. So a shape with a part that floats above
a narrower part below it — a canopy over a trunk, a cap over a stalk — cannot
be a single printable object. There are exactly two honest resolutions: hold it
with rods, or give every column its own path to the ground. This build takes
the second, so there are no connecting rods anywhere.

### The construction

Subjects are **real 3D solids**, composed from signed-distance primitives —
cones, frustums, capsules, boxes — and voxelised. The code is then carved out
of the solid:

```
V(x, y, z) = QR(x, y) ∧ M(x, y, z)
```

Because `M` is a genuine solid rather than an outline given depth, its
occupancy varies along every axis, and so does the result. Projecting back:

```
top(x, y)  = QR(x, y) ∧ (the solid stands somewhere in that column)
side(x, z) = M's outline ∧ (that code column carries ink somewhere)
```

The top view is the one that must never be approximate, and the plinth
guarantees it: a pedestal spanning every data column means each dark module
carries material regardless of where the sculpture happens to stand. The side
view needs no such device — it only needs one dark module anywhere across the
depth, and with tens of columns to draw from it survives at 92–100%.

### Grounding, and why the library looks the way it does

Every column is filled from the plate up to the solid's top surface. That is
what removes the rods, and it has a price: filling a column downward propagates
its width all the way down. A shape that re-widens above a narrow point loses
exactly the feature that made it recognisable — a chess king becomes a taper,
a mushroom becomes a bell. A shape that **tapers** is reproduced faithfully.

So the library is authored to that constraint rather than against it. Two rules
came out of testing every candidate:

- **Radius never grows with height.** Standing, tapering subjects are the ones
  this medium renders: towers, trees, rockets, peaks, seated animals.
- **Stepped profiles beat smooth ones.** The silhouette is only ~30 modules
  tall, so a gentle curve becomes an anonymous mound — a snowman, a penguin and
  a vase all came out as the same nondescript hill. A hard setback survives as
  a shape you can name, which is why the skyscraper has deco setbacks and the
  lighthouse has a gallery.

`outlineDistortion` reports what grounding cost each subject, so the trade is
visible rather than hidden. **Solid** mode is available for the true occupancy
with overhangs kept — it reports floating pieces honestly rather than welding
them.

### Supplying the subject

1. **A prompt**, matched against the model library.
2. **An uploaded image**, turned on a lathe — a genuine solid interpretation of
   an outline rather than a slab.
3. **A word**, cast as raised lettering. This is the one extruded case, because
   extruded lettering is what 3D text actually *is*.

### Printability

- **One piece.** Every column reaches the plate, so nothing falls off.
- **Zero overhangs**, measured, so it prints with no supports at all.
- **Zero connecting rods**, by construction rather than by repair.
- **A base plate**, which gives a scanner its contrast — light plate, dark code
  — and ties the code's isolated modules together.
- **Greedy quad meshing**, cutting a naive six-quads-per-voxel mesh by an order
  of magnitude without changing the shape.

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

**"Looks 3D" is not a claim you can eyeball.** The suite measures it: for each
column, how many *distinct* height profiles do the open depth slices carry? A
shape swept along the depth axis scores exactly 1.00, because every slice
carries the same profile. The modelled solids score well above that — the
difference between a shape with form and a shape without.

**"Prints in one piece" is not a claim you can eyeball either.** Every model in
the library is asserted to come out at exactly one connected piece (6-connected:
voxels meeting at an edge or a corner are not a printable weld) with zero
overhanging voxels. A deliberately overhung test shape confirms the reporting
is real — in Solid mode it comes back as multiple pieces rather than silently
welded.

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
npm run models       # ASCII-render every solid, grounded and code-masked
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
  sdf.ts          3D distance primitives and combinators
  models3d.ts     the solids, and the prompt matcher
  voxelize.ts     lathe and lettering adapters for 2D input
  voxel.ts        the construction, plinth, grounding, fidelity report
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
