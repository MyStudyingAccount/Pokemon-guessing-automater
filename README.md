# Pokémon Guess Helper

A fully-static, mobile-first web app that helps you narrow down possible Pokémon in a guessing game by entering feedback constraints. No backend required.

## Live Demo

Once deployed to GitHub Pages the app is available at:
`https://<your-username>.github.io/Pokemon-guessing-automater/`

---

## How to use

1. Open the app on your phone or desktop.
2. **Enter your guess** – type a Pokémon name (e.g. `Charizard`) or its national Pokédex number (e.g. `6`) and press **Apply**.
3. **Set feedback** – for every field the game revealed, choose the result:
   - Numeric fields *(height, weight, BST, speed, hatch cycles)*: **↑ Higher** / **= Equal** / **↓ Lower**
   - Categorical fields *(types, abilities, egg groups, etc.)*: **✓ Match** / **✗ No Match**
   - Leave fields as **? Unknown** if the game gave no information.
4. Press **Confirm feedback** – the candidate list updates instantly.
5. Repeat for each guess until only one Pokémon remains.
6. Use **↺ Reset all** to start a new game.

**Options**
- *Exclude already-guessed Pokémon* – hides Pokémon you have already submitted.
- *Base forms only* – excludes Mega evolutions, regional forms, etc.

---

## Project structure

```
docs/               GitHub Pages site root
├── index.html      Main page
├── style.css       Mobile-first styles
├── app.js          Client-side filtering logic
└── data/
    └── pokemon.json  Pre-generated Pokémon dataset (~600 KB)

scripts/
├── preprocess.js   Build-time data pipeline (Node.js)
├── validate.js     Validation / tests for the generated JSON
└── package.json    Node dependencies (js-yaml)
```

---

## Running the preprocessing script

The preprocessing script downloads Pokémon data from two open sources and
produces `docs/data/pokemon.json`.

**Data sources used**
| Source | What it provides |
|---|---|
| [pokemondb/database](https://github.com/pokemondb/database) | `pokemon.yaml`, `pokemon-forms.yaml`, `abilities.yaml`, `egg-groups.yaml` — types, stats, height, weight, gender ratio, hatch cycles, EV yield, generation, form info, ability and egg-group display names |
| [PokeAPI/pokeapi](https://github.com/PokeAPI/pokeapi) CSV files | Per-Pokémon ability mapping, egg group membership, body shape, Pokédex color, evolution stage |

**Prerequisites:** Node.js 16+ and npm.

```bash
# Install dependencies (only needs to be done once)
cd scripts
npm install

# Fetch data and regenerate docs/data/pokemon.json
node preprocess.js

# Validate the output (all checks should pass)
node validate.js
```

The script fetches all data over HTTPS from GitHub's raw content CDN – no
local copies of the upstream repositories are needed.

---

## Serving the site locally

Any static HTTP server works. For example:

```bash
# Python 3
cd docs && python3 -m http.server 8080
# then open http://localhost:8080

# Node (npx)
npx serve docs
```

> **Important:** the app uses `fetch('data/pokemon.json')`, which requires an
> HTTP server. Opening `index.html` directly as a `file://` URL will not work
> in most browsers due to CORS restrictions.

---

## Adding an OCR module (future work)

The app exposes a JavaScript hook for a future OCR integration:

```js
// Call this from an OCR module with the guessed Pokémon's slug
// and the feedback map the OCR module extracted.
window.applyOcrFeedback('bulbasaur', {
  height:     'lower',
  bst:        'higher',
  type1:      'match',
  egg_groups: 'no-match',
});
```

Valid feedback values: `'higher'`, `'lower'`, `'equal'`, `'match'`, `'no-match'`.

---

## Pokémon data fields

Each record in `pokemon.json` contains:

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique form slug (e.g. `charizard-mega-x`) |
| `pokemonid` | string | Base species slug |
| `national` | number | National Pokédex number |
| `name` | string | Display name |
| `formname` | string\|null | Form name (null for base form) |
| `gen` | number | Generation introduced |
| `is_form` | boolean | `true` for non-base forms |
| `type1` / `type2` | string\|null | Types (lowercase) |
| `hp`…`speed` / `bst` | number | Base stats and total |
| `height` | number | Height in metres |
| `weight` | number | Weight in kg |
| `gender` | string | Gender ratio bucket |
| `egg_cycles` | number | Hatch cycles |
| `ev_yield` | string\|null | EV yield summary |
| `abilities` | string[]\|null | Non-hidden abilities |
| `hidden_ability` | string\|null | Hidden ability |
| `egg_groups` | string[]\|null | Egg groups |
| `body_shape` | string\|null | Body shape identifier |
| `color` | string\|null | Pokédex color |
| `evolution_stage` | 1\|2\|3\|null | Stage in evolution line |
| `is_baby` | boolean | Baby Pokémon flag |
| `is_legendary` | boolean | Legendary flag |
| `is_mythical` | boolean | Mythical flag |
