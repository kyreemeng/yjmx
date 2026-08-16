// 图形路径取自 Tabler Icons（MIT License）
// https://github.com/tabler/tabler-icons
const ICON_PATHS = {
  refresh: '<path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4"/><path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4"/>',
  heart: '<path d="M19.5 12.572l-7.5 7.428l-7.5 -7.428a5 5 0 1 1 7.5 -6.566a5 5 0 1 1 7.5 6.572"/>',
  star: '<path d="M12 17.75l-6.172 3.245l1.179 -6.873l-4.993 -4.867l6.9 -1.002l3.086 -6.253l3.086 6.253l6.9 1.002l-4.993 4.867l1.179 6.873z"/>',
  share: '<path d="M6 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0"/><path d="M18 6m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0"/><path d="M18 18m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0"/><path d="M8.7 10.7l6.6 -3.4"/><path d="M8.7 13.3l6.6 3.4"/>',
  poster: '<path d="M15 8h.01"/><path d="M3 6a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v12a3 3 0 0 1 -3 3h-12a3 3 0 0 1 -3 -3v-12z"/><path d="M3 16l5 -5c.928 -.893 2.072 -.893 3 0l5 5"/><path d="M14 14l1 -1c.928 -.893 2.072 -.893 3 0l3 3"/>',
  home: '<path d="M3 11l9 -8l9 8"/><path d="M5 10v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1 -1v-10"/><path d="M9 21v-6a3 3 0 0 1 6 0v6"/>',
  trophy: '<path d="M8 21h8"/><path d="M12 17v4"/><path d="M7 4h10v8a5 5 0 0 1 -10 0z"/><path d="M5 9l-2 -1v2a3 3 0 0 0 3 3h1"/><path d="M19 9l2 -1v2a3 3 0 0 1 -3 3h-1"/>',
  user: '<path d="M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0"/><path d="M6 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2"/>',
  chevronRight: '<path d="M9 6l6 6l-6 6"/>',
  chevronLeft: '<path d="M15 6l-6 6l6 6"/>',
  inbox: '<path d="M4 13h3l3 3h4l3 -3h3"/><path d="M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2z"/>',
  wifiOff: '<path d="M12 18l.01 0"/><path d="M9.172 15.172a4 4 0 0 1 5.656 0"/><path d="M6.343 12.343a8 8 0 0 1 7.864 -2.03"/><path d="M16.53 10.536a8 8 0 0 1 1.127 1.807"/><path d="M3.515 9.515a12 12 0 0 1 2.679 -1.965"/><path d="M9.048 5.06a12 12 0 0 1 11.437 4.455"/><path d="M3 3l18 18"/>',
  alertTriangle: '<path d="M12 9v4"/><path d="M12 17v.01"/><path d="M5.071 19h13.858a2 2 0 0 0 1.736 -3l-6.929 -12a2 2 0 0 0 -3.472 0l-6.929 12a2 2 0 0 0 1.736 3"/>',
};

function encodeBase64(value) {
  const bytes = unescape(encodeURIComponent(value));
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  let output = '';

  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes.charCodeAt(i);
    const b = bytes.charCodeAt(i + 1);
    const c = bytes.charCodeAt(i + 2);
    const triplet = (a << 16) | ((b || 0) << 8) | (c || 0);
    output += alphabet[(triplet >> 18) & 63];
    output += alphabet[(triplet >> 12) & 63];
    output += Number.isNaN(b) ? '=' : alphabet[(triplet >> 6) & 63];
    output += Number.isNaN(c) ? '=' : alphabet[triplet & 63];
  }

  return output;
}

// 图标源缓存：同一 (name, color, filled) 组合复用，避免点赞/收藏切换时重复 base64 编码
const ICON_CACHE = {};

function createIconSource(name, color, filled) {
  const cacheKey = name + '|' + color + '|' + (filled ? '1' : '0');
  if (ICON_CACHE[cacheKey]) return ICON_CACHE[cacheKey];

  const paths = ICON_PATHS[name] || ICON_PATHS.inbox;
  const fill = filled ? color : 'none';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="${fill}" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
  const src = `data:image/svg+xml;base64,${encodeBase64(svg)}`;
  ICON_CACHE[cacheKey] = src;
  return src;
}

Component({
  properties: {
    name: { type: String, value: 'inbox' },
    color: { type: String, value: '#8B7355' },
    size: { type: Number, value: 48 },
    filled: { type: Boolean, value: false },
  },

  data: {
    src: '',
  },

  observers: {
    'name, color, filled': function (name, color, filled) {
      this.setData({ src: createIconSource(name, color, filled) });
    },
  },
});
