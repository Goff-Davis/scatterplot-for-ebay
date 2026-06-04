# Submitting to Firefox Add-ons (AMO)

## Prerequisites

- An account at https://addons.mozilla.org
- AMO API credentials: https://addons.mozilla.org/developers/addon/api/key/
  - Set `WEB_EXT_API_KEY` and `WEB_EXT_API_SECRET` in your environment before running `npm run sign`

## Build workflow

```bash
npm install        # installs web-ext and vendors Chart.js into vendor/
npm run lint       # must pass with 0 errors before submitting
npm run build      # produces web-ext-artifacts/ebay_scatterplot-1.0.0.zip
npm run sign       # submits to AMO as a listed add-on (requires API keys above)
```

To update Chart.js independently of other deps:

```bash
npm update chart.js
npm run vendor
```

## What to write in the AMO source code submission

AMO requires a source code upload for any minified or generated files. Upload a zip of this repository (excluding `node_modules/` and `vendor/`) and include the following in the reviewer notes:

> The only third-party dependency is Chart.js, vendored from its official npm release.
>
> To reproduce `vendor/chart.js/chart.umd.min.js`:
> 1. Install Node.js (any current LTS)
> 2. Run `npm ci`
> 3. Run `npm run vendor`
>
> This copies `node_modules/chart.js/dist/chart.umd.min.js` (Chart.js v4.5.1,
> unmodified) into `vendor/`. The version is pinned in `package-lock.json`.
> No bundler or build step is applied to the extension's own source files.

## Versioning

Bump `"version"` in both `manifest.json` and `package.json` before each release. AMO requires the version to be higher than the previously submitted one.
