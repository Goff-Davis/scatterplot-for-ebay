import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';

// Loads the real src/extract.js into a jsdom-backed vm context and returns its
// function-declaration globals. This keeps the shared-scope source pristine —
// no test-only exports are added to the shipped files, and the tests exercise
// the exact bytes that ship.
export function loadExtract() {
  const dom = new JSDOM('<!DOCTYPE html><body></body>');
  const { window } = dom;

  // Silence the intentional console.warn() calls for skipped/best-offer cards.
  const quietConsole = Object.create(console);
  quietConsole.warn = () => {};

  const sandbox = { window, document: window.document, console: quietConsole };
  vm.createContext(sandbox);
  const code = readFileSync(new URL('../../src/extract.js', import.meta.url), 'utf8');
  vm.runInContext(code, sandbox);

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
