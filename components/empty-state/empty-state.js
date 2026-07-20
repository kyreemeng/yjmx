Component({
  properties: {
    type: {
      type: String,
      value: 'empty',
    },
    title: {
      type: String,
      value: '',
    },
    description: {
      type: String,
      value: '',
    },
    buttonText: {
      type: String,
      value: '',
    },
  },

  data: {
    presets: {
      empty: { icon: 'inbox', title: '暂无数据', description: '这里还没有内容', buttonText: '去首页' },
      network: { icon: 'wifiOff', title: '网络开小差了', description: '请检查网络后重试', buttonText: '重新加载' },
      error: { icon: 'alertTriangle', title: '暂时无法加载', description: '请稍后再试', buttonText: '重试' },
      favorite: { icon: 'star', title: '还没有收藏', description: '去首页发现打动你的金句', buttonText: '去看看' },
      like: { icon: 'heart', title: '还没有点赞', description: '遇到喜欢的金句，可以点个赞', buttonText: '去首页' },
      rank: { icon: 'trophy', title: '暂无排行', description: '去首页点赞，让喜欢的金句上榜', buttonText: '去点赞' },
    },
    // 初始渲染即包含这些字段，避免「Expected updated data but get first rendering data」
    displayTitle: '暂无数据',
    displayDesc: '这里还没有内容',
    displayBtn: '去首页',
    displayIcon: 'inbox',
  },

  observers: {
    // 属性变化（含首次初始化）时同步展示字段，属于数据绑定机制，不会触发渲染层告警
    'type, title, description, buttonText': function (type, title, description, buttonText) {
      const preset = this.data.presets[type] || this.data.presets.empty;
      this.setData({
        displayTitle: title || preset.title,
        displayDesc: description || preset.description,
        displayBtn: buttonText || preset.buttonText,
        displayIcon: preset.icon,
      });
    },
  },

  methods: {
    onAction() {
      this.triggerEvent('action');
    },
  },
});
