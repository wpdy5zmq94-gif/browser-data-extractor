# Browser Data Extractor

A Manifest V3 browser extension that extracts structured rows from a page you already have open. Site-specific logic lives in adapters. After a run, the rows are handed to a module registry and a CSV file is downloaded.

The extension does not sign you in. It uses whatever session the browser already has for that site.

The first included adapter exports an **AliExpress wishlist** to CSV.

This project is unofficial and is not affiliated with AliExpress.

## Install

1. Clone this repository: [https://github.com/wpdy5zmq94-gif/browser-data-extractor](https://github.com/wpdy5zmq94-gif/browser-data-extractor)
2. Open Chrome → Extensions → Developer mode → Load unpacked → select this extension folder (the folder that contains `manifest.json`).
3. Chrome 114 or newer is required so the content script can load as a module.
4. Reload the wishlist tab after loading the extension so the content script can attach.

No build step and no `npm install` are required to load the extension.

## Usage

1. Sign in to AliExpress yourself and open the wishlist. The page is usually `https://www.aliexpress.com/p/wish-manage/index.html` or `https://www.aliexpress.com/p/wishlist/index.html` (the German UI on `de.aliexpress.com` is the same adapter).
2. For the full list, open **Alle Artikel** / **All items**. For one list, open it under **Meine Listen** / **My lists**.
3. Open the extension popup.
4. Turn **Enabled** on. While the toggle is off, the content script returns immediately and does not read the page.
5. Click **Export CSV**.

The file is saved to the browser’s default Downloads folder. The name looks like `aliexpress-wishlist-2026-10-26.csv`.

## AliExpress wishlist adapter

Columns, in this order:

| Column | What it is |
| --- | --- |
| category | The open list name (for example a list under Meine Listen). On the full wishlist this is the active tab, such as Alle Artikel or All items. A category printed on the product card wins when the page shows one. |
| seller | Store link or store name on the card. |
| price | Current price as shown, including the currency symbol. A struck-through price is left out. |
| shipping | Shipping line as shown (Free shipping, Kostenloser Versand, a shipping fee, or empty when the card has none). |
| title | Product title. |
| url | Product URL. Extra column, useful for opening the item again. Same product id is kept once. |

The adapter recognizes the English and German wishlist UI: Wunschliste, Wishlist, Alle Artikel, All items, Meine Listen, My lists. It reads the DOM of the page you opened. It does not type credentials or walk through an AliExpress login.

Product cards are matched from stable class prefixes (`AllListItem--` and similar CSS-module names) and from `/item/<id>` links, because AliExpress changes the hashed part of those class names. If a future redesign moves the price or the store name, expect empty cells before the whole export fails.

### Delays and rate limits

Before every scroll, pagination click, or “open Alle Artikel / All items” click, the extractor waits a **new random delay**. The default range is **800–2500 ms**. That jitter is there to reduce the chance of tripping AliExpress rate limits. It is not a guarantee.

The delay is tunable:

- In the popup, edit the two millisecond fields. They are stored in `chrome.storage.local` as `delayMinMs` and `delayMaxMs` (each capped at 60000).
- The defaults live in `core/settings.js` (`DEFAULT_SETTINGS`).

Scroll size and the stop conditions are separate from the delay. They live on the adapter as `LIMITS` in `adapters/aliexpress-wishlist/constants.js`:

- `scrollFraction` (default `0.75`) and `minScrollPx` (default `240`) control how far one step moves. Each step stays around three quarters of the visible list so a lazy-loaded or virtualized list can mount the next rows instead of jumping to the bottom. If rows are missing, lower `scrollFraction` (for example to `0.5`) so steps overlap more.
- `maxStaleRounds` (default `3`) stops the run after that many advances in a row add nothing new.
- `maxSteps` (default `400`) is a hard cap. Raise it for a very long wishlist. The popup says when a run hits the cap.

Changing `LIMITS` or the defaults means reloading the unpacked extension.

## Adapters

`adapters/registry.js` is the adapter slot. The core loop in `core/extractor.js` does not know which site it is on. It asks the matched adapter for the current rows, then for one advance (`scroll`, `paginate`, `open-all-items`, or `done`), and waits the random delay between advances.

To add an adapter:

1. Create `adapters/<id>/adapter.js` exporting an object with:
   - `id`, `name`, `description`
   - `columns` — header order for the CSV
   - `limits` — optional `maxStaleRounds` and `maxSteps`
   - `matches(url)` — true when this adapter owns the URL
   - `pageStatus(document, url)` — `{ ok, code?, message? }`
   - `extractVisible(document)` — rows currently in the DOM
   - `rowKey(row)` — stable id used to skip duplicates
   - `planAdvance(document, ctx)` — `{ action: 'scroll' | 'paginate' | 'done' | ... }`
   - `performAdvance(document, plan)` — do that one request
   - `filename(date)` — download name
2. Import it in `adapters/registry.js` and append it to `adapters`. The first match wins.
3. Add the site origin to `host_permissions` and `content_scripts.matches` in `manifest.json`.
4. Reload the unpacked extension.

## Modules

After rows are collected, and before the CSV downloads, `modules/registry.js` calls every enabled module with:

```js
{
  adapterId,
  adapterName,
  columns,
  rows,       // copies; editing them does not change the file
  csv,        // the file contents, including a UTF-8 BOM
  pageUrl,
  extractedAt // ISO timestamp
}
```

Included modules:

- `modules/console-log.js` — prints the row count and the first rows in the page console.
- `modules/noop.js` — registered template that does nothing. Copy it when you want to send rows somewhere else.

To add a module:

1. Copy `modules/noop.js` to `modules/<id>.js`.
2. Export `{ id, name, description, enabled, async process(payload) }`.
3. Import it in `modules/registry.js` and append it to `modules`.
4. Reload the unpacked extension.

Set `enabled: false` to keep a module registered without running it. If `process` throws, the popup reports that module and the CSV still downloads. The included modules do not send data off the machine. A module you add can.

Cells that start with `=`, `+`, `-`, or `@` are prefixed with a single quote so a spreadsheet does not treat a product title as a formula.

## Project layout

```
manifest.json
background/service-worker.js   download
content/content.js             on/off gate, runs the core on the open page
popup/                         toggle, delay, export
core/extractor.js              adapter loop, dedupe, delay, stop conditions
core/csv.js                    CSV builder
core/settings.js               enabled flag and delay defaults
core/delay.js                  random wait
adapters/registry.js
adapters/aliexpress-wishlist/  first adapter
modules/registry.js
modules/console-log.js
modules/noop.js
icons/
```

## Development checks

Optional. Loading the extension unpacked does not use these.

```bash
npm install
npm test
```

## Disclaimer

This is an unofficial tool. It is not affiliated with, endorsed by, or connected to AliExpress or Alibaba. You are responsible for using it in line with the site’s terms and with the law where you live. Export data from your own signed-in session. Do not use the module slot to take data you are not allowed to have.
