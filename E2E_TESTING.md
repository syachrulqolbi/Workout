# Browser tests

The browser suite follows the Next.js recommendation to test the optimized production app.

1. Run `npm run build`.
2. Run `npm run start -- --hostname 127.0.0.1` in one terminal.
3. Run `npm run test:e2e` in another terminal.

The suite uses the installed Google Chrome browser at desktop and mobile viewport sizes.
