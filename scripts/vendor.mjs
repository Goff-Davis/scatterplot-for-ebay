#!/usr/bin/env node
// Copies the Chart.js files the extension ships into vendor/, so the packaged
// XPI never references node_modules. Runs automatically on `npm install`
// (postinstall) and before `web-ext build`. Keep the list minimal — only what
// the extension actually loads, plus the library's license for MIT compliance.
import { mkdirSync, copyFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { buildSync } from 'esbuild';

const files = [
  [
    'node_modules/chart.js/dist/chart.umd.min.js',
    'vendor/chart.js/chart.umd.min.js',
  ],
  ['node_modules/chart.js/LICENSE.md', 'vendor/chart.js/LICENSE.md'],
];

for (const [src, dest] of files) {
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
  console.log(`vendored ${src} -> ${dest}`);
}

buildSync({
  entryPoints: ['node_modules/easy-currencies/dist/index.js'],
  bundle: true,
  platform: 'browser',
  format: 'iife',
  globalName: 'EasyCurrencies',
  outfile: 'vendor/easy-currencies/easy-currencies.iife.js',
  minify: false,
});

console.log(
  'bundled easy-currencies -> vendor/easy-currencies/easy-currencies.iife.js',
);
