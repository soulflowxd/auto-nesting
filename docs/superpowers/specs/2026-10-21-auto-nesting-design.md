# Team Nest: STEP/DXF sheet nesting

## Agreed outcome

A local web app for an FTC/FRC team. Import flat parts, assign material,
thickness and quantity, arrange compatible parts on stock sheets, preview the
result, and download one DXF per sheet. The user approved this flow and asked
for material and thickness selection during import, then narrowed the stock
presets to SWYFT Robotics sheet materials.
The user also requested inches as the default everywhere, with millimeter
equivalents visible alongside every physical dimension.

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

## Display and input units

Inches are the default for every dimension input, primary label, sheet preset,
part size, thickness selector, spacing, edge margin, preview dimension, result
summary and export. Always show the corresponding millimeter value alongside
the inch value, including before any files are imported. For example, label
3 mm stock as `0.1181 in (3 mm)` and 6 mm stock as `0.2362 in (6 mm)`.
Include units in filename thickness labels as well.

Default editable dimensions to inches, with a visible millimeter equivalent
that updates on edit. An explicit inch/mm input-unit switch may be provided,
but changing input units must preserve the physical value and keep both units
visible. A unitless DXF defaults to inches in the import panel, with an explicit
millimeter option; unit-bearing DXFs and STEP retain their source scale.

Store exact catalog thicknesses and stock sizes, and convert using exactly
25.4 mm per inch. Display rounding must never overwrite stock values, split
nesting groups or change exported geometry. Use sufficient decimal places for
small clearances. Export DXF with inch coordinates and declared inch units by
default. Material presets remain based on the vendor's exact metric dimensions.

## Materials and thickness

Use the following fixed stock combinations in the import selector, based on
the user's requested materials and SWYFT's sheet-material catalog checked on
2026-10-21. Thickness options depend on the selected material.

The following table records canonical vendor dimensions in millimeters; the
app displays inches first with these metric values alongside them.

| Material | Thickness (mm) | Default sheet size (mm) |
| --- | --- | --- |
| 7075-T6 aluminum | 3 mm, 6 mm | 700 x 700 |
| SWYFT SRPP, solid | 1.75 mm | 660 x 737 |
| SWYFT SRPP, solid | 3 mm | 610 x 610 |
| SWYFT SRPP, foam core | 6 mm | 610 x 610 |
| White Delrin / acetal (POM), user-requested stock | 3 mm | 600 x 600 |
| Polycarbonate | 3 mm, 6 mm | 745 x 745 |

Sources:
- https://swyftrobotics.com/tools/materials
- https://swyftrobotics.com/machines/swyft-composite
- https://swyftrobotics.com/machines/acetal-sheets

The acetal catalog uses the name Acetal (POM); white color and Delrin branding
are the user's requested stock description, not independently verified vendor
claims. The comparison table calls this stock 3 mm while SWYFT's sheet kit
calls it 1/8 inch. Keep the user's requested 3 mm preset, label it nominal, and
allow the measured stock thickness to be recorded explicitly without treating
3 mm and 3.175 mm as equivalent.

Offer black/white SRPP color selection as listed by SWYFT; color is part of the
stock identity, so different colors never share a sheet. Default SRPP to black
and acetal to white. The SRPP foam-core construction has its own material ID,
distinct from solid SRPP. Preserve the fixed catalog combinations instead of
offering generic aluminum, plywood or MDF presets. ABS grid is excluded at
the user's request. User-entered dimensions
allow nesting onto smaller stock and remnants. Presets describe stock; they
do not assert that a material suits a machine. Catalog data ships with the app
and does not require a live connection or promise current vendor availability.

Store thickness in a canonical millimeter representation and group using a
normalized key so unit conversion noise does not split equivalent selections.
Material identity, color and thickness together define a nesting group. Different
groups never share a sheet. Sheet settings belong to each group.

Material is user supplied. DXF does not supply a reliable stock thickness.
For STEP, display measured thickness and use it as the initial selection when
it matches a supported stock thickness and no batch thickness was selected.
Otherwise require a stock selection and display the measured STEP thickness.
If selected and measured
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
boundaries. Export DXF in inches by default with declared units matching its
coordinates. Curve
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
Auto Nest and Export DXF. Show inches first and millimeter equivalents for
every physical dimension. Use clear processing/error
states, accessible labels and keyboard-operable controls. Adapt panels to
narrow screens without hiding required inputs.

## Verification and acceptance

- Import DXF outlines with holes and verify dimensions in inches and millimeters.
- Verify inches are the initial input/display/export units, millimeter values
  remain visible, and unit changes/display rounding preserve exact geometry
  and stock grouping. Verify metric input files are not interpreted as inches.
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
