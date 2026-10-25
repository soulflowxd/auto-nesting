# ITKAN Nest

An FTC/FRC sheet nesting workspace. Upload one flat STEP/STP or DXF design per
file, assign SWYFT stock, enter quantities and sheet settings, then export a
DXF for each sheet. Inches are the default, with millimeter equivalents beside
every dimension. ABS grid is excluded.
New sheets start with 1.5 mm part spacing and a 1.5 mm edge margin; both can be
edited in inches or millimeters.


## Run locally

Requires Node.js 22.12+ and Bun, matching the scouting project's workflow.

```powershell
bun install
bun run dev
```

Open the URL Vite prints (normally http://127.0.0.1:5173). Geometry import,
nesting, local project save/open and DXF export work without accounts, API keys
or a backend connection. Upload `public/samples/bearing-plate.step` to test a
plate with a through-hole.
The first STEP import loads an approximately 23 MB CAD kernel; DXF imports do
not load it. Files are processed in browser workers and stay on your device.
Normal use requires no account or backend storage.

**Save job** downloads one `.nest.json` project containing every part, material
group, and sheet in the current nest. **Export DXF** downloads only the sheet
currently shown; select each sheet in turn to export its DXF.
For a single STEP/STP part, use its **DXF** button on the import card or in the
parts queue to download its flat cut contours without nesting or choosing stock.
The part DXF uses inches, with blue outside contours and red holes; it contains
one part at the origin and no sheet outline or quantity copies.
Drag a project JSON anywhere onto the workspace, or use Open job.
Opening restores the layout immediately, with geometry and clearance checked.
Older projects without layouts still open and can be nested again. DXF downloads
use the project name (with a sheet suffix for multiple sheets).
The active job is held in memory: save it before refreshing/closing the page.
Changing a part, quantity or sheet setting invalidates its material group's
layout. Run **Auto Nest** again before exporting that group.

For partly used stock, first run **Auto Nest** to see the original sheet count.
Switch between sheets above the preview, choose **Mark used area**, and drag
rectangles over material already consumed on each sheet. Use **+ Sheet** to
mark another physical sheet. Select an added sheet and use **Remove sheet** to
take it back out. You can undo or clear marks on the selected sheet.
The original count stays visible while you edit and after re-nesting, alongside
the new count. The project JSON saves the per-sheet marks and original count;
older JSON with first-sheet marks still opens. Editing marks clears the old
layout, so run **Auto Nest** again before exporting. Used-area shading is a
preview guide, not an extra DXF cut path.

## Optional admin server nesting

The designated admin can sign in with Vercel and choose **Vercel server** from
the nesting computer menu. Everyone else uses **Local workspace**.
The server receives the already-extracted part contours and sheet settings for
one request, runs the same CPU nesting algorithm, and returns placements. It
does not receive STEP/DXF files or save projects. Server nesting can still be
slower than local nesting for large jobs because it adds network transfer and
Vercel function startup time. Vercel limits function request/response payloads
to 4.5 MB; the app caps server requests at 4 MB and leaves larger jobs local.

To enable admin sign-in on the deployed site, create a **Sign in with Vercel**
OAuth app in the Vercel dashboard with `openid` and `email` scopes and callback
`https://nesting.vercel.app/api/auth/callback`. Set its client ID as
`VERCEL_OAUTH_CLIENT_ID` and client secret as `VERCEL_OAUTH_CLIENT_SECRET` in
the Vercel project's environment variables. Set `ITKAN_ADMIN_EMAIL` there to
the authorized Vercel account address, then redeploy. These values must
never be committed. The server verifies Vercel's signed ID token and checks
the exact admin email on every nest request. Sign-in opens a new tab so an
unsaved job in the original tab remains intact; return to that tab afterward.

**Free rotation · automatic** lets the optimizer choose
arbitrary floating-point angles. It derives orientations from the actual part
geometry, searches for sheet-fit orientations, and adaptively refines angles
against the current sheet's collision and packing score. There is no angle or
increment to enter. The local refinement works down to approximately 0.000001°;
this is numerical search precision, not a manufacturing accuracy guarantee.
The workspace always uses free rotation, including when opening older projects.
Each imported part waits for an explicit material, thickness and color choice.

## Materials

| Stock | Thickness, inches (mm) | Default sheet, inches (mm) |
| --- | --- | --- |
| Solid SRPP, black | 0.0689 (1.75) | 25.9843 × 29.0157 (660 × 737) |
| Solid SRPP, black/white | 0.1181 (3) | 24.0157 × 24.0157 (610 × 610) |
| Foam-core SRPP, black/white | 0.2362 (6) | 24.0157 × 24.0157 (610 × 610) |
| White Delrin / acetal | 0.1181 (3), nominal | 23.6220 × 23.6220 (600 × 600) |

Aluminum is temporarily unavailable for new parts, and polycarbonate is no longer offered. Existing saved jobs using either preset remain readable.

These are stock presets, not live inventory. Sizes come from
[SWYFT's sheet material comparison](https://swyftrobotics.com/tools/materials),
checked October 21, 2026. The acetal name/color follows the team's requested
white Delrin stock; SWYFT calls it Acetal (POM) and lists both nominal 3 mm and
1/8 inch in different catalog pages. The preset uses the requested 3 mm. Check
your actual stock. Parts with different material, thickness or color stay on
separate sheets. Custom sheet dimensions support remnants.

## DXF output and geometry limits

- Inch coordinates and `$INSUNITS = 1`. Closed POLYLINE contours; separate
  layers **and explicit entity colors**: `CUT-OUTSIDE` blue (ACI 5), `CUT-HOLES`
  red (ACI 1). Sheet corners are gray POINT markers on `SHEET-DATUM`.
- Apply inward/outward kerf compensation in CAM. Exported geometry has **no
  kerf offset, lead-ins, tabs or toolpaths**. Plus/minus signs depend on CAM.
- Hole classification uses containment, independent of contour winding.
- STEP accepts one uniform prismatic solid with through-holes in any orientation.
  Bent sheet metal, assemblies, tapered parts and blind/multiple-depth features
  require preparing separate flat parts in CAD first.
- DXF supports lines, arcs, circles, polylines and non-rational splines forming
  closed planar contours. File units are honored; unitless DXFs use your import
  selection (inches by default). Explode unsupported blocks in CAD first.
- One connected part per file. Crossing, touching and disconnected contours or
  islands are rejected with an import error. Interior holes are retained, but
  other parts are not placed into them.
- The reused contour raster nester tries multiple placement strategies. Free
  rotation uses geometry-derived seeds and adaptive continuous angular
  refinement; constrained modes use their specified angles. It does not
  guarantee the mathematical optimum. Grid rounding can
  leave more space than requested; spacing is a minimum. Oversized parts are
  reported rather than silently dropped. Each sheet is geometrically checked
  for containment, intersections and clearance before export.
- Curves are tessellated: DXF arcs/circles at 2° steps, STEP circles at 90 samples
  per edge and other STEP curves at 128 samples. Chord error depends on curve
  size (a full 90-segment circle has about 0.061% radius chord deviation).
  If a STEP file exceeds the 20,000-point limit, its contours are simplified
  with a maximum additional deviation of 0.005″ (0.127 mm); the actual tolerance
  is reported with the imported part. Export uses the resulting sampled loops,
  with coordinates to 0.000001″ (0.0000254 mm). Review large curved parts in CAM for
  your required precision. Display rounding never changes stock dimensions.
- Limits: 20 MB per input, 100 designs, 500 total copies, 20,000 points and 256
  loops per part. Local computations can be cancelled and have no app-imposed
  time limit. Vercel server nesting remains subject to its function time limit.

## Local data

Jobs stay in browser memory. Save job downloads JSON to your device; Open job
restores it (up to 20 MB). Export DXF downloads the selected sheet. Save before
refreshing or closing the page. No account or backend is used.

## Verification

```powershell
bun run test
bun run typecheck
bun run lint
bun run build
bun run preview
```

Tests cover inherited STEP/DXF geometry, kerf layers/colors, unit conversions,
stock grouping, quantities, rotations, collisions/spacing, stale results and
local project round trips. `bun run samples` regenerates sample CAD files.

To inspect an exported DXF independently:

```powershell
bun scripts/verify-export.ts "C:\path\to\sheet.dxf"
```

The Vercel config builds a static Vite site. No backend configuration is needed.
`.env*` files are ignored by Git. Do not commit CAD jobs, credentials, or private
team files to this public repository.

See [Third-party notices](THIRD_PARTY_NOTICES.md) for dependency licenses.
