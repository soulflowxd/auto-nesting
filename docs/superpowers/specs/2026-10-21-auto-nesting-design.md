# Team Nest: STEP/DXF sheet nesting

## Agreed outcome

A local web app for an FTC/FRC team. Import flat parts, assign material,
thickness and quantity, arrange compatible parts on stock sheets, preview the
result, and download one DXF per sheet. The user approved this flow and asked
for material and thickness selection during import.

## User flow

1. Drop or browse for one or more `.dxf`, `.step` or `.stp` files.
2. In the import panel choose material, thickness and units for unitless DXFs.
   These values apply to the batch; every imported part can be edited afterward.
3. Review each part's outline, dimensions, quantity, material and thickness.
   Show import errors beside the affected file and retain successful imports.
4. For each material/thickness group, set sheet width and height, part spacing,
   edge margin and allowed rotation. Offer common sheet sizes plus custom sizes.
5. Run Auto Nest, inspect the sheet previews, and see utilization and any parts
   that do not fit. Multiple sheets are created when needed.
6. Export each sheet as a DXF named with its material, thickness and sheet number.

## Materials and thickness

Offer editable presets for 6061 aluminum, 5052 aluminum, polycarbonate, plywood,
MDF and a custom material. Thickness accepts positive numeric values in inches
or millimeters, with convenient presets such as 1/16, 1/8, 3/16 and 1/4 inch.
Presets describe stock; they do not assert that a material suits a machine.

Store thickness in a canonical millimeter representation and group using a
normalized key so unit conversion noise does not split equivalent selections.
Material identity and thickness together define a nesting group. Different
groups never share a sheet. Sheet settings belong to each group.

Material is user supplied. DXF does not supply a reliable stock thickness.
For STEP, display measured thickness and use it as the initial selection unless
the user has explicitly selected a batch thickness. If selected and measured
thickness differ, show both with a visible mismatch message; never silently
change the flat profile or scale it to match stock thickness.

Changing parts, quantities, material/thickness or sheet settings invalidates the
affected result. Export remains unavailable until that group is nested again.

## Architecture and reuse

Use a small TypeScript React web client and local Node server, with a single
documented development command. Geometry import runs on the local server;
nesting runs in a worker so computation does not freeze the interface.
The first version keeps the active job in browser memory.

Adapt the geometry analysis, contour nesting and DXF writing modules from
INTERNAL_SOURCE, inspected at commit
`6100cdc2a44bb573b672ae8c5ecd6535d0dc90f8`. Preserve provenance in a third-party
notice and inspect applicable repository notices before bringing code across.
Keep imported core modules separate from the team-specific app workflow.

The reference project uses dxf-parser for DXF and RepliCAD/OpenCascade WASM for
STEP. Reuse its geometry types, unit conversions and error handling. The team
app requires only import, grouping, nesting, preview and export; the reference
project's quoting, ordering, authentication and payment subsystems are outside
the agreed scope.

Components have separate responsibilities:

- Import service: validate file size/type, parse geometry, return normalized
  contours, dimensions, source units and STEP thickness when available.
- Job state: manage parts, quantities, assignments, group settings and result
  invalidation.
- Nesting worker: place parts within sheet margins using allowed rotations and
  configured spacing; return sheets and explicit unplaced quantities.
- Preview: render the same transformed loops that will be exported, with sheet
  selection, part identification and fit/utilization information.
- Export: validate placements and generate DXF in sheet coordinates with units,
  closed outer contours, holes and separate datum information.

## Geometry contract

STEP accepts single, flat, uniform-thickness prismatic solids, including holes.
Arbitrarily oriented flat solids are projected into their flat plane. Bent
sheet metal, assemblies and varying-depth solids produce actionable errors.
Sheet metal unfolding is outside this first version.

DXF supports closed outlines assembled from the reference parser's supported
lines, arcs, circles, polylines and non-rational splines. Honor declared units;
ask for inches or millimeters when units are missing. Preserve internal cutouts.
Report open contours and unsupported geometry rather than exporting incomplete
parts. One imported file represents one part design; quantities repeat it.

Use the reference core's inches internally and explicit conversion at UI
boundaries. Export DXF with declared units matching its coordinates. Curve
flattening tolerance must be documented and consistent between preview/export.

The reference nester uses contour rasterization with discrete rotations; it is
a heuristic and does not promise a globally optimal arrangement. Preserve
conservative footprints and prohibit nesting inside another part's holes.
Validate actual output for finite coordinates, sheet containment, overlap and
configured clearance. A failed validation blocks the affected sheet's export
and explains the problem. Reject nonpositive dimensions, invalid quantities,
and parts larger than the usable stock in every allowed orientation.

DXF export contains placed part contours and holes. Sheet datum information
lives on a separate layer using non-cutting point markers, following the
reference exporter. Part spacing is not cutter compensation; machine toolpaths
and kerf offsets remain settings in the team's cutting software.

## Interface

A focused workspace with the import/parts panel on the left, a large sheet
preview in the center, and material-group/sheet controls alongside it. The
empty state clearly starts with file upload. Primary actions are Import,
Auto Nest and Export DXF. Use visible numeric units, clear processing/error
states, accessible labels and keyboard-operable controls. Adapt panels to
narrow screens without hiding required inputs.

## Verification and acceptance

- Import DXF outlines with holes and verify dimensions in inches and millimeters.
- Import valid flat STEP fixtures, preserve holes and measured thickness, and
  reject bent/multi-solid or non-prismatic fixtures with clear errors.
- Verify mixed materials and thicknesses produce separate groups and sheets.
- Verify quantity, allowed rotation, edge margins, spacing, overflow to multiple
  sheets and explicit reporting for oversized parts.
- Check that changed import assignments/settings invalidate stale results.
- Reparse exported DXFs to verify units, transformed bounds, holes and complete
  quantities; validate collision/clearance and sheet containment.
- Run TypeScript checks, core tests and a production build, then exercise the
  complete upload, material assignment, nesting and download flow in a browser.

Deliver the working local app, sample geometry, setup/run instructions,
provenance and documented format/algorithm limitations.
