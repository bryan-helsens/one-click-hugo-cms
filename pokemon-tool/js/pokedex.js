/**
 * pokedex.js
 * A lightweight Pokédex dataset used for name autocomplete, fuzzy-matching
 * OCR output against real names, and auto-flagging legendary/mythical species.
 *
 * Covers Gen 1–2 (Kanto + Johto) names plus a cross-generation set of
 * legendary / mythical Pokémon. Extend POKEDEX_NAMES with later gens as needed.
 */

const POKEDEX_NAMES = [
  // --- Gen 1 (Kanto) ---
  "Bulbasaur", "Ivysaur", "Venusaur", "Charmander", "Charmeleon", "Charizard",
  "Squirtle", "Wartortle", "Blastoise", "Caterpie", "Metapod", "Butterfree",
  "Weedle", "Kakuna", "Beedrill", "Pidgey", "Pidgeotto", "Pidgeot", "Rattata",
  "Raticate", "Spearow", "Fearow", "Ekans", "Arbok", "Pikachu", "Raichu",
  "Sandshrew", "Sandslash", "Nidoran♀", "Nidorina", "Nidoqueen", "Nidoran♂",
  "Nidorino", "Nidoking", "Clefairy", "Clefable", "Vulpix", "Ninetales",
  "Jigglypuff", "Wigglytuff", "Zubat", "Golbat", "Oddish", "Gloom", "Vileplume",
  "Paras", "Parasect", "Venonat", "Venomoth", "Diglett", "Dugtrio", "Meowth",
  "Persian", "Psyduck", "Golduck", "Mankey", "Primeape", "Growlithe", "Arcanine",
  "Poliwag", "Poliwhirl", "Poliwrath", "Abra", "Kadabra", "Alakazam", "Machop",
  "Machoke", "Machamp", "Bellsprout", "Weepinbell", "Victreebel", "Tentacool",
  "Tentacruel", "Geodude", "Graveler", "Golem", "Ponyta", "Rapidash", "Slowpoke",
  "Slowbro", "Magnemite", "Magneton", "Farfetch'd", "Doduo", "Dodrio", "Seel",
  "Dewgong", "Grimer", "Muk", "Shellder", "Cloyster", "Gastly", "Haunter",
  "Gengar", "Onix", "Drowzee", "Hypno", "Krabby", "Kingler", "Voltorb",
  "Electrode", "Exeggcute", "Exeggutor", "Cubone", "Marowak", "Hitmonlee",
  "Hitmonchan", "Lickitung", "Koffing", "Weezing", "Rhyhorn", "Rhydon",
  "Chansey", "Tangela", "Kangaskhan", "Horsea", "Seadra", "Goldeen", "Seaking",
  "Staryu", "Starmie", "Mr. Mime", "Scyther", "Jynx", "Electabuzz", "Magmar",
  "Pinsir", "Tauros", "Magikarp", "Gyarados", "Lapras", "Ditto", "Eevee",
  "Vaporeon", "Jolteon", "Flareon", "Porygon", "Omanyte", "Omastar", "Kabuto",
  "Kabutops", "Aerodactyl", "Snorlax", "Articuno", "Zapdos", "Moltres",
  "Dratini", "Dragonair", "Dragonite", "Mewtwo", "Mew",

  // --- Gen 2 (Johto) ---
  "Chikorita", "Bayleef", "Meganium", "Cyndaquil", "Quilava", "Typhlosion",
  "Totodile", "Croconaw", "Feraligatr", "Sentret", "Furret", "Hoothoot",
  "Noctowl", "Ledyba", "Ledian", "Spinarak", "Ariados", "Crobat", "Chinchou",
  "Lanturn", "Pichu", "Cleffa", "Igglybuff", "Togepi", "Togetic", "Natu",
  "Xatu", "Mareep", "Flaaffy", "Ampharos", "Bellossom", "Marill", "Azumarill",
  "Sudowoodo", "Politoed", "Hoppip", "Skiploom", "Jumpluff", "Aipom", "Sunkern",
  "Sunflora", "Yanma", "Wooper", "Quagsire", "Espeon", "Umbreon", "Murkrow",
  "Slowking", "Misdreavus", "Unown", "Wobbuffet", "Girafarig", "Pineco",
  "Forretress", "Dunsparce", "Gligar", "Steelix", "Snubbull", "Granbull",
  "Qwilfish", "Scizor", "Shuckle", "Heracross", "Sneasel", "Teddiursa",
  "Ursaring", "Slugma", "Magcargo", "Swinub", "Piloswine", "Corsola", "Remoraid",
  "Octillery", "Delibird", "Mantine", "Skarmory", "Houndour", "Houndoom",
  "Kingdra", "Phanpy", "Donphan", "Porygon2", "Stantler", "Smeargle", "Tyrogue",
  "Hitmontop", "Smoochum", "Elekid", "Magby", "Miltank", "Blissey", "Raikou",
  "Entei", "Suicune", "Larvitar", "Pupitar", "Tyranitar", "Lugia", "Ho-Oh",
  "Celebi"
];

// Legendary & mythical species (across generations) — used to auto-tag.
const LEGENDARY_NAMES = new Set([
  // Gen 1
  "Articuno", "Zapdos", "Moltres", "Mewtwo", "Mew",
  // Gen 2
  "Raikou", "Entei", "Suicune", "Lugia", "Ho-Oh", "Celebi",
  // Gen 3
  "Regirock", "Regice", "Registeel", "Latias", "Latios", "Kyogre", "Groudon",
  "Rayquaza", "Jirachi", "Deoxys",
  // Gen 4
  "Uxie", "Mesprit", "Azelf", "Dialga", "Palkia", "Heatran", "Regigigas",
  "Giratina", "Cresselia", "Phione", "Manaphy", "Darkrai", "Shaymin", "Arceus",
  // Gen 5
  "Cobalion", "Terrakion", "Virizion", "Tornadus", "Thundurus", "Reshiram",
  "Zekrom", "Landorus", "Kyurem", "Keldeo", "Meloetta", "Genesect",
  // Gen 6
  "Xerneas", "Yveltal", "Zygarde", "Diancie", "Hoopa", "Volcanion",
  // Gen 7
  "Cosmog", "Cosmoem", "Solgaleo", "Lunala", "Necrozma", "Magearna", "Marshadow",
  "Zeraora", "Meltan", "Melmetal"
]);

/** Normalize a string for matching: lowercase, strip non-alphanumerics. */
function normalizeName(str) {
  return (str || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Precompute normalized lookup once.
const NORMALIZED_POKEDEX = POKEDEX_NAMES.map((name) => ({
  name,
  norm: normalizeName(name)
}));

/** Levenshtein edit distance between two strings. */
function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    prev = curr;
  }
  return prev[b.length];
}

/**
 * Find the closest Pokédex name to a (possibly OCR-garbled) candidate.
 * Returns { name, score } where score is 0..1 (1 = exact). Returns null if
 * nothing is close enough.
 */
function matchPokedexName(candidate) {
  const norm = normalizeName(candidate);
  if (norm.length < 3) return null;

  let best = null;
  for (const entry of NORMALIZED_POKEDEX) {
    if (entry.norm === norm) return { name: entry.name, score: 1 };
    const dist = levenshtein(norm, entry.norm);
    const score = 1 - dist / Math.max(norm.length, entry.norm.length);
    if (!best || score > best.score) best = { name: entry.name, score };
  }
  // Require a reasonably strong match to avoid nonsense.
  return best && best.score >= 0.6 ? best : null;
}

function isLegendaryName(name) {
  return LEGENDARY_NAMES.has(name);
}
