#!/usr/bin/env node
// Trims one listing card out of a saved eBay search page into a self-contained
// test fixture:
//
//   node scripts/extract-fixture.mjs "<saved page>.htm" <listing-id> test/fixtures/<name>.html
//
// The page is parsed by jsdom WITHOUT running its scripts. The card is the <li>
// holding the listing id. Images, styles, comments and tracking attributes are
// dropped and hrefs lose their query strings. Struck prices get an inline
// line-through: the live page strikes them with a CSS class, which jsdom does not
// apply, so isStruck() would never see it.
import { readFileSync, writeFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const [page, id, out] = process.argv.slice(2);

if (!page || !/^\d+$/.test(id || '') || !out) {
  console.error(
    'usage: node scripts/extract-fixture.mjs <saved-page.htm> <listing-id> <out.html>',
  );
  process.exit(1);
}

const { window } = new JSDOM(readFileSync(page, 'utf8'));
const { document } = window;

// A saved page can hold the same id twice (jsdom parses <noscript> fallbacks as
// real nodes), so prefer the copy inside the results list.
const list = document.querySelector('ul.srp-results, ul.su-grid');
const matches = [...document.querySelectorAll(`[data-listingid="${id}"]`)];
const hit = matches.find((el) => list && list.contains(el)) || matches[0];

if (!hit) {
  console.error(`no element with data-listingid="${id}" in ${page}`);
  process.exit(1);
}

const card = (hit.closest('li') || hit).cloneNode(true);

card
  .querySelectorAll('img, svg, picture, source, script, style, noscript, link')
  .forEach((n) => n.remove());

const walker = document.createTreeWalker(card, window.NodeFilter.SHOW_COMMENT);
const comments = [];

while (walker.nextNode()) {
  comments.push(walker.currentNode);
}

comments.forEach((c) => c.remove());

const TRACKING =
  /^(data-viewport|data-view|data-interactions|data-hscroll|_sp|tabindex|data-carousel-tabindex|data-s-.*)$/;

for (const el of [card, ...card.querySelectorAll('*')]) {
  for (const { name, value } of [...el.attributes]) {
    // hrefs first: the long tracking query strings would trip the length cap.
    if (name === 'href') {
      el.setAttribute('href', value.replace(/[?#].*$/, ''));
    } else if (TRACKING.test(name) || value.length > 200) {
      el.removeAttribute(name);
    } else if (name === 'style' && value.includes('url(')) {
      el.removeAttribute(name);
    }
  }

  if (el.classList.contains('strikethrough')) {
    el.setAttribute('style', 'text-decoration: line-through');
  }
}

writeFileSync(out, card.outerHTML + '\n');
console.log(`wrote ${out} (${card.outerHTML.length} bytes, listing ${id})`);
