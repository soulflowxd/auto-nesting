# Automatic free rotation verification

The user clarified that the optimizer must choose unrestricted fractional
orientations automatically, including angles such as 3.84731° and 4.6153°.
Manual angle and increment fields were removed before this feature shipped.

- New jobs default to `free`; legacy fixed/quarter/fine settings remain valid.
- Convex snapshots and local project files accept and preserve the free rule.
- The engine derives seeds from convex-hull edges and continuous sheet-fit
  optimization, then refines orientations against live placement/collision
  scores to approximately 0.000001°. It does not round placement angles to an
  allowed increment. Positions remain on the existing raster grid.
- Rotated holes, exact clearance and sheet boundaries remain checked before
  DXF export. The preview displays selected angles to five decimal places;
  geometry retains full floating-point orientation internally.
- Avoided repeated identical strategy runs and unused cutout-mask generation
  when nesting into holes is disabled, reducing free-rotation work.

Verification completed:

- `bun run test`: 99 passing tests in 12 files. Seven free-rotation tests cover
  legacy presets, automatic fractional-angle discovery, continuous local
  refinement, rotated DXF holes/dimensions, clearance for multiple copies,
  persistence and result invalidation.
- `bun run typecheck`, `bun run lint`, `bun run build`: passed.
- Production browser at http://127.0.0.1:4173: a tilted 8 × 0.5 inch bar cannot
  fit a 9 × 0.9 inch remnant with quarter-turn rules; automatic free rotation
  selected 3.84731° and enabled export. No angle/increment inputs are present.
- Screenshot: `docs/screenshots/free-rotation.png`.
- Refreshed and restored the current nine-part job, selected free rotation,
  and confirmed it completed with no export-blocking errors or browser errors.

The user-provided Lapas site was reviewed as workflow inspiration. No Lapas
code or nesting-performance claims are used in this implementation.
