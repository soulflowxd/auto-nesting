# ITKAN Nest

An FTC/FRC sheet nesting workspace. Upload one flat STEP/STP or DXF design per
file, assign SWYFT stock, enter quantities and sheet settings, then export a
DXF for each sheet. Inches are the default, with millimeter equivalents beside
every dimension. ABS grid is excluded.

## Run locally

Requires Node.js 22.12+ and Bun, matching the scouting project's workflow.

```powershell
bun install
bun run dev
```

Open the URL Vite prints (normally http://127.0.0.1:5173). Geometry import,
nesting, local project save/open and DXF export work without accounts, API keys
or a backend connection. Choose **Try a sample job** for two DXF designs, or
upload `public/samples/bearing-plate.step` to test a plate with a through-hole.
The first STEP import loads an approximately 23 MB CAD kernel; DXF imports do
not load it. Files are processed in browser workers and are not sent to Convex
unless you explicitly save a cloud project.

**Save job** downloads a `.nest.json` project that can be reopened and edited.
The active job is held in memory: save it before refreshing/closing the page.
Changing a part, quantity or sheet setting invalidates its material group's
layout. Run **Auto Nest** again before exporting that group.

## Materials

| Stock | Thickness, inches (mm) | Default sheet, inches (mm) |
| --- | --- | --- |
| 7075-T6 aluminum | 0.1181 (3), 0.2362 (6) | 27.5591 × 27.5591 (700 × 700) |
| Solid SRPP, black/white | 0.0689 (1.75) | 25.9843 × 29.0157 (660 × 737) |
| Solid SRPP, black/white | 0.1181 (3) | 24.0157 × 24.0157 (610 × 610) |
| Foam-core SRPP, black/white | 0.2362 (6) | 24.0157 × 24.0157 (610 × 610) |
| White Delrin / acetal | 0.1181 (3), nominal | 23.6220 × 23.6220 (600 × 600) |
| Polycarbonate | 0.1181 (3), 0.2362 (6) | 29.3307 × 29.3307 (745 × 745) |

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
- The reused contour raster nester tries multiple strategies and discrete
  rotations. It does not guarantee the mathematical optimum. Grid rounding can
  leave more space than requested; spacing is a minimum. Oversized parts are
  reported rather than silently dropped. Each sheet is geometrically checked
  for containment, intersections and clearance before export.
- Curves are tessellated: DXF arcs/circles at 2° steps, STEP circles at 90 samples
  per edge and other STEP curves at 128 samples. Chord error depends on curve
  size (a full 90-segment circle has about 0.061% radius chord deviation).
  Export uses those same sampled loops without further simplification, with
  coordinates to 0.000001″ (0.0000254 mm). Review large curved parts in CAM for
  your required precision. Display rounding never changes stock dimensions.
- Limits: 20 MB per input, 100 designs, 500 total copies, 20,000 points and 256
  loops per part. Computations may be cancelled; a three-minute timeout stops
  unusually expensive jobs.

## Convex backend

Uses React, TypeScript, Vite, Tailwind, Zustand, Lucide, Convex and Convex Auth
following [2026-scouting](https://github.com/soulflowxd/2026-scouting). Backend
source is in `convex/`. It is ready to connect but **no cloud deployment is
configured by this checkout**. The local workspace continues working without it.

1. In a terminal, run `bun run convex:dev`. Sign in and explicitly create/select
   a **new ITKAN Nest project**, rather than selecting your scouting deployment.
   Convex generates deployment bindings and writes `.env.local`.
2. In another terminal, run:

   ```powershell
   bunx @convex-dev/auth --web-server-url http://127.0.0.1:5173
   ```

   This configures `SITE_URL`, `JWT_PRIVATE_KEY` and `JWKS` on the new backend.
   Keep the existing password provider, schema and HTTP routes when prompted.
3. Set `VITE_CONVEX_URL` in `.env.local` to that deployment's public `.convex.cloud`
   URL. Restart `bun run dev`. Keep `bun run convex:dev` running during development.
4. Open **Cloud projects**, create an account or sign in, and save a snapshot.

Each cloud save creates a **new private snapshot**, stored as versioned project
JSON in Convex file storage. Database records store the owner and snapshot
metadata. Server-side authorization protects listing, opening and deleting;
another user cannot access your snapshots. No public storage URLs are returned.
Up to 50 snapshots per user, each up to 750 KB. Saved placement results are not
trusted or restored: reopening loads parts/settings and requires nesting again.
Original CAD files are not stored; the analyzed geometry is in the snapshot.
Use local project downloads for offline work or larger projects.

The scouting app's Convex Auth endpoint compatibility patch is retained as an
idempotent `postinstall` script. Secrets belong only in deployment environment
variables. No scouting credentials are included or reused.

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
Convex project authorization/storage. Backend tests use `convex-test` and need
no cloud deployment. `bun run samples` regenerates sample CAD files.

To inspect an exported DXF independently:

```powershell
bun scripts/verify-export.ts "C:\path\to\sheet.dxf"
```

The Vercel config builds the static Vite frontend. To deploy with cloud saving,
configure and deploy the separate Convex backend first, set `SITE_URL` to the
frontend origin, and set `VITE_CONVEX_URL` in Vercel before building. Live cloud
sign-in and persistence must be smoke-tested after connecting that deployment.

## Provenance

Geometry and nesting modules are adapted from
[INTERNAL_SOURCE](https://github.com/INTERNAL_SOURCE), commit
`6100cdc2a44bb573b672ae8c5ecd6535d0dc90f8`.
See `THIRD_PARTY_NOTICES.md` for upstream attribution and dependency licenses.
