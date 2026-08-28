# QR3D

A 3D-printable sculpture that is two pictures at once. Look straight down and
it is a scannable QR code. Look at it edge-on and it is whatever you asked for
— a cat, a rocket, your own uploaded image.

Type a link, type a prompt, get an STL.

## How it works

The naive approach is a heightfield: extrude each dark QR module to a height
taken from the artwork. It does not work. A heightfield seen from the side is
only its upper contour — a mountain range — so you can never get a real
silhouette, and anything with a hole in it (a mug handle, the gap under a cat's
chin) is lost.

The construction that does work is the voxel Cartesian product, from
[Shadow Art (Mitra & Pauly, SIGGRAPH Asia 2009)](https://graphics.stanford.edu/~niloy/research/shadowArt/paper_docs/shadowArt_sigA_09_small.pdf).
Take the QR code `Q(x, y)` and the side artwork `S(x, z)`, and fill a voxel at
every point where both are solid:

```
V(x, y, z) = Q(x, y) ∧ S(x, z)
```

The two images share the `x` axis. That is the whole trick, and projecting the
result back shows exactly what it costs:

```
top(x, y)  = Q(x, y) ∧ (column x of S is non-empty)
side(x, z) = S(x, z) ∧ (column x of Q is non-empty)
```

Each view is reproduced perfectly wherever the *other* image has something in
the same column, and is blank where it does not. So there are two conditions,
and they are not equally fixable:

- **The top view is made exact, unconditionally.** A plinth — a pedestal
  spanning every column of the code — forces "column x of S is non-empty" to
  hold everywhere the QR has ink. This is not a heuristic that usually works;
  it closes the only hole in the identity. The code always comes out perfect,
  which is the one thing that must never be approximate. The artwork also gets
  seated on that plinth rather than centred, so it stands on its pedestal
  instead of hovering above it.

- **The side view cannot be.** If a QR column happens to be entirely light, no
  material may stand there without corrupting the code, so that slice of the
  artwork is impossible. The app reports these as *blind columns* rather than
  fudging them. In practice real codes have ink in every column and side
  fidelity comes out at 100%, but the number is measured, not assumed.

### Giving it depth

That product alone is not yet a sculpture, and it is worth being precise about
why. At a fixed `x` the solid set is `{y : QR} × {z : S}` — a product. The
z-structure depends only on `x`, so every pillar in a column shares one height
profile and the object is a 2D shape swept along `y`. That is an extrusion.

So the depth is made to vary too:

```
V(x, y, z) = Q(x, y) ∧ S(x, z) ∧ ( |y − c| ≤ D(x, z) )
```

`D` is a depth field over the side view, and because it depends on both `x` and
`z` the slices through the model differ from one another — that difference *is*
the form. Three fields ship:

- **Rounded** (default) inflates the silhouette the way sketch-based modellers
  do: depth follows distance from the outline, on a circular falloff rather
  than a linear one, so the surface domes over instead of meeting the edge as a
  cone. Distance is an exact Euclidean transform rather than a chamfer
  approximation — chamfer error shows up as faceting along the diagonals of a
  surface that should read as smooth. Thin features stay thin: a cat's ears are
  near their own outline everywhere, so they read as ears rather than rods.
- **Turned** sweeps each height's cross-section around its own centre line, for
  a lathed, generalised-cylinder form. It uses the per-row centre rather than
  one global axis, so an off-centre subject bends with its own spine instead of
  ballooning around the model's middle.
- **Flat** is the constant-depth case — the extrusion above, kept because it is
  the cheapest thing to print.

Neither guarantee is spent on this. The plinth stays full depth, which is what
keeps the top view exact however thin the artwork gets above it. And narrowing
the band can leave a cell whose slice of the code is entirely light, which
would erode the side view into a ragged outline exactly where the form is
thinnest — so those cells get the single nearest dark module added behind the
surface. One module is too small to disturb the silhouette it is protecting,
and the side view stays as faithful as the flat build: limited only by blind
columns, never by the depth field.

### Printability

A voxel model that projects correctly can still be unprintable, so three more
things happen:

- **Connectivity.** Components are found with 6-connectivity — face contact
  only, since voxels meeting at an edge or corner are not a printable weld.
  Anything not reaching the plinth gets a thin post dropped under it. A post
  sits inside a module that is already dark, so it is invisible from above and
  a hairline from the side.
- **A base plate.** The dark modules of a QR are not a connected shape, so
  without a plate underneath they would print as loose pieces. The plate is
  also what gives a scanner its contrast: light plate, dark code.
- **Greedy quad meshing.** Six quads per voxel would put a typical model past
  100k triangles. Merging coplanar faces into maximal rectangles cuts that by
  an order of magnitude without changing the shape.

### Skyline mode

The alternative mode fills the artwork downward from its upper contour. It
loses interior detail — the gap between a pair of legs closes up — but it is
guaranteed to be one connected mass with no posts. Useful when a silhouette is
too delicate to print.

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
swept extrusion scores exactly 1.00 by construction. The rounded field scores
5.83 and the turned field 4.31 on the same subject, which is the difference
between a shape with form and a shape without.

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
npm run shapes       # ASCII-render the silhouette library
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
  bitmap.ts       binary rasters, fitting, projection helpers
  qr.ts           QR module matrix, quiet zone included
  path.ts         SVG path parser and bezier flattener
  raster.ts       supersampled scanline polygon fill; image thresholding
  silhouettes.ts  the shape library and prompt matcher
  voxel.ts        the construction, plinth, welding, fidelity report
  mesh.ts         greedy quad meshing, base plate, posts
  stl.ts          binary STL and OBJ
  verify.ts       decodes the model's own top-down projection
  pipeline.ts     input -> design, with warnings and printing notes
src/components/   three.js viewer, exact projection canvas
```

The viewer's camera is orthographic, and that is not a style choice: the
illusion is defined for parallel projection. Under perspective the rays
diverge, modules near the edge of the code are seen past, and the QR smears.
