/**
 * 开发用预览脚本（不参与小程序打包，放在小程序目录之外）
 *
 * 用一个"记录型 Canvas 2D 上下文"接管 draw.js 的全部绘制指令，
 * 转成 SVG 字符串输出，用来在开发阶段验证几何算法是否正确。
 *
 * 用法: node tools/preview-face.js [数量]
 */

const path = require('path');
const fs = require('fs');

const draw = require(path.join(__dirname, '..', 'chou-lian-face', 'utils', 'draw.js'));

/* ---------------- 记录型 Canvas 2D 上下文 ---------------- */

class RecorderContext {
  constructor() {
    this.t = [1, 0, 0, 1, 0, 0];
    this.stack = [];
    this.paths = [];     // 当前路径的子路径，每项 { pts: [[x,y]...], closed: bool }
    this.cur = null;
    this.out = [];
    this.clips = [];
    this.idc = 0;

    this.fillStyle = '#000';
    this.strokeStyle = '#000';
    this.lineWidth = 1;
    this.lineJoin = 'miter';
    this.lineCap = 'butt';
    this.globalAlpha = 1;
  }

  /* --- 变换 --- */
  setTransform(a, b, c, d, e, f) { this.t = [a, b, c, d, e, f]; }

  translate(tx, ty) {
    const [a, b, c, d, e, f] = this.t;
    this.t = [
      a, b, c, d,
      a * tx + c * ty + e,
      b * tx + d * ty + f
    ];
  }

  _apply(x, y) {
    const [a, b, c, d, e, f] = this.t;
    return [a * x + c * y + e, b * x + d * y + f];
  }

  _scaleFactor() {
    const [a, b, c, d] = this.t;
    return Math.sqrt(Math.abs(a * d - b * c)) || 1;
  }

  /* --- 状态 --- */
  save() {
    this.stack.push({
      t: this.t.slice(),
      fillStyle: this.fillStyle,
      strokeStyle: this.strokeStyle,
      lineWidth: this.lineWidth,
      lineJoin: this.lineJoin,
      lineCap: this.lineCap,
      globalAlpha: this.globalAlpha,
      clips: this.clips.slice()
    });
  }

  restore() {
    const s = this.stack.pop();
    if (!s) return;
    this.t = s.t;
    this.fillStyle = s.fillStyle;
    this.strokeStyle = s.strokeStyle;
    this.lineWidth = s.lineWidth;
    this.lineJoin = s.lineJoin;
    this.lineCap = s.lineCap;
    this.globalAlpha = s.globalAlpha;
    this.clips = s.clips;
  }

  /* --- 路径 --- */
  beginPath() { this.paths = []; this.cur = null; }

  moveTo(x, y) { this.cur = { pts: [[x, y]], closed: false }; this.paths.push(this.cur); }

  lineTo(x, y) { if (!this.cur) this.moveTo(x, y); else this.cur.pts.push([x, y]); }

  closePath() { if (this.cur) this.cur.closed = true; }

  quadraticCurveTo(cx, cy, x, y) {
    if (!this.cur) this.moveTo(x, y);
    const p0 = this.cur.pts[this.cur.pts.length - 1];
    for (let i = 1; i <= 16; i++) {
      const t = i / 16, mt = 1 - t;
      this.cur.pts.push([
        mt * mt * p0[0] + 2 * mt * t * cx + t * t * x,
        mt * mt * p0[1] + 2 * mt * t * cy + t * t * y
      ]);
    }
  }

  arc(x, y, r, a0, a1) {
    const seg = 44;
    const sub = { pts: [], closed: true };
    for (let i = 0; i <= seg; i++) {
      const a = a0 + (a1 - a0) * (i / seg);
      sub.pts.push([x + Math.cos(a) * r, y + Math.sin(a) * r]);
    }
    this.paths.push(sub);
    this.cur = sub;
  }

  _pathData(transformFn) {
    let d = '';
    for (const sub of this.paths) {
      if (sub.pts.length < 2) continue;
      const p = sub.pts.map(([x, y]) => transformFn(x, y));
      d += 'M' + p.map(q => q[0].toFixed(2) + ',' + q[1].toFixed(2)).join('L');
      if (sub.closed) d += 'Z';
    }
    return d;
  }

  _clipAttrs() {
    if (!this.clips.length) return '';
    return ' clip-path="url(#' + this.clips[this.clips.length - 1] + ')"';
  }

  fill() {
    const d = this._pathData((x, y) => this._apply(x, y));
    if (!d) return;
    this.out.push(
      '<path d="' + d + '" fill="' + this.fillStyle + '" fill-rule="nonzero" opacity="' +
      this.globalAlpha.toFixed(2) + '"' + this._clipAttrs() + '/>'
    );
  }

  stroke() {
    const d = this._pathData((x, y) => this._apply(x, y));
    if (!d) return;
    const lw = (this.lineWidth * this._scaleFactor()).toFixed(2);
    this.out.push(
      '<path d="' + d + '" fill="none" stroke="' + this.strokeStyle + '" stroke-width="' + lw +
      '" stroke-linejoin="' + this.lineJoin + '" stroke-linecap="' + this.lineCap +
      '" opacity="' + this.globalAlpha.toFixed(2) + '"' + this._clipAttrs() + '/>'
    );
  }

  clip() {
    const id = 'clip' + (this.idc++);
    const d = this._pathData((x, y) => this._apply(x, y));
    this.out.push('<clipPath id="' + id + '"><path d="' + d + '"/></clipPath>');
    this.clips.push(id);
  }

  clearRect() {}
  fillRect(x, y, w, h) {
    const p = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]].map(q => this._apply(q[0], q[1]));
    this.out.push(
      '<path d="M' + p.map(q => q[0].toFixed(2) + ',' + q[1].toFixed(2)).join('L') +
      'Z" fill="' + this.fillStyle + '"/>'
    );
  }
}

/* ---------------- 渲染 ---------------- */

function renderSvg(size, palette) {
  const ctx = new RecorderContext();
  const face = draw.buildFace(palette);
  draw.renderFace(ctx, face, size, size, 1);

  // clipPath 必须放在 defs 里，简单挪一下位置
  const defs = ctx.out.filter(l => l.startsWith('<clipPath')).join('');
  const body = ctx.out.filter(l => !l.startsWith('<clipPath')).join('');

  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">` +
      `<defs>${defs}</defs>` +
      `<rect width="${size}" height="${size}" fill="#ffffff"/>` +
      body +
      `</svg>`,
    face
  };
}

/* ---------------- CLI ---------------- */

if (require.main === module) {
  const n = parseInt(process.argv[2] || '1', 10);
  const fakePhotoPalette = {
    ok: true,
    skin: [226, 179, 141],
    hair: [52, 38, 34],
    bg: [180, 205, 214],
    lip: [190, 112, 118],
    faceRatio: 1.02
  };

  for (let i = 0; i < n; i++) {
    const isPhoto = i % 2 === 0;
    const r = renderSvg(680, isPhoto ? fakePhotoPalette : null);
    const file = path.join(__dirname, 'preview-' + i + '.svg');
    fs.writeFileSync(file, r.svg, 'utf8');
    console.log(
      '[' + i + '] ' + (isPhoto ? '照片配色' : '随机配色') +
      ' 头发线条=' + r.face.hairs.length +
      ' 脸宽=' + r.face.faceWidth.toFixed(1) +
      ' 脸高=' + r.face.faceHeight.toFixed(1) +
      ' -> ' + file
    );
  }
}
