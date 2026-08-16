const RARITIES = {
  legendary: { key: 'legendary', label: '传世', className: 'rarity-legendary' },
  epic: { key: 'epic', label: '精粹', className: 'rarity-epic' },
  rare: { key: 'rare', label: '佳句', className: 'rarity-rare' },
  common: { key: 'common', label: '摘录', className: 'rarity-common' },
};

function getRarity(id) {
  const roll = (Number(id) * 7 + 3) % 100;
  if (roll < 5) return { ...RARITIES.legendary };
  if (roll < 20) return { ...RARITIES.epic };
  if (roll < 50) return { ...RARITIES.rare };
  return { ...RARITIES.common };
}

module.exports = {
  getRarity,
};
