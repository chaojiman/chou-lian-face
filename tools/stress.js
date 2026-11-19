const path = require('path');
const draw = require(path.join(__dirname, '..', 'chou-lian-face', 'utils', 'draw.js'));

// 最小可用的空上下文，只做数值校验
const noop = function () {};
const ctx = new Proxy({}, {
  get: function (t, k) { return (k in t) ? t[k] : noop; },
  set: function (t, k, v) { t[k] = v; return true; }
});

var bad = 0, maxHair = 0, minHair = 1e9;
var t0 = Date.now();
var N = 300;

for (var i = 0; i < N; i++) {
  var pal = (i % 3 === 0) ? null : {
    ok: true,
    skin: [200, 150, 120], hair: [50, 40, 35],
    bg: [180, 200, 210], lip: [190, 110, 115],
    faceRatio: 0.9 + (i % 5) * 0.05
  };
  try {
    var f = draw.buildFace(pal);
    var all = f.facePoints.concat(f.mouthPoints);
    for (var h = 0; h < f.hairs.length; h++) all = all.concat(f.hairs[h]);
    for (var k = 0; k < all.length; k++) {
      if (!isFinite(all[k][0]) || !isFinite(all[k][1])) throw new Error('NaN / Infinity 坐标');
    }
    if (!(f.faceWidth > 0) || !(f.faceHeight > 0)) throw new Error('脸宽高异常');
    if (f.hairs.length > maxHair) maxHair = f.hairs.length;
    if (f.hairs.length < minHair) minHair = f.hairs.length;
    draw.renderFace(ctx, f, 340, 340, 2);
  } catch (e) {
    bad++;
    if (bad <= 3) console.log('  失败 #' + i + ': ' + e.message);
  }
}

var cost = Date.now() - t0;
console.log(N + ' 次生成，失败 ' + bad + ' 次，耗时 ' + cost + 'ms（平均 ' + (cost / N).toFixed(1) + 'ms/张）');
console.log('头发线条数范围: ' + minHair + ' ~ ' + maxHair + '（上限 300）');
