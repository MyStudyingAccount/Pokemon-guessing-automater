#!/usr/bin/env node
/**
 * preprocess.js
 *
 * Fetches Pokémon data from:
 *   1. pokemondb/database GitHub repo YAML files:
 *        pokemon.yaml        – national dex number, name, generation
 *        pokemon-forms.yaml  – types, stats, height, weight, gender ratio,
 *                              egg cycles, EV yield, gen, form info
 *        abilities.yaml      – ability display names and generation introduced
 *        egg-groups.yaml     – egg group display names
 *   2. PokeAPI/pokeapi CSV files on GitHub for per-Pokémon mappings not
 *      present in the YAML source:
 *        pokemon_species.csv     – body shape, color, is_baby/legendary/mythical,
 *                                  evolution chain
 *        pokemon_egg_groups.csv  – which egg groups each species belongs to
 *        pokemon.csv             – default form mapping (species → pokemon_id)
 *        pokemon_abilities.csv   – which abilities each Pokémon has
 *
 * Outputs a single compact JSON file at ../docs/data/pokemon.json.
 *
 * Usage:
 *   cd scripts && npm install && node preprocess.js
 */

'use strict';

const https = require('https');
const path  = require('path');
const fs    = require('fs');
const yaml  = require('js-yaml');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const POKEMONDB_BASE =
  'https://raw.githubusercontent.com/pokemondb/database/' +
  'e7bea6b12d745c4b2696e43c343f86bfdc405334/data';

const POKEAPI_CSV_BASE =
  'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv';

const OUT_PATH = path.join(__dirname, '..', 'docs', 'data', 'pokemon.json');

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------

function fetchText(url) {
  return new Promise(function(resolve, reject) {
    https.get(url, function(res) {
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error('HTTP ' + res.statusCode + ' for ' + url));
      }
      let data = '';
      res.on('data', function(chunk) { data += chunk; });
      res.on('end',  function()      { resolve(data);  });
    }).on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// CSV parser (handles quoted fields)
// ---------------------------------------------------------------------------

function parseCsv(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',');
  return lines.slice(1).map(function(line) {
    const fields = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if      (c === '"')           { inQ = !inQ; }
      else if (c === ',' && !inQ)   { fields.push(cur); cur = ''; }
      else                          { cur += c; }
    }
    fields.push(cur);
    const obj = {};
    headers.forEach(function(h, i) { obj[h.trim()] = (fields[i] || '').trim(); });
    return obj;
  });
}

// ---------------------------------------------------------------------------
// Gender-ratio bucket
// ---------------------------------------------------------------------------

function genderBucket(genderStr) {
  if (!genderStr) return 'genderless';
  const s = String(genderStr);
  if (s === '0:0') return 'genderless';
  const parts = s.split(':');
  if (parts.length !== 2) return 'unknown';
  const m = Number(parts[0]);
  const f = Number(parts[1]);
  const total = m + f;
  if (total === 0) return 'genderless';
  const mPct = m / total;
  if (mPct === 0) return 'female-only';
  if (mPct === 1) return 'male-only';
  if (mPct < 0.5) return 'mostly-female';
  if (mPct > 0.5) return 'mostly-male';
  return 'equal';
}

// ---------------------------------------------------------------------------
// EV yield helper
// ---------------------------------------------------------------------------

function evYieldStr(evYield) {
  if (!evYield || typeof evYield !== 'object') return null;
  const abbrev = { hp: 'HP', attack: 'Atk', defense: 'Def',
                   spatk: 'SpA', spdef: 'SpD', speed: 'Spe' };
  return Object.entries(evYield)
    .map(function(e) { return e[1] + ' ' + (abbrev[e[0]] || e[0]); })
    .join(', ');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // ── 1. pokemondb/database YAML files ──────────────────────────────────────
  console.log('Fetching YAML files from pokemondb/database ...');

  const [pokemonYamlText, formsYamlRaw, abilitiesYamlText, eggGroupsYamlText] =
    await Promise.all([
      fetchText(POKEMONDB_BASE + '/pokemon.yaml'),
      fetchText(POKEMONDB_BASE + '/pokemon-forms.yaml'),
      fetchText(POKEMONDB_BASE + '/abilities.yaml'),
      fetchText(POKEMONDB_BASE + '/egg-groups.yaml'),
    ]);

  // Fix `type2: -` (invalid YAML in pokemondb source) -> bare null
  const formsYamlText = formsYamlRaw.replace(/^(\s+type[12]): -\s*$/gm, '$1:');

  const pokemonMeta   = yaml.load(pokemonYamlText);   // slug -> {national, name, gen}
  const pokemonForms  = yaml.load(formsYamlText);     // formSlug -> form data
  const abilitiesDb   = yaml.load(abilitiesYamlText); // abilitySlug -> {name, gen, ...}
  const eggGroupsDb   = yaml.load(eggGroupsYamlText); // eggGroupSlug -> {name}

  console.log(
    'Loaded ' + Object.keys(pokemonMeta).length + ' Pokemon, ' +
    Object.keys(pokemonForms).length + ' forms, ' +
    Object.keys(abilitiesDb).length + ' abilities, ' +
    Object.keys(eggGroupsDb).length + ' egg groups.'
  );

  // ── 2. PokeAPI CSV files (per-Pokémon mappings) ───────────────────────────
  console.log('Fetching PokeAPI CSV files ...');

  const [
    speciesCsvText,
    eggGroupCsvText,
    eggGroupIdCsvText,
    colorCsvText,
    shapeCsvText,
    pokemonCsvText,
    pokemonAbilityCsvText,
    abilityCsvText,
  ] = await Promise.all([
    fetchText(POKEAPI_CSV_BASE + '/pokemon_species.csv'),
    fetchText(POKEAPI_CSV_BASE + '/pokemon_egg_groups.csv'),
    fetchText(POKEAPI_CSV_BASE + '/egg_groups.csv'),
    fetchText(POKEAPI_CSV_BASE + '/pokemon_colors.csv'),
    fetchText(POKEAPI_CSV_BASE + '/pokemon_shapes.csv'),
    fetchText(POKEAPI_CSV_BASE + '/pokemon.csv'),
    fetchText(POKEAPI_CSV_BASE + '/pokemon_abilities.csv'),
    fetchText(POKEAPI_CSV_BASE + '/abilities.csv'),
  ]);

  // PokeAPI id -> slug maps (used to resolve numeric IDs back to slugs)
  const colorById     = {};
  parseCsv(colorCsvText).forEach(function(r)    { colorById[r.id]    = r.identifier; });

  const shapeById     = {};
  parseCsv(shapeCsvText).forEach(function(r)    { shapeById[r.id]    = r.identifier; });

  // PokeAPI egg_group_id -> slug; then we look up the display name from pokemondb
  const eggGroupSlugById = {};
  parseCsv(eggGroupIdCsvText).forEach(function(r) { eggGroupSlugById[r.id] = r.identifier; });

  // PokeAPI ability_id -> slug; then we look up the display name from pokemondb
  const abilitySlugById = {};
  parseCsv(abilityCsvText).forEach(function(r)   { abilitySlugById[r.id] = r.identifier; });

  // species_id -> {color, shape, is_baby, is_legendary, is_mythical, evolves_from}
  const speciesById = {};
  parseCsv(speciesCsvText).forEach(function(row) {
    speciesById[row.id] = {
      color:        colorById[row.color_id] || null,
      shape:        shapeById[row.shape_id] || null,
      is_baby:      row.is_baby      === '1',
      is_legendary: row.is_legendary === '1',
      is_mythical:  row.is_mythical  === '1',
      evolves_from: row.evolves_from_species_id || null,
    };
  });

  // species_id -> [egg_group_slug, ...]  (slug matches pokemondb egg-groups.yaml keys)
  const eggGroupsBySpecies = {};
  parseCsv(eggGroupCsvText).forEach(function(row) {
    if (!eggGroupsBySpecies[row.species_id]) eggGroupsBySpecies[row.species_id] = [];
    const slug = eggGroupSlugById[row.egg_group_id];
    // Normalize: PokeAPI uses "plant" but pokemondb uses "grass", etc.
    if (slug) eggGroupsBySpecies[row.species_id].push(slug);
  });

  // species_id -> default pokemon_id  (for ability lookup)
  const defaultPokemonBySpecies = {};
  parseCsv(pokemonCsvText).forEach(function(row) {
    if (row.is_default === '1') defaultPokemonBySpecies[row.species_id] = row.id;
  });

  // pokemon_id -> [{ability_slug, is_hidden}]
  const abilitiesByPokemon = {};
  parseCsv(pokemonAbilityCsvText).forEach(function(row) {
    if (!abilitiesByPokemon[row.pokemon_id]) abilitiesByPokemon[row.pokemon_id] = [];
    const slug = abilitySlugById[row.ability_id];
    if (slug) abilitiesByPokemon[row.pokemon_id].push({
      slug,
      is_hidden: row.is_hidden === '1',
    });
  });

  // Helper: ability slug -> display name (prefer pokemondb, fall back to slug)
  function abilityName(slug) {
    return (abilitiesDb[slug] && abilitiesDb[slug].name) || slug;
  }

  // Helper: egg group slug -> display name (prefer pokemondb, fall back to slug)
  function eggGroupName(slug) {
    // PokeAPI uses 'plant' while pokemondb uses 'grass'; align to pokemondb keys
    const norm = slug === 'plant' ? 'grass'
               : slug === 'humanshape' ? 'human-like'
               : slug === 'water1' ? 'water-1'
               : slug === 'water2' ? 'water-2'
               : slug === 'water3' ? 'water-3'
               : slug;
    return (eggGroupsDb[norm] && eggGroupsDb[norm].name) || slug;
  }

  // Helper: evolution stage (1 = base, 2 = first evo, 3 = second evo)
  function evolutionStage(speciesId) {
    const sp = speciesById[String(speciesId)];
    if (!sp)              return null;
    if (!sp.evolves_from) return 1;
    const parent = speciesById[String(sp.evolves_from)];
    if (!parent || !parent.evolves_from) return 2;
    return 3;
  }

  // ── 3. Build output records ────────────────────────────────────────────────
  console.log('Building output records ...');

  const output = [];

  for (const [formSlug, form] of Object.entries(pokemonForms)) {
    const baseSlug    = form.pokemonid || formSlug;
    const meta        = pokemonMeta[baseSlug] || {};
    const isForm      = !!form.formid;
    const nationalNum = meta.national;

    const s   = form.stats || {};
    const bst = (s.hp || 0) + (s.attack || 0) + (s.defense || 0) +
                (s.spatk || 0) + (s.spdef || 0) + (s.speed || 0);

    const gender = genderBucket(form.gender);

    const sid      = String(nationalNum);
    const sp       = speciesById[sid];
    const defPokId = defaultPokemonBySpecies[sid];
    const abRows   = defPokId ? (abilitiesByPokemon[defPokId] || []) : [];

    const abilities = abRows
      .filter(function(a) { return !a.is_hidden; })
      .map(function(a)    { return abilityName(a.slug); })
      .sort();
    const hiddenRow     = abRows.find(function(a) { return a.is_hidden; });
    const hiddenAbility = hiddenRow ? abilityName(hiddenRow.slug) : null;

    const rawEggGroups = eggGroupsBySpecies[sid] || null;
    const eggGroups = rawEggGroups
      ? rawEggGroups.map(eggGroupName)
      : null;

    output.push({
      id:              formSlug,
      pokemonid:       baseSlug,
      national:        nationalNum || null,
      name:            meta.name || baseSlug,
      formname:        form.formname || null,
      gen:             form.gen || meta.gen || null,
      is_form:         isForm,
      type1:           form.type1  || null,
      type2:           form.type2  || null,
      hp:              s.hp        || null,
      attack:          s.attack    || null,
      defense:         s.defense   || null,
      spatk:           s.spatk     || null,
      spdef:           s.spdef     || null,
      speed:           s.speed     || null,
      bst:             bst         || null,
      height:          form.height || null,
      weight:          form.weight || null,
      gender,
      egg_cycles:      form['egg-cycles'] || null,
      ev_yield:        evYieldStr(form['ev-yield']),
      abilities:       abilities.length ? abilities : null,
      hidden_ability:  hiddenAbility,
      egg_groups:      eggGroups,
      body_shape:      sp ? sp.shape        : null,
      color:           sp ? sp.color        : null,
      evolution_stage: nationalNum ? evolutionStage(nationalNum) : null,
      is_baby:         sp ? sp.is_baby      : false,
      is_legendary:    sp ? sp.is_legendary : false,
      is_mythical:     sp ? sp.is_mythical  : false,
    });
  }

  // ── 4. Write output ────────────────────────────────────────────────────────
  const outDir = path.dirname(OUT_PATH);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  fs.writeFileSync(OUT_PATH, JSON.stringify(output));
  console.log('Written ' + output.length + ' records to ' + OUT_PATH);
  console.log('File size: ' + (fs.statSync(OUT_PATH).size / 1024).toFixed(1) + ' KB');
}

main().catch(function(err) {
  console.error('Fatal error:', err);
  process.exit(1);
});
