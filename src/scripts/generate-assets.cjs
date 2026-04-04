/**
 * Asset Generation Script v3 — Complete redesign
 * Run: node src/scripts/generate-assets.cjs
 */
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const SPRITES_DIR = path.join(__dirname, '../../public/assets/sprites');
fs.mkdirSync(SPRITES_DIR, { recursive: true });

// ═══════════════════════════════════════════════════════════════════════
// GRASS TILES — 5 variants with VISIBLE differences
// ═══════════════════════════════════════════════════════════════════════

const grassVariants = [
  // 1: Rich green, dense grass
  `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
  <rect width="64" height="64" fill="#3B8C3F"/>
  <rect width="64" height="64" fill="#347D37" opacity="0.4"/>
  <g fill="#2D6E30" opacity="0.5"><rect x="0" y="0" width="32" height="32" rx="2"/></g>
  <g fill="#45A04A" opacity="0.3"><rect x="30" y="28" width="34" height="36" rx="2"/></g>
  <g stroke="#2A6B2E" stroke-width="1.5" stroke-linecap="round" opacity="0.5">
    <line x1="8" y1="14" x2="6" y2="6"/><line x1="10" y1="14" x2="13" y2="5"/>
    <line x1="28" y1="34" x2="26" y2="26"/><line x1="30" y1="34" x2="33" y2="25"/>
    <line x1="50" y1="20" x2="48" y2="12"/><line x1="52" y1="20" x2="55" y2="11"/>
    <line x1="18" y1="52" x2="16" y2="44"/><line x1="20" y1="52" x2="23" y2="43"/>
    <line x1="44" y1="50" x2="42" y2="42"/><line x1="46" y1="50" x2="49" y2="41"/>
  </g>
</svg>`,

  // 2: Lighter green with dry patches
  `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
  <rect width="64" height="64" fill="#4A9E4E"/>
  <rect x="0" y="0" width="64" height="32" fill="#52A856" opacity="0.4"/>
  <ellipse cx="40" cy="38" rx="18" ry="12" fill="#8B7A45" opacity="0.15"/>
  <ellipse cx="12" cy="14" rx="10" ry="8" fill="#8B7A45" opacity="0.1"/>
  <g stroke="#3A8E3E" stroke-width="1.3" stroke-linecap="round" opacity="0.45">
    <line x1="6" y1="30" x2="4" y2="22"/><line x1="8" y1="30" x2="11" y2="21"/>
    <line x1="54" y1="12" x2="52" y2="4"/><line x1="56" y1="12" x2="59" y2="3"/>
    <line x1="34" y1="56" x2="32" y2="48"/><line x1="36" y1="56" x2="39" y2="47"/>
    <line x1="20" y1="42" x2="18" y2="35"/><line x1="48" y1="44" x2="46" y2="36"/>
  </g>
</svg>`,

  // 3: Dark green, mossy with stones
  `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
  <rect width="64" height="64" fill="#2E7832"/>
  <rect x="28" y="0" width="36" height="64" fill="#368038" opacity="0.3"/>
  <circle cx="48" cy="44" r="4" fill="#6B6B60" opacity="0.4"/>
  <circle cx="50" cy="43" r="1.5" fill="#7A7A70" opacity="0.3"/>
  <circle cx="14" cy="52" r="3" fill="#6B6B60" opacity="0.35"/>
  <ellipse cx="30" cy="20" rx="8" ry="5" fill="#256828" opacity="0.4"/>
  <g stroke="#1E5E22" stroke-width="1.4" stroke-linecap="round" opacity="0.5">
    <line x1="10" y1="18" x2="8" y2="10"/><line x1="12" y1="18" x2="15" y2="9"/>
    <line x1="38" y1="40" x2="36" y2="32"/><line x1="40" y1="40" x2="43" y2="31"/>
    <line x1="56" y1="22" x2="54" y2="14"/><line x1="22" y1="58" x2="20" y2="50"/>
  </g>
</svg>`,

  // 4: Warm green with wildflowers
  `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
  <rect width="64" height="64" fill="#4AAA48"/>
  <rect x="0" y="30" width="64" height="34" fill="#42A040" opacity="0.3"/>
  <g stroke="#358838" stroke-width="1.3" stroke-linecap="round" opacity="0.5">
    <line x1="12" y1="24" x2="10" y2="16"/><line x1="14" y1="24" x2="17" y2="15"/>
    <line x1="42" y1="14" x2="40" y2="6"/><line x1="44" y1="14" x2="47" y2="5"/>
    <line x1="30" y1="48" x2="28" y2="40"/><line x1="32" y1="48" x2="35" y2="39"/>
    <line x1="54" y1="40" x2="52" y2="32"/><line x1="56" y1="40" x2="59" y2="31"/>
  </g>
  <circle cx="20" cy="18" r="2.5" fill="#E84040" opacity="0.7"/>
  <circle cx="20" cy="18" r="1" fill="#FF8080" opacity="0.8"/>
  <circle cx="48" cy="50" r="2.5" fill="#D8D040" opacity="0.65"/>
  <circle cx="48" cy="50" r="1" fill="#FFFF90" opacity="0.8"/>
  <circle cx="36" cy="32" r="2" fill="#8060D0" opacity="0.5"/>
  <circle cx="36" cy="32" r="0.8" fill="#C0A0FF" opacity="0.7"/>
</svg>`,

  // 5: Blue-green, cooler tone
  `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
  <rect width="64" height="64" fill="#3A8A50"/>
  <rect x="0" y="0" width="34" height="64" fill="#329048" opacity="0.35"/>
  <ellipse cx="44" cy="16" rx="14" ry="10" fill="#2A7A42" opacity="0.3"/>
  <ellipse cx="16" cy="48" rx="12" ry="8" fill="#2A7A42" opacity="0.25"/>
  <g stroke="#286E3A" stroke-width="1.4" stroke-linecap="round" opacity="0.5">
    <line x1="8" y1="20" x2="6" y2="12"/><line x1="10" y1="20" x2="13" y2="11"/>
    <line x1="34" y1="10" x2="32" y2="2"/><line x1="36" y1="10" x2="39" y2="1"/>
    <line x1="52" y1="36" x2="50" y2="28"/><line x1="54" y1="36" x2="57" y2="27"/>
    <line x1="24" y1="54" x2="22" y2="46"/><line x1="26" y1="54" x2="29" y2="45"/>
    <line x1="44" y1="56" x2="42" y2="48"/><line x1="46" y1="56" x2="49" y2="47"/>
  </g>
</svg>`,
];

// ═══════════════════════════════════════════════════════════════════════
// BLOCKED TILES — 3 variants (kept from v2, those were fine)
// ═══════════════════════════════════════════════════════════════════════

const blockedVariants = [
  `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><defs><radialGradient id="bk1" cx="40%" cy="40%" r="60%"><stop offset="0%" stop-color="#5C5C5C"/><stop offset="100%" stop-color="#333333"/></radialGradient><filter id="bn1"><feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="5" seed="42"/><feColorMatrix type="saturate" values="0"/><feBlend in="SourceGraphic" mode="overlay"/></filter><filter id="bs1"><feDropShadow dx="1" dy="1" stdDeviation="1.5" flood-color="#000" flood-opacity="0.3"/></filter></defs><rect width="64" height="64" fill="url(#bk1)"/><rect width="64" height="64" fill="#444" filter="url(#bn1)" opacity="0.4"/><polygon points="8,48 4,32 14,18 28,14 36,20 38,36 30,50" fill="#5A5A5A" stroke="#404040" stroke-width="1" filter="url(#bs1)"/><polygon points="14,20 28,16 34,22 28,28 16,26" fill="#686868" opacity="0.5"/><polygon points="36,52 42,36 56,32 60,44 54,56" fill="#4E4E4E" stroke="#3A3A3A" stroke-width="0.8"/><polygon points="52,8 44,22 60,22" fill="#2D5A2D" opacity="0.85"/><polygon points="52,14 46,24 58,24" fill="#337733" opacity="0.7"/><rect x="50.5" y="22" width="3" height="5" fill="#5C3D20"/><circle cx="20" cy="54" r="2" fill="#4A4A4A"/><ellipse cx="12" cy="40" rx="4" ry="2" fill="#3D6B3D" opacity="0.35"/></svg>`,
  `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><defs><radialGradient id="bk2" cx="50%" cy="50%" r="60%"><stop offset="0%" stop-color="#525252"/><stop offset="100%" stop-color="#2E2E2E"/></radialGradient><filter id="bn2"><feTurbulence type="fractalNoise" baseFrequency="0.08" numOctaves="4" seed="77"/><feColorMatrix type="saturate" values="0"/><feBlend in="SourceGraphic" mode="overlay"/></filter><filter id="bs2"><feDropShadow dx="1" dy="1" stdDeviation="1" flood-color="#000" flood-opacity="0.35"/></filter></defs><rect width="64" height="64" fill="url(#bk2)"/><rect width="64" height="64" fill="#3A3A3A" filter="url(#bn2)" opacity="0.45"/><ellipse cx="18" cy="20" rx="12" ry="10" fill="#555" stroke="#3E3E3E" stroke-width="1" filter="url(#bs2)"/><ellipse cx="16" cy="18" rx="8" ry="6" fill="#626262" opacity="0.5"/><ellipse cx="46" cy="16" rx="10" ry="8" fill="#4E4E4E" stroke="#3A3A3A" stroke-width="0.8" filter="url(#bs2)"/><ellipse cx="36" cy="42" rx="14" ry="11" fill="#505050" stroke="#3C3C3C" stroke-width="1" filter="url(#bs2)"/><ellipse cx="12" cy="52" rx="8" ry="6" fill="#4A4A4A" stroke="#383838" stroke-width="0.8"/><path d="M22,24 L28,30 L26,36" fill="none" stroke="#2A2A2A" stroke-width="0.8" opacity="0.6"/><circle cx="56" cy="38" r="1.5" fill="#484848"/><circle cx="54" cy="54" r="2" fill="#444"/></svg>`,
  `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><defs><radialGradient id="bk3" cx="45%" cy="45%" r="55%"><stop offset="0%" stop-color="#4F4F4F"/><stop offset="100%" stop-color="#303030"/></radialGradient><filter id="bn3"><feTurbulence type="fractalNoise" baseFrequency="0.1" numOctaves="4" seed="99"/><feColorMatrix type="saturate" values="0"/><feBlend in="SourceGraphic" mode="overlay"/></filter></defs><rect width="64" height="64" fill="url(#bk3)"/><rect width="64" height="64" fill="#3E3E3E" filter="url(#bn3)" opacity="0.4"/><polygon points="0,40 8,28 24,22 40,26 48,34 48,48 32,54 8,52 0,48" fill="#525252" stroke="#3C3C3C" stroke-width="1"/><polygon points="4,38 12,30 26,24 38,28 44,34 40,40 24,42 8,42" fill="#5C5C5C" opacity="0.5"/><polygon points="38,8 52,4 62,12 58,24 44,22" fill="#4A4A4A" stroke="#383838" stroke-width="0.8"/><g stroke="#6B5030" stroke-width="1.2" stroke-linecap="round" opacity="0.7"><line x1="54" y1="40" x2="50" y2="32"/><line x1="54" y1="40" x2="58" y2="30"/><line x1="54" y1="40" x2="56" y2="34"/><line x1="50" y1="32" x2="46" y2="28"/><line x1="58" y1="30" x2="60" y2="24"/><line x1="54" y1="40" x2="54" y2="48"/></g><ellipse cx="20" cy="48" rx="6" ry="2" fill="#4A3A2A" opacity="0.25"/></svg>`,
];

// ═══════════════════════════════════════════════════════════════════════
// PATH TILE
// ═══════════════════════════════════════════════════════════════════════

const pathTile = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
  <defs><linearGradient id="pB" x1="0" y1="0" x2="0.7" y2="1"><stop offset="0%" stop-color="#C9A96E"/><stop offset="50%" stop-color="#B8935A"/><stop offset="100%" stop-color="#A07840"/></linearGradient><filter id="pN"><feTurbulence type="fractalNoise" baseFrequency="0.12" numOctaves="5" seed="3"/><feColorMatrix type="saturate" values="0"/><feBlend in="SourceGraphic" mode="multiply"/></filter></defs>
  <rect width="64" height="64" fill="url(#pB)"/><rect width="64" height="64" fill="url(#pB)" filter="url(#pN)" opacity="0.25"/>
  <ellipse cx="20" cy="18" rx="10" ry="4" fill="#BFA060" opacity="0.25"/><ellipse cx="44" cy="44" rx="12" ry="5" fill="#C4A868" opacity="0.2"/>
  <circle cx="12" cy="30" r="2" fill="#8B7340" opacity="0.5"/><circle cx="48" cy="18" r="1.5" fill="#7A6535" opacity="0.45"/>
  <circle cx="36" cy="52" r="2" fill="#806830" opacity="0.4"/><circle cx="52" cy="40" r="1.2" fill="#7A6535" opacity="0.35"/>
  <rect x="0" y="0" width="64" height="2" fill="#7A6030" opacity="0.1"/><rect x="0" y="62" width="64" height="2" fill="#7A6030" opacity="0.1"/>
</svg>`;

// ═══════════════════════════════════════════════════════════════════════
// SPAWN PORTAL & OBJECTIVE (kept from v2)
// ═══════════════════════════════════════════════════════════════════════

const spawnTile = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><defs><radialGradient id="spG" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#FF8C00"/><stop offset="35%" stop-color="#FF5500"/><stop offset="70%" stop-color="#CC2200"/><stop offset="100%" stop-color="#220500"/></radialGradient><radialGradient id="spC" cx="50%" cy="50%" r="35%"><stop offset="0%" stop-color="#FFCC44"/><stop offset="50%" stop-color="#FF8800"/><stop offset="100%" stop-color="#FF440000"/></radialGradient><filter id="spGl"><feGaussianBlur stdDeviation="2.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter><filter id="spGl2"><feGaussianBlur stdDeviation="1.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><rect width="64" height="64" fill="#180800"/><rect width="64" height="64" fill="url(#spG)" opacity="0.9"/><circle cx="32" cy="32" r="26" fill="none" stroke="#FF6622" stroke-width="2" opacity="0.3" filter="url(#spGl)"/><circle cx="32" cy="32" r="24" fill="none" stroke="#553320" stroke-width="4" opacity="0.7"/><circle cx="32" cy="32" r="24" fill="none" stroke="#774430" stroke-width="2" opacity="0.5"/><circle cx="32" cy="8" r="2" fill="#FF8844" opacity="0.5" filter="url(#spGl2)"/><circle cx="56" cy="32" r="2" fill="#FF8844" opacity="0.5" filter="url(#spGl2)"/><circle cx="32" cy="56" r="2" fill="#FF8844" opacity="0.5" filter="url(#spGl2)"/><circle cx="8" cy="32" r="2" fill="#FF8844" opacity="0.5" filter="url(#spGl2)"/><circle cx="32" cy="32" r="18" fill="url(#spC)" opacity="0.85"/><path d="M32,14 C44,20 44,32 32,32 C20,32 20,44 32,50" fill="none" stroke="#FFBB44" stroke-width="1.5" opacity="0.35" filter="url(#spGl2)"/><path d="M14,32 C20,20 32,20 32,32 C32,44 44,44 50,32" fill="none" stroke="#FFBB44" stroke-width="1.5" opacity="0.35" filter="url(#spGl2)"/><circle cx="32" cy="32" r="6" fill="#FFCC44" opacity="0.7" filter="url(#spGl)"/><circle cx="32" cy="32" r="3" fill="#FFEEAA" opacity="0.85"/><circle cx="32" cy="32" r="1.2" fill="#FFFFFF" opacity="0.95"/><circle cx="22" cy="18" r="1" fill="#FF8800" opacity="0.6" filter="url(#spGl2)"/><circle cx="44" cy="22" r="0.8" fill="#FFAA00" opacity="0.5" filter="url(#spGl2)"/><circle cx="40" cy="46" r="1.2" fill="#FF6600" opacity="0.5" filter="url(#spGl2)"/></svg>`;

const objectiveTile = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><defs><radialGradient id="obG" cx="50%" cy="50%" r="55%"><stop offset="0%" stop-color="#6A5ACD"/><stop offset="50%" stop-color="#3E348A"/><stop offset="100%" stop-color="#14102E"/></radialGradient><filter id="obGl"><feGaussianBlur stdDeviation="1.8" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter><filter id="obSh"><feDropShadow dx="1" dy="1" stdDeviation="1.5" flood-color="#000" flood-opacity="0.4"/></filter><linearGradient id="obW" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#7A6CB8"/><stop offset="100%" stop-color="#4A3E80"/></linearGradient></defs><rect width="64" height="64" fill="#14102E"/><rect width="64" height="64" fill="url(#obG)" opacity="0.8"/><rect x="12" y="22" width="40" height="28" fill="url(#obW)" rx="2" filter="url(#obSh)"/><line x1="14" y1="30" x2="50" y2="30" stroke="#3E348A" stroke-width="0.5" opacity="0.5"/><line x1="14" y1="38" x2="50" y2="38" stroke="#3E348A" stroke-width="0.5" opacity="0.5"/><rect x="8" y="14" width="12" height="22" fill="#6A5AB0" rx="1" filter="url(#obSh)"/><rect x="8" y="12" width="4" height="5" fill="#7A6CB8"/><rect x="12" y="12" width="4" height="5" fill="#7A6CB8"/><rect x="16" y="12" width="4" height="5" fill="#7A6CB8"/><rect x="44" y="14" width="12" height="22" fill="#6A5AB0" rx="1" filter="url(#obSh)"/><rect x="44" y="12" width="4" height="5" fill="#7A6CB8"/><rect x="48" y="12" width="4" height="5" fill="#7A6CB8"/><rect x="52" y="12" width="4" height="5" fill="#7A6CB8"/><rect x="20" y="18" width="5" height="5" fill="#7A6CB8"/><rect x="27" y="18" width="5" height="5" fill="#7A6CB8"/><rect x="34" y="18" width="5" height="5" fill="#7A6CB8"/><path d="M26,50 L26,36 Q26,30 32,30 Q38,30 38,36 L38,50 Z" fill="#1A1040"/><path d="M28,50 L28,37 Q28,32 32,32 Q36,32 36,37 L36,50 Z" fill="#241858"/><polygon points="32,2 27,12 37,12" fill="#A888FF" filter="url(#obGl)"/><polygon points="32,4 29,12 35,12" fill="#C8B8FF" opacity="0.7"/><circle cx="32" cy="8" r="5" fill="#A888FF" opacity="0.2" filter="url(#obGl)"/><circle cx="32" cy="8" r="2" fill="#DDCCFF" opacity="0.5"/><path d="M32,25 L29,28 L32,32 L35,28 Z" fill="#9888CC" stroke="#B8A8E8" stroke-width="0.6"/><ellipse cx="32" cy="52" rx="20" ry="4" fill="#6A5ACD" opacity="0.15" filter="url(#obGl)"/></svg>`;

// ═══════════════════════════════════════════════════════════════════════
// TOWERS — Redesigned with actual building perspective, not flat stickers
// ═══════════════════════════════════════════════════════════════════════

const towers = {
  // Arrow Tower: stone base with wooden turret, visible arrow slit
  'tower-ranged': `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
  <defs><filter id="sh1"><feDropShadow dx="2" dy="3" stdDeviation="2" flood-color="#000" flood-opacity="0.5"/></filter></defs>
  <ellipse cx="34" cy="52" rx="20" ry="6" fill="#000" opacity="0.25"/>
  <!-- Stone base walls -->
  <rect x="10" y="20" width="44" height="32" fill="#8A7A60" stroke="#6A5A40" stroke-width="2" rx="3" filter="url(#sh1)"/>
  <rect x="14" y="24" width="36" height="24" fill="#9A8A70" rx="2"/>
  <!-- Brick lines -->
  <line x1="14" y1="32" x2="50" y2="32" stroke="#7A6A50" stroke-width="0.8"/><line x1="14" y1="40" x2="50" y2="40" stroke="#7A6A50" stroke-width="0.8"/>
  <line x1="32" y1="24" x2="32" y2="48" stroke="#7A6A50" stroke-width="0.6" opacity="0.5"/>
  <!-- Top platform -->
  <rect x="8" y="16" width="48" height="8" fill="#7A6A50" stroke="#5A4A30" stroke-width="1.5" rx="2"/>
  <!-- Crenellations -->
  <rect x="8" y="12" width="8" height="6" fill="#8A7A60" stroke="#5A4A30" stroke-width="1"/><rect x="20" y="12" width="8" height="6" fill="#8A7A60" stroke="#5A4A30" stroke-width="1"/><rect x="36" y="12" width="8" height="6" fill="#8A7A60" stroke="#5A4A30" stroke-width="1"/><rect x="48" y="12" width="8" height="6" fill="#8A7A60" stroke="#5A4A30" stroke-width="1"/>
  <!-- Wooden crossbow on top -->
  <rect x="26" y="6" width="12" height="8" fill="#6B4D30" stroke="#4A3018" stroke-width="1" rx="1"/>
  <line x1="32" y1="4" x2="32" y2="14" stroke="#5C3D20" stroke-width="2"/>
  <line x1="26" y1="10" x2="38" y2="10" stroke="#5C3D20" stroke-width="2"/>
  <!-- Arrow slit -->
  <rect x="29" y="28" width="6" height="14" fill="#2A2018" rx="1"/><rect x="26" y="34" width="12" height="2" fill="#2A2018"/>
</svg>`,

  // Sniper Tower: tall narrow stone tower with blue lens on top
  'tower-focused': `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
  <defs><filter id="sh2"><feDropShadow dx="2" dy="3" stdDeviation="2" flood-color="#000" flood-opacity="0.5"/></filter>
  <filter id="gl2"><feGaussianBlur stdDeviation="2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
  <ellipse cx="34" cy="54" rx="16" ry="5" fill="#000" opacity="0.25"/>
  <!-- Tall narrow base -->
  <rect x="18" y="14" width="28" height="40" fill="#6A6A7A" stroke="#4A4A5A" stroke-width="2" rx="2" filter="url(#sh2)"/>
  <rect x="22" y="18" width="20" height="32" fill="#7A7A8A" rx="1"/>
  <!-- Stone detail -->
  <line x1="22" y1="26" x2="42" y2="26" stroke="#5A5A6A" stroke-width="0.7"/><line x1="22" y1="34" x2="42" y2="34" stroke="#5A5A6A" stroke-width="0.7"/><line x1="22" y1="42" x2="42" y2="42" stroke="#5A5A6A" stroke-width="0.7"/>
  <!-- Scope platform on top -->
  <rect x="16" y="10" width="32" height="6" fill="#5A5A6A" stroke="#3A3A4A" stroke-width="1.5" rx="2"/>
  <!-- Scope/lens assembly -->
  <rect x="26" y="2" width="12" height="10" fill="#4A4A5A" stroke="#3A3A4A" stroke-width="1" rx="2"/>
  <circle cx="32" cy="6" r="5" fill="#0088CC" opacity="0.8" filter="url(#gl2)"/>
  <circle cx="32" cy="6" r="3" fill="#00BBFF" opacity="0.6"/>
  <circle cx="32" cy="6" r="1.2" fill="#FFFFFF" opacity="0.8"/>
  <!-- Window slit -->
  <rect x="30" y="28" width="4" height="8" fill="#1A1A2A" rx="0.5"/>
</svg>`,

  // Broadcast Tower: crystal spire on stone platform, green energy
  'tower-broadcast': `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
  <defs><filter id="sh3"><feDropShadow dx="2" dy="3" stdDeviation="2" flood-color="#000" flood-opacity="0.4"/></filter>
  <filter id="gl3"><feGaussianBlur stdDeviation="2.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
  <ellipse cx="34" cy="54" rx="18" ry="5" fill="#000" opacity="0.2"/>
  <!-- Hexagonal stone base -->
  <polygon points="32,22 50,30 50,46 32,54 14,46 14,30" fill="#506068" stroke="#384048" stroke-width="2" filter="url(#sh3)"/>
  <polygon points="32,26 46,32 46,44 32,50 18,44 18,32" fill="#5A6A72"/>
  <!-- Energy rings -->
  <circle cx="32" cy="38" r="22" fill="none" stroke="#44FFAA" stroke-width="1" opacity="0.12"/>
  <circle cx="32" cy="38" r="18" fill="none" stroke="#44FFAA" stroke-width="1" opacity="0.18"/>
  <circle cx="32" cy="38" r="14" fill="none" stroke="#44FFAA" stroke-width="1" opacity="0.25"/>
  <!-- Crystal spire -->
  <polygon points="32,2 24,26 40,26" fill="#22CC88" stroke="#1AA070" stroke-width="1" filter="url(#gl3)"/>
  <polygon points="32,6 28,26 36,26" fill="#44EEBB" opacity="0.5"/>
  <!-- Crystal glow -->
  <circle cx="32" cy="16" r="6" fill="#44FFAA" opacity="0.2" filter="url(#gl3)"/>
  <circle cx="32" cy="16" r="2" fill="#AAFFDD" opacity="0.7"/>
  <!-- Base glow -->
  <ellipse cx="32" cy="38" rx="8" ry="4" fill="#44FFAA" opacity="0.15" filter="url(#gl3)"/>
</svg>`,

  // Anti-Air Tower: military bunker with missile rack
  'tower-antiair': `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
  <defs><filter id="sh4"><feDropShadow dx="2" dy="3" stdDeviation="2" flood-color="#000" flood-opacity="0.5"/></filter>
  <filter id="gl4"><feGaussianBlur stdDeviation="1.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
  <ellipse cx="34" cy="54" rx="18" ry="5" fill="#000" opacity="0.25"/>
  <!-- Concrete bunker base -->
  <rect x="10" y="26" width="44" height="28" fill="#5A6570" stroke="#404A55" stroke-width="2" rx="4" filter="url(#sh4)"/>
  <rect x="14" y="30" width="36" height="20" fill="#6A7580" rx="2"/>
  <!-- Metal top plate -->
  <rect x="8" y="22" width="48" height="8" fill="#4A5560" stroke="#354050" stroke-width="1.5" rx="3"/>
  <!-- Missile rack (4 missiles) -->
  <rect x="14" y="6" width="36" height="18" fill="#4A5560" stroke="#354050" stroke-width="1" rx="2"/>
  <!-- Missiles -->
  <rect x="16" y="8" width="6" height="14" fill="#667788" rx="2"/><polygon points="19,8 16,4 22,4" fill="#DD3333"/>
  <rect x="24" y="8" width="6" height="14" fill="#667788" rx="2"/><polygon points="27,8 24,4 30,4" fill="#DD3333"/>
  <rect x="32" y="8" width="6" height="14" fill="#667788" rx="2"/><polygon points="35,8 32,4 38,4" fill="#DD3333"/>
  <rect x="40" y="8" width="6" height="14" fill="#667788" rx="2"/><polygon points="43,8 40,4 46,4" fill="#DD3333"/>
  <!-- Red LED -->
  <circle cx="32" cy="38" r="3" fill="#FF2222" opacity="0.8" filter="url(#gl4)"/>
  <circle cx="32" cy="38" r="1.5" fill="#FF8888"/>
  <!-- Slit window -->
  <rect x="22" y="34" width="20" height="3" fill="#1A2530" rx="1"/>
</svg>`,
};

// ═══════════════════════════════════════════════════════════════════════
// ENEMIES — Completely new designs: goblin, golem, wolf, drone, spiders
// ═══════════════════════════════════════════════════════════════════════

const enemies = {
  // Runner: Green goblin soldier, running right
  'enemy-runner': `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
  <defs><filter id="es1"><feDropShadow dx="1" dy="2" stdDeviation="1.5" flood-color="#000" flood-opacity="0.3"/></filter></defs>
  <ellipse cx="32" cy="56" rx="12" ry="4" fill="#000" opacity="0.2"/>
  <!-- Body -->
  <ellipse cx="30" cy="36" rx="10" ry="12" fill="#4A8A30" stroke="#2A6A18" stroke-width="1.5" filter="url(#es1)"/>
  <!-- Leather vest -->
  <ellipse cx="30" cy="36" rx="8" ry="10" fill="#6A5030" opacity="0.5"/>
  <line x1="30" y1="26" x2="30" y2="46" stroke="#5A4020" stroke-width="1"/>
  <!-- Head (big for goblin) -->
  <circle cx="36" cy="20" r="10" fill="#5AAA38" stroke="#3A8A20" stroke-width="1.2" filter="url(#es1)"/>
  <!-- Pointed ears -->
  <polygon points="28,14 22,8 26,16" fill="#5AAA38" stroke="#3A8A20" stroke-width="0.8"/>
  <polygon points="44,14 50,8 42,16" fill="#5AAA38" stroke="#3A8A20" stroke-width="0.8"/>
  <!-- Eyes (menacing) -->
  <ellipse cx="38" cy="18" rx="3" ry="2" fill="#FFEE00"/><circle cx="39" cy="18" r="1" fill="#880000"/>
  <ellipse cx="33" cy="18" rx="2.5" ry="1.8" fill="#FFEE00"/><circle cx="34" cy="18" r="0.8" fill="#880000"/>
  <!-- Grin -->
  <path d="M33,24 Q37,27 41,24" fill="none" stroke="#2A6A18" stroke-width="1"/>
  <!-- Legs (running) -->
  <line x1="26" y1="46" x2="18" y2="54" stroke="#4A8A30" stroke-width="3" stroke-linecap="round"/>
  <line x1="34" y1="46" x2="42" y2="52" stroke="#4A8A30" stroke-width="3" stroke-linecap="round"/>
  <!-- Arms -->
  <line x1="24" y1="32" x2="16" y2="26" stroke="#4A8A30" stroke-width="2.5" stroke-linecap="round"/>
  <line x1="36" y1="32" x2="46" y2="28" stroke="#4A8A30" stroke-width="2.5" stroke-linecap="round"/>
  <!-- Small sword in hand -->
  <line x1="46" y1="28" x2="54" y2="20" stroke="#AAAAAA" stroke-width="2" stroke-linecap="round"/>
  <line x1="54" y1="20" x2="56" y2="18" stroke="#CCCCCC" stroke-width="1"/>
</svg>`,

  // Tank: Stone golem, heavy and armored
  'enemy-tank': `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
  <defs><filter id="es2"><feDropShadow dx="1" dy="2" stdDeviation="2" flood-color="#000" flood-opacity="0.35"/></filter></defs>
  <ellipse cx="32" cy="56" rx="18" ry="5" fill="#000" opacity="0.25"/>
  <!-- Massive body -->
  <rect x="12" y="18" width="40" height="36" fill="#706860" stroke="#504840" stroke-width="2" rx="6" filter="url(#es2)"/>
  <!-- Stone cracks/texture -->
  <path d="M20,24 L28,30 L24,38" fill="none" stroke="#504840" stroke-width="1" opacity="0.5"/>
  <path d="M40,22 L44,32 L38,40" fill="none" stroke="#504840" stroke-width="0.8" opacity="0.4"/>
  <!-- Shoulder boulders -->
  <ellipse cx="14" cy="26" rx="8" ry="6" fill="#686058" stroke="#484038" stroke-width="1.5"/>
  <ellipse cx="50" cy="26" rx="8" ry="6" fill="#686058" stroke="#484038" stroke-width="1.5"/>
  <!-- Head (small, embedded) -->
  <rect x="24" y="8" width="16" height="14" fill="#787068" stroke="#504840" stroke-width="1.5" rx="3"/>
  <!-- Glowing eyes -->
  <circle cx="28" cy="14" r="2.5" fill="#FF6600" opacity="0.9"/>
  <circle cx="36" cy="14" r="2.5" fill="#FF6600" opacity="0.9"/>
  <circle cx="28" cy="14" r="1" fill="#FFCC00"/><circle cx="36" cy="14" r="1" fill="#FFCC00"/>
  <!-- Mouth -->
  <line x1="28" y1="19" x2="36" y2="19" stroke="#3A3028" stroke-width="2"/>
  <!-- Arms (thick, rocky) -->
  <rect x="2" y="28" width="12" height="8" fill="#686058" stroke="#484038" stroke-width="1" rx="3"/>
  <rect x="50" y="28" width="12" height="8" fill="#686058" stroke="#484038" stroke-width="1" rx="3"/>
  <!-- Fist rocks -->
  <circle cx="4" cy="32" r="4" fill="#605850" stroke="#484038" stroke-width="1"/>
  <circle cx="60" cy="32" r="4" fill="#605850" stroke="#484038" stroke-width="1"/>
  <!-- Legs -->
  <rect x="16" y="50" width="10" height="8" fill="#605850" stroke="#484038" stroke-width="1" rx="2"/>
  <rect x="38" y="50" width="10" height="8" fill="#605850" stroke="#484038" stroke-width="1" rx="2"/>
  <!-- Rune glow on chest -->
  <path d="M28,30 L32,26 L36,30 L32,38 Z" fill="none" stroke="#FF8844" stroke-width="1.2" opacity="0.6"/>
</svg>`,

  // Fast: Sleek wolf, running fast
  'enemy-fast': `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
  <defs><filter id="es3"><feDropShadow dx="1" dy="1" stdDeviation="1.5" flood-color="#000" flood-opacity="0.25"/></filter></defs>
  <ellipse cx="32" cy="54" rx="14" ry="4" fill="#000" opacity="0.15"/>
  <!-- Speed lines -->
  <line x1="0" y1="28" x2="8" y2="28" stroke="#888" stroke-width="0.8" opacity="0.3"/>
  <line x1="2" y1="34" x2="12" y2="34" stroke="#888" stroke-width="1" opacity="0.35"/>
  <line x1="0" y1="40" x2="8" y2="40" stroke="#888" stroke-width="0.8" opacity="0.3"/>
  <!-- Body (sleek, wolf-like) -->
  <ellipse cx="28" cy="34" rx="16" ry="9" fill="#666666" stroke="#444444" stroke-width="1.2" filter="url(#es3)"/>
  <!-- Lighter belly -->
  <ellipse cx="28" cy="38" rx="12" ry="4" fill="#888888" opacity="0.4"/>
  <!-- Head (pointed, wolf) -->
  <path d="M40,28 L56,24 L54,34 L40,36 Z" fill="#707070" stroke="#505050" stroke-width="1"/>
  <!-- Snout -->
  <path d="M54,28 L62,30 L54,32 Z" fill="#606060" stroke="#444" stroke-width="0.5"/>
  <!-- Ears (pointed) -->
  <polygon points="44,26 40,16 46,22" fill="#707070" stroke="#505050" stroke-width="0.8"/>
  <polygon points="48,24 46,14 50,20" fill="#707070" stroke="#505050" stroke-width="0.8"/>
  <!-- Eye -->
  <circle cx="52" cy="28" r="2" fill="#FFCC00"/><circle cx="53" cy="28" r="0.8" fill="#441100"/>
  <!-- Legs (running, stretched) -->
  <line x1="18" y1="42" x2="8" y2="52" stroke="#555" stroke-width="2.5" stroke-linecap="round"/>
  <line x1="22" y1="42" x2="14" y2="48" stroke="#555" stroke-width="2.5" stroke-linecap="round"/>
  <line x1="36" y1="42" x2="44" y2="52" stroke="#555" stroke-width="2.5" stroke-linecap="round"/>
  <line x1="38" y1="42" x2="50" y2="48" stroke="#555" stroke-width="2.5" stroke-linecap="round"/>
  <!-- Tail -->
  <path d="M12,30 Q6,24 4,28 Q6,34 12,34" fill="#606060" stroke="#444" stroke-width="0.8"/>
</svg>`,

  // Flyer: Military drone (matches "Sky Drone" name)
  'enemy-flyer': `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
  <defs><filter id="es4"><feDropShadow dx="2" dy="4" stdDeviation="2.5" flood-color="#000" flood-opacity="0.2"/></filter>
  <filter id="gl5"><feGaussianBlur stdDeviation="1.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
  <!-- Far ground shadow (altitude) -->
  <ellipse cx="36" cy="58" rx="10" ry="3" fill="#000" opacity="0.1"/>
  <!-- Drone body (angular, military) -->
  <path d="M20,28 L44,24 L50,32 L44,40 L20,36 Z" fill="#4A5A6A" stroke="#2A3A4A" stroke-width="1.5" filter="url(#es4)"/>
  <!-- Body highlight -->
  <path d="M22,29 L42,26 L46,32 L42,34 L22,34 Z" fill="#5A6A7A" opacity="0.5"/>
  <!-- Wings (swept back) -->
  <polygon points="28,28 10,12 18,28" fill="#3A4A5A" stroke="#2A3A4A" stroke-width="1"/>
  <polygon points="28,36 10,52 18,36" fill="#3A4A5A" stroke="#2A3A4A" stroke-width="1"/>
  <!-- Wing markings -->
  <line x1="14" y1="16" x2="22" y2="28" stroke="#FF3333" stroke-width="1.5" opacity="0.6"/>
  <line x1="14" y1="48" x2="22" y2="36" stroke="#FF3333" stroke-width="1.5" opacity="0.6"/>
  <!-- Nose -->
  <polygon points="50,32 58,30 58,34" fill="#3A4A5A" stroke="#2A3A4A" stroke-width="0.8"/>
  <!-- Sensor eye (front) -->
  <circle cx="52" cy="32" r="3" fill="#00AAFF" opacity="0.8" filter="url(#gl5)"/>
  <circle cx="52" cy="32" r="1.5" fill="#88DDFF"/>
  <!-- Propeller discs -->
  <ellipse cx="24" cy="24" rx="6" ry="2" fill="#8899AA" opacity="0.4" transform="rotate(-10,24,24)"/>
  <ellipse cx="24" cy="40" rx="6" ry="2" fill="#8899AA" opacity="0.4" transform="rotate(10,24,40)"/>
  <!-- Tail -->
  <rect x="12" y="30" width="10" height="4" fill="#3A4A5A" rx="1"/>
  <polygon points="12,28 8,26 8,38 12,36" fill="#3A4A5A"/>
</svg>`,

  // Swarm: Small spiderlings
  'enemy-swarm': `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
  <defs><filter id="es5"><feDropShadow dx="0.5" dy="1" stdDeviation="1" flood-color="#000" flood-opacity="0.25"/></filter></defs>
  <ellipse cx="32" cy="50" rx="10" ry="3" fill="#000" opacity="0.15"/>
  <!-- Spider body -->
  <ellipse cx="28" cy="32" rx="6" ry="5" fill="#2A2A2A" filter="url(#es5)"/>
  <circle cx="36" cy="32" r="5" fill="#333333" stroke="#1A1A1A" stroke-width="1" filter="url(#es5)"/>
  <!-- Red hourglass marking -->
  <path d="M27,30 L29,32 L27,34" fill="#CC0000" opacity="0.8"/>
  <!-- 8 legs -->
  <g stroke="#222" stroke-width="1.3" stroke-linecap="round" fill="none">
    <path d="M24,28 L16,18 L12,16"/><path d="M24,36 L16,46 L12,48"/>
    <path d="M26,27 L22,16 L20,12"/><path d="M26,37 L22,48 L20,52"/>
    <path d="M34,28 L40,18 L44,16"/><path d="M34,36 L40,46 L44,48"/>
    <path d="M36,27 L42,20 L46,18"/><path d="M36,37 L42,44 L46,46"/>
  </g>
  <!-- Eyes (cluster) -->
  <circle cx="38" cy="29" r="1.5" fill="#FF0000" opacity="0.8"/>
  <circle cx="40" cy="31" r="1.2" fill="#FF0000" opacity="0.7"/>
  <circle cx="38" cy="33" r="1.5" fill="#FF0000" opacity="0.8"/>
  <circle cx="40" cy="29" r="0.8" fill="#FF4444" opacity="0.6"/>
  <!-- Fangs -->
  <line x1="40" y1="31" x2="44" y2="29" stroke="#888" stroke-width="1" stroke-linecap="round"/>
  <line x1="40" y1="33" x2="44" y2="35" stroke="#888" stroke-width="1" stroke-linecap="round"/>
</svg>`,

  // BOLT-017: Shielded Unit -- cyan/blue armored figure with energy shield bubble
  'enemy-shielded': `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
  <defs>
    <filter id="es6"><feDropShadow dx="1" dy="2" stdDeviation="1.5" flood-color="#000" flood-opacity="0.3"/></filter>
    <radialGradient id="shield-glow" cx="50%" cy="50%" r="60%">
      <stop offset="0%" stop-color="#44CCFF" stop-opacity="0.05"/>
      <stop offset="60%" stop-color="#44CCFF" stop-opacity="0.15"/>
      <stop offset="100%" stop-color="#44CCFF" stop-opacity="0.3"/>
    </radialGradient>
  </defs>
  <ellipse cx="32" cy="56" rx="14" ry="4" fill="#000" opacity="0.2"/>
  <!-- Shield bubble (outer) -->
  <ellipse cx="32" cy="32" rx="26" ry="24" fill="url(#shield-glow)" stroke="#44CCFF" stroke-width="1.5" stroke-opacity="0.5"/>
  <!-- Body -->
  <rect x="24" y="18" width="16" height="28" rx="4" fill="#4477AA" filter="url(#es6)"/>
  <rect x="26" y="20" width="12" height="10" fill="#5588BB" opacity="0.5" rx="2"/>
  <!-- Helmet -->
  <rect x="22" y="10" width="20" height="14" rx="5" fill="#336699" filter="url(#es6)"/>
  <rect x="26" y="14" width="12" height="4" rx="1" fill="#88DDFF" opacity="0.8"/>
  <!-- Arms with shield plates -->
  <rect x="16" y="20" width="8" height="18" rx="3" fill="#4477AA"/>
  <rect x="40" y="20" width="8" height="18" rx="3" fill="#4477AA"/>
  <rect x="14" y="22" width="4" height="12" rx="1" fill="#44CCFF" opacity="0.4"/>
  <rect x="46" y="22" width="4" height="12" rx="1" fill="#44CCFF" opacity="0.4"/>
  <!-- Legs -->
  <rect x="26" y="44" width="5" height="10" rx="2" fill="#335577"/>
  <rect x="33" y="44" width="5" height="10" rx="2" fill="#335577"/>
</svg>`,

  // BOLT-017: Support Unit -- green glowing healer/buffer with aura ring
  'enemy-support': `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
  <defs>
    <filter id="es7"><feDropShadow dx="1" dy="2" stdDeviation="1.5" flood-color="#000" flood-opacity="0.3"/></filter>
    <radialGradient id="aura-glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#44FF44" stop-opacity="0"/>
      <stop offset="60%" stop-color="#44FF44" stop-opacity="0.08"/>
      <stop offset="100%" stop-color="#44FF44" stop-opacity="0.2"/>
    </radialGradient>
  </defs>
  <ellipse cx="32" cy="56" rx="12" ry="4" fill="#000" opacity="0.15"/>
  <!-- Aura glow ring -->
  <circle cx="32" cy="32" r="28" fill="url(#aura-glow)"/>
  <circle cx="32" cy="32" r="28" fill="none" stroke="#44FF44" stroke-width="1" stroke-opacity="0.35" stroke-dasharray="4 3"/>
  <!-- Robed body -->
  <path d="M24,22 Q22,46 20,54 L44,54 Q42,46 40,22 Z" fill="#2A6B2E" filter="url(#es7)"/>
  <path d="M26,24 Q24,42 23,50 L41,50 Q40,42 38,24 Z" fill="#347D37" opacity="0.5"/>
  <!-- Hood -->
  <ellipse cx="32" cy="16" rx="10" ry="9" fill="#2A6B2E" filter="url(#es7)"/>
  <ellipse cx="32" cy="17" rx="7" ry="5" fill="#1A4A1E"/>
  <!-- Glowing eyes -->
  <circle cx="29" cy="16" r="1.5" fill="#88FF88"/>
  <circle cx="35" cy="16" r="1.5" fill="#88FF88"/>
  <!-- Staff with green crystal -->
  <line x1="46" y1="10" x2="46" y2="52" stroke="#5A3A1A" stroke-width="2.5" stroke-linecap="round"/>
  <polygon points="46,6 42,12 50,12" fill="#44FF44" stroke="#22CC22" stroke-width="0.5"/>
  <circle cx="46" cy="9" r="2" fill="#88FF88" opacity="0.6"/>
</svg>`,
};

// ═══════════════════════════════════════════════════════════════════════
// PROJECTILES (kept from v2 — those were fine)
// ═══════════════════════════════════════════════════════════════════════

const projectiles = {
  'projectile-arrow': `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="8"><defs><filter id="pa"><feDropShadow dx="0" dy="0.5" stdDeviation="0.3" flood-color="#000" flood-opacity="0.3"/></filter></defs><rect x="3" y="3" width="15" height="2" fill="#8B6914" rx="0.5" filter="url(#pa)"/><rect x="5" y="3.2" width="12" height="0.8" fill="#A08030" opacity="0.4"/><polygon points="18,0.5 24,4 18,7.5" fill="#B0B0B0" stroke="#888" stroke-width="0.5"/><polygon points="0,0.5 5,3 5,4 0,3" fill="#CC2222"/><polygon points="0,7.5 5,5 5,4 0,5" fill="#CC2222"/></svg>`,
  'projectile-blast': `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><defs><radialGradient id="pb1" cx="40%" cy="40%" r="55%"><stop offset="0%" stop-color="#FFFFAA"/><stop offset="30%" stop-color="#FFCC22"/><stop offset="70%" stop-color="#FF8800"/><stop offset="100%" stop-color="#FF440000"/></radialGradient><filter id="pbg"><feGaussianBlur stdDeviation="1.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><circle cx="8" cy="8" r="7.5" fill="#FFAA00" opacity="0.15" filter="url(#pbg)"/><circle cx="8" cy="8" r="6" fill="url(#pb1)" filter="url(#pbg)"/><circle cx="8" cy="8" r="3" fill="#FFEE66" opacity="0.7"/><circle cx="7" cy="7" r="1.5" fill="#FFFFFF" opacity="0.85"/></svg>`,
  'projectile-missile': `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="10"><defs><linearGradient id="pm1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#8899AA"/><stop offset="50%" stop-color="#667788"/><stop offset="100%" stop-color="#556677"/></linearGradient><filter id="pmg"><feGaussianBlur stdDeviation="1" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><ellipse cx="3" cy="5" rx="4" ry="2.5" fill="#FF6600" opacity="0.35" filter="url(#pmg)"/><ellipse cx="1" cy="5" rx="2.5" ry="1.8" fill="#FFAA00" opacity="0.25" filter="url(#pmg)"/><rect x="6" y="1.5" width="14" height="7" fill="url(#pm1)" rx="1.5"/><rect x="8" y="2" width="10" height="2" fill="#99AABB" opacity="0.35" rx="0.5"/><rect x="10" y="1.5" width="2.5" height="7" fill="#DD3333" opacity="0.75"/><polygon points="20,0.5 24,5 20,9.5" fill="#EE3333" stroke="#CC2222" stroke-width="0.5"/><polygon points="6,1.5 3,0 8,1.5" fill="#556677"/><polygon points="6,8.5 3,10 8,8.5" fill="#556677"/></svg>`,
};

// ═══════════════════════════════════════════════════════════════════════
// BOLT-010: AUTO-TILE SPRITE VARIANTS
// Path bitmask encoding: bit 0 = north, bit 1 = east, bit 2 = south,
// bit 3 = west. A set bit means a path neighbor exists in that direction.
// Only the 11 masks reachable by the single-path generator are produced.
// ═══════════════════════════════════════════════════════════════════════

/**
 * Builds an SVG string for a path tile with the given bitmask.
 * Connected edges extend dirt/sand to the tile boundary for seamless joins.
 * Terminated edges show a grass strip 8px from the edge.
 *
 * @param {number} mask - 4-bit bitmask (N=1, E=2, S=4, W=8)
 * @returns {string} SVG markup for a 64x64 tile
 */
function buildPathSvg(mask) {
  const hasN = (mask & 1) !== 0;
  const hasE = (mask & 2) !== 0;
  const hasS = (mask & 4) !== 0;
  const hasW = (mask & 8) !== 0;

  // Path region insets -- 0 if connected (flush to edge), 8 if terminated
  const top = hasN ? 0 : 8;
  const right = hasE ? 64 : 56;
  const bottom = hasS ? 64 : 56;
  const left = hasW ? 0 : 8;

  // Unique filter IDs per mask to avoid SVG id collisions in composite renders
  const id = `pm${mask}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
  <defs>
    <linearGradient id="${id}g" x1="0" y1="0" x2="0.7" y2="1">
      <stop offset="0%" stop-color="#C9A96E"/>
      <stop offset="50%" stop-color="#B8935A"/>
      <stop offset="100%" stop-color="#A07840"/>
    </linearGradient>
    <filter id="${id}n">
      <feTurbulence type="fractalNoise" baseFrequency="0.12" numOctaves="5" seed="${mask + 10}"/>
      <feColorMatrix type="saturate" values="0"/>
      <feBlend in="SourceGraphic" mode="multiply"/>
    </filter>
  </defs>
  <!-- Grass background -->
  <rect width="64" height="64" fill="#3B8C3F"/>
  <rect width="64" height="64" fill="#347D37" opacity="0.3"/>
  <!-- Grass blade strokes on terminated edges -->
  ${!hasN ? '<g stroke="#2A6B2E" stroke-width="1.3" stroke-linecap="round" opacity="0.5"><line x1="12" y1="6" x2="10" y2="1"/><line x1="28" y1="7" x2="26" y2="2"/><line x1="44" y1="6" x2="42" y2="1"/></g>' : ''}
  ${!hasE ? '<g stroke="#2A6B2E" stroke-width="1.3" stroke-linecap="round" opacity="0.5"><line x1="58" y1="12" x2="63" y2="10"/><line x1="59" y1="32" x2="63" y2="30"/><line x1="58" y1="50" x2="63" y2="48"/></g>' : ''}
  ${!hasS ? '<g stroke="#2A6B2E" stroke-width="1.3" stroke-linecap="round" opacity="0.5"><line x1="12" y1="58" x2="10" y2="63"/><line x1="28" y1="57" x2="26" y2="62"/><line x1="44" y1="58" x2="42" y2="63"/></g>' : ''}
  ${!hasW ? '<g stroke="#2A6B2E" stroke-width="1.3" stroke-linecap="round" opacity="0.5"><line x1="6" y1="12" x2="1" y2="10"/><line x1="5" y1="32" x2="1" y2="30"/><line x1="6" y1="50" x2="1" y2="48"/></g>' : ''}
  <!-- Dirt/sand path surface -->
  <rect x="${left}" y="${top}" width="${right - left}" height="${bottom - top}" fill="url(#${id}g)"/>
  <rect x="${left}" y="${top}" width="${right - left}" height="${bottom - top}" fill="url(#${id}g)" filter="url(#${id}n)" opacity="0.2"/>
  <!-- Pebble detail on path surface -->
  <circle cx="${left + 10}" cy="${top + 8}" r="1.5" fill="#8B7340" opacity="0.45"/>
  <circle cx="${right - 12}" cy="${bottom - 10}" r="2" fill="#806830" opacity="0.4"/>
  <circle cx="${(left + right) / 2}" cy="${(top + bottom) / 2 + 4}" r="1.2" fill="#7A6535" opacity="0.35"/>
</svg>`;
}

// The 11 reachable bitmask values for the single-path generator
const REACHABLE_PATH_MASKS = [0, 1, 2, 3, 4, 5, 6, 8, 9, 10, 12];

// ═══════════════════════════════════════════════════════════════════════
// BOLT-010: DIRECTIONAL SPAWN AND OBJECTIVE BASE SVGS
// Base sprites have the opening on the EAST edge. sharp.rotate() produces
// the other 3 directions: 90=south, 180=west, 270=north.
// ═══════════════════════════════════════════════════════════════════════

/**
 * Spawn portal with east-facing opening. The opening is a gap in the ring
 * on the right edge where enemies emerge, with a bright energy glow.
 */
const spawnDirectionalBase = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
  <defs>
    <radialGradient id="sdG" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#FF8C00"/>
      <stop offset="35%" stop-color="#FF5500"/>
      <stop offset="70%" stop-color="#CC2200"/>
      <stop offset="100%" stop-color="#220500"/>
    </radialGradient>
    <radialGradient id="sdC" cx="50%" cy="50%" r="35%">
      <stop offset="0%" stop-color="#FFCC44"/>
      <stop offset="50%" stop-color="#FF8800"/>
      <stop offset="100%" stop-color="#FF440000"/>
    </radialGradient>
    <filter id="sdGl">
      <feGaussianBlur stdDeviation="2.5" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="sdGl2">
      <feGaussianBlur stdDeviation="1.5" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <rect width="64" height="64" fill="#180800"/>
  <rect width="64" height="64" fill="url(#sdG)" opacity="0.9"/>
  <!-- Portal ring with gap on the east (right) edge -->
  <path d="M32,8 A24,24 0 1,0 32,56 A24,24 0 0,0 56,32" fill="none" stroke="#553320" stroke-width="4" opacity="0.7"/>
  <path d="M32,8 A24,24 0 1,0 32,56 A24,24 0 0,0 56,32" fill="none" stroke="#774430" stroke-width="2" opacity="0.5"/>
  <!-- Energy glow at east opening -->
  <rect x="54" y="24" width="10" height="16" fill="#FF8800" opacity="0.35" filter="url(#sdGl)"/>
  <rect x="56" y="28" width="8" height="8" fill="#FFCC44" opacity="0.5" filter="url(#sdGl2)"/>
  <!-- Directional arrow pointing east -->
  <polygon points="50,26 60,32 50,38" fill="#FFBB44" opacity="0.6" filter="url(#sdGl2)"/>
  <!-- Inner energy core -->
  <circle cx="32" cy="32" r="18" fill="url(#sdC)" opacity="0.85"/>
  <circle cx="32" cy="32" r="6" fill="#FFCC44" opacity="0.7" filter="url(#sdGl)"/>
  <circle cx="32" cy="32" r="3" fill="#FFEEAA" opacity="0.85"/>
  <circle cx="32" cy="32" r="1.2" fill="#FFFFFF" opacity="0.95"/>
  <!-- Swirl energy lines -->
  <path d="M32,14 C44,20 44,32 32,32 C20,32 20,44 32,50" fill="none" stroke="#FFBB44" stroke-width="1.5" opacity="0.3" filter="url(#sdGl2)"/>
  <!-- Accent sparks -->
  <circle cx="22" cy="18" r="1" fill="#FF8800" opacity="0.6" filter="url(#sdGl2)"/>
  <circle cx="44" cy="22" r="0.8" fill="#FFAA00" opacity="0.5" filter="url(#sdGl2)"/>
  <circle cx="40" cy="46" r="1.2" fill="#FF6600" opacity="0.5" filter="url(#sdGl2)"/>
</svg>`;

/**
 * Objective castle with east-facing gate opening. The gate arch faces
 * right, with battlements around the other three edges.
 */
const objectiveDirectionalBase = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
  <defs>
    <radialGradient id="odG" cx="50%" cy="50%" r="55%">
      <stop offset="0%" stop-color="#6A5ACD"/>
      <stop offset="50%" stop-color="#3E348A"/>
      <stop offset="100%" stop-color="#14102E"/>
    </radialGradient>
    <filter id="odGl">
      <feGaussianBlur stdDeviation="1.8" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="odSh">
      <feDropShadow dx="1" dy="1" stdDeviation="1.5" flood-color="#000" flood-opacity="0.4"/>
    </filter>
    <linearGradient id="odW" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#7A6CB8"/>
      <stop offset="100%" stop-color="#4A3E80"/>
    </linearGradient>
  </defs>
  <rect width="64" height="64" fill="#14102E"/>
  <rect width="64" height="64" fill="url(#odG)" opacity="0.8"/>
  <!-- Castle walls -->
  <rect x="6" y="14" width="52" height="36" fill="url(#odW)" rx="2" filter="url(#odSh)"/>
  <!-- Stone lines -->
  <line x1="8" y1="24" x2="56" y2="24" stroke="#3E348A" stroke-width="0.5" opacity="0.5"/>
  <line x1="8" y1="34" x2="56" y2="34" stroke="#3E348A" stroke-width="0.5" opacity="0.5"/>
  <!-- Left tower with crenellations -->
  <rect x="4" y="8" width="12" height="28" fill="#6A5AB0" rx="1" filter="url(#odSh)"/>
  <rect x="4" y="6" width="4" height="5" fill="#7A6CB8"/>
  <rect x="8" y="6" width="4" height="5" fill="#7A6CB8"/>
  <rect x="12" y="6" width="4" height="5" fill="#7A6CB8"/>
  <!-- Top crenellations along north wall -->
  <rect x="20" y="10" width="5" height="5" fill="#7A6CB8"/>
  <rect x="28" y="10" width="5" height="5" fill="#7A6CB8"/>
  <rect x="36" y="10" width="5" height="5" fill="#7A6CB8"/>
  <!-- Gate arch facing east (right side) -->
  <path d="M52,22 Q64,22 64,32 Q64,42 52,42 L52,22 Z" fill="#1A1040"/>
  <path d="M54,24 Q62,24 62,32 Q62,40 54,40 L54,24 Z" fill="#241858"/>
  <!-- Portcullis lines inside the gate -->
  <line x1="56" y1="24" x2="56" y2="40" stroke="#3E348A" stroke-width="0.8" opacity="0.6"/>
  <line x1="59" y1="24" x2="59" y2="40" stroke="#3E348A" stroke-width="0.8" opacity="0.6"/>
  <!-- Banner/flag on left tower -->
  <polygon points="10,2 5,8 15,8" fill="#A888FF" filter="url(#odGl)"/>
  <polygon points="10,4 7,8 13,8" fill="#C8B8FF" opacity="0.7"/>
  <!-- Diamond emblem on wall -->
  <path d="M32,26 L29,30 L32,34 L35,30 Z" fill="#9888CC" stroke="#B8A8E8" stroke-width="0.6"/>
  <!-- Ground glow -->
  <ellipse cx="32" cy="52" rx="20" ry="4" fill="#6A5ACD" opacity="0.15" filter="url(#odGl)"/>
</svg>`;

// Rotation degrees for directional variants: east=base, south=90, west=180, north=270
const DIRECTION_ROTATIONS = { e: 0, s: 90, w: 180, n: 270 };

// ═══════════════════════════════════════════════════════════════════════
// GENERATE
// ═══════════════════════════════════════════════════════════════════════

async function generateAll() {
  // --- Legacy flat sprites (existing behavior, unchanged) ---
  const assets = {};
  assets['tile-path'] = pathTile;
  grassVariants.forEach((svg, i) => { assets[`tile-buildable${i === 0 ? '' : '-' + (i + 1)}`] = svg; });
  blockedVariants.forEach((svg, i) => { assets[`tile-blocked${i === 0 ? '' : '-' + (i + 1)}`] = svg; });
  assets['tile-spawn'] = spawnTile;
  assets['tile-objective'] = objectiveTile;
  Object.assign(assets, towers, enemies, projectiles);

  // --- BOLT-010: tile variant sprites in subdirectories ---
  const tileAssets = [];

  // Path bitmask variants (11 sprites)
  for (const mask of REACHABLE_PATH_MASKS) {
    tileAssets.push({
      name: `tile-path-${mask}`,
      svg: buildPathSvg(mask),
      outDir: path.join(SPRITES_DIR, 'tiles', 'path'),
    });
  }

  // Grass/buildable variants (5 sprites, reusing existing SVGs at new paths)
  grassVariants.forEach((svg, i) => {
    tileAssets.push({
      name: `tile-buildable-${i + 1}`,
      svg,
      outDir: path.join(SPRITES_DIR, 'tiles', 'grass'),
    });
  });

  // Blocked variants (3 sprites, reusing existing SVGs at new paths)
  blockedVariants.forEach((svg, i) => {
    tileAssets.push({
      name: `tile-blocked-${i + 1}`,
      svg,
      outDir: path.join(SPRITES_DIR, 'tiles', 'blocked'),
    });
  });

  // Spawn directional variants (4 sprites via rotation)
  for (const [dir, deg] of Object.entries(DIRECTION_ROTATIONS)) {
    tileAssets.push({
      name: `tile-spawn-${dir}`,
      svg: spawnDirectionalBase,
      outDir: path.join(SPRITES_DIR, 'tiles', 'spawn'),
      rotateDeg: deg,
    });
  }

  // Objective directional variants (4 sprites via rotation)
  for (const [dir, deg] of Object.entries(DIRECTION_ROTATIONS)) {
    tileAssets.push({
      name: `tile-objective-${dir}`,
      svg: objectiveDirectionalBase,
      outDir: path.join(SPRITES_DIR, 'tiles', 'objective'),
      rotateDeg: deg,
    });
  }

  const totalLegacy = Object.keys(assets).length;
  const totalTile = tileAssets.length;
  const total = totalLegacy + totalTile;
  let count = 0;
  console.log(`Generating ${total} game assets (v3 + BOLT-010 tiles)...\n`);

  // Generate legacy flat sprites
  for (const [name, svg] of Object.entries(assets)) {
    const outPath = path.join(SPRITES_DIR, `${name}.png`);
    try {
      await sharp(Buffer.from(svg)).png().toFile(outPath);
      count++;
      console.log(`  [${count}/${total}] ${name}.png`);
    } catch (err) {
      console.error(`  FAIL: ${name} - ${err.message}`);
    }
  }

  // Generate BOLT-010 tile variant sprites
  console.log('\n  --- BOLT-010: Auto-tile variants ---');
  for (const tile of tileAssets) {
    fs.mkdirSync(tile.outDir, { recursive: true });
    const outPath = path.join(tile.outDir, `${tile.name}.png`);
    try {
      let pipeline = sharp(Buffer.from(tile.svg));
      // Apply rotation for directional spawn/objective sprites
      if (tile.rotateDeg) {
        pipeline = pipeline.rotate(tile.rotateDeg).resize(64, 64);
      }
      await pipeline.png().toFile(outPath);
      count++;
      console.log(`  [${count}/${total}] tiles/.../${tile.name}.png`);
    } catch (err) {
      console.error(`  FAIL: ${tile.name} - ${err.message}`);
    }
  }

  console.log(`\nDone! Generated ${count}/${total} assets in ${SPRITES_DIR}`);
}

generateAll().catch(console.error);
