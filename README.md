# Amy’s Quiet Space

A local, browser-based TikTok LIVE overlay for after-work, quiet-space vibes, built with React, TypeScript, Vite and the native browser WebSocket API. It connects directly to TikFinity at `ws://localhost:21213/` and works as a transparent overlay for TikTok LIVE Studio or OBS.

## What this app does

- Opens at `/overlay` as a clean transparent overlay for stream software
- Opens at `/test` for local simulation and debugging
- Connects directly to TikFinity over WebSocket without any backend or database
- Shows calm, elegant welcome cards for join, follow, gift, share, subscribe and first-comment events
- Supports a subtle ambient layer and mood voting from chat words
- Uses local storage for returning viewers and an in-memory session set for one-time greetings

## Download or clone

```bash
git clone <your-repo-url>
cd overlay
```

## Open in VS Code

Open the folder in VS Code and use the integrated terminal.

## Install dependencies

```bash
npm install
```

## Start the dev server

```bash
npm run dev
```

The app will be available locally at:

- http://localhost:5173/overlay
- http://localhost:5173/test

## Open the pages

- Overlay route: http://localhost:5173/overlay
- Test route: http://localhost:5173/test

## Start TikFinity

Make sure TikFinity is running locally and that it exposes the WebSocket endpoint:

```text
ws://localhost:21213/
```

If TikFinity is not running, the overlay will show a disconnected status and retry automatically.

## Confirm the WebSocket is connected

Open the test page and watch the header status pill. It should change to:

- `Events connected` when the connection is live

You can also use the test page buttons to simulate activity.

## Add to TikTok LIVE Studio

1. Open TikTok LIVE Studio.
2. Add a browser source or web source.
3. Set the URL to the local overlay route:
   - http://localhost:5173/overlay
4. Set the source size to 1080 × 1920.
5. Keep the browser source transparent and allow the background video to show through.

## Add to OBS

1. In OBS, add a Browser Source.
2. Enter the local URL:
   - http://localhost:5173/overlay
3. Set width to 1080 and height to 1920.
4. Enable transparency if your source supports it.
5. Place the source over your background scene.

## Why the Lovable HTTPS preview may fail

Hosted preview environments often run over HTTPS. Browsers block insecure `ws://localhost` WebSocket connections from HTTPS pages because of mixed-content rules. That is why this app is designed to run locally over HTTP with the local Vite dev server.

## Run locally over HTTP

Use the local Vite URL above rather than a hosted preview URL. The overlay is meant to run from:

- http://localhost:5173/overlay

## Edit the configuration

The main configuration lives in:

- src/config.ts

You can change:

- WebSocket URL
- Alert duration and transitions
- Ambient effect settings
- Prompt rotation timing
- Viewer storage limits

## Move the optional ambient layer

The ambient layer is positioned with the `ambientWindow` object in `src/config.ts`:

```ts
ambientWindow: {
  left: '50%',
  top: '12%',
  width: '44%',
  height: '42%'
}
```

Change those values to shift the ambient effect over the background scene without covering the face of the subject.
