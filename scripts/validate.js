#!/usr/bin/env node
/**
 * validate.js – Basic validation / tests for the generated pokemon.json.
 *
 * Usage:
 *   cd scripts && node validate.js
 *
 * Exit code 0 = all checks passed.
 * Exit code 1 = one or more checks failed.
 */

'use strict';

const path = require('path');
const fs   = require('fs');

const JSON_PATH = path.join(__dirname, '..', 'docs', 'data', 'pokemon.json');

// ── Load data ─────────────────────────────────────────────────────────────────

if (!fs.existsSync(JSON_PATH)) {
  console.error('FAIL: pokemon.json not found at', JSON_PATH);
  console.error('      Run `node preprocess.js` first.');
  process.exit(1);
}

let data;
try {
  data = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
} catch (e) {
  console.error('FAIL: pokemon.json is not valid JSON:', e.message);
  process.exit(1);
}

// ── Validation helpers ────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log('PASS: ' + message);
    passed++;
  } else {
    console.error('FAIL: ' + message);
    failed++;
  }
}

function assertAll(label, fn) {
  const failing = data.filter(function(p) { return !fn(p); });
  if (failing.length === 0) {
    console.log('PASS: ' + label);
    passed++;
  } else {
    const sample = failing.slice(0, 3).map(function(p) { return p.id; }).join(', ');
    console.error('FAIL: ' + label +
                  ' — ' + failing.length + ' record(s) fail, e.g.: ' + sample);
    failed++;
  }
}

// ── Checks ────────────────────────────────────────────────────────────────────

// 1. Array is non-empty
assert(Array.isArray(data) && data.length > 0, 'Data is a non-empty array');

// 2. Reasonable record count (pokemondb has 1000+ forms)
assert(data.length >= 1000, 'At least 1000 records (got ' + data.length + ')');

// 3. Required string fields present on every record
assertAll('Every record has a string id',
  function(p) { return typeof p.id === 'string' && p.id.length > 0; });

assertAll('Every record has a string name',
  function(p) { return typeof p.name === 'string' && p.name.length > 0; });

// 4. Required numeric fields are number or null
['national','gen','hp','attack','defense','spatk','spdef','speed','bst',
 'height','weight','egg_cycles'].forEach(function(field) {
  assertAll('Field "' + field + '" is number or null',
    function(p) { return p[field] === null || typeof p[field] === 'number'; });
});

// 5. BST = sum of base stats (where all stats are present)
assertAll('BST equals sum of base stats (where stats present)',
  function(p) {
    if (p.hp === null) return true; // skip incomplete
    const calc = (p.hp||0)+(p.attack||0)+(p.defense||0)+
                 (p.spatk||0)+(p.spdef||0)+(p.speed||0);
    return p.bst === calc;
  });

// 6. Types are lowercase strings or null
assertAll('type1 is non-empty lowercase string',
  function(p) { return typeof p.type1 === 'string' && p.type1 === p.type1.toLowerCase(); });
assertAll('type2 is lowercase string or null',
  function(p) {
    return p.type2 === null ||
           (typeof p.type2 === 'string' && p.type2 === p.type2.toLowerCase());
  });

// 7. is_form is boolean
assertAll('is_form is boolean',
  function(p) { return typeof p.is_form === 'boolean'; });

// 8. evolution_stage is 1, 2, 3, or null
assertAll('evolution_stage is 1|2|3|null',
  function(p) {
    return p.evolution_stage === null ||
           p.evolution_stage === 1 ||
           p.evolution_stage === 2 ||
           p.evolution_stage === 3;
  });

// 9. abilities is array or null
assertAll('abilities is array or null',
  function(p) { return p.abilities === null || Array.isArray(p.abilities); });

// 10. egg_groups is array or null
assertAll('egg_groups is array or null',
  function(p) { return p.egg_groups === null || Array.isArray(p.egg_groups); });

// 11. Spot-check well-known Pokémon
const bulbasaur = data.find(function(p) { return p.id === 'bulbasaur'; });
assert(bulbasaur !== undefined, 'Bulbasaur is present');
if (bulbasaur) {
  assert(bulbasaur.national === 1,          'Bulbasaur: national = 1');
  assert(bulbasaur.type1    === 'grass',    'Bulbasaur: type1 = grass');
  assert(bulbasaur.type2    === 'poison',   'Bulbasaur: type2 = poison');
  assert(bulbasaur.bst      === 318,        'Bulbasaur: BST = 318');
  assert(bulbasaur.gen      === 1,          'Bulbasaur: gen = 1');
  assert(bulbasaur.evolution_stage === 1,   'Bulbasaur: evolution_stage = 1');
  assert(bulbasaur.is_form  === false,      'Bulbasaur: is_form = false');
  assert(Array.isArray(bulbasaur.abilities), 'Bulbasaur: abilities is array');
  assert(Array.isArray(bulbasaur.egg_groups),'Bulbasaur: egg_groups is array');
  assert(bulbasaur.color === 'green',       'Bulbasaur: color = green');
}

const charizard = data.find(function(p) { return p.id === 'charizard'; });
assert(charizard !== undefined, 'Charizard is present');
if (charizard) {
  assert(charizard.national         === 6,       'Charizard: national = 6');
  assert(charizard.evolution_stage  === 3,       'Charizard: evolution_stage = 3');
  assert(charizard.bst              === 534,     'Charizard: BST = 534');
}

const venusaurMega = data.find(function(p) { return p.id === 'venusaur-mega'; });
assert(venusaurMega !== undefined,         'Mega Venusaur is present');
if (venusaurMega) {
  assert(venusaurMega.is_form === true,    'Mega Venusaur: is_form = true');
  assert(venusaurMega.formname === 'Mega Venusaur', 'Mega Venusaur: formname correct');
  assert(venusaurMega.national === 3,      'Mega Venusaur: national = 3 (shares base)');
}

// 12. No duplicate ids
const ids = data.map(function(p) { return p.id; });
const uniqueIds = new Set(ids);
assert(ids.length === uniqueIds.size, 'No duplicate ids');

// ── Summary ───────────────────────────────────────────────────────────────────

console.log('\n────────────────────────────────');
console.log('Results: ' + passed + ' passed, ' + failed + ' failed');
console.log('────────────────────────────────');

if (failed > 0) process.exit(1);
