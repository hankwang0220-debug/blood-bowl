/* 電腦 AI：依據啟發式評分決定每一個行動。只讀取引擎狀態，不修改它。 */
(function () {
  'use strict';
  const BB = globalThis.BB;
  const W = BB.W, H = BB.H;
  const AI = (BB.AI = {});
  const plans = [null, null]; // 每隊目前啟動中球員的後續步驟
  const END_TURN = { type: 'endTurn' };

  AI.reset = function () { plans[0] = plans[1] = null; };

  AI.decide = function (game, pr) {
    try { return decide(game.G, pr); }
    catch (e) { console.error(e); return fallback(pr); }
  };

  function fallback(pr) {
    switch (pr.type) {
      case 'turn': return END_TURN;
      case 'activation': return { type: 'end' };
      case 'setup': return { type: pr.error ? 'auto' : 'done' };
      case 'reroll': return { use: null };
      case 'confirm': case 'followUp': return { yes: false };
      case 'blockDice': return { pick: 0 };
      case 'push': return { x: pr.squares[0][0], y: pr.squares[0][1] };
      case 'intercept': case 'highKick': return { pid: null };
      case 'touchback': return { pid: pr.candidates[0] };
      case 'bncDir': return { dir: 3 };
      case 'kickOrReceive': return { choice: 'receive' };
      default: return null;
    }
  }

  const cheb = BB.cheb, has = BB.has;

  function decide(G, pr) {
    const t = pr.team;
    switch (pr.type) {
      case 'kickOrReceive': return { choice: 'receive' };
      case 'setup':
        if (pr.kind === 'kick' || pr.kind === 'receive') {
          if (pr.error) return { type: 'auto' };
          return BB.pitchPlayers(G, t).length ? { type: 'done' } : { type: 'auto' };
        }
        return { type: 'done' };
      case 'placeKick': {
        const R = 1 - t;
        const x = R === 0 ? 2 + Math.floor(Math.random() * 3) : 21 + Math.floor(Math.random() * 3);
        const y = Math.random() < 0.5 ? 3 + Math.floor(Math.random() * 3) : 9 + Math.floor(Math.random() * 3);
        return { x, y };
      }
      case 'touchback':
      case 'highKick': {
        const c = pr.candidates.map(id => G.players[id]);
        c.sort((a, b) => handScore(b) - handScore(a));
        return { pid: c.length ? c[0].id : null };
      }
      case 'reroll': {
        if (pr.dice) { // 阻擋骰由對手選：對手會挑最差的一顆，最差的不夠糟就不重擲
          const att = G.players[pr.pid];
          const bad = pr.dice.some(f => f === 'AD' || (f === 'BD' && !has(att, 'Block')));
          return { use: bad ? pickReroll(pr.options) : null };
        }
        return { use: pickReroll(pr.options) };
      }
      case 'blockDice': return chooseBlockDie(G, pr);
      case 'push': return choosePush(G, pr);
      case 'followUp': {
        const p = G.players[pr.pid];
        const cur = BB.markersOf(G, t, p.x, p.y).length;
        const nxt = BB.markersOf(G, t, pr.x, pr.y).length;
        if (G.ball.carrier === p.id) return { yes: nxt < cur };
        return { yes: nxt <= cur };
      }
      case 'intercept': {
        let best = null, bp = 0;
        for (const id of pr.candidates) {
          const q = G.players[id];
          const pp = BB.prob(q.ag, -2 - BB.markersOf(G, q.team, q.x, q.y).length);
          if (pp > bp) { bp = pp; best = id; }
        }
        return { pid: best };
      }
      case 'confirm': {
        if (pr.kind === 'dervish') {
          const p = G.players[pr.pid];
          const nx = p.x + BB.DIRS[pr.dir][0], ny = p.y + BB.DIRS[pr.dir][1];
          if (!BB.onPitch(nx, ny)) return { yes: true };
          const o = BB.playerAt(G, nx, ny);
          return { yes: !!(o && o.team === p.team) };
        }
        return { yes: true };
      }
      case 'bncDir':
        if (pr.rushing && pr.canStop) return { stop: true };
        return { dir: bncDirection(G, G.players[pr.pid]) };
      case 'turn':
        if (pr.error) { plans[t] = null; return END_TURN; }
        return planTurn(G, t);
      case 'activation': return nextStep(G, pr);
      default: return null;
    }
  }

  function pickReroll(opts) {
    if (opts.indexOf('brawler') >= 0) return 'brawler';
    if (opts.indexOf('hatred') >= 0) return 'hatred';
    if (opts.indexOf('pro') >= 0) return 'pro';
    if (opts.indexOf('team') >= 0) return 'team';
    if (opts.indexOf('tmt') >= 0) return 'tmt';
    return null;
  }

  function handScore(p) {
    return (7 - p.ag) * 3 + (has(p, 'Sure Hands') ? 2 : 0) + (has(p, 'Catch') ? 2 : 0) + p.ma * 0.3;
  }

  function chooseBlockDie(G, pr) {
    const att = G.players[pr.att], def = G.players[pr.def];
    if (att.team === def.team) { // 鏈球撞到自己人：挑傷害最小的
      const s = pr.dice.map(f => { const o = BB.faceOutcome(f, att, def, pr.blitz); return o.attDown ? -4 : o.defDown ? -2 : o.push ? 1 : 0; });
      return { pick: s.indexOf(Math.max(...s)) };
    }
    const scores = pr.dice.map(f => BB.faceScore(f, att, def, pr.blitz) + (G.ball.carrier === def.id && BB.faceOutcome(f, att, def, pr.blitz).defDown ? 2 : 0));
    if (pr.team === att.team) {
      const best = Math.max(...scores);
      if (pr.options && pr.options.length && best < 1) return { reroll: pickReroll(pr.options) };
      return { pick: scores.indexOf(best) };
    }
    return { pick: scores.indexOf(Math.min(...scores)) };
  }

  function choosePush(G, pr) {
    const v = G.players[pr.pid];
    const own = v.team === pr.team;
    let best = pr.squares[0], bs = -1e9;
    for (const [x, y] of pr.squares) {
      let s = 0;
      if (!BB.onPitch(x, y)) s = own ? -100 : 100;
      else {
        const edge = Math.min(y, H - 1 - y);
        s += own ? edge : -edge * 2;
        const mk = BB.markersOf(G, v.team, x, y).length;
        s += own ? -mk * 3 : mk * 2;
        if (BB.playerAt(G, x, y)) s -= 1;
      }
      if (s > bs) { bs = s; best = [x, y]; }
    }
    return { x: best[0], y: best[1] };
  }

  function bncDirection(G, p) {
    let best = null, bd = 99;
    for (const q of BB.pitchPlayers(G, 1 - p.team)) {
      if (q.status !== 'standing') continue;
      const dd = cheb(p.x, p.y, q.x, q.y);
      if (dd < bd) { bd = dd; best = q; }
    }
    // 鏈球只能朝四個正方向（面向達陣區或邊線）
    let dx = 0, dy = 0;
    if (best) {
      const ax = best.x - p.x, ay = best.y - p.y;
      if (Math.abs(ax) >= Math.abs(ay)) dx = Math.sign(ax) || 1; else dy = Math.sign(ay);
    } else dx = p.team === 0 ? 1 : -1;
    // 太靠近邊線時往內轉
    if (p.y <= 1 && dy < 0) dy = 1;
    if (p.y >= H - 2 && dy > 0) dy = -1;
    if (p.y <= 0 && dx) { dx = 0; dy = 1; }
    if (p.y >= H - 1 && dx) { dx = 0; dy = -1; }
    return BB.DIRS.findIndex(([a, b]) => a === dx && b === dy);
  }

  // ---------- 回合規劃 ----------
  function bestEndzone(G, p, reach) {
    const ez = BB.endzoneOf(p.team);
    let best = null;
    for (const r of reach.values()) {
      if (r.x !== ez) continue;
      if (!best || r.prob > best.prob + 1e-9 || (Math.abs(r.prob - best.prob) < 1e-9 && r.steps < best.steps)) best = r;
    }
    return best;
  }

  function pickupProb(G, p, x, y) {
    let mod = 0;
    if (!has(p, 'Big Hand')) {
      mod -= BB.markersOf(G, p.team, x, y).length;
      if (G.weather === 'rain') mod--;
    }
    if (has(p, 'Extra Arms')) mod++;
    let q = BB.prob(p.ag, mod);
    if (has(p, 'Sure Hands')) q = q + (1 - q) * q;
    return q;
  }

  function carrierValue(G, t, c, x, y) {
    const ez = BB.endzoneOf(t);
    let v = -Math.abs(ez - x) * 10;
    for (const q of G.players) {
      if (q.loc !== 'pitch' || q === c) continue;
      const dd = cheb(q.x, q.y, x, y);
      if (q.team === t) { if (dd === 1 && q.status === 'standing') v += 5; }
      else if (q.status === 'standing') {
        if (dd === 1) v -= 25;
        else if (dd === 2) v -= 9;
        else if (dd === 3) v -= 3;
      }
    }
    if (y === 0 || y === H - 1) v -= 6;
    return v;
  }

  function bestAdvance(G, c, reach) {
    const t = c.team;
    const cur = carrierValue(G, t, c, c.x, c.y);
    // 被盯防時原地不動也很危險，所以可以接受較冒險的脫身路線（例如彈簧跳躍）
    const minP = BB.markersOf(G, t, c.x, c.y).length ? 0.6 : 0.97;
    let best = null, bv = cur + 4;
    for (const r of reach.values()) {
      if (r.prob < minP) continue;
      const v = carrierValue(G, t, c, r.x, r.y) - r.rushes * 6 - (1 - r.prob) * 80;
      if (v > bv) { bv = v; best = r; }
    }
    return best;
  }

  // ---------- 路徑（含彈簧跳躍） ----------
  const pRushOf = (G, p) => {
    const q = BB.prob(2, (G.weather === 'blizzard' ? -1 : 0) + (has(p, 'Drunkard') ? -1 : 0));
    return has(p, 'Sure Feet') ? 1 - (1 - q) * (1 - q) : q;
  };

  // 回傳和 BB.reach 相同的 Map，但每格多了 steps（可直接送給引擎的指令序列）
  function fullReach(G, p) {
    const out = BB.reach(G, p);
    for (const r of out.values()) r.steps = [{ type: 'move', path: r.path }];
    const active = G.act && G.act.pid === p.id;
    if (!(has(p, 'Pogo') || has(p, 'Leap')) || p.status !== 'standing' || p.rooted) return out;
    let maLeft, rush;
    if (active) { maLeft = Math.max(0, p.ma - G.act.used); rush = G.act.rush; }
    else { maLeft = p.ma; rush = has(p, 'Sprint') ? 3 : 2; }
    if (maLeft + rush < 2) return out;
    const loose = G.ball.carrier == null && !G.ball.inAir;
    const pr = pRushOf(G, p);
    for (let x = p.x - 2; x <= p.x + 2; x++) {
      for (let y = p.y - 2; y <= p.y + 2; y++) {
        if (!BB.jumpTargetOk(G, p, x, y)) continue;
        let m = maLeft, rr = rush, prob = 1;
        for (let i = 0; i < 2; i++) { if (m > 0) m--; else { rr--; prob *= pr; } }
        let mod = -Math.max(BB.markersOf(G, p.team, p.x, p.y).length, BB.markersOf(G, p.team, x, y).length);
        if (has(p, 'Pogo')) mod = 0;
        else if (mod < 0) mod = Math.min(-1, mod + 1);
        if (has(p, 'Very Long Legs')) mod++;
        prob *= BB.prob(p.ag, mod);
        const leap = { type: 'jump', x, y };
        const k = y * W + x;
        const cur = out.get(k);
        if (!cur || prob > cur.prob + 0.02) out.set(k, { x, y, prob, steps: [leap], rushes: rush - rr, path: [] });
        if (loose && G.ball.x === x && G.ball.y === y) continue; // 跳到球上會先撿球，之後再重新規劃
        const sub = BB.reach(G, p, { fromX: x, fromY: y, maLeft: m, rush: rr });
        for (const [kk, r] of sub) {
          const pp = prob * r.prob;
          const c2 = out.get(kk);
          if (c2 && pp <= c2.prob + 0.02) continue;
          out.set(kk, { x: r.x, y: r.y, prob: pp, steps: [leap, { type: 'move', path: r.path }], rushes: rush - rr + r.rushes, path: r.path });
        }
      }
    }
    return out;
  }

  // ---------- 傳球估算 ----------
  function catchProb(G, q, x, y, mod) {
    let m = mod;
    if (!has(q, 'Nerves of Steel')) m -= BB.markersOf(G, q.team, x, y).length;
    if (G.weather === 'rain') m--;
    if (has(q, 'Extra Arms')) m++;
    let c = BB.prob(q.ag, m);
    if (has(q, 'Catch')) c = c + (1 - c) * c;
    return c;
  }

  // 傳球者站在 (sx,sy) 傳給站在 (tx,ty) 的接球者 q
  function passOdds(G, p, sx, sy, q, tx, ty) {
    const band = BB.passRange(tx - sx, ty - sy);
    if (!band || (tx === sx && ty === sy)) return null;
    if (G.weather === 'blizzard' && (band === 'long' || band === 'bomb')) return null;
    const ox = p.x, oy = p.y;
    let mod, ic;
    p.x = sx; p.y = sy;
    try { mod = BB.passMod(G, p, band); ic = BB.interceptors(G, p, tx, ty); }
    finally { p.x = ox; p.y = oy; }
    let acc = 0;
    for (let r = 1; r <= 6; r++) if (BB.passResult(r, p.pa, mod) === 'accurate') acc++;
    acc /= 6;
    if (has(p, 'Pass')) acc = acc + (1 - acc) * acc;
    let pi = 0;
    for (const c of ic) {
      const m = -3 - (has(c, 'Nerves of Steel') ? 0 : BB.markersOf(G, c.team, c.x, c.y).length) + (has(c, 'Extra Arms') ? 1 : 0);
      pi = Math.max(pi, BB.prob(c.ag, m));
    }
    const pc = catchProb(G, q, tx, ty, 0);
    return { band, acc, pi, pc, success: acc * (1 - pi) * pc };
  }

  // 投擲隊友：精準與不準的機率
  function throwOdds(G, p, band) {
    const pa = p.pa == null ? 6 : p.pa;
    const mod = (band === 'quick' ? 0 : -1) - (has(p, 'Nerves of Steel') ? 0 : BB.markersOf(G, p.team, p.x, p.y).length);
    let acc = 0, inacc = 0;
    for (let r = 1; r <= 6; r++) {
      const res = BB.passResult(r, pa, mod);
      if (res === 'accurate') acc++;
      else if (res !== 'fumble') inacc++;
    }
    return { acc: acc / 6, inacc: inacc / 6 };
  }

  // 適合跑到前場接應傳球的球員
  function isReceiver(p) {
    return !has(p, 'No Ball') && p.st <= 3 && p.ag <= 3 && (has(p, 'Catch') || p.ma >= 7 || has(p, 'Pogo'));
  }

  function posValue(G, t, ctx, x, y, p) {
    let v = 0;
    if (ctx.weHave) {
      const c = ctx.carrier;
      const dc = cheb(x, y, c.x, c.y);
      const fwd = ctx.ez === W - 1 ? x - c.x : c.x - x;
      if (p && isReceiver(p) && c.pa != null) {
        // 接球手：跑到持球者前方 4–9 格、附近沒有對手的空位
        const near = BB.pitchPlayers(G, 1 - t).some(o => o.status === 'standing' && cheb(o.x, o.y, x, y) <= 2);
        if (fwd >= 4 && fwd <= 9 && !near) v += 45 - Math.abs(fwd - 6) * 2;
        else v += Math.max(0, 15 - dc * 2);
        return v - BB.markersOf(G, t, x, y).length * 3;
      }
      if (dc === 1) v += (x !== c.x && y !== c.y) ? 40 : 22;
      else v += Math.max(0, 20 - dc * 3);
      if (fwd > 1 && fwd <= 4 && Math.abs(y - c.y) <= 3) v += 10;
    } else if (ctx.theyHave) {
      const c = ctx.carrier;
      const dc = cheb(x, y, c.x, c.y);
      if (dc === 1) v += 45; else v += Math.max(0, 28 - dc * 3);
      const oz = BB.endzoneOf(1 - t);
      const between = oz === 0 ? x < c.x : x > c.x;
      if (between && Math.abs(y - c.y) <= 3) v += 12;
    } else if (ctx.loose) {
      const db = cheb(x, y, G.ball.x, G.ball.y);
      v += Math.max(0, 30 - db * 4);
    } else {
      // 球在空中或不在場上：往中場靠
      v += Math.max(0, 15 - Math.abs(x - 12.5));
    }
    v -= BB.markersOf(G, t, x, y).length * 3;
    if (y === 0 || y === H - 1) v -= 5;
    return v;
  }

  function planTurn(G, t) {
    plans[t] = null;
    const special = G.tf.special;
    const me = BB.pitchPlayers(G, t);
    const avail = me.filter(p => !p.activated && p.status !== 'stunned' &&
      !(special && !BB.isOpen(G, p)));
    if (!avail.length) return END_TURN;
    const carrier = G.ball.carrier != null ? G.players[G.ball.carrier] : null;
    const ctx = {
      carrier, ez: BB.endzoneOf(t),
      weHave: !!(carrier && carrier.team === t),
      theyHave: !!(carrier && carrier.team !== t),
      loose: !carrier && !G.ball.inAir && BB.onPitch(G.ball.x, G.ball.y)
    };
    const lastTurn = G.turnNo[t] >= 8;
    const cache = new Map();
    const R = p => { if (!cache.has(p.id)) cache.set(p.id, fullReach(G, p)); return cache.get(p.id); };
    const cands = [];
    const add = (score, p, action, steps) => {
      if (!BB.canActivate(G, p, action)) cands.push({ score, pid: p.id, action, steps });
    };
    const isBnc = p => has(p, 'Ball & Chain');

    // A. 持球者直接達陣
    let tdProb = 0;
    if (ctx.weHave && avail.indexOf(carrier) >= 0 && !special) {
      const best = bestEndzone(G, carrier, R(carrier));
      if (best) {
        tdProb = best.prob;
        if (best.prob >= 0.45 || lastTurn) add(1000 + best.prob * 1000, carrier, 'move', best.steps);
      }
    }
    // A2. 手遞給能達陣的隊友
    if (ctx.weHave && avail.indexOf(carrier) >= 0 && !G.tf.handoff && tdProb < 0.45 && !special) {
      for (const q of avail) {
        if (q === carrier || q.status !== 'standing' || !BB.canCatch(q)) continue;
        const rq = bestEndzone(G, q, R(q));
        if (!rq || rq.prob < 0.6) continue;
        const catchP = BB.prob(q.ag, -BB.markersOf(G, t, q.x, q.y).length) * (has(q, 'Catch') ? 1.3 : 1);
        if (BB.adjacent(carrier, q)) {
          add(800 + 500 * catchP * rq.prob, carrier, 'handoff', [{ type: 'handoff', target: q.id }]);
          continue;
        }
        for (const r of R(carrier).values()) {
          if (r.prob < 0.9 || cheb(r.x, r.y, q.x, q.y) !== 1) continue;
          add(800 + 500 * r.prob * catchP * rq.prob, carrier, 'handoff', r.steps.concat([{ type: 'handoff', target: q.id }]));
        }
      }
    }
    // A3. 傳球：傳給能達陣的隊友，或把球往前送
    if (ctx.weHave && avail.indexOf(carrier) >= 0 && !G.tf.pass && carrier.pa != null && !has(carrier, 'No Ball') && tdProb < 0.45 && !special) {
      const spots = [{ x: carrier.x, y: carrier.y, prob: 1, steps: [] }];
      const more = [];
      for (const r of R(carrier).values()) if (r.prob >= 0.97 && !r.rushes) more.push(r);
      // 優先考慮沒被盯防、比較前面的位置
      const fwd = r => -Math.abs(ctx.ez - r.x) - BB.markersOf(G, t, r.x, r.y).length * 5;
      more.sort((a, b) => fwd(b) - fwd(a));
      spots.push(...more.slice(0, 24));
      for (const q of me) {
        if (q === carrier || !BB.canCatch(q)) continue;
        const inEZ = q.x === ctx.ez;
        let after = inEZ ? 1 : 0;
        if (!inEZ && avail.indexOf(q) >= 0) { const rq = bestEndzone(G, q, R(q)); after = rq ? rq.prob : 0; }
        const qFree = !BB.pitchPlayers(G, 1 - t).some(o => o.status === 'standing' && cheb(o.x, o.y, q.x, q.y) <= 2);
        for (const s of spots) {
          if (s.x === q.x && s.y === q.y) continue;
          const po = passOdds(G, carrier, s.x, s.y, q, q.x, q.y);
          if (!po) continue;
          const succ = s.prob * po.success;
          const steps = s.steps.concat([{ type: 'pass', x: q.x, y: q.y }]);
          if (after >= 0.5) {
            const v = succ * after;
            if (v >= 0.35 || (lastTurn && v > 0.05)) add(850 + 450 * v, carrier, 'pass', steps);
          } else {
            const gain = Math.abs(ctx.ez - s.x) - Math.abs(ctx.ez - q.x);
            if (succ >= 0.6 && gain >= 3 && qFree) add(410 + gain * 3 + succ * 20, carrier, 'pass', steps);
          }
        }
      }
    }
    // A4. 投擲隊友
    if (!G.tf.ttm && !special) {
      for (const p of avail) {
        if (p.status !== 'standing' || !has(p, 'Throw Team-Mate')) continue;
        for (const q of me) {
          if (q === p || q.status !== 'standing' || !has(q, 'Right Stuff') || !BB.adjacent(p, q)) continue;
          const qAvail = avail.indexOf(q) >= 0;
          const qBall = G.ball.carrier === q.id;
          for (let x = p.x - 7; x <= p.x + 7; x++) {
            for (let y = p.y - 7; y <= p.y + 7; y++) {
              if (!BB.onPitch(x, y) || BB.playerAt(G, x, y)) continue;
              const band = BB.passRange(x - p.x, y - p.y);
              if (band !== 'quick' && band !== 'short') continue;
              const th = throwOdds(G, p, band);
              const land = BB.prob(q.ag, -BB.markersOf(G, t, x, y).length);
              const landInacc = BB.prob(q.ag, -1);
              const ok = th.acc * land + th.inacc * landInacc * 0.5;
              const step = [{ type: 'ttm', target: q.id, x, y }];
              if (qBall && qAvail) {
                // 持球的小個子丟過去後自己跑進達陣區
                const dist = Math.abs(ctx.ez - x);
                const run = x === ctx.ez ? 1 : dist <= q.ma ? 0.85 : dist <= q.ma + 2 ? 0.55 : 0;
                const v = ok * run;
                if (v >= 0.25 && tdProb < 0.45) add(650 + 300 * v, p, 'ttm', step);
              } else if (ctx.loose && qAvail && !has(q, 'No Ball')) {
                // 把小個子丟到球旁邊去撿球
                if (cheb(x, y, G.ball.x, G.ball.y) !== 1) continue;
                const v = ok * pickupProb(G, q, G.ball.x, G.ball.y);
                if (v >= 0.2) add(120 + 300 * v, p, 'ttm', step);
              } else if (ctx.theyHave && !qBall && ok >= 0.3) {
                // 把小個子丟到對方持球者旁邊去纏住他
                if (cheb(x, y, ctx.carrier.x, ctx.carrier.y) !== 1) continue;
                add(200 + 100 * ok, p, 'ttm', step);
              } else if (ctx.weHave && !qBall && !has(q, 'No Ball') && ok >= 0.3 && qAvail) {
                // 把小個子丟到前場當接應
                const c = ctx.carrier;
                const fwd = ctx.ez === W - 1 ? x - c.x : c.x - x;
                if (fwd < 4 || fwd > 9) continue;
                if (BB.pitchPlayers(G, 1 - t).some(o => o.status === 'standing' && cheb(o.x, o.y, x, y) <= 2)) continue;
                add(165 + 60 * ok, p, 'ttm', step);
              }
            }
          }
        }
      }
    }
    // B. 撿球
    if (ctx.loose && !special) {
      const bi = G.ball.y * W + G.ball.x;
      for (const p of avail) {
        if (has(p, 'No Ball')) continue;
        const r = R(p).get(bi);
        if (!r) continue;
        // 附近沒有對手時用保球行動（2+ 撿球，比較穩）
        if (!BB.canActivate(G, p, 'secure')) {
          const tot = r.prob * (1 - (1 / 6) * (1 / 6));
          add(620 + 300 * tot, p, 'secure', r.steps);
        }
        const tot = r.prob * Math.min(1, pickupProb(G, p, G.ball.x, G.ball.y));
        add(tot >= 0.5 ? 600 + 300 * tot : 100 + 300 * tot, p, 'move', r.steps);
      }
    }
    // D3. 特殊攻擊：刺擊、電鋸、噴吐、噴火
    const breakP = (av, mod) => { let c = 0; for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) if (a + b + mod >= av) c++; return c / 36; };
    for (const p of avail) {
      if (p.status !== 'standing') continue;
      for (const q of BB.pitchPlayers(G, 1 - t)) {
        if (!BB.adjacent(p, q)) continue;
        const bonus = q === carrier ? 1.8 : 1;
        if (has(p, 'Stab') && q.status === 'standing') add(380 + 60 * breakP(q.av, 0) * bonus, p, 'stab', [{ type: 'stab', target: q.id }]);
        if (has(p, 'Chainsaw')) add(120 + 120 * (5 / 6) * breakP(q.av, has(q, 'Iron Hard Skin') ? 0 : 3) * bonus, p, 'chainsaw', [{ type: 'chainsaw', target: q.id }]);
        if (has(p, 'Projectile Vomit') && q.status === 'standing') add(140 + 100 * (5 / 6) * breakP(q.av, 0) * bonus, p, 'vomit', [{ type: 'vomit', target: q.id }]);
        if (has(p, 'Breathe Fire') && q.status === 'standing') add(110 + 120 * (q.st >= 5 ? 0.33 : 0.5) * bonus, p, 'fire', [{ type: 'fire', target: q.id }]);
      }
    }
    // C. 閃擊持球者
    if (ctx.theyHave && !G.tf.blitz && carrier.status === 'standing') {
      for (const p of avail) {
        if (isBnc(p)) continue;
        let opts = [];
        if (p.status === 'standing' && BB.adjacent(p, carrier)) opts.push({ x: p.x, y: p.y, prob: 1, path: [] });
        const r2 = BB.reach(G, p, { reserve: 1 });
        for (const r of r2.values()) if (cheb(r.x, r.y, carrier.x, carrier.y) === 1) opts.push(r);
        for (const o of opts) {
          const info = BB.blockInfo(G, p, carrier, { blitz: true, fromX: o.x, fromY: o.y });
          const odds = BB.blockOdds(info, p, carrier, true);
          const val = o.prob * odds.defDown;
          if (val < 0.12) continue;
          const steps = o.path.length ? [{ type: 'move', path: o.path }] : [];
          steps.push({ type: 'block', target: carrier.id });
          add(500 + 400 * val - 150 * odds.attDown, p, 'blitz', steps);
        }
      }
    }
    // D. 原地阻擋
    for (const p of avail) {
      if (p.status !== 'standing' || isBnc(p)) continue;
      for (const q of BB.pitchPlayers(G, 1 - t)) {
        if (q.status !== 'standing' || !BB.adjacent(p, q)) continue;
        const info = BB.blockInfo(G, p, q, {});
        const odds = BB.blockOdds(info, p, q, false);
        let ev = 100 * odds.defDown - 160 * odds.attDown + (q === carrier ? 200 * odds.defDown : 0);
        if (G.ball.carrier === p.id) ev -= 80;
        if (odds.attDown <= 0.03 && ev > 20) add(450 + ev / 10, p, 'block', [{ type: 'block', target: q.id }]);
        else if (ev > 25) add(60 + ev / 5, p, 'block', [{ type: 'block', target: q.id }]);
      }
    }
    // D2. 閃擊一般球員（安全路線）
    if (!G.tf.blitz && !ctx.theyHave) {
      for (const p of avail) {
        if (p.status !== 'standing' || isBnc(p) || G.ball.carrier === p.id) continue;
        if (BB.markersOf(G, t, p.x, p.y).length) continue;
        const r2 = BB.reach(G, p, { reserve: 1 });
        for (const r of r2.values()) {
          if (r.prob < 0.999 || r.rushes) continue;
          for (const q of BB.pitchPlayers(G, 1 - t)) {
            if (q.status !== 'standing' || cheb(r.x, r.y, q.x, q.y) !== 1) continue;
            const info = BB.blockInfo(G, p, q, { blitz: true, fromX: r.x, fromY: r.y });
            const odds = BB.blockOdds(info, p, q, true);
            if (odds.attDown > 0.03 || odds.defDown < 0.3) continue;
            add(300 + 50 * odds.defDown, p, 'blitz', [{ type: 'move', path: r.path }, { type: 'block', target: q.id }]);
          }
        }
      }
    }
    // E. 持球者推進
    if (ctx.weHave && avail.indexOf(carrier) >= 0 && tdProb < 0.45 && !special) {
      const adv = bestAdvance(G, carrier, R(carrier));
      if (adv) add(400, carrier, 'move', adv.steps);
    }
    // F. 走位
    for (const p of avail) {
      if (p === carrier || isBnc(p)) continue;
      const marked = BB.markersOf(G, t, p.x, p.y).length > 0;
      const pogo = has(p, 'Pogo');
      if (marked && !pogo) {
        if (p.status === 'prone') add(200, p, 'move', []);
        continue;
      }
      // 彈簧高蹺手可以跳過人牆或跳離盯防（成功率較低，所以扣分，並排在安全走位之後）
      const minP = pogo ? 0.6 : 0.999;
      const cur = posValue(G, t, ctx, p.x, p.y, p);
      let best = null, bv = cur + (marked ? 12 : 3);
      for (const r of R(p).values()) {
        if (r.prob < minP || r.rushes) continue;
        if (ctx.loose && r.x === G.ball.x && r.y === G.ball.y) continue;
        const v = posValue(G, t, ctx, r.x, r.y, p) - (1 - r.prob) * 40;
        if (v > bv) { bv = v; best = r; }
      }
      if (best) add((best.prob >= 0.999 ? 150 : 90) + Math.min(100, bv - cur), p, 'move', best.steps);
      else if (p.status === 'prone') add(140, p, 'move', []);
    }
    // G. 犯規
    if (!G.tf.foul && !special) {
      for (const p of avail) {
        if (p.star || p.status !== 'standing' || G.ball.carrier === p.id || isBnc(p) || has(p, 'No Ball') && !has(p, 'Dirty Player')) continue;
        for (const q of BB.pitchPlayers(G, 1 - t)) {
          if (q.status === 'standing') continue;
          if (BB.adjacent(p, q)) { add(55, p, 'foul', [{ type: 'foul', target: q.id }]); continue; }
          if (BB.markersOf(G, t, p.x, p.y).length) continue;
          for (const r of R(p).values()) {
            if (r.prob < 0.999 || r.rushes || cheb(r.x, r.y, q.x, q.y) !== 1) continue;
            add(50, p, 'foul', r.steps.concat([{ type: 'foul', target: q.id }]));
            break;
          }
        }
      }
    }
    // H. 鏈球
    for (const p of avail) {
      if (!isBnc(p) || p.status !== 'standing' || special) continue;
      let dd = 99;
      for (const q of BB.pitchPlayers(G, 1 - t)) if (q.status === 'standing') dd = Math.min(dd, cheb(p.x, p.y, q.x, q.y));
      if (dd <= 4) add(70, p, 'bnc', []);
    }

    if (!cands.length) return END_TURN;
    cands.sort((a, b) => b.score - a.score);
    const c = cands[0];
    plans[t] = { pid: c.pid, steps: c.steps.slice() };
    return { type: 'activate', pid: c.pid, action: c.action };
  }

  function nextStep(G, pr) {
    const t = pr.team;
    const plan = plans[t];
    if (pr.error) { plans[t] = null; return { type: 'end' }; }
    if (plan && plan.pid === pr.pid && plan.steps.length) return plan.steps.shift();
    const p = G.players[pr.pid];
    if (G.ball.carrier === p.id && pr.action !== 'block') {
      const r = fullReach(G, p);
      const td = bestEndzone(G, p, r);
      const go = td && (td.prob >= 0.45 || G.turnNo[t] >= 8) ? td : bestAdvance(G, p, r);
      if (go) {
        plans[t] = { pid: p.id, steps: go.steps.slice(1) };
        return go.steps[0];
      }
    }
    return { type: 'end' };
  }
})();
