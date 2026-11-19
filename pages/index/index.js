/**
 * 抽象丑脸生成 · 首页
 *
 * 全流程纯前端：
 *   上传照片 -> 绘制到 canvas -> getImageData 取像素 -> 提取肤色/发色/背景色/脸型比例
 *   -> 用这些参数驱动几何生成器 -> 绘制抽象丑脸 -> canvasToTempFilePath 导出保存
 *
 * 不请求任何接口，不需要后端，0 成本。
 */

var draw = require('../../utils/draw.js');
var paletteUtil = require('../../utils/palette.js');

function getWin() {
  if (typeof wx.getWindowInfo === 'function') {
    try { return wx.getWindowInfo(); } catch (e) { /* 降级 */ }
  }
  return wx.getSystemInfoSync();
}

Page({
  data: {
    size: 300,
    busy: false,
    tip: '点「上传图片」，丑脸就照着你的样子长',
    swatches: []
  },

  onLoad: function () {
    var win = getWin();
    var size = Math.max(220, Math.min(win.windowWidth - 68, 420));
    var self = this;
    this.setData({ size: size }, function () {
      // 等一帧，确保 canvas 节点已挂载
      setTimeout(function () { self.setupCanvas(0); }, 30);
    });
  },

  onShareAppMessage: function () {
    return {
      title: '我生成了一张抽象丑脸，你也来试试',
      path: '/pages/index/index'
    };
  },

  /* ---------------- 初始化画布 ---------------- */

  setupCanvas: function (retry) {
    var self = this;
    wx.createSelectorQuery()
      .select('#face')
      .fields({ node: true, size: true })
      .exec(function (res) {
        var item = res && res[0];
        if (!item || !item.node) {
          if ((retry || 0) < 3) {
            setTimeout(function () { self.setupCanvas((retry || 0) + 1); }, 90);
          }
          return;
        }

        var canvas = item.node;
        var dpr = getWin().pixelRatio || 2;

        // Canvas 2D 的宽高是"设备像素"，必须乘 dpr 才不会糊
        canvas.width = item.width * dpr;
        canvas.height = item.height * dpr;

        self.canvas = canvas;
        self.ctx = canvas.getContext('2d');
        self.cssW = item.width;
        self.cssH = item.height;
        self.dpr = dpr;
        self.palette = null;

        self.regenerate();
      });
  },

  /* ---------------- 生成 ---------------- */

  regenerate: function () {
    var self = this;
    if (!this.ctx) return;

    this.setData({ busy: true });

    // 先让 loading 状态渲染出来，再做同步的几何计算
    setTimeout(function () {
      try {
        var face = draw.buildFace(self.palette);
        draw.renderFace(self.ctx, face, self.cssW, self.cssH, self.dpr);
        self.lastFace = face;
      } catch (err) {
        console.error('[抽象丑脸] 渲染失败', err);
        wx.showToast({ title: '生成失败，请重试', icon: 'none' });
      }
      self.setData({ busy: false });
    }, 30);
  },

  /* ---------------- 上传照片 ---------------- */

  onUpload: function () {
    var self = this;
    if (!this.canvas) {
      wx.showToast({ title: '画布还没准备好', icon: 'none' });
      return;
    }

    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: function (res) {
        var f = res.tempFiles && res.tempFiles[0];
        if (f && f.tempFilePath) self.applyPhoto(f.tempFilePath);
      },
      fail: function () { /* 用户取消，静默 */ }
    });
  },

  applyPhoto: function (filePath) {
    var self = this;
    var canvas = this.canvas;

    wx.showLoading({ title: '正在分析…', mask: true });

    var img = canvas.createImage();

    img.onload = function () {
      try {
        var W = canvas.width;
        var H = canvas.height;

        // 保持比例铺满画布（cover），保证四周取到的确实是背景
        var scale = Math.max(W / img.width, H / img.height);
        var dw = img.width * scale;
        var dh = img.height * scale;

        var ctx = self.ctx;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 1;
        ctx.clearRect(0, 0, W, H);
        ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);

        // 读取像素做配色分析（本地临时文件，无跨域污染）
        var pal = null;
        try {
          var imageData = ctx.getImageData(0, 0, W, H);
          pal = paletteUtil.analyzeImageData(imageData.data, W, H);
        } catch (e) {
          console.warn('[抽象丑脸] 像素分析不可用，回退到随机配色', e);
        }

        self.palette = (pal && pal.ok) ? pal : null;
        self.updateSwatches(self.palette);

        wx.hideLoading();
        self.regenerate();
      } catch (err) {
        wx.hideLoading();
        console.error('[抽象丑脸] 图片处理失败', err);
        wx.showToast({ title: '图片处理失败', icon: 'none' });
      }
    };

    img.onerror = function () {
      wx.hideLoading();
      wx.showToast({ title: '图片读取失败', icon: 'none' });
    };

    img.src = filePath;
  },

  updateSwatches: function (pal) {
    if (!pal) {
      this.setData({
        swatches: [],
        tip: '没识别出明显的人脸配色，已改用随机风格'
      });
      return;
    }
    this.setData({
      swatches: [
        { name: '肤色', color: paletteUtil.rgbCss(pal.skin) },
        { name: '发色', color: paletteUtil.rgbCss(pal.hair) },
        { name: '背景', color: paletteUtil.rgbCss(pal.bg) }
      ],
      tip: '已按你的照片提取配色 · 点「重新生成」换张脸'
    });
  },

  onReset: function () {
    this.palette = null;
    this.setData({
      swatches: [],
      tip: '已回到随机模式'
    });
    this.regenerate();
  },

  /* ---------------- 保存 ---------------- */

  onSave: function () {
    var self = this;
    if (!this.canvas) return;

    wx.showLoading({ title: '正在导出…', mask: true });

    wx.canvasToTempFilePath({
      canvas: this.canvas,
      fileType: 'png',
      quality: 1,
      success: function (res) {
        wx.hideLoading();
        wx.saveImageToPhotosAlbum({
          filePath: res.tempFilePath,
          success: function () {
            wx.showToast({ title: '已保存到相册' });
          },
          fail: function (err) {
            var msg = (err && err.errMsg) || '';
            if (msg.indexOf('auth') > -1 || msg.indexOf('deny') > -1) {
              wx.showModal({
                title: '需要相册权限',
                content: '请在设置中允许「保存到相册」后重试',
                confirmText: '去设置',
                success: function (m) {
                  if (m.confirm) wx.openSetting();
                }
              });
            } else {
              wx.showToast({ title: '保存失败', icon: 'none' });
            }
          }
        });
      },
      fail: function (err) {
        wx.hideLoading();
        console.error('[抽象丑脸] 导出失败', err);
        wx.showToast({ title: '导出失败', icon: 'none' });
      }
    }, this);
  }
});
