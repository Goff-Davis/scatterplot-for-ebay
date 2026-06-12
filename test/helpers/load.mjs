import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';

// Loads any combination of the real src/*.js files into ONE shared jsdom-backed
// vm context, mirroring how the extension actually loads them: all files share a
// single content-script scope, so top-level const/let in an earlier-loaded file
// are visible to later ones, and function declarations are reachable as globals.
// This keeps the shipped source pristine — no test-only exports are added, and the
// tests exercise the exact bytes that ship.
//
// Verified facts this relies on:
//  - Separate runInContext() calls on the same context share top-level const/let
//    (one global lexical environment), so constants.js then storage.js works.
//  - function declarations are exposed as properties on the sandbox object;
//    top-level const/let are NOT (but are reachable by the functions that close
//    over them).
//  - jsdom provides a working localStorage only when given a `url` — always pass one.
//  - jsdom's getComputedStyle reflects inline styles but not class-based rules, so
//    strikethrough tests must use an inline `text-decoration: line-through`.
export function loadModules(
  files,
  { url = 'https://www.ebay.com/sch/i.html', setup } = {},
) {
  const dom = new JSDOM('<!DOCTYPE html><body></body>', {
    url,
    pretendToBeVisual: true,
  });
  const { window } = dom;

  // Silence the intentional console.warn() calls for skipped/best-offer cards.
  const quietConsole = Object.create(console);
  quietConsole.warn = () => {};

  const sandbox = {
    window,
    document: window.document,
    localStorage: window.localStorage,
    console: quietConsole,
  };
  vm.createContext(sandbox);

  // Hook to inject window.Chart, pin innerWidth/innerHeight, etc. BEFORE the
  // source files run (so module-level reads see the configured values).
  if (setup) {
    setup(sandbox);
  }

  for (const f of files) {
    const code = readFileSync(new URL(`../../src/${f}`, import.meta.url), 'utf8');
    vm.runInContext(code, sandbox);
  }

  // Build a fresh <li> with the given inner HTML (synthetic cards).
  sandbox.card = (innerHTML) => {
    const li = window.document.createElement('li');
    li.innerHTML = innerHTML;
    return li;
  };

  // Parse a full card outerHTML string (fixtures) into its top element.
  sandbox.parse = (outerHTML) => {
    const tpl = window.document.createElement('template');
    tpl.innerHTML = outerHTML.trim();
    return tpl.content.firstElementChild;
  };

  return sandbox;
}

// Back-compat: the original extract-only loader, now expressed via loadModules so
// the existing test/extract.test.mjs keeps working unchanged.
export const loadExtract = () => loadModules(['extract.js']);
