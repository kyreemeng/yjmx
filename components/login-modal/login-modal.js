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
      // 已填写昵称时误触遮罩需二次确认，避免丢失输入
      if (String(this.data.nickName || '').trim()) {
        wx.showModal({
          title: '放弃编辑？',
          content: '已填写的资料将不会保存',
          confirmText: '放弃',
          cancelText: '继续填写',
          success: (res) => {
            if (res.confirm) this.triggerEvent('close');
          },
        });
      } else {
        this.triggerEvent('close');
      }
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
