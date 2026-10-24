# ITKAN Nest agent guide

- This is a local-first React, TypeScript, and Vite app for FTC/FRC sheet nesting. Use Bun for package scripts.
- Keep STEP/DXF import, project JSON, DXF export, and default nesting in the browser. The verified admin may opt into Vercel server nesting of extracted contours only. Do not add backend storage or upload raw CAD files.
- Keep inches as the default display unit and show millimeters alongside. Placement spacing and edge margin also support an in/mm switch; new sheets default both to 1.5 mm.
- Preserve arbitrary free rotation, one material/thickness/color per sheet, multi-sheet navigation, and project JSON layouts. DXF export is for the selected sheet and uses blue outside contours and red holes.
- Offer SRPP and white 3 mm Delrin for new parts. Aluminum is temporarily hidden and polycarbonate is no longer offered; retain legacy presets so saved jobs using them still open.
- Do not commit `.env*`, `.vercel`, credentials, user CAD files, or generated `dist/` output. The repository is public.
- Before pushing or deploying code changes, run `bun run build`, `bun run lint`, and `bun run test`. Preserve existing project data compatibility when changing job or stock formats.
- See `README.md` for the current workflow, material sizes, geometry limits, and export behavior.
