const { DEFAULT_AVATAR } = require('../../utils/constants');

Component({
  properties: {
    show: {
      type: Boolean,
      value: false,
    },
  },

  data: {
    avatarUrl: DEFAULT_AVATAR,
    nickName: '',
  },

  observers: {
    show(show) {
      if (show) {
        this.setData({ avatarUrl: DEFAULT_AVATAR, nickName: '' });
      }
    },
  },

  methods: {
    onClose() {
      this.triggerEvent('close');
    },

    onOverlayTap() {
      this.triggerEvent('close');
    },

    preventBubble() {
      // 阻止事件冒泡
    },

    onChooseAvatar(e) {
      const avatarUrl = e.detail.avatarUrl;
      if (avatarUrl) this.setData({ avatarUrl });
    },

    onNicknameInput(e) {
      this.setData({ nickName: e.detail.value });
    },

    onSubmit(e) {
      const nickName = String(e.detail.value.nickname || this.data.nickName || '').trim();
      if (!nickName) {
        wx.showToast({ title: '请填写昵称', icon: 'none' });
        return;
      }
      this.triggerEvent('success', {
        userInfo: {
          nickName,
          avatarUrl: this.data.avatarUrl,
        },
      });
    },
  },
});
