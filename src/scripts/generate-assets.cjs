/**
 * Asset Generation Script v2 for Tower Defense Game
 * High-fidelity SVG → PNG sprites via sharp.
 * Run: node src/scripts/generate-assets.cjs
 */
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const SPRITES_DIR = path.join(__dirname, '../../public/assets/sprites');
fs.mkdirSync(SPRITES_DIR, { recursive: true });

// ─── GRASS / BUILDABLE TILES (5 variants) ─────────────────────────────

function grassTile(seed) {
  const rng = (s) => ((Math.sin(s * 127.1 + seed * 311.7) * 43758.5453) % 1 + 1) % 1;
  const blades = [];
  for (let i = 0; i < 14; i++) {
    const x = 4 + rng(i * 3) * 56;
    const y = 4 + rng(i * 3 + 1) * 56;
    const h = 4 + rng(i * 3 + 2) * 6;
    const lean = (rng(i * 7) - 0.5) * 4;
    blades.push(`<line x1="${x}" y1="${y}" x2="${x + lean}" y2="${y - h}" stroke="#2E7D32" stroke-width="1.2" stroke-linecap="round" opacity="${0.3 + rng(i * 5) * 0.3}"/>`);
  }
  const flowers = [];
  if (seed % 3 === 0) {
    const fx = 12 + rng(99) * 40; const fy = 10 + rng(98) * 44;
    flowers.push(`<circle cx="${fx}" cy="${fy}" r="2" fill="#FFEB3B" opacity="0.7"/>`);
    flowers.push(`<circle cx="${fx}" cy="${fy}" r="1" fill="#FFF9C4" opacity="0.9"/>`);
  }
  if (seed % 5 === 0 || seed % 5 === 2) {
    const fx = 35 + rng(77) * 20; const fy = 35 + rng(76) * 20;
    flowers.push(`<circle cx="${fx}" cy="${fy}" r="1.8" fill="#E8F5E9" opacity="0.6"/>`);
  }
  const dirt = seed % 2 === 0
    ? `<ellipse cx="${18 + rng(50) * 28}" cy="${20 + rng(51) * 24}" rx="${4 + rng(52) * 4}" ry="${2 + rng(53) * 3}" fill="#6D4C2A" opacity="0.12"/>`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
  <defs>
    <linearGradient id="g${seed}" x1="0" y1="0" x2="${0.2 + seed * 0.1}" y2="1">
      <stop offset="0%" stop-color="#4CAF50"/><stop offset="40%" stop-color="#43A047"/><stop offset="100%" stop-color="#388E3C"/>
    </linearGradient>
    <filter id="gn${seed}"><feTurbulence type="fractalNoise" baseFrequency="${0.2 + seed * 0.02}" numOctaves="4" seed="${seed * 13}"/>
      <feColorMatrix type="saturate" values="0"/><feBlend in="SourceGraphic" mode="soft-light"/></filter>
  </defs>
  <rect width="64" height="64" fill="url(#g${seed})"/>
  <rect width="64" height="64" filter="url(#gn${seed})" opacity="0.25" fill="url(#g${seed})"/>
  ${dirt}
  <circle cx="${10 + seed * 8}" cy="${15 + seed * 5}" r="${4 + seed}" fill="#66BB6A" opacity="0.15"/>
  <circle cx="${40 - seed * 3}" cy="${42 + seed * 2}" r="${5 - seed * 0.5}" fill="#81C784" opacity="0.12"/>
  ${blades.join('\n  ')}
  ${flowers.join('\n  ')}
  <rect x="0" y="0" width="64" height="1" fill="#2E7D32" opacity="0.06"/>
  <rect x="0" y="63" width="64" height="1" fill="#2E7D32" opacity="0.06"/>
  <rect x="0" y="0" width="1" height="64" fill="#2E7D32" opacity="0.06"/>
  <rect x="63" y="0" width="1" height="64" fill="#2E7D32" opacity="0.06"/>
</svg>`;
}

// ─── BLOCKED / ROCK TILES (3 variants) ────────────────────────────────

const blockedVariants = [
  `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
  <defs><radialGradient id="bk1" cx="40%" cy="40%" r="60%"><stop offset="0%" stop-color="#5C5C5C"/><stop offset="100%" stop-color="#333333"/></radialGradient>
    <filter id="bn1"><feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="5" seed="42"/><feColorMatrix type="saturate" values="0"/><feBlend in="SourceGraphic" mode="overlay"/></filter>
    <filter id="bs1"><feDropShadow dx="1" dy="1" stdDeviation="1.5" flood-color="#000" flood-opacity="0.3"/></filter></defs>
  <rect width="64" height="64" fill="url(#bk1)"/><rect width="64" height="64" fill="#444" filter="url(#bn1)" opacity="0.4"/>
  <polygon points="8,48 4,32 14,18 28,14 36,20 38,36 30,50" fill="#5A5A5A" stroke="#404040" stroke-width="1" filter="url(#bs1)"/>
  <polygon points="14,20 28,16 34,22 28,28 16,26" fill="#686868" opacity="0.5"/>
  <polygon points="36,52 42,36 56,32 60,44 54,56" fill="#4E4E4E" stroke="#3A3A3A" stroke-width="0.8"/>
  <polygon points="44,38 54,34 58,42 50,44" fill="#5E5E5E" opacity="0.4"/>
  <polygon points="52,8 44,22 60,22" fill="#2D5A2D" opacity="0.85"/>
  <polygon points="52,14 46,24 58,24" fill="#337733" opacity="0.7"/>
  <rect x="50.5" y="22" width="3" height="5" fill="#5C3D20"/>
  <circle cx="20" cy="54" r="2" fill="#4A4A4A"/><circle cx="46" cy="26" r="1.5" fill="#555"/>
  <ellipse cx="12" cy="40" rx="4" ry="2" fill="#3D6B3D" opacity="0.35"/>
  <ellipse cx="48" cy="50" rx="3" ry="1.5" fill="#3D6B3D" opacity="0.3"/>
</svg>`,
  `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
  <defs><radialGradient id="bk2" cx="50%" cy="50%" r="60%"><stop offset="0%" stop-color="#525252"/><stop offset="100%" stop-color="#2E2E2E"/></radialGradient>
    <filter id="bn2"><feTurbulence type="fractalNoise" baseFrequency="0.08" numOctaves="4" seed="77"/><feColorMatrix type="saturate" values="0"/><feBlend in="SourceGraphic" mode="overlay"/></filter>
    <filter id="bs2"><feDropShadow dx="1" dy="1" stdDeviation="1" flood-color="#000" flood-opacity="0.35"/></filter></defs>
  <rect width="64" height="64" fill="url(#bk2)"/><rect width="64" height="64" fill="#3A3A3A" filter="url(#bn2)" opacity="0.45"/>
  <ellipse cx="18" cy="20" rx="12" ry="10" fill="#555" stroke="#3E3E3E" stroke-width="1" filter="url(#bs2)"/>
  <ellipse cx="16" cy="18" rx="8" ry="6" fill="#626262" opacity="0.5"/>
  <ellipse cx="46" cy="16" rx="10" ry="8" fill="#4E4E4E" stroke="#3A3A3A" stroke-width="0.8" filter="url(#bs2)"/>
  <ellipse cx="44" cy="14" rx="6" ry="4" fill="#5A5A5A" opacity="0.4"/>
  <ellipse cx="36" cy="42" rx="14" ry="11" fill="#505050" stroke="#3C3C3C" stroke-width="1" filter="url(#bs2)"/>
  <ellipse cx="34" cy="40" rx="9" ry="6" fill="#5C5C5C" opacity="0.45"/>
  <ellipse cx="12" cy="52" rx="8" ry="6" fill="#4A4A4A" stroke="#383838" stroke-width="0.8"/>
  <path d="M22,24 L28,30 L26,36" fill="none" stroke="#2A2A2A" stroke-width="0.8" opacity="0.6"/>
  <path d="M40,20 L44,28" fill="none" stroke="#2A2A2A" stroke-width="0.6" opacity="0.5"/>
  <circle cx="56" cy="38" r="1.5" fill="#484848"/><circle cx="8" cy="36" r="1" fill="#464646"/>
  <circle cx="54" cy="54" r="2" fill="#444"/><circle cx="28" cy="56" r="1.2" fill="#474747"/>
</svg>`,
  `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
  <defs><radialGradient id="bk3" cx="45%" cy="45%" r="55%"><stop offset="0%" stop-color="#4F4F4F"/><stop offset="100%" stop-color="#303030"/></radialGradient>
    <filter id="bn3"><feTurbulence type="fractalNoise" baseFrequency="0.1" numOctaves="4" seed="99"/><feColorMatrix type="saturate" values="0"/><feBlend in="SourceGraphic" mode="overlay"/></filter></defs>
  <rect width="64" height="64" fill="url(#bk3)"/><rect width="64" height="64" fill="#3E3E3E" filter="url(#bn3)" opacity="0.4"/>
  <polygon points="0,40 8,28 24,22 40,26 48,34 48,48 32,54 8,52 0,48" fill="#525252" stroke="#3C3C3C" stroke-width="1"/>
  <polygon points="4,38 12,30 26,24 38,28 44,34 40,40 24,42 8,42" fill="#5C5C5C" opacity="0.5"/>
  <polygon points="38,8 52,4 62,12 58,24 44,22" fill="#4A4A4A" stroke="#383838" stroke-width="0.8"/>
  <polygon points="42,10 52,6 58,14 52,18" fill="#565656" opacity="0.4"/>
  <g stroke="#6B5030" stroke-width="1.2" stroke-linecap="round" opacity="0.7">
    <line x1="54" y1="40" x2="50" y2="32"/><line x1="54" y1="40" x2="58" y2="30"/>
    <line x1="54" y1="40" x2="56" y2="34"/><line x1="50" y1="32" x2="46" y2="28"/>
    <line x1="58" y1="30" x2="60" y2="24"/><line x1="54" y1="40" x2="54" y2="48"/>
  </g>
  <ellipse cx="20" cy="48" rx="6" ry="2" fill="#4A3A2A" opacity="0.25"/>
  <circle cx="10" cy="18" r="1.5" fill="#444"/><circle cx="30" cy="58" r="1" fill="#474747"/>
</svg>`,
];

// ─── PATH TILE ────────────────────────────────────────────────────────

const pathTile = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
  <defs><linearGradient id="pB" x1="0" y1="0" x2="0.7" y2="1"><stop offset="0%" stop-color="#C9A96E"/><stop offset="50%" stop-color="#B8935A"/><stop offset="100%" stop-color="#A07840"/></linearGradient>
    <filter id="pN"><feTurbulence type="fractalNoise" baseFrequency="0.12" numOctaves="5" seed="3"/><feColorMatrix type="saturate" values="0"/><feBlend in="SourceGraphic" mode="multiply"/></filter></defs>
  <rect width="64" height="64" fill="url(#pB)"/><rect width="64" height="64" fill="url(#pB)" filter="url(#pN)" opacity="0.25"/>
  <ellipse cx="20" cy="18" rx="10" ry="4" fill="#BFA060" opacity="0.25"/>
  <ellipse cx="44" cy="44" rx="12" ry="5" fill="#C4A868" opacity="0.2"/>
  <ellipse cx="14" cy="50" rx="7" ry="3" fill="#A88848" opacity="0.2"/>
  <circle cx="12" cy="30" r="2" fill="#8B7340" opacity="0.5"/><circle cx="12.5" cy="29" r="0.6" fill="#A89060" opacity="0.5"/>
  <circle cx="48" cy="18" r="1.5" fill="#7A6535" opacity="0.45"/>
  <circle cx="36" cy="52" r="2" fill="#806830" opacity="0.4"/>
  <circle cx="52" cy="40" r="1.2" fill="#7A6535" opacity="0.35"/>
  <path d="M0,28 Q16,26 32,28 Q48,30 64,28" fill="none" stroke="#9A7E48" stroke-width="1" opacity="0.12"/>
  <path d="M0,36 Q16,38 32,36 Q48,34 64,36" fill="none" stroke="#9A7E48" stroke-width="1" opacity="0.12"/>
  <rect x="0" y="0" width="64" height="2" fill="#7A6030" opacity="0.1"/>
  <rect x="0" y="62" width="64" height="2" fill="#7A6030" opacity="0.1"/>
</svg>`;

// ─── SPAWN PORTAL ─────────────────────────────────────────────────────

const spawnTile = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
  <defs><radialGradient id="spG" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#FF8C00"/><stop offset="35%" stop-color="#FF5500"/><stop offset="70%" stop-color="#CC2200"/><stop offset="100%" stop-color="#220500"/></radialGradient>
    <radialGradient id="spC" cx="50%" cy="50%" r="35%"><stop offset="0%" stop-color="#FFCC44"/><stop offset="50%" stop-color="#FF8800"/><stop offset="100%" stop-color="#FF440000"/></radialGradient>
    <filter id="spGl"><feGaussianBlur stdDeviation="2.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <filter id="spGl2"><feGaussianBlur stdDeviation="1.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
  <rect width="64" height="64" fill="#180800"/><rect width="64" height="64" fill="url(#spG)" opacity="0.9"/>
  <circle cx="32" cy="32" r="26" fill="none" stroke="#FF6622" stroke-width="2" opacity="0.3" filter="url(#spGl)"/>
  <circle cx="32" cy="32" r="24" fill="none" stroke="#553320" stroke-width="4" opacity="0.7"/>
  <circle cx="32" cy="32" r="24" fill="none" stroke="#774430" stroke-width="2" opacity="0.5"/>
  <circle cx="32" cy="8" r="2" fill="#FF8844" opacity="0.5" filter="url(#spGl2)"/>
  <circle cx="56" cy="32" r="2" fill="#FF8844" opacity="0.5" filter="url(#spGl2)"/>
  <circle cx="32" cy="56" r="2" fill="#FF8844" opacity="0.5" filter="url(#spGl2)"/>
  <circle cx="8" cy="32" r="2" fill="#FF8844" opacity="0.5" filter="url(#spGl2)"/>
  <circle cx="32" cy="32" r="18" fill="url(#spC)" opacity="0.85"/>
  <path d="M32,14 C44,20 44,32 32,32 C20,32 20,44 32,50" fill="none" stroke="#FFBB44" stroke-width="1.5" opacity="0.35" filter="url(#spGl2)"/>
  <path d="M14,32 C20,20 32,20 32,32 C32,44 44,44 50,32" fill="none" stroke="#FFBB44" stroke-width="1.5" opacity="0.35" filter="url(#spGl2)"/>
  <path d="M32,18 C40,24 40,32 32,32 C24,32 24,40 32,46" fill="none" stroke="#FFDD66" stroke-width="0.8" opacity="0.25"/>
  <path d="M18,32 C24,24 32,24 32,32 C32,40 40,40 46,32" fill="none" stroke="#FFDD66" stroke-width="0.8" opacity="0.25"/>
  <circle cx="32" cy="32" r="6" fill="#FFCC44" opacity="0.7" filter="url(#spGl)"/>
  <circle cx="32" cy="32" r="3" fill="#FFEEAA" opacity="0.85"/>
  <circle cx="32" cy="32" r="1.2" fill="#FFFFFF" opacity="0.95"/>
  <circle cx="22" cy="18" r="1" fill="#FF8800" opacity="0.6" filter="url(#spGl2)"/>
  <circle cx="44" cy="22" r="0.8" fill="#FFAA00" opacity="0.5" filter="url(#spGl2)"/>
  <circle cx="40" cy="46" r="1.2" fill="#FF6600" opacity="0.5" filter="url(#spGl2)"/>
  <circle cx="18" cy="42" r="0.8" fill="#FFAA00" opacity="0.4" filter="url(#spGl2)"/>
</svg>`;

// ─── OBJECTIVE CASTLE ─────────────────────────────────────────────────

const objectiveTile = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
  <defs><radialGradient id="obG" cx="50%" cy="50%" r="55%"><stop offset="0%" stop-color="#6A5ACD"/><stop offset="50%" stop-color="#3E348A"/><stop offset="100%" stop-color="#14102E"/></radialGradient>
    <filter id="obGl"><feGaussianBlur stdDeviation="1.8" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <filter id="obSh"><feDropShadow dx="1" dy="1" stdDeviation="1.5" flood-color="#000" flood-opacity="0.4"/></filter>
    <linearGradient id="obW" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#7A6CB8"/><stop offset="100%" stop-color="#4A3E80"/></linearGradient></defs>
  <rect width="64" height="64" fill="#14102E"/><rect width="64" height="64" fill="url(#obG)" opacity="0.8"/>
  <rect x="12" y="22" width="40" height="28" fill="url(#obW)" rx="2" filter="url(#obSh)"/>
  <line x1="14" y1="30" x2="50" y2="30" stroke="#3E348A" stroke-width="0.5" opacity="0.5"/>
  <line x1="14" y1="38" x2="50" y2="38" stroke="#3E348A" stroke-width="0.5" opacity="0.5"/>
  <line x1="32" y1="24" x2="32" y2="50" stroke="#3E348A" stroke-width="0.4" opacity="0.3"/>
  <rect x="8" y="14" width="12" height="22" fill="#6A5AB0" rx="1" filter="url(#obSh)"/>
  <rect x="8" y="12" width="4" height="5" fill="#7A6CB8"/><rect x="12" y="12" width="4" height="5" fill="#7A6CB8"/><rect x="16" y="12" width="4" height="5" fill="#7A6CB8"/>
  <rect x="44" y="14" width="12" height="22" fill="#6A5AB0" rx="1" filter="url(#obSh)"/>
  <rect x="44" y="12" width="4" height="5" fill="#7A6CB8"/><rect x="48" y="12" width="4" height="5" fill="#7A6CB8"/><rect x="52" y="12" width="4" height="5" fill="#7A6CB8"/>
  <rect x="20" y="18" width="5" height="5" fill="#7A6CB8"/><rect x="27" y="18" width="5" height="5" fill="#7A6CB8"/>
  <rect x="34" y="18" width="5" height="5" fill="#7A6CB8"/><rect x="41" y="18" width="2" height="5" fill="#7A6CB8"/>
  <path d="M26,50 L26,36 Q26,30 32,30 Q38,30 38,36 L38,50 Z" fill="#1A1040"/>
  <path d="M28,50 L28,37 Q28,32 32,32 Q36,32 36,37 L36,50 Z" fill="#241858"/>
  <line x1="32" y1="33" x2="32" y2="50" stroke="#1A1040" stroke-width="0.8"/>
  <circle cx="34" cy="42" r="1" fill="#B8A8E8" opacity="0.6"/>
  <polygon points="32,2 27,12 37,12" fill="#A888FF" filter="url(#obGl)"/>
  <polygon points="32,4 29,12 35,12" fill="#C8B8FF" opacity="0.7"/>
  <circle cx="32" cy="8" r="5" fill="#A888FF" opacity="0.2" filter="url(#obGl)"/>
  <circle cx="32" cy="8" r="2" fill="#DDCCFF" opacity="0.5"/>
  <rect x="12" y="20" width="3" height="4" fill="#CCBBFF" opacity="0.3" rx="0.5"/>
  <rect x="49" y="20" width="3" height="4" fill="#CCBBFF" opacity="0.3" rx="0.5"/>
  <path d="M32,25 L29,28 L32,32 L35,28 Z" fill="#9888CC" stroke="#B8A8E8" stroke-width="0.6"/>
  <ellipse cx="32" cy="52" rx="20" ry="4" fill="#6A5ACD" opacity="0.15" filter="url(#obGl)"/>
</svg>`;

// ─── TOWERS ───────────────────────────────────────────────────────────

const towers = {
  'tower-ranged': `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><defs><radialGradient id="tr1" cx="45%" cy="45%" r="50%"><stop offset="0%" stop-color="#B8915A"/><stop offset="80%" stop-color="#8B6840"/><stop offset="100%" stop-color="#6B4D30"/></radialGradient><filter id="trs"><feDropShadow dx="2" dy="2" stdDeviation="2.5" flood-color="#000" flood-opacity="0.4"/></filter></defs><ellipse cx="34" cy="35" rx="22" ry="22" fill="#000" opacity="0.15"/><circle cx="32" cy="32" r="22" fill="url(#tr1)" stroke="#5C3D20" stroke-width="2.5" filter="url(#trs)"/><circle cx="32" cy="32" r="18" fill="none" stroke="#7A5A35" stroke-width="0.4" opacity="0.4"/><circle cx="32" cy="32" r="14" fill="none" stroke="#7A5A35" stroke-width="0.3" opacity="0.35"/><line x1="12" y1="24" x2="52" y2="24" stroke="#6B4D30" stroke-width="0.5" opacity="0.3"/><line x1="12" y1="32" x2="52" y2="32" stroke="#6B4D30" stroke-width="0.5" opacity="0.3"/><line x1="12" y1="40" x2="52" y2="40" stroke="#6B4D30" stroke-width="0.5" opacity="0.3"/><circle cx="32" cy="32" r="11" fill="#9A7848" stroke="#6B4D30" stroke-width="1.2"/><rect x="28" y="29" width="26" height="6" fill="#5C3D20" rx="1.5"/><rect x="30" y="30.5" width="22" height="3" fill="#7A5A35"/><path d="M33,29 Q25,20 27,12" fill="none" stroke="#5C3D20" stroke-width="3" stroke-linecap="round"/><path d="M33,35 Q25,44 27,52" fill="none" stroke="#5C3D20" stroke-width="3" stroke-linecap="round"/><path d="M33,29 Q26,21 28,14" fill="none" stroke="#8B6840" stroke-width="1" stroke-linecap="round" opacity="0.5"/><path d="M33,35 Q26,43 28,50" fill="none" stroke="#8B6840" stroke-width="1" stroke-linecap="round" opacity="0.5"/><line x1="27" y1="12" x2="27" y2="52" stroke="#D4C090" stroke-width="0.8"/><polygon points="54,32 48,27 48,37" fill="#B0B0B0" stroke="#808080" stroke-width="0.6"/><polygon points="54,32 50,29 50,35" fill="#CCCCCC" opacity="0.4"/><circle cx="32" cy="32" r="3.5" fill="#6B4D30" stroke="#4A3018" stroke-width="1.5"/><circle cx="32" cy="32" r="1.5" fill="#4A3018"/><circle cx="31" cy="31" r="0.6" fill="#8B6840" opacity="0.6"/></svg>`,
  'tower-focused': `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><defs><radialGradient id="tf1" cx="45%" cy="45%" r="55%"><stop offset="0%" stop-color="#8A8A9A"/><stop offset="100%" stop-color="#5A5A6A"/></radialGradient><radialGradient id="tfl" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#00EEFF"/><stop offset="60%" stop-color="#0088CC"/><stop offset="100%" stop-color="#00446600"/></radialGradient><filter id="tfs"><feDropShadow dx="2" dy="2" stdDeviation="2.5" flood-color="#000" flood-opacity="0.4"/></filter><filter id="tfgl"><feGaussianBlur stdDeviation="2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><ellipse cx="34" cy="35" rx="20" ry="20" fill="#000" opacity="0.15"/><polygon points="32,8 50,16 56,32 50,48 32,56 14,48 8,32 14,16" fill="url(#tf1)" stroke="#404050" stroke-width="2.5" filter="url(#tfs)"/><line x1="14" y1="26" x2="50" y2="26" stroke="#4A4A5A" stroke-width="0.5" opacity="0.4"/><line x1="14" y1="38" x2="50" y2="38" stroke="#4A4A5A" stroke-width="0.5" opacity="0.4"/><circle cx="32" cy="32" r="11" fill="#6A6A7A" stroke="#505060" stroke-width="1"/><rect x="30" y="27" width="28" height="10" fill="#505060" rx="2"/><rect x="32" y="28.5" width="24" height="7" fill="#606070"/><rect x="34" y="29" width="20" height="2" fill="#7A7A8A" opacity="0.4" rx="0.5"/><circle cx="58" cy="32" r="5" fill="url(#tfl)" opacity="0.85" filter="url(#tfgl)"/><circle cx="58" cy="32" r="3" fill="#00EEFF" opacity="0.6"/><circle cx="58" cy="32" r="1.2" fill="#FFFFFF" opacity="0.8"/><line x1="54" y1="32" x2="62" y2="32" stroke="#FFFFFF" stroke-width="0.4" opacity="0.5"/><line x1="58" y1="28" x2="58" y2="36" stroke="#FFFFFF" stroke-width="0.4" opacity="0.5"/><circle cx="58" cy="32" r="7" fill="none" stroke="#00DDFF" stroke-width="0.5" opacity="0.3"/><circle cx="32" cy="32" r="4" fill="#505060" stroke="#3A3A4A" stroke-width="1.5"/><circle cx="32" cy="32" r="1.5" fill="#3A3A4A"/></svg>`,
  'tower-broadcast': `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><defs><radialGradient id="tc1" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#44FFAA"/><stop offset="50%" stop-color="#22BB77"/><stop offset="100%" stop-color="#0A553300"/></radialGradient><radialGradient id="tcb" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#607888"/><stop offset="100%" stop-color="#3A5060"/></radialGradient><filter id="tcgl"><feGaussianBlur stdDeviation="2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter><filter id="tcs"><feDropShadow dx="2" dy="2" stdDeviation="2" flood-color="#000" flood-opacity="0.35"/></filter></defs><ellipse cx="34" cy="35" rx="22" ry="22" fill="#000" opacity="0.12"/><polygon points="32,10 52,21 52,43 32,54 12,43 12,21" fill="url(#tcb)" stroke="#2A3A4A" stroke-width="2.5" filter="url(#tcs)"/><polygon points="32,16 46,24 46,40 32,48 18,40 18,24" fill="#4A6070" stroke="#3A5060" stroke-width="1"/><line x1="32" y1="16" x2="32" y2="48" stroke="#3A5060" stroke-width="0.4" opacity="0.4"/><line x1="18" y1="32" x2="46" y2="32" stroke="#3A5060" stroke-width="0.4" opacity="0.4"/><circle cx="32" cy="32" r="28" fill="none" stroke="#44FFAA" stroke-width="0.8" opacity="0.1"/><circle cx="32" cy="32" r="24" fill="none" stroke="#44FFAA" stroke-width="1" opacity="0.15"/><circle cx="32" cy="32" r="20" fill="none" stroke="#44FFAA" stroke-width="1" opacity="0.2"/><circle cx="32" cy="32" r="16" fill="none" stroke="#44FFAA" stroke-width="0.8" opacity="0.25"/><circle cx="32" cy="32" r="12" fill="url(#tc1)" opacity="0.5"/><polygon points="32,18 40,26 40,38 32,46 24,38 24,26" fill="#33DDAA" stroke="#22AA88" stroke-width="1.2" filter="url(#tcgl)"/><polygon points="32,18 40,26 32,32" fill="#55FFCC" opacity="0.35"/><polygon points="32,46 24,38 32,32" fill="#1A9966" opacity="0.3"/><polygon points="24,26 32,18 32,32" fill="#44EEBB" opacity="0.2"/><polygon points="32,24 36,28 36,36 32,40 28,36 28,28" fill="#66FFCC" opacity="0.3"/><circle cx="32" cy="32" r="3.5" fill="#AAFFDD" opacity="0.8" filter="url(#tcgl)"/><circle cx="32" cy="32" r="1.5" fill="#FFFFFF" opacity="0.9"/></svg>`,
  'tower-antiair': `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><defs><radialGradient id="ta1" cx="45%" cy="45%" r="55%"><stop offset="0%" stop-color="#7A8899"/><stop offset="100%" stop-color="#4A5568"/></radialGradient><filter id="tas"><feDropShadow dx="2" dy="2" stdDeviation="2.5" flood-color="#000" flood-opacity="0.4"/></filter><filter id="tagl"><feGaussianBlur stdDeviation="1.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><ellipse cx="34" cy="36" rx="20" ry="20" fill="#000" opacity="0.15"/><circle cx="32" cy="32" r="22" fill="url(#ta1)" stroke="#354050" stroke-width="2.5" filter="url(#tas)"/><circle cx="32" cy="32" r="20" fill="none" stroke="#5A6A7A" stroke-width="0.5" opacity="0.5"/><circle cx="32" cy="11" r="1.8" fill="#8899AA" stroke="#667788" stroke-width="0.3"/><circle cx="47" cy="17" r="1.8" fill="#8899AA" stroke="#667788" stroke-width="0.3"/><circle cx="53" cy="32" r="1.8" fill="#8899AA" stroke="#667788" stroke-width="0.3"/><circle cx="47" cy="47" r="1.8" fill="#8899AA" stroke="#667788" stroke-width="0.3"/><circle cx="32" cy="53" r="1.8" fill="#8899AA" stroke="#667788" stroke-width="0.3"/><circle cx="17" cy="47" r="1.8" fill="#8899AA" stroke="#667788" stroke-width="0.3"/><circle cx="11" cy="32" r="1.8" fill="#8899AA" stroke="#667788" stroke-width="0.3"/><circle cx="17" cy="17" r="1.8" fill="#8899AA" stroke="#667788" stroke-width="0.3"/><rect x="22" y="22" width="20" height="20" fill="#556677" stroke="#3A4555" stroke-width="1.2" rx="3"/><rect x="24" y="24" width="16" height="16" fill="#607080" rx="2"/><rect x="34" y="22" width="22" height="4.5" fill="#4A5A6A" rx="1.5" stroke="#3A4555" stroke-width="0.5"/><rect x="34" y="27" width="22" height="4.5" fill="#4A5A6A" rx="1.5" stroke="#3A4555" stroke-width="0.5"/><rect x="34" y="32.5" width="22" height="4.5" fill="#4A5A6A" rx="1.5" stroke="#3A4555" stroke-width="0.5"/><rect x="34" y="37.5" width="22" height="4.5" fill="#4A5A6A" rx="1.5" stroke="#3A4555" stroke-width="0.5"/><rect x="36" y="22.8" width="18" height="1.2" fill="#6A7A8A" opacity="0.35" rx="0.5"/><rect x="36" y="27.8" width="18" height="1.2" fill="#6A7A8A" opacity="0.35" rx="0.5"/><rect x="36" y="33.3" width="18" height="1.2" fill="#6A7A8A" opacity="0.35" rx="0.5"/><rect x="36" y="38.3" width="18" height="1.2" fill="#6A7A8A" opacity="0.35" rx="0.5"/><circle cx="56" cy="24.2" r="1.5" fill="#1A2530"/><circle cx="56" cy="29.2" r="1.5" fill="#1A2530"/><circle cx="56" cy="34.7" r="1.5" fill="#1A2530"/><circle cx="56" cy="39.7" r="1.5" fill="#1A2530"/><circle cx="28" cy="32" r="6" fill="#5A6A7A" stroke="#4A5A6A" stroke-width="1"/><circle cx="28" cy="32" r="3.5" fill="#4A5A6A" stroke="#3A4A5A" stroke-width="0.5"/><line x1="28" y1="27" x2="28" y2="37" stroke="#4A5A6A" stroke-width="0.5"/><line x1="23" y1="32" x2="33" y2="32" stroke="#4A5A6A" stroke-width="0.5"/><circle cx="28" cy="32" r="2" fill="#FF3333" opacity="0.8" filter="url(#tagl)"/><circle cx="28" cy="32" r="1" fill="#FF8888" opacity="0.9"/><circle cx="28" cy="32" r="4" fill="#FF3333" opacity="0.1"/></svg>`,
};

// ─── ENEMIES ──────────────────────────────────────────────────────────

const enemies = {
  'enemy-runner': `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><defs><radialGradient id="er1" cx="55%" cy="40%" r="50%"><stop offset="0%" stop-color="#EE4444"/><stop offset="100%" stop-color="#AA2020"/></radialGradient><filter id="ers"><feDropShadow dx="1" dy="2" stdDeviation="2" flood-color="#000" flood-opacity="0.3"/></filter></defs><ellipse cx="33" cy="50" rx="16" ry="5" fill="#000" opacity="0.15"/><ellipse cx="22" cy="32" rx="10" ry="9" fill="#BB2020" stroke="#881515" stroke-width="1"/><ellipse cx="34" cy="32" rx="10" ry="10" fill="url(#er1)" stroke="#992020" stroke-width="1.2" filter="url(#ers)"/><ellipse cx="32" cy="27" rx="7" ry="3" fill="#FF6666" opacity="0.3"/><path d="M26,24 Q30,22 34,24" fill="none" stroke="#881515" stroke-width="0.8" opacity="0.5"/><path d="M26,32 Q30,30 34,32" fill="none" stroke="#881515" stroke-width="0.6" opacity="0.4"/><g stroke="#882020" stroke-width="1.8" stroke-linecap="round" fill="none"><path d="M20,24 L14,16 L10,14"/><path d="M20,40 L14,48 L10,50"/><path d="M28,23 L24,14 L22,10"/><path d="M28,41 L24,50 L22,54"/><path d="M36,25 L40,16 L42,12"/><path d="M36,39 L40,48 L42,52"/></g><ellipse cx="46" cy="32" rx="7" ry="6.5" fill="#DD3838" stroke="#AA2020" stroke-width="1"/><ellipse cx="49" cy="28" rx="3" ry="2.5" fill="#FFCC00" stroke="#CC9900" stroke-width="0.4"/><ellipse cx="49" cy="36" rx="3" ry="2.5" fill="#FFCC00" stroke="#CC9900" stroke-width="0.4"/><circle cx="50" cy="28" r="1" fill="#332200"/><circle cx="50" cy="36" r="1" fill="#332200"/><path d="M52,29 L58,26 L56,29" fill="#AA2020" stroke="#882020" stroke-width="0.8"/><path d="M52,35 L58,38 L56,35" fill="#AA2020" stroke="#882020" stroke-width="0.8"/><polygon points="12,32 6,30 6,34" fill="#992020" stroke="#771515" stroke-width="0.5"/></svg>`,
  'enemy-tank': `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><defs><radialGradient id="et1" cx="45%" cy="40%" r="55%"><stop offset="0%" stop-color="#884030"/><stop offset="100%" stop-color="#5A2818"/></radialGradient><filter id="ets"><feDropShadow dx="1" dy="2" stdDeviation="2.5" flood-color="#000" flood-opacity="0.35"/></filter></defs><ellipse cx="33" cy="52" rx="20" ry="6" fill="#000" opacity="0.18"/><ellipse cx="30" cy="32" rx="22" ry="17" fill="url(#et1)" stroke="#3A1808" stroke-width="2" filter="url(#ets)"/><path d="M10,26 L30,18 L50,26 L50,38 L30,46 L10,38 Z" fill="#7A3828" stroke="#5A2818" stroke-width="1"/><line x1="10" y1="32" x2="50" y2="32" stroke="#4A2015" stroke-width="1.2"/><line x1="30" y1="18" x2="30" y2="46" stroke="#4A2015" stroke-width="0.8"/><path d="M12,27 L30,20 L30,32 L12,32 Z" fill="#9A5040" opacity="0.2"/><path d="M30,20 L48,27 L48,32 L30,32 Z" fill="#9A5040" opacity="0.15"/><circle cx="20" cy="26" r="2" fill="#8A5040" stroke="#6A3828" stroke-width="0.5"/><circle cx="20" cy="38" r="2" fill="#8A5040" stroke="#6A3828" stroke-width="0.5"/><circle cx="38" cy="26" r="2" fill="#8A5040" stroke="#6A3828" stroke-width="0.5"/><circle cx="38" cy="38" r="2" fill="#8A5040" stroke="#6A3828" stroke-width="0.5"/><g stroke="#4A2015" stroke-width="3" stroke-linecap="round" fill="none"><path d="M16,22 L8,12 L4,10"/><path d="M16,42 L8,52 L4,54"/><path d="M38,22 L46,12 L50,10"/><path d="M38,42 L46,52 L50,54"/></g><path d="M48,22 Q56,26 58,32 Q56,38 48,42 Z" fill="#7A3828" stroke="#5A2818" stroke-width="1.5"/><polygon points="56,32 64,29 64,35" fill="#9A5040" stroke="#6A3020" stroke-width="0.6"/><polygon points="58,32 64,30 64,34" fill="#AA6050" opacity="0.4"/><circle cx="52" cy="28" r="2.2" fill="#FF7700" stroke="#CC5500" stroke-width="0.3"/><circle cx="52" cy="36" r="2.2" fill="#FF7700" stroke="#CC5500" stroke-width="0.3"/><circle cx="53" cy="28" r="0.8" fill="#220000"/><circle cx="53" cy="36" r="0.8" fill="#220000"/></svg>`,
  'enemy-fast': `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><defs><linearGradient id="ef1" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#CC6622"/><stop offset="100%" stop-color="#FFAA44"/></linearGradient><filter id="efs"><feDropShadow dx="1" dy="1" stdDeviation="1.5" flood-color="#000" flood-opacity="0.25"/></filter></defs><ellipse cx="33" cy="48" rx="14" ry="4" fill="#000" opacity="0.12"/><line x1="0" y1="26" x2="10" y2="26" stroke="#FFAA44" stroke-width="0.8" opacity="0.25" stroke-linecap="round"/><line x1="2" y1="32" x2="14" y2="32" stroke="#FFAA44" stroke-width="1.2" opacity="0.35" stroke-linecap="round"/><line x1="0" y1="38" x2="10" y2="38" stroke="#FFAA44" stroke-width="0.8" opacity="0.25" stroke-linecap="round"/><ellipse cx="22" cy="32" rx="10" ry="6" fill="url(#ef1)" stroke="#AA5518" stroke-width="1"/><line x1="18" y1="27" x2="18" y2="37" stroke="#AA5518" stroke-width="1.5" opacity="0.6"/><line x1="22" y1="26" x2="22" y2="38" stroke="#AA5518" stroke-width="1.5" opacity="0.6"/><line x1="26" y1="27" x2="26" y2="37" stroke="#AA5518" stroke-width="1.2" opacity="0.5"/><ellipse cx="24" cy="20" rx="10" ry="4" fill="#FFDDAA" opacity="0.3" transform="rotate(-10,24,20)"/><ellipse cx="24" cy="44" rx="10" ry="4" fill="#FFDDAA" opacity="0.3" transform="rotate(10,24,44)"/><ellipse cx="32" cy="32" rx="4" ry="3.5" fill="#FFBB55" stroke="#CC7722" stroke-width="0.6"/><path d="M34,26 L54,32 L34,38 Z" fill="#FFBB55" stroke="#CC7722" stroke-width="1" filter="url(#efs)"/><path d="M36,28 L50,32 L36,36 Z" fill="#FFCC66" opacity="0.3"/><circle cx="44" cy="29" r="2.5" fill="#FFFFFF" stroke="#DDDDDD" stroke-width="0.3"/><circle cx="44" cy="35" r="2.5" fill="#FFFFFF" stroke="#DDDDDD" stroke-width="0.3"/><circle cx="45" cy="29" r="1.2" fill="#111"/><circle cx="45" cy="35" r="1.2" fill="#111"/><polygon points="12,32 4,30 4,34" fill="#CC6622" stroke="#AA5518" stroke-width="0.5"/></svg>`,
  'enemy-flyer': `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><defs><radialGradient id="efl1" cx="55%" cy="45%" r="50%"><stop offset="0%" stop-color="#55CCEE"/><stop offset="100%" stop-color="#2288AA"/></radialGradient><radialGradient id="efle" cx="40%" cy="40%" r="50%"><stop offset="0%" stop-color="#88FFFF"/><stop offset="100%" stop-color="#00AACC"/></radialGradient><filter id="efls"><feDropShadow dx="2" dy="3" stdDeviation="2.5" flood-color="#000" flood-opacity="0.2"/></filter><filter id="eflgl"><feGaussianBlur stdDeviation="1" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><ellipse cx="36" cy="54" rx="14" ry="4" fill="#000" opacity="0.1"/><ellipse cx="26" cy="14" rx="16" ry="8" fill="#66DDEE" opacity="0.25" stroke="#44BBCC" stroke-width="0.5"/><ellipse cx="26" cy="50" rx="16" ry="8" fill="#66DDEE" opacity="0.25" stroke="#44BBCC" stroke-width="0.5"/><line x1="14" y1="12" x2="38" y2="18" stroke="#55CCDD" stroke-width="0.4" opacity="0.4"/><line x1="18" y1="10" x2="34" y2="16" stroke="#55CCDD" stroke-width="0.3" opacity="0.3"/><line x1="14" y1="52" x2="38" y2="46" stroke="#55CCDD" stroke-width="0.4" opacity="0.4"/><line x1="18" y1="54" x2="34" y2="48" stroke="#55CCDD" stroke-width="0.3" opacity="0.3"/><ellipse cx="30" cy="32" rx="14" ry="8" fill="url(#efl1)" stroke="#1A7799" stroke-width="1.5" filter="url(#efls)"/><ellipse cx="28" cy="28" rx="8" ry="3" fill="#77DDEE" opacity="0.25"/><line x1="22" y1="25" x2="22" y2="39" stroke="#1A7799" stroke-width="0.6" opacity="0.4"/><line x1="30" y1="24" x2="30" y2="40" stroke="#1A7799" stroke-width="0.6" opacity="0.4"/><line x1="38" y1="26" x2="38" y2="38" stroke="#1A7799" stroke-width="0.6" opacity="0.4"/><circle cx="46" cy="32" r="6" fill="#44CCDD" stroke="#1A7799" stroke-width="1.2"/><ellipse cx="48" cy="28" rx="3" ry="2.8" fill="url(#efle)" filter="url(#eflgl)"/><ellipse cx="48" cy="36" rx="3" ry="2.8" fill="url(#efle)" filter="url(#eflgl)"/><circle cx="49" cy="28" r="1" fill="#FFFFFF" opacity="0.8"/><circle cx="49" cy="36" r="1" fill="#FFFFFF" opacity="0.8"/><path d="M50,27 L56,20" stroke="#33AABB" stroke-width="1.2" stroke-linecap="round"/><path d="M50,37 L56,44" stroke="#33AABB" stroke-width="1.2" stroke-linecap="round"/><circle cx="56" cy="20" r="1.2" fill="#66EEFF" filter="url(#eflgl)"/><circle cx="56" cy="44" r="1.2" fill="#66EEFF" filter="url(#eflgl)"/><path d="M16,32 L8,28 L6,32 L8,36 Z" fill="#33AACC" stroke="#1A7799" stroke-width="0.6"/></svg>`,
  'enemy-swarm': `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><defs><radialGradient id="es1" cx="55%" cy="40%" r="50%"><stop offset="0%" stop-color="#EE55AA"/><stop offset="100%" stop-color="#AA2266"/></radialGradient><filter id="ess"><feDropShadow dx="1" dy="1" stdDeviation="1.5" flood-color="#000" flood-opacity="0.25"/></filter></defs><ellipse cx="33" cy="48" rx="10" ry="3" fill="#000" opacity="0.12"/><ellipse cx="24" cy="32" rx="8" ry="7" fill="#CC3388" stroke="#992266" stroke-width="0.8"/><ellipse cx="34" cy="32" rx="9" ry="8" fill="url(#es1)" stroke="#992266" stroke-width="1" filter="url(#ess)"/><ellipse cx="32" cy="28" rx="5" ry="2.5" fill="#FF88CC" opacity="0.25"/><ellipse cx="26" cy="22" rx="7" ry="3.5" fill="#FFAADD" opacity="0.25" transform="rotate(-8,26,22)"/><ellipse cx="26" cy="42" rx="7" ry="3.5" fill="#FFAADD" opacity="0.25" transform="rotate(8,26,42)"/><g stroke="#992266" stroke-width="1.2" stroke-linecap="round" fill="none"><path d="M22,26 L16,18"/><path d="M22,38 L16,46"/><path d="M30,24 L26,16"/><path d="M30,40 L26,48"/><path d="M36,26 L40,18"/><path d="M36,38 L40,46"/></g><circle cx="44" cy="32" r="5" fill="#DD4499" stroke="#AA2266" stroke-width="0.8"/><circle cx="46" cy="29.5" r="2" fill="#FFAADD" stroke="#CC6699" stroke-width="0.3"/><circle cx="46" cy="34.5" r="2" fill="#FFAADD" stroke="#CC6699" stroke-width="0.3"/><circle cx="47" cy="29.5" r="0.7" fill="#440022"/><circle cx="47" cy="34.5" r="0.7" fill="#440022"/><path d="M48,28 L52,22" stroke="#AA2266" stroke-width="0.8" stroke-linecap="round"/><path d="M48,36 L52,42" stroke="#AA2266" stroke-width="0.8" stroke-linecap="round"/><circle cx="52" cy="22" r="0.8" fill="#FF66AA"/><circle cx="52" cy="42" r="0.8" fill="#FF66AA"/></svg>`,
};

// ─── PROJECTILES ──────────────────────────────────────────────────────

const projectiles = {
  'projectile-arrow': `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="8"><defs><filter id="pa"><feDropShadow dx="0" dy="0.5" stdDeviation="0.3" flood-color="#000" flood-opacity="0.3"/></filter></defs><rect x="3" y="3" width="15" height="2" fill="#8B6914" rx="0.5" filter="url(#pa)"/><rect x="5" y="3.2" width="12" height="0.8" fill="#A08030" opacity="0.4"/><polygon points="18,0.5 24,4 18,7.5" fill="#B0B0B0" stroke="#888" stroke-width="0.5"/><polygon points="19,2 23,4 19,6" fill="#D0D0D0" opacity="0.4"/><polygon points="0,0.5 5,3 5,4 0,3" fill="#CC2222"/><polygon points="0,7.5 5,5 5,4 0,5" fill="#CC2222"/><polygon points="1,1 4,3 4,3.5 1,2.5" fill="#EE4444" opacity="0.4"/><polygon points="1,7 4,5 4,4.5 1,5.5" fill="#EE4444" opacity="0.4"/></svg>`,
  'projectile-blast': `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><defs><radialGradient id="pb1" cx="40%" cy="40%" r="55%"><stop offset="0%" stop-color="#FFFFAA"/><stop offset="30%" stop-color="#FFCC22"/><stop offset="70%" stop-color="#FF8800"/><stop offset="100%" stop-color="#FF440000"/></radialGradient><filter id="pbg"><feGaussianBlur stdDeviation="1.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><circle cx="8" cy="8" r="7.5" fill="#FFAA00" opacity="0.15" filter="url(#pbg)"/><circle cx="8" cy="8" r="6" fill="url(#pb1)" filter="url(#pbg)"/><circle cx="8" cy="8" r="3" fill="#FFEE66" opacity="0.7"/><circle cx="7" cy="7" r="1.5" fill="#FFFFFF" opacity="0.85"/></svg>`,
  'projectile-missile': `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="10"><defs><linearGradient id="pm1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#8899AA"/><stop offset="50%" stop-color="#667788"/><stop offset="100%" stop-color="#556677"/></linearGradient><filter id="pmg"><feGaussianBlur stdDeviation="1" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><ellipse cx="3" cy="5" rx="4" ry="2.5" fill="#FF6600" opacity="0.35" filter="url(#pmg)"/><ellipse cx="1" cy="5" rx="2.5" ry="1.8" fill="#FFAA00" opacity="0.25" filter="url(#pmg)"/><rect x="6" y="1.5" width="14" height="7" fill="url(#pm1)" rx="1.5"/><rect x="8" y="2" width="10" height="2" fill="#99AABB" opacity="0.35" rx="0.5"/><rect x="10" y="1.5" width="2.5" height="7" fill="#DD3333" opacity="0.75"/><polygon points="20,0.5 24,5 20,9.5" fill="#EE3333" stroke="#CC2222" stroke-width="0.5"/><polygon points="20.5,2 23,5 20.5,8" fill="#FF5555" opacity="0.3"/><polygon points="6,1.5 3,0 8,1.5" fill="#556677"/><polygon points="6,8.5 3,10 8,8.5" fill="#556677"/></svg>`,
};

// ─── GENERATE ALL ─────────────────────────────────────────────────────

async function generateAll() {
  const assets = {};
  assets['tile-path'] = pathTile;
  for (let i = 0; i < 5; i++) assets[`tile-buildable${i === 0 ? '' : '-' + (i + 1)}`] = grassTile(i);
  blockedVariants.forEach((svg, i) => { assets[`tile-blocked${i === 0 ? '' : '-' + (i + 1)}`] = svg; });
  assets['tile-spawn'] = spawnTile;
  assets['tile-objective'] = objectiveTile;
  Object.assign(assets, towers, enemies, projectiles);

  const total = Object.keys(assets).length;
  let count = 0;
  console.log(`Generating ${total} game assets (v2)...\n`);

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
  console.log(`\nDone! Generated ${count}/${total} assets in ${SPRITES_DIR}`);
}

generateAll().catch(console.error);
