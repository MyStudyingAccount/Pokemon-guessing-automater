/**
 * app.js – Pokémon Guess Helper
 *
 * OCR module hook: when an OCR module is added later it should call
 * `window.applyOcrFeedback(pokemonId, feedbackMap)` where feedbackMap is
 * { fieldKey: 'higher'|'lower'|'equal'|'match'|'no-match' }.
 */

'use strict';

// ── State ────────────────────────────────────────────────────────────────────

let ALL_POKEMON = [];         // loaded from pokemon.json
let candidates  = [];         // currently filtered subset
let constraints = [];         // [{pokemon, feedbackMap}, ...]
let guessedIds  = new Set();  // ids of already-guessed Pokémon
let pendingGuess = null;      // pokemon object being set up right now

// ── Field definitions ────────────────────────────────────────────────────────

const NUMERIC_FIELDS = [
  { key: 'height',     label: 'Height (m)' },
  { key: 'weight',     label: 'Weight (kg)' },
  { key: 'bst',        label: 'Base Stat Total' },
  { key: 'speed',      label: 'Speed' },
  { key: 'egg_cycles', label: 'Hatch Cycles' },
];

const CATEGORICAL_FIELDS = [
  { key: 'type1',           label: 'Type 1',       multi: false },
  { key: 'type2',           label: 'Type 2',       multi: false },
  { key: 'color',           label: 'Color',        multi: false },
  { key: 'body_shape',      label: 'Body Shape',   multi: false },
  { key: 'gender',          label: 'Gender Ratio', multi: false },
  { key: 'gen',             label: 'Generation',   multi: false },
  { key: 'evolution_stage', label: 'Evo Stage',    multi: false },
  { key: 'egg_groups',      label: 'Egg Groups',   multi: true  },
  { key: 'abilities',       label: 'Abilities',    multi: true  },
];

// ── Boot ─────────────────────────────────────────────────────────────────────

(async function init() {
  try {
    const resp = await fetch('data/pokemon.json');
    ALL_POKEMON = await resp.json();
    candidates  = ALL_POKEMON.slice();
    renderResults();
    bindUI();
  } catch (e) {
    document.querySelector('main').innerHTML =
      '<p style="color:red;padding:1rem">Failed to load pokemon.json: ' + e.message + '</p>';
  }
})();

// ── Binding ───────────────────────────────────────────────────────────────────

function bindUI() {
  const guessInput  = document.getElementById('guess-input');
  const applyBtn    = document.getElementById('apply-btn');
  const confirmBtn  = document.getElementById('confirm-btn');
  const cancelBtn   = document.getElementById('cancel-btn');
  const resetBtn    = document.getElementById('reset-btn');
  const toggleBtn   = document.getElementById('toggle-list-btn');
  const exclCb      = document.getElementById('exclude-guessed');
  const baseCb      = document.getElementById('base-only');

  applyBtn.addEventListener('click', handleApply);
  guessInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') handleApply();
  });

  confirmBtn.addEventListener('click', confirmFeedback);
  cancelBtn.addEventListener('click',  cancelFeedback);
  resetBtn.addEventListener('click',   resetAll);
  toggleBtn.addEventListener('click',  toggleCandidateList);
  exclCb.addEventListener('change',    refilter);
  baseCb.addEventListener('change',    refilter);
}

// ── Lookup ────────────────────────────────────────────────────────────────────

function findPokemon(query) {
  query = query.trim().toLowerCase();
  if (!query) return null;
  // Try national dex number
  const num = parseInt(query, 10);
  if (!isNaN(num)) {
    return ALL_POKEMON.find(function(p) { return p.national === num && !p.is_form; }) ||
           ALL_POKEMON.find(function(p) { return p.national === num; }) || null;
  }
  // Try exact id or name
  return ALL_POKEMON.find(function(p) { return p.id === query; }) ||
         ALL_POKEMON.find(function(p) { return p.name.toLowerCase() === query; }) ||
         ALL_POKEMON.find(function(p) { return p.id.startsWith(query) && !p.is_form; }) ||
         null;
}

// ── Apply / Feedback UI ───────────────────────────────────────────────────────

function handleApply() {
  const input = document.getElementById('guess-input');
  const errEl = document.getElementById('guess-error');
  const poke  = findPokemon(input.value);

  if (!poke) {
    errEl.textContent = 'Pokémon not found. Try a name or Pokédex number.';
    errEl.hidden = false;
    return;
  }
  errEl.hidden = true;
  input.value  = '';

  pendingGuess = poke;
  guessedIds.add(poke.id);
  showFeedbackPanel(poke);
}

function showFeedbackPanel(poke) {
  const section    = document.getElementById('feedback-section');
  const nameEl     = document.getElementById('feedback-pokemon-name');
  const fieldsDiv  = document.getElementById('feedback-fields');

  nameEl.textContent = displayName(poke);
  fieldsDiv.innerHTML = '';

  // Build one row per field
  NUMERIC_FIELDS.concat(CATEGORICAL_FIELDS).forEach(function(fd) {
    const rawVal = poke[fd.key];
    if (rawVal === null || rawVal === undefined) return; // skip missing

    const valStr = formatValue(fd.key, rawVal);
    const div    = document.createElement('div');
    div.className = 'fb-field';
    div.dataset.key = fd.key;

    const labelEl = document.createElement('div');
    labelEl.className = 'fb-field-label';
    labelEl.textContent = fd.label;

    const valEl = document.createElement('div');
    valEl.className = 'fb-field-value';
    valEl.innerHTML = valStr;

    const btnsDiv = document.createElement('div');
    btnsDiv.className = 'fb-buttons';

    const isNumeric = NUMERIC_FIELDS.some(function(f) { return f.key === fd.key; });
    const options   = isNumeric
      ? [['higher','↑ Higher'],['equal','= Equal'],['lower','↓ Lower'],['unknown','? Unknown']]
      : [['match','✓ Match'],['no-match','✗ No Match'],['unknown','? Unknown']];

    options.forEach(function(opt) {
      const btn = document.createElement('button');
      btn.className  = 'fb-btn';
      btn.dataset.fb = opt[0];
      btn.textContent = opt[1];
      if (opt[0] === 'unknown') btn.classList.add('active-unknown');
      btn.addEventListener('click', function() {
        btnsDiv.querySelectorAll('.fb-btn').forEach(function(b) {
          b.className = 'fb-btn';
        });
        btn.classList.add('active-' + opt[0]);
      });
      btnsDiv.appendChild(btn);
    });

    div.appendChild(labelEl);
    div.appendChild(valEl);
    div.appendChild(btnsDiv);
    fieldsDiv.appendChild(div);
  });

  section.hidden = false;
  section.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function confirmFeedback() {
  if (!pendingGuess) return;

  const feedbackMap = {};
  document.querySelectorAll('#feedback-fields .fb-field').forEach(function(row) {
    const key       = row.dataset.key;
    const activeBtn = row.querySelector('.fb-btn.active-higher, .fb-btn.active-lower, ' +
                                        '.fb-btn.active-equal, .fb-btn.active-match, ' +
                                        '.fb-btn.active-no-match');
    if (activeBtn) feedbackMap[key] = activeBtn.dataset.fb;
  });

  constraints.push({ pokemon: pendingGuess, feedbackMap: feedbackMap });
  pendingGuess = null;

  document.getElementById('feedback-section').hidden = true;
  refilter();
  renderConstraints();
}

function cancelFeedback() {
  pendingGuess = null;
  document.getElementById('feedback-section').hidden = true;
}

// ── Filtering ─────────────────────────────────────────────────────────────────

function refilter() {
  const excludeGuessed = document.getElementById('exclude-guessed').checked;
  const baseOnly       = document.getElementById('base-only').checked;

  candidates = ALL_POKEMON.filter(function(p) {
    if (excludeGuessed && guessedIds.has(p.id)) return false;
    if (baseOnly && p.is_form) return false;

    for (const c of constraints) {
      if (!matchesConstraint(p, c.pokemon, c.feedbackMap)) return false;
    }
    return true;
  });

  renderResults();
}

function matchesConstraint(candidate, guessedPoke, feedbackMap) {
  for (const [key, fb] of Object.entries(feedbackMap)) {
    const guessVal = guessedPoke[key];
    const candVal  = candidate[key];

    if (fb === 'higher') {
      if (candVal === null || candVal <= guessVal) return false;
    } else if (fb === 'lower') {
      if (candVal === null || candVal >= guessVal) return false;
    } else if (fb === 'equal') {
      if (candVal !== guessVal) return false;
    } else if (fb === 'match') {
      const fd = CATEGORICAL_FIELDS.find(function(f) { return f.key === key; });
      if (fd && fd.multi) {
        // At least one element must match
        const gArr = toArray(guessVal);
        const cArr = toArray(candVal);
        if (!gArr.some(function(v) { return cArr.includes(v); })) return false;
      } else {
        if (candVal !== guessVal) return false;
      }
    } else if (fb === 'no-match') {
      const fd = CATEGORICAL_FIELDS.find(function(f) { return f.key === key; });
      if (fd && fd.multi) {
        // No element from guess should appear in candidate
        const gArr = toArray(guessVal);
        const cArr = toArray(candVal);
        if (gArr.some(function(v) { return cArr.includes(v); })) return false;
      } else {
        if (candVal === guessVal) return false;
      }
    }
    // 'unknown' → no constraint applied
  }
  return true;
}

function toArray(val) {
  if (!val) return [];
  return Array.isArray(val) ? val : [val];
}

// ── Render ────────────────────────────────────────────────────────────────────

function renderResults() {
  document.getElementById('candidate-count').textContent = candidates.length;

  const listEl = document.getElementById('candidate-list');
  listEl.innerHTML = '';
  candidates.slice().sort(function(a, b) {
    return (a.national || 9999) - (b.national || 9999);
  }).forEach(function(p) {
    const chip = document.createElement('div');
    chip.className = 'candidate-chip';
    chip.innerHTML =
      '<span class="dex">#' + (p.national || '?') + ' </span>' +
      (p.formname ? p.name + ' <em>' + p.formname + '</em>' : p.name);
    listEl.appendChild(chip);
  });
}

function renderConstraints() {
  const section = document.getElementById('constraints-section');
  const list    = document.getElementById('constraints-list');
  list.innerHTML = '';

  if (constraints.length === 0) {
    section.hidden = true;
    return;
  }
  section.hidden = false;

  constraints.forEach(function(c, idx) {
    const card  = document.createElement('div');
    card.className = 'constraint-card';

    const title = document.createElement('div');
    title.className = 'c-title';
    title.textContent = (idx + 1) + '. ' + displayName(c.pokemon);
    card.appendChild(title);

    const table = document.createElement('table');
    table.className = 'constraint-table';

    const allFields = NUMERIC_FIELDS.concat(CATEGORICAL_FIELDS);
    for (const [key, fb] of Object.entries(c.feedbackMap)) {
      const fd = allFields.find(function(f) { return f.key === key; });
      if (!fd) continue;
      const val = c.pokemon[key];
      const tr  = document.createElement('tr');
      tr.innerHTML =
        '<td class="label">' + fd.label + '</td>' +
        '<td class="value">' + formatValue(key, val) + '</td>' +
        '<td class="fb-' + fb + '">' + fbLabel(fb) + '</td>';
      table.appendChild(tr);
    }
    card.appendChild(table);
    list.appendChild(card);
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function displayName(p) {
  return p.formname ? p.name + ' (' + p.formname + ')' : p.name;
}

function fbLabel(fb) {
  switch (fb) {
    case 'higher':   return '↑ Higher';
    case 'lower':    return '↓ Lower';
    case 'equal':    return '= Equal';
    case 'match':    return '✓ Match';
    case 'no-match': return '✗ No Match';
    default:         return '?';
  }
}

function formatValue(key, val) {
  if (val === null || val === undefined) return '<em style="color:#666">—</em>';
  if (key === 'type1' || key === 'type2') {
    return '<span class="type-badge t-' + val.toLowerCase() + '">' + val + '</span>';
  }
  if (key === 'abilities' || key === 'egg_groups') {
    return toArray(val).join(', ');
  }
  if (key === 'gen')             return 'Gen ' + val;
  if (key === 'evolution_stage') return 'Stage ' + val;
  if (key === 'height')          return val + ' m';
  if (key === 'weight')          return val + ' kg';
  return String(val);
}

function toggleCandidateList() {
  const list = document.getElementById('candidate-list');
  const btn  = document.getElementById('toggle-list-btn');
  if (list.hidden) {
    list.hidden = false;
    btn.textContent = 'Hide list ▲';
  } else {
    list.hidden = true;
    btn.textContent = 'Show list ▼';
  }
}

function resetAll() {
  constraints = [];
  guessedIds.clear();
  pendingGuess = null;
  candidates   = ALL_POKEMON.slice();

  document.getElementById('feedback-section').hidden    = true;
  document.getElementById('constraints-section').hidden = true;
  document.getElementById('guess-error').hidden         = true;
  document.getElementById('guess-input').value          = '';
  renderResults();
}

// ── OCR hook (placeholder for future module) ──────────────────────────────────
window.applyOcrFeedback = function(pokemonId, feedbackMap) {
  const poke = ALL_POKEMON.find(function(p) { return p.id === pokemonId; });
  if (!poke) { console.warn('applyOcrFeedback: unknown id', pokemonId); return; }
  guessedIds.add(pokemonId);
  constraints.push({ pokemon: poke, feedbackMap: feedbackMap });
  refilter();
  renderConstraints();
};
