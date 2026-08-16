Component({
  options: {
    addGlobalClass: true,
  },

  properties: {
    quote: {
      type: Object,
      value: null,
    },
    liked: {
      type: Boolean,
      value: false,
    },
    favorited: {
      type: Boolean,
      value: false,
    },
    loading: {
      type: Boolean,
      value: false,
    },
    showActions: {
      type: Boolean,
      value: true,
    },
    showRefresh: {
      type: Boolean,
      value: true,
    },
    animate: {
      type: Boolean,
      value: true,
    },
  },

  data: {
    animating: false,
    lastAction: '',
    contentReady: false,
  },

  observers: {
    'quote': function (quote) {
      if (quote) {
        if (this._contentTimer) clearTimeout(this._contentTimer);
        if (!this.data.animate) {
          this.setData({ contentReady: true });
          return;
        }
        this.setData({ contentReady: false });
        this._contentTimer = setTimeout(() => {
          this.setData({ contentReady: true });
        }, 24);
      }
    },
  },

  lifetimes: {
    detached() {
      if (this._contentTimer) clearTimeout(this._contentTimer);
      if (this._actionTimer) clearTimeout(this._actionTimer);
    },
  },

  methods: {
    onTapCard() {
      this.triggerEvent('tap', { quote: this.data.quote });
    },

    onLike() {
      if (this.data.loading || this.data.animating) return;
      this.setData({ animating: true, lastAction: 'like' });
      this.triggerEvent('like', { quote: this.data.quote });
      this._actionTimer = setTimeout(() => {
        this.setData({ animating: false });
      }, 200);
    },

    onFavorite() {
      if (this.data.loading || this.data.animating) return;
      this.setData({ animating: true, lastAction: 'favorite' });
      this.triggerEvent('favorite', { quote: this.data.quote });
      this._actionTimer = setTimeout(() => {
        this.setData({ animating: false });
      }, 200);
    },

    onPoster() {
      if (this.data.loading || this.data.animating) return;
      this.setData({ animating: true, lastAction: 'poster' });
      this.triggerEvent('poster', { quote: this.data.quote });
      this._actionTimer = setTimeout(() => {
        this.setData({ animating: false });
      }, 200);
    },

    onRefresh() {
      if (this.data.loading || this.data.animating) return;
      this.setData({ animating: true, lastAction: 'refresh' });
      this.triggerEvent('refresh', { quote: this.data.quote });
      this._actionTimer = setTimeout(() => {
        this.setData({ animating: false });
      }, 200);
    },
  },
});
