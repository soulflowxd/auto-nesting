# Third-party notices

## INTERNAL_SOURCE

Source: https://github.com/INTERNAL_SOURCE
Reference revision: 6100cdc2a44bb573b672ae8c5ecd6535d0dc90f8

`src/lib/reference/` contains the geometry analysis, loop hierarchy, thickness
helpers, contour nesting, DXF writer and their tests adapted from this project
at the user's request. Original authorship remains with the upstream authors.
Changes include automatic geometry-derived free rotation with adaptive
continuous angular refinement, configurable nesting options, a browser WASM asset override,
explicit DXF entity colors and extra STEP regression tests. The application
export path preserves sampled contours without upstream simplification.

The original SRPP preview textures are copied without modification from the
same reference revision: `public/materials/srpp-decal.png` (black woven SRPP)
and `public/materials/srpp-white.jpg` (white woven SRPP). They are used for
swatches and preview fills only; DXF cut geometry and colors are unchanged.

No repository-wide LICENSE or NOTICE file was present at the inspected revision.
This attribution does not assert an open-source redistribution license for
that code. Confirm the author's permission before publishing/distributing a
derivative beyond the team's authorized use. This project does not apply a new
license to the upstream material.

## 2026-scouting

Source: https://github.com/soulflowxd/2026-scouting

The user requested this stack: React, TypeScript, Vite, Tailwind, Zustand,
Lucide, Convex and Convex Auth. The small Convex Auth endpoint compatibility
script follows that project's `scripts/patch-convex-auth.mjs`. Scouting-specific
business logic, credentials and deployment settings are not included.

## Dependencies

- RepliCAD: MIT, https://github.com/sgenoud/replicad
- replicad-opencascadejs: LGPL-2.1-only; includes OpenCascade bindings and
  WebAssembly kernel, https://github.com/sgenoud/replicad/tree/main/packages/replicad-opencascadejs
- Open CASCADE Technology: LGPL-2.1 with additional exception,
  https://dev.opencascade.org/resources/licensing
- dxf-parser: MIT, https://github.com/gdsestimating/dxf-parser
- React and Zustand: MIT; Convex: Apache-2.0; Convex Auth: Apache-2.0.
- Lucide: ISC; Geist font: SIL Open Font License 1.1.

Installed dependency packages contain their full licenses. The CAD WebAssembly
module remains a separate runtime-loaded asset; the package source/build
instructions are available at the upstream repositories above. Preserve the
applicable notices and source availability obligations in distributed builds.
