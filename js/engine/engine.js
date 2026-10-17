/*
 * Blood Bowl 規則引擎（純邏輯，不碰 DOM）。
 *
 * 整場比賽是一個 generator（gameFlow）。每當需要某位教練做決定時，
 * generator 會 yield 一個 prompt（{type, team, ...}），呼叫端用 game.act(answer) 回答。
 * 亂數由種子決定，所以「種子 + 回答紀錄」可以完整重播一場比賽——之後架伺服器時，
 * 伺服器只要跑同一份引擎、驗證並轉送回答即可。
 */
(function () {
  'use strict';
  const BB = (globalThis.BB = globalThis.BB || {});

  const W = 26, H = 15;
  BB.W = W; BB.H = H;
  // D8 方向：1=左上 2=上 3=右上 4=右 5=右下 6=下 7=左下 8=左
  const DIRS = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]];
  BB.DIRS = DIRS;
  const DIR_ZH = ['左上', '上', '右上', '右', '右下', '下', '左下', '左'];
  BB.DIR_ZH = DIR_ZH;

  const WEATHER_ZH = { heat: '酷熱', sunny: '烈日', perfect: '好天氣', rain: '大雨', blizzard: '暴風雪' };
  BB.WEATHER_ZH = WEATHER_ZH;
  const ACTION_ZH = { move: '移動', block: '阻擋', blitz: '閃擊', pass: '傳球', handoff: '手遞', foul: '犯規', ttm: '投擲隊友' };
  BB.ACTION_ZH = ACTION_ZH;
  const FACE_ZH = { AD: '攻方倒地', BD: '雙方倒地', PU: '推開', DS: '守方踉蹌', POW: '守方倒地' };
  BB.FACE_ZH = FACE_ZH;
  const FACES = ['AD', 'BD', 'PU', 'PU', 'DS', 'POW'];
  BB.FACES = FACES;
  const CAS_ZH = { bh: '輕傷', sh: '重傷', si: '嚴重受傷', li: '永久傷害', dead: '死亡' };

  // ---------- 亂數 ----------
  function rand(G) { // mulberry32
    let t = (G.rng = (G.rng + 0x6D2B79F5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function d(G, n) { return 1 + Math.floor(rand(G) * n); }

  // ---------- 幾何與查詢 ----------
  const onPitch = (x, y) => x >= 0 && x < W && y >= 0 && y < H;
  const inHalf = (t, x) => (t === 0 ? x <= 12 : x >= 13);
  const endzoneOf = t => (t === 0 ? W - 1 : 0); // 該隊要達陣的 x
  const losOf = t => (t === 0 ? 12 : 13);
  const has = (p, s) => p.skills.indexOf(s) >= 0;
  const adjacent = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) === 1;
  const cheb = (ax, ay, bx, by) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));
  Object.assign(BB, { onPitch, inHalf, endzoneOf, losOf, has, adjacent, cheb });

  function pitchPlayers(G, team) {
    return G.players.filter(p => p.loc === 'pitch' && (team == null || p.team === team));
  }
  function playerAt(G, x, y) {
    for (const p of G.players) if (p.loc === 'pitch' && p.x === x && p.y === y) return p;
    return null;
  }
  function hasTZ(p) { return p.loc === 'pitch' && p.status === 'standing' && !p.lostTZ; }
  // 盯防 (x,y) 的對手（相對於 team）
  function markersOf(G, team, x, y) {
    const r = [];
    for (const q of G.players) {
      if (q.team !== team && hasTZ(q) && cheb(q.x, q.y, x, y) === 1) r.push(q);
    }
    return r;
  }
  function canCatch(p) { return hasTZ(p) && !has(p, 'No Hands'); }
  function disturbing(G, p) {
    let n = 0;
    for (const q of G.players) if (q.team !== p.team && q.loc === 'pitch' && has(q, 'Disturbing Presence') && cheb(q.x, q.y, p.x, p.y) <= 3) n++;
    return n;
  }
  function possession(G) { return G.ball.carrier == null ? null : G.players[G.ball.carrier].team; }
  function looseAt(G, x, y) { return G.ball.carrier == null && !G.ball.inAir && G.ball.x === x && G.ball.y === y; }
  Object.assign(BB, { pitchPlayers, playerAt, hasTZ, markersOf, canCatch, possession, disturbing });

  function okRoll(r, target, mod) { return r !== 1 && (r === 6 || r + mod >= target); }
  BB.prob = function (target, mod) {
    let c = 0;
    for (let r = 1; r <= 6; r++) if (okRoll(r, target, mod)) c++;
    return c / 6;
  };
  const needStr = (target, mod) => Math.max(2, Math.min(6, target - mod)) + '+';

  // ---------- 紀錄 ----------
  function pname(p) { return `${G_team(p)}#${p.num} ${p.name}`; }
  let _curG = null;
  function G_team(p) { return _curG ? _curG.teams[p.team].name : ''; }
  function log(G, text, cls) { G.log.push({ text, cls: cls || '' }); }
  function fx(G, x, y, text, good) { G.fx.push({ id: ++G.fxId, x, y, text, good: good === undefined ? null : good }); }

  function place(G, p, x, y) {
    p.x = x; p.y = y;
    if (G.ball.carrier === p.id) { G.ball.x = x; G.ball.y = y; }
  }
  function toBox(G, p, loc) {
    if (G.ball.carrier === p.id) G.ball.carrier = null;
    p.loc = loc; p.x = -1; p.y = -1; p.status = 'standing'; p.lostTZ = false; p.justStunned = false;
  }

  // ---------- 提問 ----------
  function* ask(G, prompt, valid) {
    for (;;) {
      const a = yield prompt;
      let e;
      try { e = valid ? valid(a) : true; } catch (err) { e = false; }
      if (e === true) { delete prompt.error; return a; }
      prompt.error = typeof e === 'string' ? e : '無效的指令';
    }
  }
  const isBool = v => v && typeof v.yes === 'boolean';
  function* confirm(G, team, kind, text, extra) {
    const a = yield* ask(G, Object.assign({ type: 'confirm', team, kind, text }, extra || {}), isBool);
    return a.yes;
  }

  // ---------- 擲骰與重擲 ----------
  function rerollOptions(G, p, o) {
    o = o || {};
    const opts = [];
    const T = G.teams[p.team];
    if (G.active === p.team && !G.tf.rerollUsed && T.rerollsLeft > 0 && !o.noTeam) opts.push('team');
    if (has(p, 'Pro') && G.active === p.team && !p.used.pro) opts.push('pro');
    if (has(p, "Thinking Man's Troll") && G.tmt[p.id] !== G.half && o.single !== false) opts.push('tmt');
    return opts;
  }
  BB.rerollOptions = rerollOptions;

  function* spendReroll(G, p, kind) {
    if (kind === 'team') {
      const T = G.teams[p.team];
      T.rerollsLeft--; G.tf.rerollUsed = true;
      log(G, `${T.name} 使用隊伍重擲（剩 ${T.rerollsLeft}）`, 'rr');
      if (has(p, 'Loner')) {
        const r = d(G, 6);
        if (r < 4) { log(G, `獨行者：擲出 ${r}，重擲浪費了`, 'bad'); fx(G, p.x, p.y, '獨行者失敗', false); return false; }
        log(G, `獨行者：擲出 ${r}，可以重擲`, 'good');
      }
      return true;
    }
    if (kind === 'pro') {
      p.used.pro = true;
      const r = d(G, 6);
      log(G, `職業球員：擲出 ${r}${r >= 3 ? '，可以重擲' : '，失敗'}`, r >= 3 ? 'good' : 'bad');
      return r >= 3;
    }
    if (kind === 'tmt') {
      G.tmt[p.id] = G.half;
      log(G, `${pname(p)} 使用「會思考的巨魔」重擲`, 'rr');
      return true;
    }
    return false;
  }

  function* useReroll(G, p, o, desc) {
    if (o.skill && has(p, o.skill) && !o.noSkill) {
      const once = o.skill === 'Dodge' || o.skill === 'Sure Feet';
      if (!once || !p.used[o.skill]) {
        if (once) p.used[o.skill] = true;
        log(G, `使用技能 ${BB.SKILL_ZH[o.skill] || o.skill} 重擲`, 'rr');
        return true;
      }
    }
    const opts = rerollOptions(G, p, o);
    if (!opts.length) return false;
    const a = yield* ask(G, { type: 'reroll', team: p.team, pid: p.id, label: desc, options: opts },
      v => v && (v.use === null || opts.indexOf(v.use) >= 0));
    if (!a.use) return false;
    return yield* spendReroll(G, p, a.use);
  }

  // 一般的 D6 檢定（敏捷、衝刺等）
  function* test(G, p, target, mod, o) {
    let r = d(G, 6);
    let ok = okRoll(r, target, mod);
    log(G, `${pname(p)} ${o.label}（${needStr(target, mod)}）：擲出 ${r}，${ok ? '成功' : '失敗'}`, ok ? 'good' : 'bad');
    fx(G, p.x, p.y, `${o.label} ${r}${ok ? '✓' : '✗'}`, ok);
    if (ok) return true;
    if (!(yield* useReroll(G, p, o, `${o.label}失敗（需要 ${needStr(target, mod)}，擲出 ${r}）`))) return false;
    r = d(G, 6);
    ok = okRoll(r, target, mod);
    log(G, `重擲 ${o.label}：擲出 ${r}，${ok ? '成功' : '失敗'}`, ok ? 'good' : 'bad');
    fx(G, p.x, p.y, `重擲 ${r}${ok ? '✓' : '✗'}`, ok);
    return ok;
  }

  // ---------- 建立比賽狀態 ----------
  BB.newState = function (cfg) {
    const G = {
      seed: cfg.seed >>> 0, rng: (cfg.seed >>> 0) || 1,
      half: 0, turnNo: [0, 0], active: -1, kicking: 0, firstKicker: 0,
      score: [0, 0], teams: [], players: [],
      ball: { x: -1, y: -1, carrier: null, inAir: false },
      weather: 'perfect', log: [], fx: [], fxId: 0,
      tf: { rerollUsed: true }, turnover: false, touchdown: null, tmt: {}, act: null,
      over: false, drive: 0, pendingBounce: null, phase: 'pregame'
    };
    cfg.teams.forEach((tc, ti) => {
      const def = BB.TEAMS[tc.race];
      G.teams.push({
        name: tc.name || def.name, race: tc.race, color: tc.color || def.colors[0],
        rerolls: tc.rerolls, rerollsLeft: tc.rerolls, apo: !!tc.apothecary, apoUsed: false, bribes: 0
      });
      let num = 1;
      for (const pos of def.positions) {
        for (let i = 0; i < (tc.counts[pos.key] || 0); i++) G.players.push(makePlayer(G, ti, pos, num++, false));
      }
      for (const s of tc.stars) G.players.push(makePlayer(G, ti, BB.STARS[s], num++, true));
    });
    // 同顏色時客隊換備用色
    if (G.teams[0].color === G.teams[1].color) G.teams[1].color = BB.TEAMS[G.teams[1].race].colors[1];
    return G;
  };

  function makePlayer(G, team, pos, num, star) {
    return {
      id: G.players.length, team, num, name: pos.name, pos: pos.key, short: pos.short, star,
      ma: pos.ma, st: pos.st, ag: pos.ag, pa: pos.pa, av: pos.av, skills: pos.skills.slice(),
      loc: 'reserve', x: -1, y: -1, status: 'standing',
      activated: false, used: {}, lostTZ: false, justStunned: false, cas: null
    };
  }

  // ---------- 天氣 ----------
  function rollWeather(G) {
    const a = d(G, 6), b = d(G, 6), r = a + b;
    G.weather = r === 2 ? 'heat' : r === 3 ? 'sunny' : r <= 10 ? 'perfect' : r === 11 ? 'rain' : 'blizzard';
    log(G, `天氣擲骰 ${a}+${b}=${r}：${WEATHER_ZH[G.weather]}`, 'info');
  }

  // ---------- 主流程 ----------
  function* gameFlow(G) {
    log(G, `比賽開始：${G.teams[0].name}（主）對 ${G.teams[1].name}（客）`, 'head');
    rollWeather(G);
    const toss = d(G, 2) - 1;
    log(G, `擲硬幣：${G.teams[toss].name} 贏得選擇權`, 'info');
    const ch = yield* ask(G, { type: 'kickOrReceive', team: toss }, a => a && (a.choice === 'kick' || a.choice === 'receive'));
    G.firstKicker = ch.choice === 'kick' ? toss : 1 - toss;
    log(G, `${G.teams[G.firstKicker].name} 開球`, 'info');

    for (G.half = 1; G.half <= 2; G.half++) {
      G.turnNo = [0, 0];
      for (const T of G.teams) T.rerollsLeft = T.rerolls;
      G.kicking = G.half === 1 ? G.firstKicker : 1 - G.firstKicker;
      log(G, `══ 第 ${G.half} 半場 ══`, 'head');
      for (;;) {
        if (G.turnNo[1 - G.kicking] >= 8) break; // 接球方沒有回合了
        yield* startDrive(G);
        let active = 1 - G.kicking, scored = null;
        for (;;) {
          if (G.turnNo[active] >= 8) break;
          G.turnNo[active]++;
          yield* teamTurn(G, active, null);
          if (G.touchdown !== null) { scored = G.touchdown; break; }
          active = 1 - active;
        }
        yield* endDrive(G);
        if (scored === null) break;
        G.kicking = scored;
        G.touchdown = null;
      }
      log(G, `第 ${G.half} 半場結束，比分 ${G.score[0]} : ${G.score[1]}`, 'head');
    }
    G.over = true; G.half = 2; G.phase = 'over';
    const w = G.score[0] > G.score[1] ? 0 : G.score[1] > G.score[0] ? 1 : null;
    G.winner = w;
    log(G, w === null ? `比賽結束，平手 ${G.score[0]} : ${G.score[1]}` : `比賽結束，${G.teams[w].name} 獲勝！ ${G.score[0]} : ${G.score[1]}`, 'head');
    for (;;) yield { type: 'gameOver', team: null };
  }

  // ---------- 推進（drive） ----------
  function* startDrive(G) {
    G.drive++;
    G.phase = 'setup';
    for (const p of G.players) if (p.loc === 'pitch') toBox(G, p, 'reserve');
    G.ball = { x: -1, y: -1, carrier: null, inAir: false };
    G.active = -1; G.tf = { rerollUsed: true };
    for (const p of G.players) {
      if (p.loc === 'ko') {
        const r = d(G, 6);
        if (r >= 4) { p.loc = 'reserve'; log(G, `${pname(p)} 清醒過來（${r}），回到替補席`, 'good'); }
        else log(G, `${pname(p)} 仍然昏迷（${r}）`, 'bad');
      }
    }
    yield* setupPhase(G, G.kicking, { kind: 'kick' });
    yield* setupPhase(G, 1 - G.kicking, { kind: 'receive' });
    for (const p of G.players) p.inDrive = p.loc === 'pitch';
    yield* kickoff(G);
    for (const p of G.players) if (p.loc === 'heat') p.loc = 'reserve';
    G.phase = 'play';
  }

  function* endDrive(G) {
    G.active = -1; G.tf = { rerollUsed: true };
    for (const p of G.players) {
      if (p.loc === 'pitch' && has(p, 'Secret Weapon')) {
        log(G, `${pname(p)} 是秘密武器，裁判要把他罰下場`, 'bad');
        let saved = false;
        const T = G.teams[p.team];
        if (T.bribes > 0 && (yield* confirm(G, p.team, 'bribe', `${pname(p)} 要被罰下場，要使用賄賂嗎？（剩 ${T.bribes}）`, { pid: p.id }))) {
          T.bribes--;
          const r = d(G, 6);
          saved = r > 1;
          log(G, `賄賂擲出 ${r}：${saved ? '成功' : '失敗'}`, saved ? 'good' : 'bad');
        }
        if (!saved) toBox(G, p, 'sent');
      }
    }
    if (G.weather === 'heat') {
      for (const p of pitchPlayers(G)) {
        if (d(G, 6) === 1) { toBox(G, p, 'heat'); log(G, `${pname(p)} 中暑，下一次推進無法上場`, 'bad'); }
      }
    }
    for (const p of pitchPlayers(G)) toBox(G, p, 'reserve');
    G.ball = { x: -1, y: -1, carrier: null, inAir: false };
  }

  // ---------- 布陣 ----------
  const FORM = {
    kick: [[0, 6], [0, 7], [0, 8], [1, 3], [1, 11], [2, 5], [2, 9], [3, 7], [4, 2], [4, 12], [7, 7]],
    receive: [[0, 6], [0, 7], [0, 8], [1, 2], [1, 12], [3, 4], [3, 10], [3, 7], [5, 5], [5, 9], [8, 7]]
  };

  function setupError(G, t, noCount) {
    const on = pitchPlayers(G, t);
    const avail = on.length + G.players.filter(p => p.team === t && p.loc === 'reserve').length;
    if (on.length > 11) return '場上最多 11 人';
    if (!noCount && on.length < Math.min(11, avail)) return `必須派上 ${Math.min(11, avail)} 名球員（目前 ${on.length}）`;
    for (const p of on) if (!inHalf(t, p.x)) return '球員必須在己方半場';
    const los = on.filter(p => p.x === losOf(t) && p.y >= 4 && p.y <= 10).length;
    if (los < Math.min(3, on.length)) return `爭球線（中央）至少要 ${Math.min(3, on.length)} 人（目前 ${los}）`;
    if (on.filter(p => p.y <= 3).length > 2) return '上方邊路最多 2 人';
    if (on.filter(p => p.y >= 11).length > 2) return '下方邊路最多 2 人';
    return null;
  }
  BB.setupError = setupError;

  function autoSetup(G, t, kind) {
    for (const p of pitchPlayers(G, t)) toBox(G, p, 'reserve');
    const avail = G.players.filter(p => p.team === t && p.loc === 'reserve');
    const slots = FORM[kind === 'receive' ? 'receive' : 'kick'];
    const n = Math.min(11, avail.length);
    const brawn = p => p.st * 10 + (has(p, 'Block') ? 3 : 0) + p.av * 0.5 - (has(p, 'Stunty') && p.st < 3 ? 5 : 0);
    const hands = p => (7 - p.ag) * 3 + (has(p, 'Catch') ? 2 : 0) + (has(p, 'Sure Hands') ? 2 : 0) + p.ma * 0.5 - (has(p, 'No Hands') ? 50 : 0) - p.st;
    const pool = avail.slice();
    const take = (score) => { pool.sort((a, b) => score(b) - score(a)); return pool.shift(); };
    const assign = new Array(n);
    const losN = Math.min(3, n);
    for (let i = 0; i < losN; i++) assign[i] = take(brawn);
    const deep = kind === 'receive' ? [10, 9, 8] : [10];
    for (const i of deep) if (i < n) assign[i] = take(hands);
    for (let i = losN; i < n; i++) if (!assign[i]) assign[i] = take(brawn);
    // 若人數不足 11，前面的格子先填；deep 格子可能超出 n
    for (let i = 0; i < n; i++) {
      const p = assign[i];
      if (!p) continue;
      const [dx, y] = slots[i];
      p.loc = 'pitch'; p.status = 'standing';
      place(G, p, t === 0 ? losOf(0) - dx : losOf(1) + dx, y);
    }
  }
  BB.autoSetup = autoSetup;

  function* setupPhase(G, t, o) {
    const kind = o.kind;
    const limited = kind === 'solid' || kind === 'quick';
    const moved = [];
    const orig = {};
    for (const p of pitchPlayers(G, t)) orig[p.id] = [p.x, p.y];
    if (kind === 'kick' || kind === 'receive') log(G, `${G.teams[t].name} 布陣（${kind === 'kick' ? '開球方' : '接球方'}）`, 'info');
    let err = null;
    for (;;) {
      const a = yield { type: 'setup', team: t, kind, limit: o.limit || 0, moved: moved.slice(), error: err };
      err = null;
      if (!a) { err = '無效的指令'; continue; }
      if (a.type === 'done') {
        if (kind === 'solid' && !moved.length) return;
        if (kind !== 'quick') { err = setupError(G, t, kind === 'solid'); if (err) continue; }
        return;
      }
      if (a.type === 'auto' && !limited) { autoSetup(G, t, kind); continue; }
      if (a.type === 'clear' && !limited) { for (const p of pitchPlayers(G, t)) toBox(G, p, 'reserve'); continue; }
      const p = G.players[a.pid];
      if (!p || p.team !== t) { err = '不是你的球員'; continue; }
      if (a.type === 'remove' && !limited) {
        if (p.loc === 'pitch') toBox(G, p, 'reserve');
        continue;
      }
      if (a.type === 'place') {
        const x = a.x, y = a.y;
        if (!onPitch(x, y)) { err = '超出球場'; continue; }
        if (limited) {
          if (p.loc !== 'pitch') { err = '只能移動場上的球員'; continue; }
          if (moved.indexOf(p.id) < 0 && moved.length >= o.limit) { err = `最多只能移動 ${o.limit} 名球員`; continue; }
          if (kind === 'quick') {
            const [ox, oy] = orig[p.id];
            if (cheb(ox, oy, x, y) > 1) { err = '快速開球：只能移動 1 格'; continue; }
          } else if (!inHalf(t, x)) { err = '只能放在己方半場'; continue; }
          if (playerAt(G, x, y)) { err = '該格已有球員'; continue; }
          place(G, p, x, y);
          if (moved.indexOf(p.id) < 0) moved.push(p.id);
          continue;
        }
        if (p.loc !== 'pitch' && p.loc !== 'reserve') { err = '該球員無法上場'; continue; }
        if (!inHalf(t, x)) { err = '只能放在己方半場'; continue; }
        const occ = playerAt(G, x, y);
        if (occ && occ.team !== t) { err = '該格已有球員'; continue; }
        if (occ === p) continue;
        if (occ) { // 交換
          if (p.loc === 'pitch') { const px = p.x, py = p.y; place(G, occ, px, py); }
          else toBox(G, occ, 'reserve');
        } else if (p.loc === 'reserve' && pitchPlayers(G, t).length >= 11) { err = '場上已有 11 人'; continue; }
        p.loc = 'pitch'; p.status = 'standing';
        place(G, p, x, y);
        continue;
      }
      err = '無效的指令';
    }
  }

  // ---------- 開球 ----------
  function* kickoff(G) {
    const K = G.kicking, R = 1 - K;
    G.phase = 'kickoff';
    const a = yield* ask(G, { type: 'placeKick', team: K },
      v => v && onPitch(v.x, v.y) && inHalf(R, v.x) ? true : '請選擇對方半場的格子');
    const dir = d(G, 8);
    let dist = d(G, 6);
    const kicker = pitchPlayers(G, K).find(p => has(p, 'Kick') && p.x !== losOf(K) && p.y >= 4 && p.y <= 10);
    if (kicker) dist = Math.ceil(dist / 2);
    const lx = a.x + DIRS[dir - 1][0] * dist, ly = a.y + DIRS[dir - 1][1] * dist;
    log(G, `${G.teams[K].name} 開球：偏移 ${DIR_ZH[dir - 1]} ${dist} 格${kicker ? '（開球手減半）' : ''}`, 'info');
    G.ball = { x: lx, y: ly, carrier: null, inAir: true };
    yield* kickoffEvent(G);
    G.active = -1; G.tf = { rerollUsed: true };
    // 落地
    const x = G.ball.x, y = G.ball.y;
    G.ball.inAir = false;
    if (!onPitch(x, y) || !inHalf(R, x)) { yield* touchback(G, R); return; }
    const p = playerAt(G, x, y);
    let res;
    if (p && canCatch(p)) {
      if (yield* catchBall(G, p, -1)) return;
      res = yield* bounce(G, x, y, { kickHalf: R });
    } else {
      log(G, '球落地', 'info');
      res = yield* bounce(G, x, y, { kickHalf: R });
    }
    if (res === 'touchback') yield* touchback(G, R);
  }

  function* touchback(G, R) {
    G.ball.inAir = false;
    log(G, '回場球（Touchback）！接球方可把球交給任一球員', 'info');
    const cands = pitchPlayers(G, R).filter(p => p.status === 'standing' && !has(p, 'No Hands'));
    if (!cands.length) {
      G.ball = { x: R === 0 ? 6 : 19, y: 7, carrier: null, inAir: false };
      return;
    }
    const a = yield* ask(G, { type: 'touchback', team: R, candidates: cands.map(p => p.id) },
      v => v && cands.some(p => p.id === v.pid));
    const p = G.players[a.pid];
    G.ball.carrier = p.id; G.ball.x = p.x; G.ball.y = p.y;
    log(G, `${pname(p)} 拿到球`, 'good');
  }

  function* kickoffEvent(G) {
    const K = G.kicking, R = 1 - K;
    const a = d(G, 6), b = d(G, 6), r = a + b;
    const head = `開球事件 ${a}+${b}=${r}：`;
    const d3 = () => Math.ceil(d(G, 6) / 2);
    switch (r) {
      case 2:
        G.teams[0].bribes++; G.teams[1].bribes++;
        log(G, head + '叫裁判過來！雙方各得 1 次賄賂', 'event');
        break;
      case 3: {
        const back = G.turnNo[K] >= 6;
        for (const t of [0, 1]) G.turnNo[t] = Math.max(0, Math.min(8, G.turnNo[t] + (back ? -1 : 1)));
        log(G, head + `暫停！雙方回合標記${back ? '倒退' : '前進'} 1 格`, 'event');
        break;
      }
      case 4: {
        const n = d3() + 3;
        log(G, head + `穩固防守：開球方可重新安排最多 ${n} 名球員`, 'event');
        yield* setupPhase(G, K, { kind: 'solid', limit: n });
        break;
      }
      case 5: {
        log(G, head + '高吊球：接球方可派一名未被盯防的球員移到球的落點', 'event');
        const bx = G.ball.x, by = G.ball.y;
        if (onPitch(bx, by) && inHalf(R, bx) && !playerAt(G, bx, by)) {
          const cands = pitchPlayers(G, R).filter(p => p.status === 'standing' && !markersOf(G, R, p.x, p.y).length);
          if (cands.length) {
            const v = yield* ask(G, { type: 'highKick', team: R, candidates: cands.map(p => p.id), x: bx, y: by },
              v => v && (v.pid === null || cands.some(p => p.id === v.pid)));
            if (v.pid !== null) { const p = G.players[v.pid]; place(G, p, bx, by); log(G, `${pname(p)} 跑到落點下方`, 'info'); }
          }
        }
        break;
      }
      case 6:
      case 7: {
        const x0 = d(G, 6), x1 = d(G, 6);
        const name = r === 6 ? '觀眾歡呼' : '精彩指導';
        if (x0 === x1) log(G, head + `${name}：雙方平手（${x0}:${x1}），沒有效果`, 'event');
        else {
          const w = x0 > x1 ? 0 : 1;
          G.teams[w].rerollsLeft++;
          log(G, head + `${name}：${G.teams[w].name} 勝出（${x0}:${x1}），本半場多 1 次隊伍重擲`, 'event');
        }
        break;
      }
      case 8: {
        log(G, head + '天氣變化', 'event');
        rollWeather(G);
        if (G.weather === 'perfect') {
          const dd = d(G, 8);
          G.ball.x += DIRS[dd - 1][0]; G.ball.y += DIRS[dd - 1][1];
          log(G, `一陣強風把球吹向${DIR_ZH[dd - 1]}`, 'info');
        }
        break;
      }
      case 9: {
        const n = d3() + 3;
        log(G, head + `快速開球：接球方最多 ${n} 名球員可移動 1 格`, 'event');
        yield* setupPhase(G, R, { kind: 'quick', limit: n });
        break;
      }
      case 10: {
        const n = d3() + 3;
        log(G, head + `閃擊！開球方最多 ${n} 名未被盯防的球員可以行動`, 'event');
        yield* teamTurn(G, K, { limit: n });
        break;
      }
      case 11: {
        const x0 = d(G, 6), x1 = d(G, 6);
        log(G, head + `多管閒事的裁判（${x0}:${x1}）`, 'event');
        for (const t of [0, 1]) {
          if ((t === 0 ? x0 : x1) > (t === 0 ? x1 : x0)) continue;
          const cands = pitchPlayers(G, t);
          if (!cands.length) continue;
          const p = cands[d(G, cands.length) - 1];
          const rr = d(G, 6);
          if (rr === 1) { toBox(G, p, 'sent'); log(G, `${pname(p)} 被裁判罰下場！`, 'bad'); }
          else { p.status = 'stunned'; log(G, `${pname(p)} 和裁判爭執，被擊暈`, 'bad'); }
        }
        break;
      }
      case 12: {
        const x0 = d(G, 6), x1 = d(G, 6);
        log(G, head + `球迷闖入球場（${x0}:${x1}）`, 'event');
        for (const t of [0, 1]) {
          if ((t === 0 ? x0 : x1) > (t === 0 ? x1 : x0)) continue;
          const cands = pitchPlayers(G, t);
          const n = Math.min(d3(), cands.length);
          for (let i = 0; i < n; i++) {
            const idx = d(G, cands.length) - 1;
            const p = cands.splice(idx, 1)[0];
            p.status = 'stunned';
            log(G, `${pname(p)} 被球迷打暈`, 'bad');
          }
        }
        break;
      }
    }
  }

  // ---------- 球的移動 ----------
  function* catchBall(G, p, mod) {
    let m = mod;
    if (!has(p, 'Nerves of Steel')) m -= markersOf(G, p.team, p.x, p.y).length;
    if (G.weather === 'rain') m -= 1;
    if (has(p, 'Extra Arms')) m += 1;
    m -= disturbing(G, p);
    G.ball.x = p.x; G.ball.y = p.y; G.ball.carrier = null; G.ball.inAir = false;
    const ok = yield* test(G, p, p.ag, m, { label: '接球', skill: 'Catch' });
    if (ok) { G.ball.carrier = p.id; checkTD(G); }
    return ok;
  }

  // 球從 (x,y) 彈跳。回傳 'caught' | 'ground' | 'out' | 'touchback'
  function* bounce(G, x, y, o) {
    o = o || {};
    for (let n = 0; n < 30; n++) {
      const dir = d(G, 8);
      const nx = x + DIRS[dir - 1][0], ny = y + DIRS[dir - 1][1];
      log(G, `球彈向${DIR_ZH[dir - 1]}`, 'info');
      if (o.kickHalf != null && (!onPitch(nx, ny) || !inHalf(o.kickHalf, nx))) return 'touchback';
      if (!onPitch(nx, ny)) { yield* throwIn(G, x, y); return 'out'; }
      G.ball.x = nx; G.ball.y = ny; G.ball.carrier = null; G.ball.inAir = false;
      const p = playerAt(G, nx, ny);
      if (!p) return 'ground';
      if (canCatch(p) && (yield* catchBall(G, p, -1))) return 'caught';
      x = nx; y = ny;
    }
    return 'ground';
  }

  function* throwIn(G, x, y) {
    for (let k = 0; k < 6; k++) {
      let dx = 0, dy = 0;
      if (y === 0) dy = 1; else if (y === H - 1) dy = -1;
      else if (x === 0) dx = 1; else if (x === W - 1) dx = -1;
      else dy = y < H / 2 ? 1 : -1;
      const r = d(G, 6);
      const s = r <= 2 ? -1 : r >= 5 ? 1 : 0;
      const vx = dx + (dy !== 0 ? s : 0), vy = dy + (dx !== 0 ? s : 0);
      const dist = d(G, 6) + d(G, 6);
      let cx = x, cy = y, lx = x, ly = y;
      for (let i = 0; i < dist; i++) { cx += vx; cy += vy; if (onPitch(cx, cy)) { lx = cx; ly = cy; } }
      log(G, `球出界！觀眾把球丟回場內（${dist} 格）`, 'info');
      if (!onPitch(cx, cy)) { x = lx; y = ly; continue; }
      G.ball = { x: cx, y: cy, carrier: null, inAir: false };
      const p = playerAt(G, cx, cy);
      if (p && canCatch(p)) {
        if (yield* catchBall(G, p, -1)) return;
        yield* bounce(G, cx, cy);
      } else if (p) yield* bounce(G, cx, cy);
      return;
    }
    G.ball = { x, y, carrier: null, inAir: false };
    const p = playerAt(G, x, y);
    if (p) yield* bounce(G, x, y);
  }

  function checkTD(G) {
    if (G.touchdown !== null || G.ball.carrier == null) return;
    const p = G.players[G.ball.carrier];
    if (p.loc === 'pitch' && p.status === 'standing' && p.x === endzoneOf(p.team)) {
      G.touchdown = p.team;
      G.score[p.team]++;
      log(G, `🏈 達陣！${pname(p)} 為 ${G.teams[p.team].name} 得分！比分 ${G.score[0]} : ${G.score[1]}`, 'td');
      fx(G, p.x, p.y, '達陣！', true);
    }
  }

  // ---------- 倒地、護甲、傷害 ----------
  // 回傳 true 表示真的倒地；穩健步伐擲出 6 則回傳 false
  function* knockDown(G, p, o) {
    o = o || {};
    if (has(p, 'Steady Footing')) {
      const r = d(G, 6);
      if (r === 6) {
        log(G, `穩健步伐：${pname(p)} 擲出 ${r}，穩住沒有倒地！`, 'good');
        fx(G, p.x, p.y, '穩健步伐', true);
        return false;
      }
      log(G, `穩健步伐：擲出 ${r}，沒能穩住`, 'info');
    }
    const hadBall = G.ball.carrier === p.id;
    const loose = !hadBall && looseAt(G, p.x, p.y);
    const x = p.x, y = p.y;
    p.status = 'prone';
    if (hadBall) { G.ball.carrier = null; G.ball.x = x; G.ball.y = y; G.ball.inAir = false; }
    log(G, `${pname(p)} 倒地`, 'bad');
    fx(G, x, y, '倒地', false);
    if (p.team === G.active && !o.noTurnover) G.turnover = true;
    yield* armourInjury(G, p, o);
    if (hadBall || loose) { log(G, '球掉了', 'info'); yield* bounce(G, x, y); }
  }

  function* armourInjury(G, p, o) {
    let mb = !!o.mb;
    if (!(o.auto || has(p, 'Ball & Chain'))) {
      const a = d(G, 6), b = d(G, 6);
      let tot = a + b + (o.armMod || 0);
      let broken = tot >= p.av || (o.claws && a + b >= 8);
      let note = '';
      if (!broken && mb && tot + 1 >= p.av) { broken = true; mb = false; tot++; note = '（重擊 +1）'; }
      log(G, `護甲擲骰 ${a}+${b}${o.armMod ? (o.armMod > 0 ? '+' : '') + o.armMod : ''}${note} 對 ${p.av}+：${broken ? '破甲！' : '擋住了'}`, broken ? 'bad' : 'info');
      if (!broken) return;
    }
    yield* injuryRoll(G, p, { mb });
  }

  function* injuryRoll(G, p, o) {
    const a = d(G, 6), b = d(G, 6);
    const tot = a + b + (o.mod || 0) + (o.mb ? 1 : 0);
    let res;
    if (has(p, 'Stunty')) res = tot <= 6 ? 'stunned' : tot <= 8 ? 'ko' : 'cas';
    else res = tot <= 7 ? 'stunned' : tot <= 9 ? 'ko' : 'cas';
    if (res === 'ko' && has(p, 'Thick Skull') && tot === 8) res = 'stunned';
    const zh = { stunned: '擊暈', ko: '昏迷 (KO)', cas: '受傷離場' }[res];
    log(G, `傷害擲骰 ${a}+${b}${o.mb ? '+1(重擊)' : ''}${o.mod ? '+' + o.mod : ''}=${tot}：${zh}`, res === 'stunned' ? 'info' : 'bad');
    fx(G, p.x, p.y, zh, false);
    yield* applyInjury(G, p, res, o);
    return { res, doubles: a === b };
  }

  function canApo(G, p) { const T = G.teams[p.team]; return T.apo && !T.apoUsed; }

  function* applyInjury(G, p, res, o) {
    if (res === 'stunned') {
      if (o.crowd) toBox(G, p, 'reserve');
      else { p.status = 'stunned'; p.justStunned = G.active === p.team; }
      return;
    }
    if (res === 'ko') {
      if (canApo(G, p) && (yield* confirm(G, p.team, 'apothecary', `${pname(p)} 昏迷了，要使用隊醫嗎？`, { pid: p.id }))) {
        G.teams[p.team].apoUsed = true;
        log(G, `隊醫治療 ${pname(p)}，改為擊暈`, 'good');
        if (o.crowd || p.loc !== 'pitch') toBox(G, p, 'reserve');
        else { p.status = 'stunned'; p.justStunned = G.active === p.team; }
        return;
      }
      toBox(G, p, 'ko');
      return;
    }
    const cas = r => (r <= 6 ? 'bh' : r <= 9 ? 'sh' : r <= 12 ? 'si' : r <= 14 ? 'li' : 'dead');
    let c = d(G, 16);
    log(G, `傷亡擲骰 ${c}：${CAS_ZH[cas(c)]}`, 'bad');
    if (canApo(G, p) && (yield* confirm(G, p.team, 'apothecary', `${pname(p)} ${CAS_ZH[cas(c)]}，要使用隊醫嗎？`, { pid: p.id }))) {
      G.teams[p.team].apoUsed = true;
      const c2 = d(G, 16);
      c = Math.min(c, c2);
      log(G, `隊醫重擲傷亡 ${c2}，採用 ${CAS_ZH[cas(c)]}`, 'info');
      if (cas(c) === 'bh') { toBox(G, p, 'reserve'); log(G, `${pname(p)} 包紮後回到替補席`, 'good'); return; }
    } else if (has(p, 'Regeneration')) {
      const r = d(G, 6);
      log(G, `再生擲骰 ${r}：${r >= 4 ? '傷口癒合，回到替補席' : '失敗'}`, r >= 4 ? 'good' : 'bad');
      if (r >= 4) { toBox(G, p, 'reserve'); return; }
    }
    toBox(G, p, 'cas');
    p.cas = cas(c);
  }

  // ---------- 回合 ----------
  function legalActions(G, p) {
    const tf = G.tf;
    if (has(p, 'Ball & Chain')) return ['move'];
    const L = ['move'];
    const opps = pitchPlayers(G, 1 - p.team);
    if (p.status === 'standing' && opps.some(q => q.status === 'standing' && adjacent(p, q))) L.push('block');
    if (!tf.blitz) L.push('blitz');
    const myBall = has(p, 'My Ball');
    if (!tf.pass && p.pa != null && !has(p, 'No Hands') && !myBall) L.push('pass');
    if (!tf.handoff && !has(p, 'No Hands') && !myBall) L.push('handoff');
    if (!tf.foul) L.push('foul');
    if (!tf.ttm && has(p, 'Throw Team-Mate') && p.status === 'standing' &&
      pitchPlayers(G, p.team).some(q => q !== p && adjacent(p, q) && q.status === 'standing' && has(q, 'Right Stuff'))) L.push('ttm');
    if (tf.special) return L.filter(a => a === 'move' || a === 'blitz');
    return L;
  }
  BB.legalActions = legalActions;

  function canActivate(G, p, action) {
    if (!p || p.team !== G.active) return '不是你的球員';
    if (p.loc !== 'pitch') return '球員不在場上';
    if (p.activated) return '這名球員本回合已行動過';
    if (p.status === 'stunned') return '被擊暈的球員不能行動';
    if (G.tf.special && markersOf(G, p.team, p.x, p.y).length) return '閃擊事件只能啟動未被盯防的球員';
    if (legalActions(G, p).indexOf(action) < 0) return '不能宣告這個行動';
    return null;
  }
  BB.canActivate = canActivate;

  function* teamTurn(G, t, special) {
    G.active = t; G.turnover = false;
    G.tf = { blitz: false, pass: false, handoff: false, foul: false, ttm: false, rerollUsed: !!special, special: special || null, count: 0 };
    for (const p of G.players) if (p.team === t) { p.activated = false; p.used = {}; p.lostTZ = false; }
    if (!special) log(G, `── ${G.teams[t].name} 第 ${G.turnNo[t]} 回合 ──`, 'turn');
    let err = null;
    for (;;) {
      if (G.turnover || G.touchdown !== null) break;
      if (special && G.tf.count >= special.limit) break;
      const a = yield { type: 'turn', team: t, special: !!special, error: err };
      err = null;
      if (!a) { err = '無效的指令'; continue; }
      if (a.type === 'endTurn') break;
      if (a.type !== 'activate') { err = '無效的指令'; continue; }
      const p = G.players[a.pid];
      const e = canActivate(G, p, a.action);
      if (e) { err = e; continue; }
      G.tf.count++;
      yield* activation(G, p, a.action);
    }
    if (G.turnover && G.touchdown === null) { log(G, '⚠ 失誤（Turnover）！回合結束', 'turnover'); }
    G.act = null;
    if (!special) {
      for (const p of G.players) {
        if (p.team !== t) continue;
        if (p.loc === 'pitch' && p.status === 'stunned' && !p.justStunned) p.status = 'prone';
        p.justStunned = false;
      }
    }
    G.turnover = false;
    if (special) { G.active = -1; G.tf = { rerollUsed: true }; }
  }

  function remaining(p, A) { return Math.max(0, p.ma - A.used) + A.rush; }

  function* activation(G, p, action) {
    p.activated = true;
    if (['blitz', 'pass', 'handoff', 'foul', 'ttm'].indexOf(action) >= 0) G.tf[action] = true;
    const A = { pid: p.id, action, used: 0, rush: has(p, 'Sprint') ? 3 : 2, blocked: false, finished: false, leaped: false };
    G.act = A;
    log(G, `${pname(p)} 宣告：${ACTION_ZH[action]}`, 'act');

    if (has(p, 'Bone Head')) {
      if (!(yield* test(G, p, 2, 0, { label: '木頭腦袋' }))) { p.lostTZ = true; log(G, `${pname(p)} 發呆了`, 'bad'); G.act = null; return; }
    }
    if (has(p, 'Really Stupid')) {
      const help = pitchPlayers(G, p.team).some(q => q !== p && adjacent(p, q) && q.status === 'standing' && !has(q, 'Really Stupid'));
      if (!(yield* test(G, p, help ? 2 : 4, 0, { label: '超級笨蛋' }))) { p.lostTZ = true; log(G, `${pname(p)} 呆住了`, 'bad'); G.act = null; return; }
    }
    if (has(p, 'Wild Animal')) {
      const need = action === 'block' || action === 'blitz' ? 2 : 4;
      if (!(yield* test(G, p, need, 0, { label: '野獸' }))) { log(G, `${pname(p)} 失控咆哮`, 'bad'); G.act = null; return; }
    }
    if (p.status === 'prone') {
      if (p.ma < 3) {
        if (!(yield* test(G, p, 4, 0, { label: '起身' }))) { G.act = null; return; }
      } else A.used += 3;
      p.status = 'standing';
      log(G, `${pname(p)} 站起來`, 'info');
    }
    if (has(p, 'Ball & Chain')) { yield* bncMove(G, p, A); G.act = null; return; }

    let err = null;
    for (;;) {
      if (G.turnover || G.touchdown !== null || p.loc !== 'pitch' || p.status !== 'standing') break;
      if (A.finished) break;
      if (action === 'block' && A.blocked) break;
      const a = yield { type: 'activation', team: p.team, pid: p.id, action, error: err };
      err = checkAct(G, p, A, a);
      if (err) continue;
      if (a.type === 'end') break;
      const before = possession(G);
      if (a.type === 'move') {
        for (const [x, y] of a.path) {
          if (!(yield* moveStep(G, p, A, x, y))) break;
        }
      } else if (a.type === 'leap') {
        yield* leap(G, p, A, a.x, a.y);
      } else if (a.type === 'block') {
        const def = G.players[a.target];
        if (action === 'blitz') {
          const needRush = A.used >= p.ma;
          A.used++;
          if (needRush) {
            A.rush--;
            if (!(yield* test(G, p, G.weather === 'blizzard' ? 3 : 2, 0, { label: '衝刺', skill: 'Sure Feet' }))) {
              if (yield* knockDown(G, p, {})) break;
            }
          }
        }
        A.blocked = true;
        yield* doBlock(G, p, def, { blitz: action === 'blitz', act: A, first: true });
      } else if (a.type === 'pass') {
        A.finished = true;
        yield* passBall(G, p, a.x, a.y);
      } else if (a.type === 'handoff') {
        A.finished = true;
        yield* handOff(G, p, G.players[a.target]);
      } else if (a.type === 'foul') {
        A.finished = true;
        yield* foul(G, p, G.players[a.target]);
      } else if (a.type === 'ttm') {
        A.finished = true;
        yield* throwTeamMate(G, p, G.players[a.target], a.x, a.y);
      }
      if (before === p.team && possession(G) !== p.team && G.touchdown === null) G.turnover = true;
    }
    G.act = null;
  }

  function checkAct(G, p, A, a) {
    if (!a || typeof a.type !== 'string') return '無效的指令';
    const act = A.action;
    if (a.type === 'end') return null;
    if (a.type === 'move') {
      if (act === 'block') return '阻擋行動不能移動';
      if (!Array.isArray(a.path) || !a.path.length) return '沒有路徑';
      if (a.path.length > remaining(p, A)) return '移動力不足';
      let cx = p.x, cy = p.y;
      for (const s of a.path) {
        if (!Array.isArray(s)) return '路徑錯誤';
        const [x, y] = s;
        if (!onPitch(x, y) || cheb(cx, cy, x, y) !== 1) return '路徑錯誤';
        const o = playerAt(G, x, y);
        if (o && o !== p) return '路徑被擋住';
        cx = x; cy = y;
      }
      return null;
    }
    if (a.type === 'leap') {
      if (!(has(p, 'Pogo Stick') || has(p, 'Leap'))) return '這名球員不會跳躍';
      if (act === 'block' || A.leaped) return '不能跳躍';
      if (!onPitch(a.x, a.y) || cheb(p.x, p.y, a.x, a.y) !== 2 || playerAt(G, a.x, a.y)) return '跳躍目標錯誤';
      if (remaining(p, A) < 2) return '移動力不足';
      return null;
    }
    const tgt = G.players[a.target];
    if (a.type === 'block') {
      if (act !== 'block' && act !== 'blitz') return '這個行動不能阻擋';
      if (A.blocked) return '已經阻擋過了';
      if (act === 'blitz' && remaining(p, A) < 1) return '移動力不足，無法閃擊';
      if (!tgt || tgt.team === p.team || tgt.loc !== 'pitch' || tgt.status !== 'standing' || !adjacent(p, tgt)) return '目標必須是相鄰且站著的對手';
      return null;
    }
    if (a.type === 'pass') {
      if (act !== 'pass') return '這個行動不能傳球';
      if (G.ball.carrier !== p.id) return '球員沒有持球';
      if (!onPitch(a.x, a.y)) return '目標超出球場';
      const band = passRange(a.x - p.x, a.y - p.y);
      if (!band || (a.x === p.x && a.y === p.y)) return '超出傳球距離';
      if (G.weather === 'blizzard' && (band === 'long' || band === 'bomb')) return '暴風雪中只能快傳或短傳';
      return null;
    }
    if (a.type === 'handoff') {
      if (act !== 'handoff') return '這個行動不能手遞';
      if (G.ball.carrier !== p.id) return '球員沒有持球';
      if (!tgt || tgt.team !== p.team || tgt === p || !adjacent(p, tgt) || !canCatch(tgt)) return '目標必須是相鄰、站著的隊友';
      return null;
    }
    if (a.type === 'foul') {
      if (act !== 'foul') return '這個行動不能犯規';
      if (!tgt || tgt.team === p.team || tgt.loc !== 'pitch' || tgt.status === 'standing' || !adjacent(p, tgt)) return '目標必須是相鄰、倒地的對手';
      return null;
    }
    if (a.type === 'ttm') {
      if (act !== 'ttm') return '這個行動不能投擲隊友';
      if (!tgt || tgt.team !== p.team || !adjacent(p, tgt) || tgt.status !== 'standing' || !has(tgt, 'Right Stuff')) return '必須投擲相鄰、有 Right Stuff 的隊友';
      if (!onPitch(a.x, a.y)) return '目標超出球場';
      const band = passRange(a.x - p.x, a.y - p.y);
      if (band !== 'quick' && band !== 'short') return '投擲隊友只能用快傳或短傳距離';
      return null;
    }
    return '無效的指令';
  }

  function dodgeMod(G, p, from, x, y, A) {
    let mod = 0;
    if (!has(p, 'Stunty')) mod -= markersOf(G, p.team, x, y).length;
    if (has(p, 'Two Heads')) mod++;
    if (has(p, 'Titchy')) mod++;
    mod -= from.filter(m => has(m, 'Prehensile Tail')).length;
    if (A && has(p, 'Break Tackle') && !A.bt) { mod += p.st >= 5 ? 2 : 1; A.bt = true; }
    return mod;
  }

  function* moveStep(G, p, A, x, y) {
    const fx0 = p.x, fy0 = p.y;
    const marked = markersOf(G, p.team, fx0, fy0);
    const needRush = A.used >= p.ma;
    A.used++;
    if (needRush) {
      A.rush--;
      if (!(yield* test(G, p, G.weather === 'blizzard' ? 3 : 2, 0, { label: '衝刺', skill: 'Sure Feet' }))) {
        place(G, p, x, y);
        if (yield* knockDown(G, p, {})) return false;
      }
    }
    place(G, p, x, y);
    if (marked.length) {
      const mod = dodgeMod(G, p, marked, x, y, A);
      const tackled = marked.some(m => has(m, 'Tackle'));
      if (!(yield* test(G, p, p.ag, mod, { label: '閃避', skill: 'Dodge', noSkill: tackled }))) {
        if (yield* knockDown(G, p, {})) return false;
      }
    }
    if (looseAt(G, x, y)) {
      if (!(yield* pickUp(G, p))) return false;
    }
    checkTD(G);
    return G.touchdown === null;
  }

  function* leap(G, p, A, x, y) {
    A.leaped = true;
    // 跳躍消耗 2 格移動力，超過的部分要衝刺
    for (let i = 0; i < 2; i++) {
      const needRush = A.used >= p.ma;
      A.used++;
      if (needRush) {
        A.rush--;
        if (!(yield* test(G, p, G.weather === 'blizzard' ? 3 : 2, 0, { label: '衝刺', skill: 'Sure Feet' }))) {
          place(G, p, x, y);
          if (yield* knockDown(G, p, {})) return;
        }
      }
    }
    let mod = 0;
    if (!has(p, 'Pogo Stick')) mod = Math.min(0, 1 - Math.max(markersOf(G, p.team, p.x, p.y).length, markersOf(G, p.team, x, y).length));
    place(G, p, x, y);
    if (!(yield* test(G, p, p.ag, mod, { label: '跳躍' }))) { if (yield* knockDown(G, p, {})) return; }
    if (looseAt(G, x, y)) { if (!(yield* pickUp(G, p))) return; }
    checkTD(G);
  }

  function* pickUp(G, p) {
    if (has(p, 'No Hands')) {
      log(G, `${pname(p)} 沒有手，球彈開了`, 'info');
      yield* bounce(G, p.x, p.y);
      return true;
    }
    let mod = 0;
    if (!has(p, 'Big Hand')) {
      mod -= markersOf(G, p.team, p.x, p.y).length;
      if (G.weather === 'rain') mod--;
    }
    if (has(p, 'Extra Arms')) mod++;
    if (yield* test(G, p, p.ag, mod, { label: '撿球', skill: 'Sure Hands' })) {
      G.ball.carrier = p.id;
      return true;
    }
    yield* bounce(G, p.x, p.y);
    if (p.team === G.active) G.turnover = true;
    return false;
  }

  // ---------- 阻擋 ----------
  function assists(G, side, target) {
    let c = 0;
    for (const q of G.players) {
      if (q.team !== side.team || q === side || !hasTZ(q) || !adjacent(q, target)) continue;
      if (!has(q, 'Guard')) {
        const ms = markersOf(G, q.team, q.x, q.y).filter(m => m !== target);
        if (ms.length) continue;
      }
      c++;
    }
    return c;
  }

  function blockInfo(G, att, def, o) {
    o = o || {};
    let a = (o.baseST || att.st) + (o.blitz && has(att, 'Horns') ? 1 : 0);
    let dd = def.st;
    let aa = 0, da = 0;
    if (att.team !== def.team) { aa = assists(G, att, def); da = assists(G, def, att); }
    a += aa; dd += da;
    let n, chooser;
    if (a === dd) { n = 1; chooser = att.team; }
    else if (a > dd) { n = a > 2 * dd ? 3 : 2; chooser = att.team; }
    else { n = dd > 2 * a ? 3 : 2; chooser = def.team; }
    return { aST: a, dST: dd, aAssist: aa, dAssist: da, n, chooser };
  }
  // 預覽：攻擊者若站在 (fx,fy) 時的阻擋骰數
  BB.blockInfo = function (G, att, def, o) {
    o = o || {};
    if (o.fromX == null) return blockInfo(G, att, def, o);
    const sx = att.x, sy = att.y;
    att.x = o.fromX; att.y = o.fromY;
    const wasStatus = att.status;
    att.status = 'standing';
    try { return blockInfo(G, att, def, o); }
    finally { att.x = sx; att.y = sy; att.status = wasStatus; }
  };

  // 某一面骰子的結果
  function faceOutcome(face, att, def, blitz) {
    const r = { attDown: false, defDown: false, push: false };
    if (face === 'AD') r.attDown = true;
    else if (face === 'BD') {
      if (blitz && has(att, 'Juggernaut')) r.push = true;
      else {
        const aF = !has(att, 'Block'), dF = !has(def, 'Block');
        if ((aF && has(att, 'Wrestle')) || (dF && has(def, 'Wrestle'))) r.wrestle = true;
        else { r.attDown = aF; r.defDown = dF; }
      }
    } else if (face === 'PU') r.push = true;
    else if (face === 'DS') { r.push = true; r.defDown = !(has(def, 'Dodge') && !has(att, 'Tackle')); }
    else if (face === 'POW') { r.push = true; r.defDown = true; }
    return r;
  }
  BB.faceOutcome = faceOutcome;
  // 以攻擊方角度評分
  function faceScore(face, att, def, blitz) {
    const r = faceOutcome(face, att, def, blitz);
    if (r.wrestle) return 0.5;
    return (r.defDown ? 3 : 0) + (r.push ? 1 : 0) - (r.attDown ? 4 : 0);
  }
  BB.faceScore = faceScore;

  // 阻擋機率（攻擊方/防守方都做最佳選擇）
  BB.blockOdds = function (info, att, def, blitz) {
    let defDown = 0, attDown = 0, total = 0;
    const n = info.n;
    const idx = new Array(n).fill(0);
    for (;;) {
      let best = null, bestS = 0;
      for (let i = 0; i < n; i++) {
        const f = FACES[idx[i]], s = faceScore(f, att, def, blitz);
        if (best === null || (info.chooser === att.team ? s > bestS : s < bestS)) { best = f; bestS = s; }
      }
      const o = faceOutcome(best, att, def, blitz);
      if (o.defDown) defDown++;
      if (o.attDown) attDown++;
      total++;
      let k = 0;
      while (k < n && ++idx[k] === 6) { idx[k] = 0; k++; }
      if (k === n) break;
    }
    return { defDown: defDown / total, attDown: attDown / total };
  };

  function rollBlockDice(G, n) { const r = []; for (let i = 0; i < n; i++) r.push(FACES[d(G, 6) - 1]); return r; }
  const diceStr = dice => dice.map(f => FACE_ZH[f]).join('、');

  function* doBlock(G, att, def, o) {
    log(G, `${pname(att)} 阻擋 ${pname(def)}`, 'act');
    if (has(def, 'Foul Appearance')) {
      const r = d(G, 6);
      if (r === 1) { log(G, `被 ${pname(def)} 的醜陋外表嚇到（${r}），阻擋失敗`, 'bad'); return; }
    }
    let baseST = att.st;
    if (has(att, 'Dauntless') && def.st > att.st) {
      const r = d(G, 6);
      if (r + att.st > def.st) { baseST = def.st; log(G, `無畏：擲出 ${r}，力量視為 ${def.st}`, 'good'); }
      else log(G, `無畏：擲出 ${r}，失敗`, 'bad');
    }
    const info = blockInfo(G, att, def, { blitz: o.blitz, baseST });
    let dice = rollBlockDice(G, info.n);
    const who = info.chooser === att.team ? '攻方' : '守方';
    log(G, `力量 ${info.aST} 對 ${info.dST}：${info.n} 顆阻擋骰（${who}選擇）→ ${diceStr(dice)}`, 'dice');
    const opts = rerollOptions(G, att, { single: info.n === 1 });
    const validPick = v => v && Number.isInteger(v.pick) && v.pick >= 0 && v.pick < dice.length;
    let face;
    const base = { type: 'blockDice', att: att.id, def: def.id, info, blitz: !!o.blitz };
    if (info.chooser === att.team) {
      let a = yield* ask(G, Object.assign({}, base, { team: att.team, dice, options: opts }),
        v => v && ((v.reroll && opts.indexOf(v.reroll) >= 0) || validPick(v)));
      if (a.reroll) {
        if (yield* spendReroll(G, att, a.reroll)) {
          dice = rollBlockDice(G, info.n);
          log(G, `重擲阻擋骰 → ${diceStr(dice)}`, 'dice');
        }
        a = yield* ask(G, Object.assign({}, base, { team: att.team, dice, options: [] }), validPick);
      }
      face = dice[a.pick];
    } else {
      if (opts.length) {
        const a = yield* ask(G, { type: 'reroll', team: att.team, pid: att.id, label: `阻擋骰：${diceStr(dice)}（由對手選擇）`, options: opts, dice },
          v => v && (v.use === null || opts.indexOf(v.use) >= 0));
        if (a.use && (yield* spendReroll(G, att, a.use))) {
          dice = rollBlockDice(G, info.n);
          log(G, `重擲阻擋骰 → ${diceStr(dice)}`, 'dice');
        }
      }
      const a = yield* ask(G, Object.assign({}, base, { team: def.team, dice, options: [] }), validPick);
      face = dice[a.pick];
    }
    log(G, `選擇：${FACE_ZH[face]}`, 'dice');
    fx(G, def.x, def.y, FACE_ZH[face], face === 'POW' || face === 'DS' ? true : face === 'AD' ? false : null);
    yield* resolveBlock(G, att, def, face, o);
  }

  function* resolveBlock(G, att, def, face, o) {
    const r = faceOutcome(face, att, def, o.blitz);
    if (r.wrestle) {
      log(G, '摔角！雙方都倒在地上', 'info');
      for (const p of [att, def]) {
        const hadBall = G.ball.carrier === p.id;
        p.status = 'prone';
        if (hadBall) {
          G.ball.carrier = null; G.ball.x = p.x; G.ball.y = p.y;
          if (p.team === G.active) G.turnover = true;
          yield* bounce(G, p.x, p.y);
        }
      }
      return;
    }
    let followed = false;
    const sx = def.x, sy = def.y;
    if (r.push) {
      const sf = has(def, 'Stand Firm') && !(o.blitz && has(att, 'Juggernaut'));
      if (sf) log(G, `${pname(def)} 站穩，沒有被推開`, 'info');
      else {
        yield* pushPlayer(G, { x: att.x, y: att.y }, def, { chooser: att.team, grab: has(att, 'Grab') && !o.blitz && o.first !== false, att });
        if (att.loc === 'pitch' && att.status === 'standing' && !playerAt(G, sx, sy)) {
          let f = has(att, 'Frenzy') || o.bnc;
          if (!f) {
            const a = yield* ask(G, { type: 'followUp', team: att.team, pid: att.id, x: sx, y: sy }, isBool);
            f = a.yes;
          }
          if (f) { place(G, att, sx, sy); followed = true; }
        }
      }
    }
    if (r.push && !r.defDown && def.loc === 'pitch' && G.ball.carrier === def.id && has(att, 'Strip Ball') && !has(def, 'Sure Hands')) {
      log(G, `${pname(att)} 抄球！`, 'good');
      G.ball.carrier = null;
      yield* bounce(G, def.x, def.y);
    }
    if (r.defDown && def.loc === 'pitch') yield* knockDown(G, def, { mb: has(att, 'Mighty Blow'), claws: has(att, 'Claws') });
    if (r.attDown && att.loc === 'pitch') yield* knockDown(G, att, {});
    if (G.pendingBounce) {
      const [bx, by] = G.pendingBounce;
      G.pendingBounce = null;
      if (looseAt(G, bx, by) && playerAt(G, bx, by)) yield* bounce(G, bx, by);
    }
    checkTD(G);
    // 狂暴：第二次阻擋
    if (o.first && has(att, 'Frenzy') && r.push && !G.turnover && G.touchdown === null &&
      att.loc === 'pitch' && att.status === 'standing' && def.loc === 'pitch' && def.status === 'standing' && adjacent(att, def)) {
      if (o.blitz && o.act) {
        const A = o.act;
        if (remaining(att, A) < 1) return;
        const needRush = A.used >= att.ma;
        A.used++;
        if (needRush) {
          A.rush--;
          if (!(yield* test(G, att, G.weather === 'blizzard' ? 3 : 2, 0, { label: '衝刺', skill: 'Sure Feet' }))) {
            if (yield* knockDown(G, att, {})) return;
          }
        }
      }
      log(G, `${pname(att)} 狂暴！再阻擋一次`, 'act');
      yield* doBlock(G, att, def, Object.assign({}, o, { first: false }));
    }
  }

  function* pushPlayer(G, from, victim, o) {
    const dx = Math.sign(victim.x - from.x), dy = Math.sign(victim.y - from.y);
    let rel;
    if (dx && dy) rel = [[dx, dy], [dx, 0], [0, dy]];
    else if (dx) rel = [[dx, -1], [dx, 0], [dx, 1]];
    else rel = [[-1, dy], [0, dy], [1, dy]];
    const sq = rel.map(([a, b]) => [victim.x + a, victim.y + b]);
    const empty = s => onPitch(s[0], s[1]) && !playerAt(G, s[0], s[1]);
    let chooser = o.chooser, cands = null;
    const around = DIRS.map(([a, b]) => [victim.x + a, victim.y + b]).filter(empty);
    if (has(victim, 'Side Step') && around.length && !(o.att && has(o.att, 'Grab'))) { cands = around; chooser = victim.team; }
    else if (o.grab && around.length) cands = around;
    if (!cands) {
      cands = sq.filter(empty);
      if (!cands.length) {
        const off = sq.filter(s => !onPitch(s[0], s[1]));
        cands = off.length ? off : sq;
      }
    }
    let target;
    if (cands.length === 1) target = cands[0];
    else {
      const a = yield* ask(G, { type: 'push', team: chooser, pid: victim.id, squares: cands },
        v => v && cands.some(s => s[0] === v.x && s[1] === v.y));
      target = [a.x, a.y];
    }
    const [tx, ty] = target;
    if (!onPitch(tx, ty)) {
      log(G, `${pname(victim)} 被推進觀眾席！`, 'bad');
      fx(G, victim.x, victim.y, '推出場外', false);
      const hadBall = G.ball.carrier === victim.id;
      const lx = victim.x, ly = victim.y;
      toBox(G, victim, 'reserve');
      if (hadBall) G.ball = { x: lx, y: ly, carrier: null, inAir: false };
      yield* injuryRoll(G, victim, { crowd: true });
      if (hadBall) yield* throwIn(G, lx, ly);
      return;
    }
    const occ = playerAt(G, tx, ty);
    if (occ) yield* pushPlayer(G, { x: victim.x, y: victim.y }, occ, { chooser: o.chooser });
    place(G, victim, tx, ty);
    if (looseAt(G, tx, ty)) G.pendingBounce = [tx, ty];
  }

  // ---------- 傳球 ----------
  function passRange(dx, dy) {
    const dd = Math.sqrt(dx * dx + dy * dy);
    if (dd <= 3.65) return 'quick';
    if (dd <= 6.75) return 'short';
    if (dd <= 10.5) return 'long';
    if (dd <= 13.5) return 'bomb';
    return null;
  }
  BB.passRange = passRange;
  const RANGE_MOD = { quick: 0, short: -1, long: -2, bomb: -3 };
  const RANGE_ZH = { quick: '快傳', short: '短傳', long: '長傳', bomb: '長炸彈' };
  BB.RANGE_ZH = RANGE_ZH;
  const RES_ZH = { accurate: '精準', inaccurate: '不準', wild: '嚴重偏離', fumble: '失手掉球' };

  function passMod(G, p, band) {
    let m = RANGE_MOD[band];
    if (!has(p, 'Nerves of Steel')) m -= markersOf(G, p.team, p.x, p.y).length;
    if (G.weather === 'sunny') m--;
    if (has(p, 'Accurate') && (band === 'quick' || band === 'short')) m++;
    if (has(p, 'Strong Arm') && band !== 'quick') m++;
    m -= disturbing(G, p);
    return m;
  }
  BB.passMod = passMod;
  function passResult(r, pa, mod) {
    if (r === 1) return 'fumble';
    if (pa != null && (r === 6 || r + mod >= pa)) return 'accurate';
    if (r + mod <= 1) return 'wild';
    return 'inaccurate';
  }
  BB.passResult = passResult;

  function interceptors(G, p, tx, ty) {
    const ax = p.x, ay = p.y, bx = tx - ax, by = ty - ay;
    const L2 = bx * bx + by * by;
    if (!L2 || has(p, 'Cloud Burster')) return [];
    return G.players.filter(q => {
      if (q.team === p.team || !canCatch(q)) return false;
      if ((q.x === tx && q.y === ty)) return false;
      const t = ((q.x - ax) * bx + (q.y - ay) * by) / L2;
      if (t <= 0 || t >= 1) return false;
      const px = ax + bx * t - q.x, py = ay + by * t - q.y;
      return Math.sqrt(px * px + py * py) <= 0.8;
    });
  }
  BB.interceptors = interceptors;

  function* passBall(G, p, tx, ty) {
    const band = passRange(tx - p.x, ty - p.y);
    const mod = passMod(G, p, band);
    let r = d(G, 6);
    let res = passResult(r, p.pa, mod);
    log(G, `${pname(p)} ${RANGE_ZH[band]}（需要 ${needStr(p.pa, mod)}）：擲出 ${r}，${RES_ZH[res]}`, res === 'accurate' ? 'good' : 'bad');
    fx(G, p.x, p.y, `${RANGE_ZH[band]} ${r}`, res === 'accurate');
    if (res !== 'accurate') {
      if (yield* useReroll(G, p, { skill: 'Pass' }, `傳球${RES_ZH[res]}（擲出 ${r}）`)) {
        r = d(G, 6);
        res = passResult(r, p.pa, mod);
        log(G, `重擲傳球：擲出 ${r}，${RES_ZH[res]}`, res === 'accurate' ? 'good' : 'bad');
      }
    }
    if (res === 'fumble' && has(p, 'Safe Pass')) {
      log(G, `安全傳球：${pname(p)} 沒有出手，仍然持球`, 'info');
      fx(G, p.x, p.y, '安全傳球', null);
      return;
    }
    G.ball.carrier = null; G.ball.x = p.x; G.ball.y = p.y; G.ball.inAir = false;
    if (res === 'fumble') {
      fx(G, p.x, p.y, '掉球', false);
      yield* bounce(G, p.x, p.y);
      G.turnover = true;
      return;
    }
    if (res !== 'wild') {
      const ic = interceptors(G, p, tx, ty);
      if (ic.length) {
        const a = yield* ask(G, { type: 'intercept', team: 1 - p.team, candidates: ic.map(q => q.id), from: [p.x, p.y], to: [tx, ty] },
          v => v && (v.pid === null || ic.some(q => q.id === v.pid)));
        if (a.pid !== null) {
          const q = G.players[a.pid];
          let m = res === 'accurate' ? -3 : -2;
          if (!has(q, 'Nerves of Steel')) m -= markersOf(G, q.team, q.x, q.y).length;
          if (has(q, 'Extra Arms')) m++;
          m -= disturbing(G, q);
          if (yield* test(G, q, q.ag, m, { label: '攔截' })) {
            G.ball.carrier = q.id; G.ball.x = q.x; G.ball.y = q.y;
            log(G, `${pname(q)} 攔截成功！`, 'bad');
            G.turnover = true;
            checkTD(G);
            return;
          }
        }
      }
    }
    let lx = tx, ly = ty;
    if (res === 'inaccurate') {
      for (let i = 0; i < 3; i++) {
        const dir = d(G, 8);
        const nx = lx + DIRS[dir - 1][0], ny = ly + DIRS[dir - 1][1];
        if (!onPitch(nx, ny)) {
          log(G, '球飛出界', 'info');
          yield* throwIn(G, lx, ly);
          if (possession(G) !== p.team) G.turnover = true;
          return;
        }
        lx = nx; ly = ny;
      }
      log(G, `球偏到 (${lx},${ly})`, 'info');
    } else if (res === 'wild') {
      const dir = d(G, 8), dist = d(G, 6);
      lx = p.x; ly = p.y;
      for (let i = 0; i < dist; i++) {
        const nx = lx + DIRS[dir - 1][0], ny = ly + DIRS[dir - 1][1];
        if (!onPitch(nx, ny)) {
          log(G, '球飛出界', 'info');
          yield* throwIn(G, lx, ly);
          if (possession(G) !== p.team) G.turnover = true;
          return;
        }
        lx = nx; ly = ny;
      }
      log(G, `球嚴重偏離，飛向${DIR_ZH[dir - 1]} ${dist} 格`, 'info');
    }
    G.ball.x = lx; G.ball.y = ly;
    const q = playerAt(G, lx, ly);
    if (q && canCatch(q)) {
      if (!(yield* catchBall(G, q, res === 'accurate' ? 0 : -1))) yield* bounce(G, lx, ly);
    } else yield* bounce(G, lx, ly);
    if (possession(G) !== p.team && G.touchdown === null) G.turnover = true;
  }

  function* handOff(G, p, q) {
    log(G, `${pname(p)} 把球手遞給 ${pname(q)}`, 'act');
    G.ball.carrier = null; G.ball.x = q.x; G.ball.y = q.y;
    if (!(yield* catchBall(G, q, 0))) yield* bounce(G, q.x, q.y);
    if (possession(G) !== p.team && G.touchdown === null) G.turnover = true;
  }

  function* foul(G, p, t) {
    log(G, `${pname(p)} 對 ${pname(t)} 犯規！`, 'act');
    const off = assists(G, p, t), def = assists(G, t, p);
    const a = d(G, 6), b = d(G, 6);
    let tot = a + b + off - def;
    let dp = has(p, 'Dirty Player');
    let broken = tot >= t.av;
    if (!broken && dp && tot + 1 >= t.av) { broken = true; dp = false; tot++; }
    log(G, `犯規護甲 ${a}+${b}（協助 +${off} / -${def}）對 ${t.av}+：${broken ? '破甲！' : '擋住了'}`, broken ? 'good' : 'info');
    let sentOff = a === b && !has(p, 'Sneaky Git');
    if (broken) {
      const ir = yield* injuryRoll(G, t, { mod: dp ? 1 : 0 });
      if (ir.doubles) sentOff = true;
    }
    if (sentOff) {
      log(G, '裁判看到了！', 'bad');
      fx(G, p.x, p.y, '被罰下場', false);
      const T = G.teams[p.team];
      let saved = false;
      if (T.bribes > 0 && (yield* confirm(G, p.team, 'bribe', `${pname(p)} 被裁判發現犯規，要使用賄賂嗎？（剩 ${T.bribes}）`, { pid: p.id }))) {
        T.bribes--;
        const r = d(G, 6);
        saved = r > 1;
        log(G, `賄賂擲出 ${r}：${saved ? '成功，裁判裝沒看到' : '失敗'}`, saved ? 'good' : 'bad');
      }
      if (!saved) {
        const hadBall = G.ball.carrier === p.id;
        const x = p.x, y = p.y;
        toBox(G, p, 'sent');
        log(G, `${pname(p)} 被罰下場`, 'bad');
        if (hadBall) { G.ball = { x, y, carrier: null, inAir: false }; yield* bounce(G, x, y); }
        G.turnover = true;
      }
    }
  }

  function* throwTeamMate(G, p, q, tx, ty) {
    const band = passRange(tx - p.x, ty - p.y);
    let mod = RANGE_MOD[band];
    if (!has(p, 'Nerves of Steel')) mod -= markersOf(G, p.team, p.x, p.y).length;
    const pa = p.pa == null ? 6 : p.pa;
    let r = d(G, 6);
    let res = passResult(r, pa, mod);
    log(G, `${pname(p)} 把 ${pname(q)} 丟出去！（需要 ${needStr(pa, mod)}）擲出 ${r}，${RES_ZH[res]}`, res === 'accurate' ? 'good' : 'bad');
    if (res !== 'accurate') {
      if (yield* useReroll(G, p, {}, `投擲隊友${RES_ZH[res]}（擲出 ${r}）`)) {
        r = d(G, 6);
        res = passResult(r, pa, mod);
        log(G, `重擲：擲出 ${r}，${RES_ZH[res]}`, res === 'accurate' ? 'good' : 'bad');
      }
    }
    const hadBall = G.ball.carrier === q.id;
    let lx, ly;
    if (res === 'fumble') { lx = q.x; ly = q.y; log(G, '投擲失手，隊友摔在原地', 'bad'); }
    else {
      lx = tx; ly = ty;
      const n = res === 'accurate' ? 0 : 3;
      for (let i = 0; i < n; i++) { const dir = d(G, 8); lx += DIRS[dir - 1][0]; ly += DIRS[dir - 1][1]; if (!onPitch(lx, ly)) break; }
    }
    q.loc = 'air';
    for (let k = 0; k < 10; k++) {
      if (!onPitch(lx, ly)) {
        log(G, `${pname(q)} 飛進了觀眾席！`, 'bad');
        const ox = q.x, oy = q.y;
        toBox(G, q, 'reserve');
        yield* injuryRoll(G, q, { crowd: true });
        if (hadBall) { G.ball = { x: ox, y: oy, carrier: null, inAir: false }; yield* throwIn(G, ox, oy); }
        if (hadBall && possession(G) !== p.team) G.turnover = true;
        return;
      }
      const occ = playerAt(G, lx, ly);
      if (!occ) break;
      log(G, `${pname(q)} 砸在 ${pname(occ)} 身上！`, 'info');
      yield* knockDown(G, occ, { noTurnover: true });
      const dir = d(G, 8); lx += DIRS[dir - 1][0]; ly += DIRS[dir - 1][1];
    }
    q.loc = 'pitch';
    place(G, q, lx, ly);
    let m = res === 'accurate' ? 0 : -1;
    m -= markersOf(G, q.team, lx, ly).length;
    if (res === 'fumble' || !(yield* test(G, q, q.ag, m, { label: '落地' }))) {
      yield* knockDown(G, q, { noTurnover: true });
      if (hadBall) G.turnover = true;
      return;
    }
    if (looseAt(G, lx, ly)) yield* bounce(G, lx, ly);
    checkTD(G);
  }

  // ---------- 鏈球（Fungus / 狂熱者） ----------
  function* bncMove(G, p, A) {
    for (let i = 0; i < p.ma; i++) {
      if (G.turnover || G.touchdown !== null || p.loc !== 'pitch' || p.status !== 'standing') return;
      const a = yield* ask(G, { type: 'bncDir', team: p.team, pid: p.id, step: i + 1, of: p.ma },
        v => v && Number.isInteger(v.dir) && v.dir >= 0 && v.dir < 8);
      let r = d(G, 6);
      const dirOf = rr => (a.dir + (rr <= 2 ? -1 : rr >= 5 ? 1 : 0) + 8) % 8;
      let dir = dirOf(r);
      log(G, `${pname(p)} 旋轉（朝${DIR_ZH[a.dir]}，擲出 ${r}）→ ${DIR_ZH[dir]}`, 'info');
      if (has(p, 'Whirling Dervish') && !A.wd) {
        if (yield* confirm(G, p.team, 'dervish', `旋轉托缽僧：將往${DIR_ZH[dir]}移動，要重擲方向嗎？`, { pid: p.id, dir })) {
          A.wd = true;
          r = d(G, 6); dir = dirOf(r);
          log(G, `旋轉托缽僧重擲：${r} → ${DIR_ZH[dir]}`, 'info');
        }
      }
      const nx = p.x + DIRS[dir][0], ny = p.y + DIRS[dir][1];
      if (!onPitch(nx, ny)) {
        log(G, `${pname(p)} 衝進了觀眾席！`, 'bad');
        toBox(G, p, 'reserve');
        yield* injuryRoll(G, p, { crowd: true });
        G.turnover = true;
        return;
      }
      const occ = playerAt(G, nx, ny);
      if (occ) {
        if (occ.status === 'standing') {
          yield* doBlock(G, p, occ, { bnc: true, first: true });
          if (p.x !== nx || p.y !== ny) return;
        } else { log(G, `${pname(p)} 撞到倒地的球員，停了下來`, 'info'); return; }
      } else {
        place(G, p, nx, ny);
        if (looseAt(G, nx, ny)) yield* bounce(G, nx, ny);
      }
    }
  }

  // ---------- 路徑搜尋（UI 與 AI 共用） ----------
  // 回傳 Map(index -> {x,y,prob,steps,path})，prob 為不含重擲的成功率（不含撿球）
  BB.reach = function (G, p, o) {
    o = o || {};
    let maLeft, rush;
    if (o.maLeft != null) { maLeft = o.maLeft; rush = o.rush; }
    else if (G.act && G.act.pid === p.id) { maLeft = Math.max(0, p.ma - G.act.used); rush = G.act.rush; }
    else { maLeft = Math.max(0, p.ma - (p.status === 'prone' && p.ma >= 3 ? 3 : 0)); rush = has(p, 'Sprint') ? 3 : 2; }
    if (o.reserve) { // 保留步數（例如閃擊阻擋）
      const take = Math.min(o.reserve, maLeft + rush);
      for (let i = 0; i < take; i++) { if (rush > 0 && maLeft === 0) rush--; else if (maLeft > 0) maLeft--; }
    }
    const total = maLeft + rush;
    const N = W * H;
    const occ = new Int16Array(N).fill(-1);
    for (const q of G.players) if (q.loc === 'pitch' && q !== p) occ[q.y * W + q.x] = q.id;
    const mk = new Int8Array(N), tk = new Uint8Array(N), pt = new Int8Array(N);
    for (const q of G.players) {
      if (q.team === p.team || !hasTZ(q)) continue;
      for (const [a, b] of DIRS) {
        const x = q.x + a, y = q.y + b;
        if (!onPitch(x, y)) continue;
        const i = y * W + x;
        mk[i]++;
        if (has(q, 'Tackle')) tk[i] = 1;
        if (has(q, 'Prehensile Tail')) pt[i]++;
      }
    }
    let pr1 = G.weather === 'blizzard' ? 4 / 6 : 5 / 6;
    if (has(p, 'Sure Feet')) pr1 = 1 - (1 - pr1) * (1 - pr1);
    const start = (o.fromY != null ? o.fromY : p.y) * W + (o.fromX != null ? o.fromX : p.x);
    const ballIdx = G.ball.carrier == null && !G.ball.inAir && onPitch(G.ball.x, G.ball.y) ? G.ball.y * W + G.ball.x : -1;
    const isBnc = has(p, 'Ball & Chain');
    const dodgeBase = (from, to) => {
      const mod = (has(p, 'Stunty') ? 0 : -mk[to]) + (has(p, 'Two Heads') ? 1 : 0) + (has(p, 'Titchy') ? 1 : 0) - pt[from];
      return BB.prob(p.ag, mod);
    };
    // 狀態 = 格子 + 「本回合的 Dodge 重擲是否已用掉」（u=1 用掉）。
    // 一旦閃避時還能用 Dodge，就保守地假設重擲被用掉了。
    const hasDodge = has(p, 'Dodge');
    const u0 = hasDodge && !(G.act && G.act.pid === p.id && p.used.Dodge) ? 0 : 1;
    const S2 = 2 * N;
    let cur = new Float64Array(S2); cur[u0 * N + start] = 1;
    const best = new Float64Array(N), bestStep = new Int8Array(N).fill(-1), bestState = new Int32Array(N).fill(-1);
    const prevs = [null];
    for (let s = 0; s < total; s++) {
      const next = new Float64Array(S2), prev = new Int32Array(S2).fill(-1);
      for (let k = 0; k < S2; k++) {
        const c = cur[k];
        if (c <= 0) continue;
        const u = k >= N ? 1 : 0, i = k - u * N;
        if (i === ballIdx && i !== start) continue;
        const x = i % W, y = (i / W) | 0;
        const base = c * (s + 1 > maLeft ? pr1 : 1);
        const marked = mk[i] > 0 && !isBnc;
        for (const [a, b] of DIRS) {
          const nx = x + a, ny = y + b;
          if (!onPitch(nx, ny)) continue;
          const n = ny * W + nx;
          if (occ[n] >= 0 || n === start) continue;
          let v = base, nu = u;
          if (marked) {
            const q = dodgeBase(i, n);
            if (u === 0 && hasDodge && !tk[i]) { v *= q + (1 - q) * q; nu = 1; }
            else v *= q;
          }
          const nk = nu * N + n;
          if (v > next[nk]) { next[nk] = v; prev[nk] = k; }
        }
      }
      prevs.push(prev);
      cur = next;
      for (let k = 0; k < S2; k++) {
        const i = k >= N ? k - N : k;
        if (cur[k] > best[i] + 1e-9) { best[i] = cur[k]; bestStep[i] = s + 1; bestState[i] = k; }
      }
    }
    const res = new Map();
    for (let i = 0; i < N; i++) {
      if (bestStep[i] < 0) continue;
      const path = [];
      let k = bestState[i];
      for (let s = bestStep[i]; s > 0; s--) { const j = k >= N ? k - N : k; path.push([j % W, (j / W) | 0]); k = prevs[s][k]; }
      path.reverse();
      res.set(i, { x: i % W, y: (i / W) | 0, prob: best[i], steps: bestStep[i], rushes: Math.max(0, bestStep[i] - maLeft), path });
    }
    return res;
  };

  // ---------- Game 物件 ----------
  class Game {
    constructor(cfg) {
      this.cfg = JSON.parse(JSON.stringify(cfg));
      this.history = [];
      this._init();
    }
    _init() {
      this.G = BB.newState(this.cfg);
      _curG = this.G;
      this.it = gameFlow(this.G);
      this.prompt = this.it.next().value;
    }
    act(answer) {
      const a = answer == null ? answer : JSON.parse(JSON.stringify(answer));
      _curG = this.G;
      try {
        this.prompt = this.it.next(a).value;
        this.history.push(a);
        return true;
      } catch (e) {
        // 引擎錯誤：用紀錄重播回到錯誤前的狀態
        if (typeof console !== 'undefined') console.error(e);
        const h = this.history;
        this._init();
        for (const x of h) this.prompt = this.it.next(x).value;
        this.G.fx = [];
        this.prompt.error = '引擎錯誤：' + e.message;
        this.lastError = e;
        return false;
      }
    }
  }
  BB.Game = Game;
})();
