# Third-party notices

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
