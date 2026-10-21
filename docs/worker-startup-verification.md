# Worker startup fix

The reported generic worker startup failure did not reproduce in the current tab.
The existing nine-part job nested successfully, and fresh production imports of
both bearing-plate.step and gusset.dxf succeeded without browser console errors.

The build previously emptied dist, invalidating hashed worker and dynamically
imported STEP assets referenced by open tabs. Builds now retain previous assets.
This addresses that failure path; the screenshot alone does not establish that
it was the only cause of the reported incident. Hosts must retain older assets
when deploying updates as well. Local dist can grow across builds.

Worker errors now distinguish CAD from nesting and advise saving before reload.
Two regression tests cover otherwise message-less worker failures. All 101 tests,
TypeScript checking, production build, and lint passed. The previous main bundle
remained in dist after rebuilding. The current job was saved before refreshing
the tab and restored afterward.
