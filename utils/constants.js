const STORAGE_KEYS = {
  USER_INFO: 'user_info',
  LIKED_QUOTES: 'liked_quotes',
  FAVORITE_QUOTES: 'favorite_quotes',
  QUOTE_STATS: 'quote_stats',
  VIEWED_QUOTES: 'viewed_quotes',
  VIEWED_DATE: 'viewed_date',
  SETTINGS: 'settings',
};

const FAVORITE_LIMIT = 500;

const DEFAULT_AVATAR = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSI1MCIgY3k9IjUwIiByPSI1MCIgZmlsbD0iI0YwRURFOCIvPjxjaXJjbGUgY3g9IjUwIiBjeT0iNDAiIHI9IjE4IiBmaWxsPSIjOEI3MzU1Ii8+PGVsbGlwc2UgY3g9IjUwIiBjeT0iOTUiIHJ4PSIzMCIgcnk9IjI1IiBmaWxsPSIjOEI3MzU1Ii8+PC9zdmc+';

module.exports = {
  STORAGE_KEYS,
  FAVORITE_LIMIT,
  DEFAULT_AVATAR,
};
