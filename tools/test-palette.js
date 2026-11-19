/**
 * 调色板提取模块的单元测试
 * 合成几张"假照片"的像素数据，检查提取结果是否合理。
 */
const path = require('path');
const P = require(path.join(__dirname, '..', 'chou-lian-face', 'utils', 'palette.js'));

const W = 240, H = 240;

/** 合成一张人像：纯色背景 + 顶部头发 + 中间椭圆脸 */
function makePortrait(opt) {
  const data = new Uint8ClampedArray(W * H * 4);
  const cx = W / 2, cy = H * 0.55;
  const rx = W * opt.faceW, ry = H * opt.faceH;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      let c = opt.bg;

      // 头发：顶部一条带
      if (y < H * 0.28) c = opt.hair;

      // 脸：椭圆
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      if (dx * dx + dy * dy <= 1) {
        c = opt.skin;
      }
      // 加一点噪点模拟真实照片
      const n = (Math.random() - 0.5) * opt.noise;
      data[i] = c[0] + n;
      data[i + 1] = c[1] + n;
      data[i + 2] = c[2] + n;
      data[i + 3] = 255;
    }
  }
  return data;
}

function show(name, opt, expect) {
  const data = makePortrait(opt);
  const r = P.analyzeImageData(data, W, H);
  const d = (a, b) => Math.round(P.colorDistance(a, b));

  console.log('\n=== ' + name + ' ===');
  console.log('  输入   肤色 ' + opt.skin + '  发色 ' + opt.hair + '  背景 ' + opt.bg);
  console.log('  提取   肤色 ' + r.skin.map(v => Math.round(v)) +
    ' (Δ' + d(r.skin, opt.skin) + ')');
  console.log('         发色 ' + r.hair.map(v => Math.round(v)) +
    ' (Δ' + d(r.hair, opt.hair) + ')');
  console.log('         背景 ' + r.bg.map(v => Math.round(v)) +
    ' (Δ' + d(r.bg, opt.bg) + ')');
  console.log('         唇色 ' + r.lip.map(v => Math.round(v)));
  console.log('         脸型比例 ' + r.faceRatio.toFixed(3) + '   ok=' + r.ok);

  const passSkin = d(r.skin, opt.skin) < 90;
  const passBg = d(r.bg, opt.bg) < 70;
  const passHair = d(r.hair, opt.hair) < 90;
  const passSep = P.colorDistance(r.bg, r.skin) > 60;
  console.log('  判定   ' + [
    passSkin ? '肤色OK' : '肤色偏差大',
    passHair ? '发色OK' : '发色偏差大',
    passBg ? '背景OK' : '背景偏差大',
    passSep ? '脸/底可区分' : '脸底太接近!'
  ].join(' | '));
  return passSkin && passBg && passHair && passSep;
}

let all = true;

all = show('浅肤色 / 深发 / 天蓝背景', {
  skin: [222, 178, 143], hair: [48, 36, 32], bg: [126, 166, 208],
  faceW: 0.30, faceH: 0.34, noise: 12
}, null) && all;

all = show('深肤色 / 黑发 / 米白背景', {
  skin: [124, 84, 62], hair: [22, 18, 18], bg: [238, 234, 226],
  faceW: 0.28, faceH: 0.33, noise: 10
}, null) && all;

all = show('偏黄肤色 / 棕发 / 灰绿背景', {
  skin: [228, 196, 148], hair: [92, 62, 40], bg: [118, 132, 104],
  faceW: 0.29, faceH: 0.30, noise: 14
}, null) && all;

all = show('长脸（纵向拉伸）', {
  skin: [214, 170, 138], hair: [60, 44, 38], bg: [200, 206, 214],
  faceW: 0.20, faceH: 0.36, noise: 10
}, null) && all;

console.log('\n结果: ' + (all ? '全部通过' : '存在失败项'));
