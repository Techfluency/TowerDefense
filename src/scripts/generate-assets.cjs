/**
 * Asset Generation Script for Tower Defense Game
 * Generates all game sprites as detailed SVGs, converts to PNG via sharp.
 * Run: node src/scripts/generate-assets.js
 */
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const SPRITES_DIR = path.join(__dirname, '../../public/assets/sprites');

// Ensure output dir exists
fs.mkdirSync(SPRITES_DIR, { recursive: true });

// ─── TILE ASSETS (64x64) ───────────────────────────────────────────────

const tiles = {
  'tile-path': `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
    <defs>
      <linearGradient id="pathBase" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#C4A265"/>
        <stop offset="100%" stop-color="#A8884A"/>
      </linearGradient>
      <filter id="pathNoise">
        <feTurbulence type="fractalNoise" baseFrequency="0.15" numOctaves="4" seed="2"/>
        <feColorMatrix type="saturate" values="0"/>
        <feBlend in="SourceGraphic" mode="multiply"/>
      </filter>
    </defs>
    <rect width="64" height="64" fill="url(#pathBase)"/>
    <rect width="64" height="64" fill="url(#pathBase)" filter="url(#pathNoise)" opacity="0.3"/>
    <!-- Worn dirt details -->
    <ellipse cx="20" cy="15" rx="8" ry="4" fill="#B89A55" opacity="0.4"/>
    <ellipse cx="45" cy="40" rx="10" ry="5" fill="#BFA060" opacity="0.3"/>
    <ellipse cx="12" cy="50" rx="6" ry="3" fill="#9E7A3C" opacity="0.35"/>
    <!-- Small pebbles -->
    <circle cx="10" cy="30" r="1.5" fill="#8B7340" opacity="0.6"/>
    <circle cx="50" cy="20" r="1" fill="#8B7340" opacity="0.5"/>
    <circle cx="35" cy="55" r="1.5" fill="#7A6535" opacity="0.5"/>
    <circle cx="55" cy="48" r="1" fill="#9E7A3C" opacity="0.4"/>
    <!-- Subtle edge darkening -->
    <rect x="0" y="0" width="64" height="2" fill="#8B7340" opacity="0.15"/>
    <rect x="0" y="62" width="64" height="2" fill="#8B7340" opacity="0.15"/>
    <rect x="0" y="0" width="2" height="64" fill="#8B7340" opacity="0.15"/>
    <rect x="62" y="0" width="2" height="64" fill="#8B7340" opacity="0.15"/>
  </svg>`,

  'tile-buildable': `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
    <defs>
      <linearGradient id="grassBase" x1="0" y1="0" x2="0.3" y2="1">
        <stop offset="0%" stop-color="#4CAF50"/>
        <stop offset="50%" stop-color="#43A047"/>
        <stop offset="100%" stop-color="#388E3C"/>
      </linearGradient>
      <filter id="grassNoise">
        <feTurbulence type="fractalNoise" baseFrequency="0.25" numOctaves="3" seed="5"/>
        <feColorMatrix type="saturate" values="0"/>
        <feBlend in="SourceGraphic" mode="multiply"/>
      </filter>
    </defs>
    <rect width="64" height="64" fill="url(#grassBase)"/>
    <rect width="64" height="64" fill="url(#grassBase)" filter="url(#grassNoise)" opacity="0.2"/>
    <!-- Grass blade clusters -->
    <g stroke="#2E7D32" stroke-width="1" opacity="0.4">
      <line x1="8" y1="12" x2="6" y2="6"/>
      <line x1="10" y1="12" x2="12" y2="5"/>
      <line x1="25" y1="30" x2="23" y2="24"/>
      <line x1="27" y1="30" x2="29" y2="23"/>
      <line x1="50" y1="18" x2="48" y2="12"/>
      <line x1="52" y1="18" x2="54" y2="11"/>
      <line x1="15" y1="50" x2="13" y2="44"/>
      <line x1="17" y1="50" x2="19" y2="43"/>
      <line x1="42" y1="55" x2="40" y2="49"/>
      <line x1="44" y1="55" x2="46" y2="48"/>
    </g>
    <!-- Light grass highlights -->
    <g fill="#66BB6A" opacity="0.3">
      <circle cx="20" cy="20" r="3"/>
      <circle cx="48" cy="35" r="4"/>
      <circle cx="12" cy="45" r="3"/>
      <circle cx="55" cy="55" r="2"/>
    </g>
    <!-- Subtle grid hint for buildable indication -->
    <rect x="1" y="1" width="62" height="62" fill="none" stroke="#66BB6A" stroke-width="0.5" stroke-dasharray="4,4" opacity="0.25" rx="2"/>
  </svg>`,

  'tile-blocked': `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
    <defs>
      <linearGradient id="rockBase" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#555555"/>
        <stop offset="100%" stop-color="#3A3A3A"/>
      </linearGradient>
      <filter id="rockNoise">
        <feTurbulence type="fractalNoise" baseFrequency="0.08" numOctaves="5" seed="8"/>
        <feColorMatrix type="saturate" values="0"/>
        <feBlend in="SourceGraphic" mode="overlay"/>
      </filter>
    </defs>
    <rect width="64" height="64" fill="url(#rockBase)"/>
    <rect width="64" height="64" fill="#444" filter="url(#rockNoise)" opacity="0.5"/>
    <!-- Rock formations -->
    <polygon points="10,40 20,20 35,25 30,45" fill="#4A4A4A" stroke="#333" stroke-width="0.5"/>
    <polygon points="35,15 50,10 55,30 40,35" fill="#505050" stroke="#3A3A3A" stroke-width="0.5"/>
    <polygon points="5,55 15,50 25,60 10,63" fill="#484848" stroke="#333" stroke-width="0.5"/>
    <polygon points="40,45 55,40 60,55 50,60" fill="#464646" stroke="#383838" stroke-width="0.5"/>
    <!-- Rock highlights -->
    <line x1="15" y1="22" x2="28" y2="28" stroke="#666" stroke-width="0.5" opacity="0.5"/>
    <line x1="38" y1="12" x2="52" y2="18" stroke="#666" stroke-width="0.5" opacity="0.5"/>
    <!-- Dark crevices -->
    <line x1="22" y1="35" x2="32" y2="40" stroke="#2A2A2A" stroke-width="1" opacity="0.6"/>
    <line x1="42" y1="50" x2="52" y2="48" stroke="#2A2A2A" stroke-width="1" opacity="0.5"/>
    <!-- Small tree/shrub on rock -->
    <circle cx="48" cy="22" r="6" fill="#2D5A2D" opacity="0.7"/>
    <circle cx="46" cy="20" r="5" fill="#336633" opacity="0.6"/>
    <rect x="47" y="25" width="2" height="5" fill="#4A3520" opacity="0.7"/>
  </svg>`,

  'tile-spawn': `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
    <defs>
      <radialGradient id="portalGlow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#FF6B35"/>
        <stop offset="50%" stop-color="#CC4400"/>
        <stop offset="100%" stop-color="#1A0A00"/>
      </radialGradient>
      <radialGradient id="portalCore" cx="50%" cy="50%" r="40%">
        <stop offset="0%" stop-color="#FFAA00"/>
        <stop offset="60%" stop-color="#FF6B35"/>
        <stop offset="100%" stop-color="#FF6B3500"/>
      </radialGradient>
      <filter id="glow">
        <feGaussianBlur stdDeviation="2" result="blur"/>
        <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>
    <!-- Dark ground base -->
    <rect width="64" height="64" fill="#1A0A00"/>
    <rect width="64" height="64" fill="url(#portalGlow)"/>
    <!-- Portal ring -->
    <circle cx="32" cy="32" r="22" fill="none" stroke="#FF8844" stroke-width="3" opacity="0.8" filter="url(#glow)"/>
    <circle cx="32" cy="32" r="18" fill="none" stroke="#FFAA55" stroke-width="1.5" opacity="0.6"/>
    <!-- Inner vortex -->
    <circle cx="32" cy="32" r="14" fill="url(#portalCore)" opacity="0.9"/>
    <!-- Swirl lines -->
    <path d="M32,18 Q42,28 32,32 Q22,36 32,46" fill="none" stroke="#FFCC66" stroke-width="1" opacity="0.5"/>
    <path d="M18,32 Q28,22 32,32 Q36,42 46,32" fill="none" stroke="#FFCC66" stroke-width="1" opacity="0.5"/>
    <!-- Center bright spot -->
    <circle cx="32" cy="32" r="5" fill="#FFDD88" opacity="0.8" filter="url(#glow)"/>
    <circle cx="32" cy="32" r="2" fill="#FFFFFF" opacity="0.9"/>
    <!-- Corner runes -->
    <text x="6" y="12" font-size="8" fill="#FF6B35" opacity="0.4" font-family="serif">&#9670;</text>
    <text x="52" y="12" font-size="8" fill="#FF6B35" opacity="0.4" font-family="serif">&#9670;</text>
    <text x="6" y="60" font-size="8" fill="#FF6B35" opacity="0.4" font-family="serif">&#9670;</text>
    <text x="52" y="60" font-size="8" fill="#FF6B35" opacity="0.4" font-family="serif">&#9670;</text>
  </svg>`,

  'tile-objective': `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
    <defs>
      <radialGradient id="baseGlow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#7B68EE"/>
        <stop offset="60%" stop-color="#483D8B"/>
        <stop offset="100%" stop-color="#1A1A3E"/>
      </radialGradient>
      <filter id="castleGlow">
        <feGaussianBlur stdDeviation="1.5" result="blur"/>
        <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>
    <!-- Base ground -->
    <rect width="64" height="64" fill="#1A1A3E"/>
    <rect width="64" height="64" fill="url(#baseGlow)" opacity="0.7"/>
    <!-- Castle/fortress base -->
    <rect x="16" y="20" width="32" height="28" fill="#5A4F8A" rx="2"/>
    <rect x="18" y="22" width="28" height="24" fill="#6B5FA0" rx="1"/>
    <!-- Towers on castle -->
    <rect x="14" y="14" width="8" height="16" fill="#5A4F8A" rx="1"/>
    <rect x="42" y="14" width="8" height="16" fill="#5A4F8A" rx="1"/>
    <!-- Battlements -->
    <rect x="14" y="12" width="3" height="4" fill="#6B5FA0"/>
    <rect x="19" y="12" width="3" height="4" fill="#6B5FA0"/>
    <rect x="42" y="12" width="3" height="4" fill="#6B5FA0"/>
    <rect x="47" y="12" width="3" height="4" fill="#6B5FA0"/>
    <!-- Center battlement row -->
    <rect x="22" y="16" width="4" height="4" fill="#6B5FA0"/>
    <rect x="30" y="16" width="4" height="4" fill="#6B5FA0"/>
    <rect x="38" y="16" width="4" height="4" fill="#6B5FA0"/>
    <!-- Gate -->
    <rect x="26" y="34" width="12" height="14" fill="#2A2050" rx="6" ry="6"/>
    <rect x="26" y="40" width="12" height="8" fill="#2A2050"/>
    <!-- Gate highlight -->
    <rect x="28" y="36" width="8" height="10" fill="#352A60" rx="4" ry="4"/>
    <rect x="28" y="41" width="8" height="7" fill="#352A60"/>
    <!-- Crystal on top -->
    <polygon points="32,6 28,14 36,14" fill="#9B8FFF" filter="url(#castleGlow)"/>
    <polygon points="32,8 30,14 34,14" fill="#B8ADFF"/>
    <!-- Glow around crystal -->
    <circle cx="32" cy="10" r="4" fill="#9B8FFF" opacity="0.3" filter="url(#castleGlow)"/>
    <!-- Shield emblem on wall -->
    <polygon points="32,26 28,30 32,34 36,30" fill="#8B7FCC" stroke="#A898E8" stroke-width="0.5"/>
  </svg>`,
};

// ─── TOWER ASSETS (64x64, top-down view) ─────────────────────────────

const towers = {
  'tower-ranged': `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
    <defs>
      <radialGradient id="woodBase" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#A0784C"/>
        <stop offset="100%" stop-color="#7A5A35"/>
      </radialGradient>
      <filter id="towerShadow">
        <feDropShadow dx="2" dy="2" stdDeviation="2" flood-color="#000" flood-opacity="0.4"/>
      </filter>
    </defs>
    <!-- Shadow -->
    <ellipse cx="35" cy="35" rx="20" ry="20" fill="#000" opacity="0.2"/>
    <!-- Tower base (wooden, circular) -->
    <circle cx="32" cy="32" r="20" fill="url(#woodBase)" stroke="#5C3D20" stroke-width="2" filter="url(#towerShadow)"/>
    <!-- Wood plank lines -->
    <line x1="14" y1="26" x2="50" y2="26" stroke="#6B4D30" stroke-width="0.5" opacity="0.5"/>
    <line x1="14" y1="32" x2="50" y2="32" stroke="#6B4D30" stroke-width="0.5" opacity="0.5"/>
    <line x1="14" y1="38" x2="50" y2="38" stroke="#6B4D30" stroke-width="0.5" opacity="0.5"/>
    <!-- Inner platform -->
    <circle cx="32" cy="32" r="12" fill="#8B6840" stroke="#5C3D20" stroke-width="1"/>
    <!-- Crossbow (pointing right = default facing) -->
    <rect x="28" y="29" width="22" height="6" fill="#5C3D20" rx="1"/>
    <rect x="30" y="31" width="18" height="2" fill="#7A5A35"/>
    <!-- Bow arms -->
    <path d="M34,29 Q28,22 30,16" fill="none" stroke="#5C3D20" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M34,35 Q28,42 30,48" fill="none" stroke="#5C3D20" stroke-width="2.5" stroke-linecap="round"/>
    <!-- Bowstring -->
    <line x1="30" y1="16" x2="30" y2="48" stroke="#C8B080" stroke-width="0.8"/>
    <!-- Arrow tip -->
    <polygon points="50,32 46,28 46,36" fill="#AAA" stroke="#777" stroke-width="0.5"/>
    <!-- Center bolt -->
    <circle cx="32" cy="32" r="3" fill="#5C3D20" stroke="#4A3018" stroke-width="1"/>
    <circle cx="32" cy="32" r="1" fill="#4A3018"/>
  </svg>`,

  'tower-focused': `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
    <defs>
      <radialGradient id="stoneBase" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#8A8A9A"/>
        <stop offset="100%" stop-color="#5A5A6A"/>
      </radialGradient>
      <radialGradient id="lensGlow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#00DDFF"/>
        <stop offset="70%" stop-color="#0088CC"/>
        <stop offset="100%" stop-color="#00446600"/>
      </radialGradient>
      <filter id="sniperShadow">
        <feDropShadow dx="2" dy="2" stdDeviation="2" flood-color="#000" flood-opacity="0.4"/>
      </filter>
    </defs>
    <!-- Shadow -->
    <ellipse cx="35" cy="35" rx="18" ry="18" fill="#000" opacity="0.2"/>
    <!-- Tower base (stone, octagonal feel) -->
    <polygon points="32,10 48,18 52,34 48,50 32,54 16,50 12,34 16,18" fill="url(#stoneBase)" stroke="#444455" stroke-width="2" filter="url(#sniperShadow)"/>
    <!-- Stone brick lines -->
    <line x1="16" y1="28" x2="48" y2="28" stroke="#4A4A5A" stroke-width="0.5" opacity="0.5"/>
    <line x1="16" y1="38" x2="48" y2="38" stroke="#4A4A5A" stroke-width="0.5" opacity="0.5"/>
    <!-- Barrel/scope pointing right -->
    <rect x="32" y="29" width="24" height="6" fill="#555566" rx="1"/>
    <rect x="34" y="30" width="20" height="4" fill="#666677"/>
    <!-- Scope lens at tip -->
    <circle cx="56" cy="32" r="4" fill="url(#lensGlow)" opacity="0.9"/>
    <circle cx="56" cy="32" r="2" fill="#00EEFF" opacity="0.8"/>
    <!-- Crosshair on lens -->
    <line x1="53" y1="32" x2="59" y2="32" stroke="#FFFFFF" stroke-width="0.5" opacity="0.6"/>
    <line x1="56" y1="29" x2="56" y2="35" stroke="#FFFFFF" stroke-width="0.5" opacity="0.6"/>
    <!-- Top platform detail -->
    <circle cx="32" cy="32" r="10" fill="#6A6A7A" stroke="#4A4A5A" stroke-width="1"/>
    <!-- Pivot mechanism -->
    <circle cx="32" cy="32" r="4" fill="#555566" stroke="#3A3A4A" stroke-width="1.5"/>
    <circle cx="32" cy="32" r="1.5" fill="#3A3A4A"/>
    <!-- Targeting glow -->
    <circle cx="56" cy="32" r="6" fill="#00DDFF" opacity="0.15"/>
  </svg>`,

  'tower-broadcast': `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
    <defs>
      <radialGradient id="crystalGlow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#44FFAA"/>
        <stop offset="40%" stop-color="#22CC88"/>
        <stop offset="100%" stop-color="#0A553300"/>
      </radialGradient>
      <radialGradient id="crystalBase" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#667788"/>
        <stop offset="100%" stop-color="#445566"/>
      </radialGradient>
      <filter id="crystalBlur">
        <feGaussianBlur stdDeviation="2" result="blur"/>
        <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>
    <!-- Shadow -->
    <ellipse cx="34" cy="35" rx="20" ry="20" fill="#000" opacity="0.2"/>
    <!-- Base platform (hexagonal) -->
    <polygon points="32,12 50,22 50,42 32,52 14,42 14,22" fill="url(#crystalBase)" stroke="#334455" stroke-width="2"/>
    <!-- Inner ring detail -->
    <polygon points="32,18 44,24 44,40 32,46 20,40 20,24" fill="#556677" stroke="#445566" stroke-width="1"/>
    <!-- Broadcast wave rings -->
    <circle cx="32" cy="32" r="26" fill="none" stroke="#44FFAA" stroke-width="1" opacity="0.15"/>
    <circle cx="32" cy="32" r="22" fill="none" stroke="#44FFAA" stroke-width="1" opacity="0.2"/>
    <circle cx="32" cy="32" r="18" fill="none" stroke="#44FFAA" stroke-width="1" opacity="0.25"/>
    <!-- Energy glow -->
    <circle cx="32" cy="32" r="12" fill="url(#crystalGlow)" opacity="0.6"/>
    <!-- Central crystal -->
    <polygon points="32,20 38,28 38,36 32,44 26,36 26,28" fill="#33DDAA" stroke="#22BB88" stroke-width="1" filter="url(#crystalBlur)"/>
    <!-- Crystal facets -->
    <polygon points="32,20 38,28 32,32" fill="#44EEBB" opacity="0.6"/>
    <polygon points="32,44 26,36 32,32" fill="#22AA77" opacity="0.6"/>
    <!-- Crystal core -->
    <circle cx="32" cy="32" r="3" fill="#AAFFDD" opacity="0.9"/>
    <circle cx="32" cy="32" r="1.5" fill="#FFFFFF" opacity="0.8"/>
  </svg>`,

  'tower-antiair': `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
    <defs>
      <radialGradient id="metalBase" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#778899"/>
        <stop offset="100%" stop-color="#4A5568"/>
      </radialGradient>
      <filter id="aaShadow">
        <feDropShadow dx="2" dy="2" stdDeviation="2" flood-color="#000" flood-opacity="0.4"/>
      </filter>
    </defs>
    <!-- Shadow -->
    <ellipse cx="35" cy="35" rx="18" ry="18" fill="#000" opacity="0.2"/>
    <!-- Metal base platform -->
    <circle cx="32" cy="32" r="20" fill="url(#metalBase)" stroke="#3A4555" stroke-width="2" filter="url(#aaShadow)"/>
    <!-- Rivets around edge -->
    <circle cx="32" cy="13" r="1.5" fill="#8899AA"/>
    <circle cx="45" cy="18" r="1.5" fill="#8899AA"/>
    <circle cx="50" cy="32" r="1.5" fill="#8899AA"/>
    <circle cx="45" cy="46" r="1.5" fill="#8899AA"/>
    <circle cx="32" cy="51" r="1.5" fill="#8899AA"/>
    <circle cx="19" cy="46" r="1.5" fill="#8899AA"/>
    <circle cx="14" cy="32" r="1.5" fill="#8899AA"/>
    <circle cx="19" cy="18" r="1.5" fill="#8899AA"/>
    <!-- Turret body -->
    <rect x="24" y="24" width="16" height="16" fill="#5A6A7A" stroke="#3A4555" stroke-width="1" rx="2"/>
    <!-- Missile launcher tubes (pointing right) -->
    <rect x="32" y="24" width="20" height="4" fill="#4A5A6A" rx="1"/>
    <rect x="32" y="28" width="20" height="4" fill="#4A5A6A" rx="1"/>
    <rect x="32" y="32" width="20" height="4" fill="#4A5A6A" rx="1"/>
    <rect x="32" y="36" width="20" height="4" fill="#4A5A6A" rx="1"/>
    <!-- Tube openings (dark circles) -->
    <circle cx="52" cy="26" r="1.5" fill="#2A3040"/>
    <circle cx="52" cy="30" r="1.5" fill="#2A3040"/>
    <circle cx="52" cy="34" r="1.5" fill="#2A3040"/>
    <circle cx="52" cy="38" r="1.5" fill="#2A3040"/>
    <!-- Tube highlights -->
    <line x1="34" y1="25" x2="50" y2="25" stroke="#6A7A8A" stroke-width="0.5" opacity="0.5"/>
    <line x1="34" y1="29" x2="50" y2="29" stroke="#6A7A8A" stroke-width="0.5" opacity="0.5"/>
    <line x1="34" y1="33" x2="50" y2="33" stroke="#6A7A8A" stroke-width="0.5" opacity="0.5"/>
    <line x1="34" y1="37" x2="50" y2="37" stroke="#6A7A8A" stroke-width="0.5" opacity="0.5"/>
    <!-- Radar dish detail on top -->
    <circle cx="28" cy="32" r="5" fill="#667788" stroke="#556677" stroke-width="1"/>
    <line x1="28" y1="28" x2="28" y2="36" stroke="#556677" stroke-width="0.5"/>
    <line x1="24" y1="32" x2="32" y2="32" stroke="#556677" stroke-width="0.5"/>
    <!-- Red targeting LED -->
    <circle cx="28" cy="32" r="1.5" fill="#FF4444"/>
    <circle cx="28" cy="32" r="3" fill="#FF4444" opacity="0.2"/>
  </svg>`,
};

// ─── ENEMY ASSETS (top-down, facing right) ───────────────────────────

const enemies = {
  'enemy-runner': `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
    <defs>
      <filter id="runnerShadow">
        <feDropShadow dx="1" dy="1" stdDeviation="1.5" flood-color="#000" flood-opacity="0.35"/>
      </filter>
    </defs>
    <!-- Shadow on ground -->
    <ellipse cx="33" cy="48" rx="14" ry="5" fill="#000" opacity="0.2"/>
    <!-- Body (insectoid runner) -->
    <ellipse cx="32" cy="32" rx="14" ry="10" fill="#CC3333" stroke="#991111" stroke-width="1.5" filter="url(#runnerShadow)"/>
    <!-- Body segments -->
    <ellipse cx="24" cy="32" rx="6" ry="8" fill="#BB2222"/>
    <ellipse cx="32" cy="32" rx="8" ry="9" fill="#CC3333"/>
    <ellipse cx="40" cy="32" rx="6" ry="7" fill="#DD4444"/>
    <!-- Legs (3 pairs) -->
    <g stroke="#991111" stroke-width="1.5" stroke-linecap="round">
      <line x1="22" y1="26" x2="14" y2="18"/>
      <line x1="22" y1="38" x2="14" y2="46"/>
      <line x1="32" y1="24" x2="28" y2="16"/>
      <line x1="32" y1="40" x2="28" y2="48"/>
      <line x1="40" y1="26" x2="44" y2="18"/>
      <line x1="40" y1="38" x2="44" y2="46"/>
    </g>
    <!-- Head -->
    <ellipse cx="46" cy="32" rx="5" ry="5" fill="#DD4444" stroke="#AA2222" stroke-width="1"/>
    <!-- Eyes -->
    <circle cx="48" cy="29" r="2" fill="#FFCC00"/>
    <circle cx="48" cy="35" r="2" fill="#FFCC00"/>
    <circle cx="49" cy="29" r="0.8" fill="#111"/>
    <circle cx="49" cy="35" r="0.8" fill="#111"/>
    <!-- Mandibles -->
    <path d="M50,30 L56,28" stroke="#AA2222" stroke-width="1.5" stroke-linecap="round"/>
    <path d="M50,34 L56,36" stroke="#AA2222" stroke-width="1.5" stroke-linecap="round"/>
    <!-- Carapace highlight -->
    <ellipse cx="32" cy="28" rx="8" ry="3" fill="#EE5555" opacity="0.4"/>
  </svg>`,

  'enemy-tank': `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
    <defs>
      <filter id="tankShadow">
        <feDropShadow dx="1" dy="1" stdDeviation="2" flood-color="#000" flood-opacity="0.4"/>
      </filter>
    </defs>
    <!-- Shadow -->
    <ellipse cx="33" cy="50" rx="18" ry="6" fill="#000" opacity="0.25"/>
    <!-- Body (armored beetle) -->
    <ellipse cx="30" cy="32" rx="20" ry="16" fill="#772222" stroke="#551111" stroke-width="2" filter="url(#tankShadow)"/>
    <!-- Armor plates -->
    <path d="M14,26 L30,20 L46,26 L46,38 L30,44 L14,38 Z" fill="#883333" stroke="#662222" stroke-width="1"/>
    <!-- Armor ridge lines -->
    <line x1="14" y1="32" x2="46" y2="32" stroke="#662222" stroke-width="1"/>
    <line x1="30" y1="20" x2="30" y2="44" stroke="#662222" stroke-width="0.8"/>
    <!-- Armor plate highlights -->
    <path d="M16,27 L30,22 L30,32 L16,32 Z" fill="#994444" opacity="0.3"/>
    <path d="M30,22 L44,27 L44,32 L30,32 Z" fill="#994444" opacity="0.2"/>
    <!-- Heavy legs (4) -->
    <g stroke="#551111" stroke-width="2.5" stroke-linecap="round">
      <line x1="20" y1="22" x2="12" y2="14"/>
      <line x1="20" y1="42" x2="12" y2="50"/>
      <line x1="38" y1="22" x2="44" y2="14"/>
      <line x1="38" y1="42" x2="44" y2="50"/>
    </g>
    <!-- Head (armored) -->
    <ellipse cx="48" cy="32" rx="7" ry="7" fill="#883333" stroke="#662222" stroke-width="1.5"/>
    <!-- Horn -->
    <polygon points="54,32 62,30 62,34" fill="#AA4444" stroke="#772222" stroke-width="0.5"/>
    <!-- Eyes (small, beady) -->
    <circle cx="50" cy="28" r="2" fill="#FF6600"/>
    <circle cx="50" cy="36" r="2" fill="#FF6600"/>
    <circle cx="51" cy="28" r="0.8" fill="#220000"/>
    <circle cx="51" cy="36" r="0.8" fill="#220000"/>
    <!-- Armor studs -->
    <circle cx="22" cy="28" r="1.5" fill="#AA5555"/>
    <circle cx="22" cy="36" r="1.5" fill="#AA5555"/>
    <circle cx="36" cy="28" r="1.5" fill="#AA5555"/>
    <circle cx="36" cy="36" r="1.5" fill="#AA5555"/>
  </svg>`,

  'enemy-fast': `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
    <defs>
      <filter id="fastShadow">
        <feDropShadow dx="1" dy="1" stdDeviation="1" flood-color="#000" flood-opacity="0.3"/>
      </filter>
    </defs>
    <!-- Shadow -->
    <ellipse cx="33" cy="46" rx="12" ry="4" fill="#000" opacity="0.2"/>
    <!-- Speed lines -->
    <line x1="2" y1="28" x2="12" y2="28" stroke="#FF8844" stroke-width="1" opacity="0.3"/>
    <line x1="4" y1="32" x2="16" y2="32" stroke="#FF8844" stroke-width="1.5" opacity="0.4"/>
    <line x1="2" y1="36" x2="12" y2="36" stroke="#FF8844" stroke-width="1" opacity="0.3"/>
    <!-- Sleek body (wasp-like) -->
    <ellipse cx="28" cy="32" rx="8" ry="5" fill="#FF8833" stroke="#CC6622" stroke-width="1"/>
    <!-- Narrow waist -->
    <ellipse cx="36" cy="32" rx="3" ry="3" fill="#FFAA44" stroke="#CC6622" stroke-width="0.5"/>
    <!-- Head (pointed) -->
    <path d="M38,28 L52,32 L38,36 Z" fill="#FFAA44" stroke="#CC6622" stroke-width="1" filter="url(#fastShadow)"/>
    <!-- Wings (small, fast-moving) -->
    <ellipse cx="30" cy="22" rx="8" ry="3" fill="#FFDDAA" opacity="0.4" transform="rotate(-15,30,22)"/>
    <ellipse cx="30" cy="42" rx="8" ry="3" fill="#FFDDAA" opacity="0.4" transform="rotate(15,30,42)"/>
    <!-- Stinger/tail -->
    <path d="M20,32 L10,30 L10,34 Z" fill="#CC6622"/>
    <!-- Eyes -->
    <circle cx="44" cy="30" r="2" fill="#FFFFFF"/>
    <circle cx="44" cy="34" r="2" fill="#FFFFFF"/>
    <circle cx="45" cy="30" r="1" fill="#111"/>
    <circle cx="45" cy="34" r="1" fill="#111"/>
    <!-- Stripe details on body -->
    <line x1="24" y1="28" x2="24" y2="36" stroke="#CC6622" stroke-width="1.5"/>
    <line x1="28" y1="27" x2="28" y2="37" stroke="#CC6622" stroke-width="1.5"/>
    <line x1="32" y1="29" x2="32" y2="35" stroke="#CC6622" stroke-width="1"/>
  </svg>`,

  'enemy-flyer': `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
    <defs>
      <filter id="flyerShadow">
        <feDropShadow dx="2" dy="3" stdDeviation="2" flood-color="#000" flood-opacity="0.3"/>
      </filter>
      <radialGradient id="flyerEye" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#00FFFF"/>
        <stop offset="100%" stop-color="#008888"/>
      </radialGradient>
    </defs>
    <!-- Ground shadow (offset = flying high) -->
    <ellipse cx="36" cy="52" rx="12" ry="4" fill="#000" opacity="0.15"/>
    <!-- Wings (large, translucent) -->
    <ellipse cx="28" cy="18" rx="14" ry="8" fill="#55CCDD" opacity="0.35" stroke="#33AABB" stroke-width="0.5"/>
    <ellipse cx="28" cy="46" rx="14" ry="8" fill="#55CCDD" opacity="0.35" stroke="#33AABB" stroke-width="0.5"/>
    <!-- Wing veins -->
    <line x1="20" y1="14" x2="36" y2="20" stroke="#44BBCC" stroke-width="0.5" opacity="0.4"/>
    <line x1="20" y1="50" x2="36" y2="44" stroke="#44BBCC" stroke-width="0.5" opacity="0.4"/>
    <!-- Body (drone-like) -->
    <ellipse cx="32" cy="32" rx="12" ry="7" fill="#33AACC" stroke="#228899" stroke-width="1.5" filter="url(#flyerShadow)"/>
    <!-- Body detail -->
    <ellipse cx="32" cy="32" rx="8" ry="5" fill="#44BBDD"/>
    <!-- Segmentation -->
    <line x1="26" y1="26" x2="26" y2="38" stroke="#228899" stroke-width="0.5"/>
    <line x1="32" y1="25" x2="32" y2="39" stroke="#228899" stroke-width="0.5"/>
    <line x1="38" y1="26" x2="38" y2="38" stroke="#228899" stroke-width="0.5"/>
    <!-- Head -->
    <circle cx="44" cy="32" r="5" fill="#44CCDD" stroke="#228899" stroke-width="1"/>
    <!-- Eyes (glowing) -->
    <circle cx="46" cy="29" r="2.5" fill="url(#flyerEye)"/>
    <circle cx="46" cy="35" r="2.5" fill="url(#flyerEye)"/>
    <circle cx="47" cy="29" r="1" fill="#FFFFFF" opacity="0.8"/>
    <circle cx="47" cy="35" r="1" fill="#FFFFFF" opacity="0.8"/>
    <!-- Antennae -->
    <path d="M48,28 L54,22" stroke="#33AABB" stroke-width="1" stroke-linecap="round"/>
    <path d="M48,36 L54,42" stroke="#33AABB" stroke-width="1" stroke-linecap="round"/>
    <circle cx="54" cy="22" r="1" fill="#55DDEE"/>
    <circle cx="54" cy="42" r="1" fill="#55DDEE"/>
    <!-- Tail -->
    <path d="M20,32 L12,28 L10,32 L12,36 Z" fill="#33AACC" stroke="#228899" stroke-width="0.5"/>
  </svg>`,

  'enemy-swarm': `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
    <defs>
      <filter id="swarmShadow">
        <feDropShadow dx="1" dy="1" stdDeviation="1" flood-color="#000" flood-opacity="0.3"/>
      </filter>
    </defs>
    <!-- Shadow -->
    <ellipse cx="33" cy="46" rx="8" ry="3" fill="#000" opacity="0.2"/>
    <!-- Small bug body -->
    <ellipse cx="32" cy="32" rx="10" ry="8" fill="#CC4488" stroke="#AA2266" stroke-width="1.5" filter="url(#swarmShadow)"/>
    <!-- Body segments -->
    <ellipse cx="26" cy="32" rx="5" ry="6" fill="#BB3377"/>
    <ellipse cx="34" cy="32" rx="6" ry="7" fill="#CC4488"/>
    <!-- Legs (3 pairs, thin) -->
    <g stroke="#AA2266" stroke-width="1" stroke-linecap="round">
      <line x1="24" y1="26" x2="18" y2="20"/>
      <line x1="24" y1="38" x2="18" y2="44"/>
      <line x1="30" y1="25" x2="28" y2="18"/>
      <line x1="30" y1="39" x2="28" y2="46"/>
      <line x1="36" y1="26" x2="40" y2="20"/>
      <line x1="36" y1="38" x2="40" y2="44"/>
    </g>
    <!-- Wings (tiny) -->
    <ellipse cx="28" cy="24" rx="5" ry="3" fill="#FFAACC" opacity="0.3"/>
    <ellipse cx="28" cy="40" rx="5" ry="3" fill="#FFAACC" opacity="0.3"/>
    <!-- Head -->
    <circle cx="42" cy="32" r="4" fill="#DD5599" stroke="#AA2266" stroke-width="1"/>
    <!-- Eyes -->
    <circle cx="44" cy="30" r="1.5" fill="#FF88BB"/>
    <circle cx="44" cy="34" r="1.5" fill="#FF88BB"/>
    <circle cx="45" cy="30" r="0.6" fill="#440022"/>
    <circle cx="45" cy="34" r="0.6" fill="#440022"/>
    <!-- Antennae -->
    <path d="M45,29 L50,24" stroke="#AA2266" stroke-width="0.8"/>
    <path d="M45,35 L50,40" stroke="#AA2266" stroke-width="0.8"/>
    <!-- Highlight -->
    <ellipse cx="30" cy="28" rx="5" ry="2" fill="#EE66AA" opacity="0.3"/>
  </svg>`,
};

// ─── PROJECTILE ASSETS ───────────────────────────────────────────────

const projectiles = {
  'projectile-arrow': `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="8">
    <!-- Arrow shaft -->
    <rect x="2" y="3" width="16" height="2" fill="#8B6914" rx="0.5"/>
    <!-- Arrow head -->
    <polygon points="18,0 24,4 18,8" fill="#AAAAAA" stroke="#777777" stroke-width="0.5"/>
    <!-- Fletching -->
    <polygon points="0,1 6,3 6,4 0,4" fill="#CC3333" opacity="0.8"/>
    <polygon points="0,7 6,5 6,4 0,4" fill="#CC3333" opacity="0.8"/>
  </svg>`,

  'projectile-blast': `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16">
    <defs>
      <radialGradient id="blastGrad" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#FFFF88"/>
        <stop offset="40%" stop-color="#FFAA22"/>
        <stop offset="100%" stop-color="#FF440000"/>
      </radialGradient>
      <filter id="blastGlow">
        <feGaussianBlur stdDeviation="1" result="blur"/>
        <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>
    <circle cx="8" cy="8" r="7" fill="url(#blastGrad)" filter="url(#blastGlow)"/>
    <circle cx="8" cy="8" r="4" fill="#FFDD44" opacity="0.8"/>
    <circle cx="8" cy="8" r="2" fill="#FFFFFF" opacity="0.9"/>
  </svg>`,

  'projectile-missile': `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="10">
    <!-- Exhaust trail -->
    <ellipse cx="3" cy="5" rx="3" ry="2" fill="#FF6600" opacity="0.4"/>
    <ellipse cx="1" cy="5" rx="2" ry="1.5" fill="#FFAA00" opacity="0.3"/>
    <!-- Missile body -->
    <rect x="6" y="2" width="14" height="6" fill="#667788" rx="1"/>
    <!-- Nose cone -->
    <polygon points="20,1 24,5 20,9" fill="#FF4444" stroke="#CC2222" stroke-width="0.5"/>
    <!-- Body stripe -->
    <rect x="10" y="2" width="2" height="6" fill="#FF4444" opacity="0.7"/>
    <!-- Fins -->
    <polygon points="6,2 4,0 8,2" fill="#556677"/>
    <polygon points="6,8 4,10 8,8" fill="#556677"/>
    <!-- Highlight -->
    <rect x="8" y="2.5" width="10" height="1.5" fill="#8899AA" opacity="0.4" rx="0.5"/>
  </svg>`,
};

// ─── GENERATE ALL ASSETS ─────────────────────────────────────────────

async function generateAll() {
  const allAssets = { ...tiles, ...towers, ...enemies, ...projectiles };
  const total = Object.keys(allAssets).length;
  let count = 0;

  console.log(`Generating ${total} game assets...\n`);

  for (const [name, svg] of Object.entries(allAssets)) {
    const outPath = path.join(SPRITES_DIR, `${name}.png`);
    try {
      await sharp(Buffer.from(svg))
        .png()
        .toFile(outPath);
      count++;
      console.log(`  [${count}/${total}] ${name}.png`);
    } catch (err) {
      console.error(`  FAIL: ${name} - ${err.message}`);
    }
  }

  console.log(`\nDone! Generated ${count}/${total} assets in ${SPRITES_DIR}`);
}

generateAll().catch(console.error);
