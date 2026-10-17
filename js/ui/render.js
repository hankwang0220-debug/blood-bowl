/* 球場繪製（Canvas）。座標系統在球場外圍多留一格當作觀眾席。 */
(function () {
  'use strict';
  const BB = globalThis.BB;
  const W = BB.W, H = BB.H;

  function textColor(hex) {
    const n = parseInt(hex.slice(1), 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#111' : '#fff';
  }

  class Renderer {
    constructor(canvas) {
      this.cv = canvas;
      this.ctx = canvas.getContext('2d');
      this.C = 32;
    }
    resize(maxW, maxH) {
      const C = Math.max(18, Math.min(52, Math.floor(Math.min(maxW / (W + 2), maxH / (H + 2)))));
      this.C = C;
      const dpr = window.devicePixelRatio || 1;
      this.cv.width = (W + 2) * C * dpr;
      this.cv.height = (H + 2) * C * dpr;
      this.cv.style.width = (W + 2) * C + 'px';
      this.cv.style.height = (H + 2) * C + 'px';
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    cellAt(px, py) {
      return { x: Math.floor(px / this.C) - 1, y: Math.floor(py / this.C) - 1 };
    }
    // 方格左上角
    sx(x) { return (x + 1) * this.C; }
    sy(y) { return (y + 1) * this.C; }

    draw(G, ui) {
      const ctx = this.ctx, C = this.C;
      ctx.clearRect(0, 0, (W + 2) * C, (H + 2) * C);
      // 觀眾席
      ctx.fillStyle = '#2a2420';
      ctx.fillRect(0, 0, (W + 2) * C, (H + 2) * C);
      // 草地
      for (let x = 0; x < W; x++) {
        ctx.fillStyle = x % 2 ? '#3c7f3a' : '#377637';
        ctx.fillRect(this.sx(x), this.sy(0), C, H * C);
      }
      // 達陣區：左邊是主隊防守的端區
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = G.teams[0].color; ctx.fillRect(this.sx(0), this.sy(0), C, H * C);
      ctx.fillStyle = G.teams[1].color; ctx.fillRect(this.sx(W - 1), this.sy(0), C, H * C);
      ctx.globalAlpha = 1;
      // 格線
      ctx.strokeStyle = 'rgba(255,255,255,0.10)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x <= W; x++) { ctx.moveTo(this.sx(x) + 0.5, this.sy(0)); ctx.lineTo(this.sx(x) + 0.5, this.sy(H)); }
      for (let y = 0; y <= H; y++) { ctx.moveTo(this.sx(0), this.sy(y) + 0.5); ctx.lineTo(this.sx(W), this.sy(y) + 0.5); }
      ctx.stroke();
      // 邊界線
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 2;
      ctx.strokeRect(this.sx(0), this.sy(0), W * C, H * C);
      ctx.beginPath();
      ctx.moveTo(this.sx(1), this.sy(0)); ctx.lineTo(this.sx(1), this.sy(H));
      ctx.moveTo(this.sx(W - 1), this.sy(0)); ctx.lineTo(this.sx(W - 1), this.sy(H));
      ctx.stroke();
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(this.sx(13), this.sy(0)); ctx.lineTo(this.sx(13), this.sy(H)); ctx.stroke();
      ctx.setLineDash([6, 5]); ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(this.sx(0), this.sy(4)); ctx.lineTo(this.sx(W), this.sy(4));
      ctx.moveTo(this.sx(0), this.sy(11)); ctx.lineTo(this.sx(W), this.sy(11));
      ctx.stroke();
      ctx.setLineDash([]);

      // 擒抱區
      if (ui.showTZ) {
        for (const p of G.players) {
          if (!BB.hasTZ(p)) continue;
          ctx.fillStyle = G.teams[p.team].color;
          ctx.globalAlpha = 0.13;
          for (const [a, b] of BB.DIRS) {
            const x = p.x + a, y = p.y + b;
            if (BB.onPitch(x, y)) ctx.fillRect(this.sx(x) + 2, this.sy(y) + 2, C - 4, C - 4);
          }
        }
        ctx.globalAlpha = 1;
      }

      // 區域高亮
      for (const h of ui.areas || []) {
        ctx.fillStyle = h.color; ctx.globalAlpha = h.alpha || 0.2;
        ctx.fillRect(this.sx(h.x), this.sy(h.y), (h.w || 1) * C, (h.h || 1) * C);
      }
      ctx.globalAlpha = 1;

      // 可到達的格子
      if (ui.reach) {
        for (const r of ui.reach.values()) {
          const c = r.prob >= 0.999 ? '255,255,255' : r.prob >= 0.66 ? '255,220,60' : '255,90,60';
          ctx.fillStyle = `rgba(${c},${r.rushes ? 0.16 : 0.3})`;
          ctx.fillRect(this.sx(r.x) + 2, this.sy(r.y) + 2, C - 4, C - 4);
        }
      }
      // 目標格（點擊選項）
      for (const tg of ui.targets || []) {
        ctx.strokeStyle = tg.color || '#ffd54f';
        ctx.lineWidth = 2.5;
        ctx.strokeRect(this.sx(tg.x) + 2, this.sy(tg.y) + 2, C - 4, C - 4);
        if (tg.label) this.label(tg.x, tg.y, tg.label, tg.color || '#ffd54f');
      }

      // 路徑
      if (ui.path && ui.path.length) {
        const sel = ui.pathFrom;
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(this.sx(sel.x) + C / 2, this.sy(sel.y) + C / 2);
        for (const [x, y] of ui.path) ctx.lineTo(this.sx(x) + C / 2, this.sy(y) + C / 2);
        ctx.stroke();
        ui.path.forEach(([x, y], i) => {
          ctx.fillStyle = 'rgba(0,0,0,0.55)';
          ctx.beginPath(); ctx.arc(this.sx(x) + C / 2, this.sy(y) + C / 2, C * 0.2, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#fff';
          ctx.font = `bold ${Math.round(C * 0.28)}px sans-serif`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(String(i + 1), this.sx(x) + C / 2, this.sy(y) + C / 2 + 1);
        });
      }
      // 傳球線
      if (ui.passLine) {
        const [a, b] = ui.passLine;
        ctx.strokeStyle = '#ffe082'; ctx.setLineDash([5, 4]); ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(this.sx(a[0]) + C / 2, this.sy(a[1]) + C / 2);
        ctx.lineTo(this.sx(b[0]) + C / 2, this.sy(b[1]) + C / 2);
        ctx.stroke(); ctx.setLineDash([]);
      }

      // 球員
      for (const p of G.players) if (p.loc === 'pitch') this.player(G, p, ui);
      // 球
      this.ball(G);
      // 浮動文字
      const now = performance.now();
      for (const f of ui.fx || []) {
        const age = (now - f.t0) / 1600;
        if (age >= 1 || f.x < 0) continue;
        ctx.globalAlpha = 1 - age * age;
        ctx.font = `bold ${Math.round(C * 0.36)}px sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const tx = this.sx(f.x) + C / 2, ty = this.sy(f.y) - age * C * 0.9 + (f.row || 0) * C * 0.42;
        ctx.lineWidth = 3; ctx.strokeStyle = '#000';
        ctx.strokeText(f.text, tx, ty);
        ctx.fillStyle = f.good === true ? '#7CFC8A' : f.good === false ? '#ff7a70' : '#ffe082';
        ctx.fillText(f.text, tx, ty);
      }
      ctx.globalAlpha = 1;
    }

    label(x, y, text, color) {
      const ctx = this.ctx, C = this.C;
      ctx.font = `bold ${Math.round(C * 0.27)}px sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const tx = this.sx(x) + C / 2, ty = this.sy(y) - C * 0.12;
      ctx.lineWidth = 3; ctx.strokeStyle = '#000'; ctx.strokeText(text, tx, ty);
      ctx.fillStyle = color; ctx.fillText(text, tx, ty);
    }

    player(G, p, ui) {
      const ctx = this.ctx, C = this.C;
      const cx = this.sx(p.x) + C / 2, cy = this.sy(p.y) + C / 2;
      const color = G.teams[p.team].color;
      const big = p.st >= 5;
      const r = C * (big ? 0.45 : 0.37);
      const dim = p.activated && p.team === G.active;
      ctx.save();
      if (p.status !== 'standing') ctx.globalAlpha = 0.72;
      // 陰影
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath(); ctx.ellipse(cx + 2, cy + 3, r, r * 0.9, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = color;
      ctx.beginPath();
      if (p.status === 'standing') ctx.arc(cx, cy, r, 0, Math.PI * 2);
      else ctx.ellipse(cx, cy + r * 0.25, r, r * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = p.star ? 3 : 2;
      ctx.strokeStyle = p.star ? '#ffd54f' : 'rgba(0,0,0,0.7)';
      ctx.stroke();
      if (dim) { ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fill(); }
      ctx.restore();
      // 號碼
      ctx.font = `bold ${Math.round(C * (big ? 0.38 : 0.34))}px sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = dim ? '#999' : textColor(color);
      ctx.fillText(p.short, cx, cy + (p.status === 'standing' ? 0 : r * 0.25) + 1);
      ctx.font = `${Math.round(C * 0.22)}px sans-serif`;
      ctx.fillStyle = '#fff';
      ctx.lineWidth = 2; ctx.strokeStyle = '#000';
      ctx.strokeText(String(p.num), cx - r * 0.75, cy - r * 0.8);
      ctx.fillText(String(p.num), cx - r * 0.75, cy - r * 0.8);
      if (p.status === 'stunned') {
        ctx.font = `bold ${Math.round(C * 0.32)}px sans-serif`;
        ctx.fillStyle = '#ffeb3b'; ctx.strokeText('✱', cx + r * 0.75, cy - r * 0.6); ctx.fillText('✱', cx + r * 0.75, cy - r * 0.6);
      }
      // 狀態小標記：分心 ?、生根 ⚘、隊長 C
      const marks = [];
      if (p.distracted) marks.push(['?', '#90caf9']);
      if (p.rooted) marks.push(['⚘', '#a5d6a7']);
      if (p.captain) marks.push(['C', '#ffd54f']);
      marks.forEach(([t, col], i) => {
        ctx.font = `bold ${Math.round(C * 0.26)}px sans-serif`;
        const mx = cx + r * 0.85, my = cy + r * 0.55 - i * C * 0.26;
        ctx.fillStyle = col; ctx.strokeText(t, mx, my); ctx.fillText(t, mx, my);
      });
      if (ui.sel === p.id) {
        ctx.strokeStyle = '#ffeb3b'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(cx, cy, r + 4, 0, Math.PI * 2); ctx.stroke();
      }
    }

    ball(G) {
      const b = G.ball;
      if (!BB.onPitch(b.x, b.y)) {
        if (b.inAir && b.x > -3 && b.y > -3 && b.x < W + 2 && b.y < H + 2) this.drawBall(b.x, b.y, 0, 0, true);
        return;
      }
      if (b.carrier != null) this.drawBall(b.x, b.y, 0.3, -0.28, false);
      else this.drawBall(b.x, b.y, 0, 0, b.inAir);
    }
    drawBall(x, y, ox, oy, air) {
      const ctx = this.ctx, C = this.C;
      const cx = this.sx(x) + C / 2 + ox * C, cy = this.sy(y) + C / 2 + oy * C;
      const r = C * 0.17;
      ctx.save();
      if (air) {
        ctx.globalAlpha = 0.4; ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.ellipse(cx, cy + C * 0.3, r, r * 0.5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 0.9;
      }
      ctx.fillStyle = '#8d5a2b';
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(cx, cy - (air ? C * 0.15 : 0), r * 1.25, r, -0.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
  }
  BB.Renderer = Renderer;
})();
