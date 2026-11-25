# AksharSeva

Back office (desktop and browser) for AksharSevak. First module: **Sabha program and announcements**.

- Sabha kinds: weekly (Ravi Sabha), flexible (Para Sabha, Gyan Goshthi), event (Prarthna Sabha).
- Program run sheet with chained times; copy as WhatsApp text, CSV, print.
- Announcement deck builder: text, numbered list, table, poster; prasad donors typed live; live preview; PowerPoint export in the slide standard (long lists continue on the next slide).
- Slide standard (font, colours, logo, wording) set once under "Slide standard".
- Data is kept locally in the browser for now (`src/data/store.ts`), so a server and the SPCO people master can be added behind the same actions.

Run: `npm install`, `npm run dev`. Check: `npm test`, `npm run build`.
The Tauri desktop shell is not added yet.
