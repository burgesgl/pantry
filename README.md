# 🌿 The Pantry Witch

A personal pantry tracker + AI recipe generator. Runs entirely in the browser via GitHub Pages. No backend. Your pantry data lives in localStorage.

## What it does

- **Pantry tracker** — log what you have, filter by category, search
- **Perishable countdown** — set expiry days on anything fresh; get alerts when things are running out of time
- **AI recipe generation** — hit "Conjure a Recipe" and Claude generates something from your actual ingredients, prioritizing whatever's expiring
- **Recipe cards** — tagged by food genre, ideal weather, and situation (weeknight dinner, guest meal, etc.)
- **Library** — save recipes you like; filter by tag; search
- **Share** — send any recipe as a text or email directly from the card

## Setup

### 1. Fork this repo

Fork it to your own GitHub account.

### 2. Enable GitHub Pages

In your fork: **Settings → Pages → Source: Deploy from a branch → main → / (root) → Save**

Your app will be live at `https://yourusername.github.io/pantry-witch/` in a minute or two.

### 3. Add your Anthropic API key

The app calls the Claude API directly from the browser. You'll need an [Anthropic API key](https://console.anthropic.com/).

Open `app.js` and find this line near the top:

```js
const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
```

The app uses your browser's fetch to call the API. You'll need to store your key somewhere the app can use it. The simplest approach for a personal tool:

**Option A (quick and personal):** Hard-code your key in `app.js` — this is fine if the repo is private.

In `app.js`, find the fetch call in `generateRecipe()` and add the header:
```js
headers: {
  'Content-Type': 'application/json',
  'x-api-key': 'sk-ant-YOUR-KEY-HERE',
  'anthropic-version': '2023-06-01',
  'anthropic-dangerous-direct-browser-access': 'true',
},
```

**Option B (prompt on first use):** The app can prompt you once and store in localStorage. See `SETUP.md` for this approach.

> ⚠️ If your repo is public, don't commit your API key. Use a private repo or the prompt-on-first-use approach.

## File structure

```
pantry-witch/
├── index.html    — structure
├── style.css     — kitchen witch aesthetic (mustard, sage, linen)
├── app.js        — all logic + API calls
└── README.md
```

## Notes

- Pantry and library data persist in `localStorage` — clearing browser data will wipe it
- Recipe generation sends your ingredient list to Claude; nothing else is shared
- Works on mobile; share buttons open native SMS/email
- The "Conjure" button prioritizes ingredients expiring in 3 days or fewer

## Planned additions

- [ ] Export/import pantry as JSON
- [ ] Recipe card image export (screenshot-optimized view)
- [ ] Meal planning mode (pick a week's worth from your library)
- [ ] Shopping list generator from selected recipes
