function filterFavorites(list, theme = 'all', rarity = 'all') {
  if (!Array.isArray(list)) return [];
  return list.filter((item) => {
    const themeMatches = theme === 'all' || item.sourceKey === theme;
    const rarityMatches = rarity === 'all' || item.rarityKey === rarity;
    return themeMatches && rarityMatches;
  });
}

function buildThemeOptions(list) {
  const labels = new Map();
  (Array.isArray(list) ? list : []).forEach((item) => {
    if (!item || !item.sourceKey) return;
    labels.set(item.sourceKey, item.sourceTitle || item.source || item.sourceKey);
  });
  return [
    { key: 'all', label: '全部主题' },
    ...Array.from(labels, ([key, label]) => ({ key, label })),
  ];
}

module.exports = {
  filterFavorites,
  buildThemeOptions,
};
