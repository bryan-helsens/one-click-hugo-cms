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
  "Celebi",

  // --- Gen 3 (Hoenn) ---
  "Treecko", "Grovyle", "Sceptile", "Torchic", "Combusken", "Blaziken",
  "Mudkip", "Marshtomp", "Swampert", "Poochyena", "Mightyena", "Zigzagoon",
  "Linoone", "Wurmple", "Silcoon", "Beautifly", "Cascoon", "Dustox", "Lotad",
  "Lombre", "Ludicolo", "Seedot", "Nuzleaf", "Shiftry", "Taillow", "Swellow",
  "Wingull", "Pelipper", "Ralts", "Kirlia", "Gardevoir", "Surskit",
  "Masquerain", "Shroomish", "Breloom", "Slakoth", "Vigoroth", "Slaking",
  "Nincada", "Ninjask", "Shedinja", "Whismur", "Loudred", "Exploud", "Makuhita",
  "Hariyama", "Azurill", "Nosepass", "Skitty", "Delcatty", "Sableye", "Mawile",
  "Aron", "Lairon", "Aggron", "Meditite", "Medicham", "Electrike", "Manectric",
  "Plusle", "Minun", "Volbeat", "Illumise", "Roselia", "Gulpin", "Swalot",
  "Carvanha", "Sharpedo", "Wailmer", "Wailord", "Numel", "Camerupt", "Torkoal",
  "Spoink", "Grumpig", "Spinda", "Trapinch", "Vibrava", "Flygon", "Cacnea",
  "Cacturne", "Swablu", "Altaria", "Zangoose", "Seviper", "Lunatone",
  "Solrock", "Barboach", "Whiscash", "Corphish", "Crawdaunt", "Baltoy",
  "Claydol", "Lileep", "Cradily", "Anorith", "Armaldo", "Feebas", "Milotic",
  "Castform", "Kecleon", "Shuppet", "Banette", "Duskull", "Dusclops",
  "Tropius", "Chimecho", "Absol", "Wynaut", "Snorunt", "Glalie", "Spheal",
  "Sealeo", "Walrein", "Clamperl", "Huntail", "Gorebyss", "Relicanth",
  "Luvdisc", "Bagon", "Shelgon", "Salamence", "Beldum", "Metang", "Metagross",
  "Regirock", "Regice", "Registeel", "Latias", "Latios", "Kyogre", "Groudon",
  "Rayquaza", "Jirachi", "Deoxys",

  // --- Gen 4 (Sinnoh) ---
  "Turtwig", "Grotle", "Torterra", "Chimchar", "Monferno", "Infernape",
  "Piplup", "Prinplup", "Empoleon", "Starly", "Staravia", "Staraptor",
  "Bidoof", "Bibarel", "Kricketot", "Kricketune", "Shinx", "Luxio", "Luxray",
  "Budew", "Roserade", "Cranidos", "Rampardos", "Shieldon", "Bastiodon",
  "Burmy", "Wormadam", "Mothim", "Combee", "Vespiquen", "Pachirisu", "Buizel",
  "Floatzel", "Cherubi", "Cherrim", "Shellos", "Gastrodon", "Ambipom",
  "Drifloon", "Drifblim", "Buneary", "Lopunny", "Mismagius", "Honchkrow",
  "Glameow", "Purugly", "Chingling", "Stunky", "Skuntank", "Bronzor",
  "Bronzong", "Bonsly", "Mime Jr.", "Happiny", "Chatot", "Spiritomb", "Gible",
  "Gabite", "Garchomp", "Munchlax", "Riolu", "Lucario", "Hippopotas",
  "Hippowdon", "Skorupi", "Drapion", "Croagunk", "Toxicroak", "Carnivine",
  "Finneon", "Lumineon", "Mantyke", "Snover", "Abomasnow", "Weavile",
  "Magnezone", "Lickilicky", "Rhyperior", "Tangrowth", "Electivire",
  "Magmortar", "Togekiss", "Yanmega", "Leafeon", "Glaceon", "Gliscor",
  "Mamoswine", "Porygon-Z", "Gallade", "Probopass", "Dusknoir", "Froslass",
  "Rotom", "Uxie", "Mesprit", "Azelf", "Dialga", "Palkia", "Heatran",
  "Regigigas", "Giratina", "Cresselia", "Phione", "Manaphy", "Darkrai",
  "Shaymin", "Arceus",

  // --- Gen 5 (Unova) ---
  "Victini", "Snivy", "Servine", "Serperior", "Tepig", "Pignite", "Emboar",
  "Oshawott", "Dewott", "Samurott", "Patrat", "Watchog", "Lillipup", "Herdier",
  "Stoutland", "Purrloin", "Liepard", "Pansage", "Simisage", "Pansear",
  "Simisear", "Panpour", "Simipour", "Munna", "Musharna", "Pidove", "Tranquill",
  "Unfezant", "Blitzle", "Zebstrika", "Roggenrola", "Boldore", "Gigalith",
  "Woobat", "Swoobat", "Drilbur", "Excadrill", "Audino", "Timburr", "Gurdurr",
  "Conkeldurr", "Tympole", "Palpitoad", "Seismitoad", "Throh", "Sawk",
  "Sewaddle", "Swadloon", "Leavanny", "Venipede", "Whirlipede", "Scolipede",
  "Cottonee", "Whimsicott", "Petilil", "Lilligant", "Basculin", "Sandile",
  "Krokorok", "Krookodile", "Darumaka", "Darmanitan", "Maractus", "Dwebble",
  "Crustle", "Scraggy", "Scrafty", "Sigilyph", "Yamask", "Cofagrigus",
  "Tirtouga", "Carracosta", "Archen", "Archeops", "Trubbish", "Garbodor",
  "Zorua", "Zoroark", "Minccino", "Cinccino", "Gothita", "Gothorita",
  "Gothitelle", "Solosis", "Duosion", "Reuniclus", "Ducklett", "Swanna",
  "Vanillite", "Vanillish", "Vanilluxe", "Deerling", "Sawsbuck", "Emolga",
  "Karrablast", "Escavalier", "Foongus", "Amoonguss", "Frillish", "Jellicent",
  "Alomomola", "Joltik", "Galvantula", "Ferroseed", "Ferrothorn", "Klink",
  "Klang", "Klinklang", "Tynamo", "Eelektrik", "Eelektross", "Elgyem",
  "Beheeyem", "Litwick", "Lampent", "Chandelure", "Axew", "Fraxure", "Haxorus",
  "Cubchoo", "Beartic", "Cryogonal", "Shelmet", "Accelgor", "Stunfisk",
  "Mienfoo", "Mienshao", "Druddigon", "Golett", "Golurk", "Pawniard",
  "Bisharp", "Bouffalant", "Rufflet", "Braviary", "Vullaby", "Mandibuzz",
  "Heatmor", "Durant", "Deino", "Zweilous", "Hydreigon", "Larvesta",
  "Volcarona", "Cobalion", "Terrakion", "Virizion", "Tornadus", "Thundurus",
  "Reshiram", "Zekrom", "Landorus", "Kyurem", "Keldeo", "Meloetta", "Genesect",

  // --- Gen 6 (Kalos) ---
  "Chespin", "Quilladin", "Chesnaught", "Fennekin", "Braixen", "Delphox",
  "Froakie", "Frogadier", "Greninja", "Bunnelby", "Diggersby", "Fletchling",
  "Fletchinder", "Talonflame", "Scatterbug", "Spewpa", "Vivillon", "Litleo",
  "Pyroar", "Flabébé", "Floette", "Florges", "Skiddo", "Gogoat", "Pancham",
  "Pangoro", "Furfrou", "Espurr", "Meowstic", "Honedge", "Doublade",
  "Aegislash", "Spritzee", "Aromatisse", "Swirlix", "Slurpuff", "Inkay",
  "Malamar", "Binacle", "Barbaracle", "Skrelp", "Dragalge", "Clauncher",
  "Clawitzer", "Helioptile", "Heliolisk", "Tyrunt", "Tyrantrum", "Amaura",
  "Aurorus", "Sylveon", "Hawlucha", "Dedenne", "Carbink", "Goomy", "Sliggoo",
  "Goodra", "Klefki", "Phantump", "Trevenant", "Pumpkaboo", "Gourgeist",
  "Bergmite", "Avalugg", "Noibat", "Noivern", "Xerneas", "Yveltal", "Zygarde",
  "Diancie", "Hoopa", "Volcanion",

  // --- Gen 7 (Alola) ---
  "Rowlet", "Dartrix", "Decidueye", "Litten", "Torracat", "Incineroar",
  "Popplio", "Brionne", "Primarina", "Pikipek", "Trumbeak", "Toucannon",
  "Yungoos", "Gumshoos", "Grubbin", "Charjabug", "Vikavolt", "Crabrawler",
  "Crabominable", "Oricorio", "Cutiefly", "Ribombee", "Rockruff", "Lycanroc",
  "Wishiwashi", "Mareanie", "Toxapex", "Mudbray", "Mudsdale", "Dewpider",
  "Araquanid", "Fomantis", "Lurantis", "Morelull", "Shiinotic", "Salandit",
  "Salazzle", "Stufful", "Bewear", "Bounsweet", "Steenee", "Tsareena",
  "Comfey", "Oranguru", "Passimian", "Wimpod", "Golisopod", "Sandygast",
  "Palossand", "Pyukumuku", "Type: Null", "Silvally", "Minior", "Komala",
  "Turtonator", "Togedemaru", "Mimikyu", "Bruxish", "Drampa", "Dhelmise",
  "Jangmo-o", "Hakamo-o", "Kommo-o", "Tapu Koko", "Tapu Lele", "Tapu Bulu",
  "Tapu Fini", "Cosmog", "Cosmoem", "Solgaleo", "Lunala", "Nihilego",
  "Buzzwole", "Pheromosa", "Xurkitree", "Celesteela", "Kartana", "Guzzlord",
  "Necrozma", "Magearna", "Marshadow", "Poipole", "Naganadel", "Stakataka",
  "Blacephalon", "Zeraora", "Meltan", "Melmetal",

  // --- Gen 8 (Galar / Hisui) ---
  "Grookey", "Thwackey", "Rillaboom", "Scorbunny", "Raboot", "Cinderace",
  "Sobble", "Drizzile", "Inteleon", "Skwovet", "Greedent", "Rookidee",
  "Corvisquire", "Corviknight", "Blipbug", "Dottler", "Orbeetle", "Nickit",
  "Thievul", "Gossifleur", "Eldegoss", "Wooloo", "Dubwool", "Chewtle",
  "Drednaw", "Yamper", "Boltund", "Rolycoly", "Carkol", "Coalossal", "Applin",
  "Flapple", "Appletun", "Silicobra", "Sandaconda", "Cramorant", "Arrokuda",
  "Barraskewda", "Toxel", "Toxtricity", "Sizzlipede", "Centiskorch",
  "Clobbopus", "Grapploct", "Sinistea", "Polteageist", "Hatenna", "Hattrem",
  "Hatterene", "Impidimp", "Morgrem", "Grimmsnarl", "Obstagoon", "Perrserker",
  "Cursola", "Sirfetch'd", "Mr. Rime", "Runerigus", "Milcery", "Alcremie",
  "Falinks", "Pincurchin", "Snom", "Frosmoth", "Stonjourner", "Eiscue",
  "Indeedee", "Morpeko", "Cufant", "Copperajah", "Dracozolt", "Arctozolt",
  "Dracovish", "Arctovish", "Duraludon", "Dreepy", "Drakloak", "Dragapult",
  "Zacian", "Zamazenta", "Eternatus", "Kubfu", "Urshifu", "Zarude",
  "Regieleki", "Regidrago", "Glastrier", "Spectrier", "Calyrex", "Wyrdeer",
  "Kleavor", "Ursaluna", "Basculegion", "Sneasler", "Overqwil", "Enamorus"
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
  "Zeraora", "Meltan", "Melmetal",
  "Tapu Koko", "Tapu Lele", "Tapu Bulu", "Tapu Fini",
  "Nihilego", "Buzzwole", "Pheromosa", "Xurkitree", "Celesteela", "Kartana",
  "Guzzlord", "Poipole", "Naganadel", "Stakataka", "Blacephalon",
  // Gen 8 / Hisui
  "Zacian", "Zamazenta", "Eternatus", "Kubfu", "Urshifu", "Zarude",
  "Regieleki", "Regidrago", "Glastrier", "Spectrier", "Calyrex", "Enamorus"
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
