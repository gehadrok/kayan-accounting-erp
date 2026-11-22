<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/19024da2-60cc-43ca-8308-9437d3717528

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Session secret (production)

Session tokens are HMAC-signed with `KAYAN_SESSION_SECRET` (minimum 16 characters),
read from the process environment (see [.env.example](.env.example)).

- **Production** (`NODE_ENV=production`): the secret is **mandatory** — the server
  refuses to start without it and never falls back to a throwaway value. Set a long
  random value and keep it out of Git; the value is never logged or printed.
- **Development**: if unset, an ephemeral per-process secret is used; sessions then
  end whenever the server restarts (the current default).
- **Rotating the secret invalidates every existing session token** — all users must
  log in again. Do not rotate casually.
