/*
 * Blood Bowl 規則引擎（Blood Bowl 2025 版／第三版，純邏輯，不碰 DOM）。
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
  const ACTION_ZH = {
    move: '移動', block: '阻擋', blitz: '閃擊', pass: '傳球', handoff: '手遞', foul: '犯規', ttm: '投擲隊友',
    secure: '保球', stab: '刺擊', chainsaw: '電鋸', vomit: '噴吐', fire: '噴火', gaze: '催眠凝視', bnc: '鏈球'
  };
  BB.ACTION_ZH = ACTION_ZH;
  const FACE_ZH = { AD: '攻方倒地', BD: '雙方倒地', PU: '推開', DS: '守方踉蹌', POW: '守方倒地' };
  BB.FACE_ZH = FACE_ZH;
  const FACES = ['AD', 'BD', 'PU', 'PU', 'DS', 'POW'];
  BB.FACES = FACES;
  const CAS_ZH = { bh: '輕傷', sh: '重傷', si: '嚴重受傷', li: '永久傷害', dead: '死亡' };

  // 目前引擎有實作的技能／特性（其餘只顯示說明）
  BB.IMPLEMENTED = new Set([
    'Catch', 'Dodge', 'Defensive', 'Jump Up', 'Leap', 'Safe Pair of Hands', 'Sidestep', 'Sprint', 'Sure Feet', 'Diving Tackle',
    'Dirty Player', 'Eye Gouge', 'Lone Fouler', 'Put the Boot In', 'Quick Foul', 'Saboteur', 'Shadowing', 'Sneaky Git', 'Lethal Flight',
    'Block', 'Dauntless', 'Fend', 'Frenzy', 'Kick', 'Pro', 'Steady Footing', 'Strip Ball', 'Sure Hands', 'Tackle', 'Taunt', 'Wrestle',
    'Big Hand', 'Claws', 'Disturbing Presence', 'Extra Arms', 'Foul Appearance', 'Horns', 'Iron Hard Skin', 'Prehensile Tail', 'Tentacles',
    'Two Heads', 'Very Long Legs', 'Accurate', 'Cannoneer', 'Cloud Burster', 'Give and Go', 'Leader', 'Nerves of Steel', 'Pass', 'Safe Pass',
    'Arm Bar', 'Brawler', 'Break Tackle', 'Bullseye', 'Grab', 'Guard', 'Juggernaut', 'Mighty Blow', 'Stand Firm', 'Strong Arm', 'Thick Skull',
    'Always Hungry', 'Animal Savagery', 'Animosity', 'Ball & Chain', 'Bloodlust', 'Bone Head', 'Breathe Fire', 'Chainsaw', 'Decay', 'Drunkard',
    'Hatred', 'Hypnotic Gaze', 'Insignificant', 'Loner', 'My Ball', 'No Ball', 'Pick-me-up', 'Pogo', 'Projectile Vomit', 'Really Stupid',
    'Regeneration', 'Right Stuff', 'Secret Weapon', 'Stab', 'Stunty', 'Take Root', 'Throw Team-mate', 'Timmm-ber!', 'Titchy',
    'Unchannelled Fury', 'Unsteady', "Thinking Man's Troll", 'Whirling Dervish'
  ]);

  // ---------- 亂數 ----------
  function rand(G) { // mulberry32
    let t = (G.rng = (G.rng + 0x6D2B79F5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function d(G, n) { return 1 + Math.floor(rand(G) * n); }
  const d3 = G => Math.ceil(d(G, 6) / 2);

  // ---------- 幾何與查詢 ----------
  const onPitch = (x, y) => x >= 0 && x < W && y >= 0 && y < H;
  const inHalf = (t, x) => (t === 0 ? x <= 12 : x >= 13);
  const endzoneOf = t => (t === 0 ? W - 1 : 0); // 該隊要達陣的 x
  const losOf = t => (t === 0 ? 12 : 13);
  const has = (p, s) => p.skills.indexOf(s) >= 0;
  const hasKw = (p, k) => p.keywords.indexOf(k) >= 0;
  const adjacent = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) === 1;
  const cheb = (ax, ay, bx, by) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));
  Object.assign(BB, { onPitch, inHalf, endzoneOf, losOf, has, hasKw, adjacent, cheb });

  function pitchPlayers(G, team) {
    return G.players.filter(p => p.loc === 'pitch' && (team == null || p.team === team));
  }
  function playerAt(G, x, y) {
    for (const p of G.players) if (p.loc === 'pitch' && p.x === x && p.y === y) return p;
    return null;
  }
  // 站著且沒有分心才有擒抱區
  function hasTZ(p) { return p.loc === 'pitch' && p.status === 'standing' && !p.distracted; }
  // 盯防 (x,y) 的對手（相對於 team）
  function markersOf(G, team, x, y) {
    const r = [];
    for (const q of G.players) if (q.team !== team && hasTZ(q) && cheb(q.x, q.y, x, y) === 1) r.push(q);
    return r;
  }
  const isOpen = (G, p) => p.status === 'standing' && !markersOf(G, p.team, p.x, p.y).length;
  function canCatch(p) { return hasTZ(p) && !has(p, 'No Ball'); }
  function disturbing(G, p) {
    let n = 0;
    for (const q of G.players) if (q.team !== p.team && q.loc === 'pitch' && has(q, 'Disturbing Presence') && cheb(q.x, q.y, p.x, p.y) <= 3) n++;
    return n;
  }
  function possession(G) { return G.ball.carrier == null ? null : G.players[G.ball.carrier].team; }
  function looseAt(G, x, y) { return G.ball.carrier == null && !G.ball.inAir && G.ball.x === x && G.ball.y === y; }
  const lonerNeed = p => parseInt(p.params.Loner, 10) || 4;
  Object.assign(BB, { pitchPlayers, playerAt, hasTZ, markersOf, canCatch, possession, disturbing, isOpen });

  function okRoll(r, target, mod) { return r !== 1 && (r === 6 || r + mod >= target); }
  BB.prob = function (target, mod) {
    let c = 0;
    for (let r = 1; r <= 6; r++) if (okRoll(r, target, mod)) c++;
    return c / 6;
  };
  const needStr = (target, mod) => Math.max(2, Math.min(6, target - mod)) + '+';

  // ---------- 紀錄 ----------
  let _curG = null;
  function pname(p) { return `${_curG ? _curG.teams[p.team].name : ''}#${p.num} ${p.name}`; }
  function log(G, text, cls) { G.log.push({ text, cls: cls || '' }); }
  function fx(G, x, y, text, good) { G.fx.push({ id: ++G.fxId, x, y, text, good: good === undefined ? null : good }); }

  function place(G, p, x, y) {
    p.x = x; p.y = y;
    if (G.ball.carrier === p.id) { G.ball.x = x; G.ball.y = y; }
  }
  function toBox(G, p, loc) {
    if (G.ball.carrier === p.id) G.ball.carrier = null;
    p.loc = loc; p.x = -1; p.y = -1; p.status = 'standing';
    p.distracted = false; p.justStunned = false; p.rooted = false; p.eyeGouged = false; p.bloodlust = false;
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
  function teamRRLeft(T) { return T.rerollsLeft + T.driveRR; }
  function rerollOptions(G, p, o) {
    o = o || {};
    const opts = [];
    const T = G.teams[p.team];
    if (!o.noTeam && G.active === p.team && teamRRLeft(T) > 0) opts.push('team');
    if (has(p, 'Pro') && !p.distracted && G.act && G.act.pid === p.id && !G.act.proUsed) opts.push('pro');
    if (has(p, "Thinking Man's Troll") && G.tmt[p.id] !== G.half) opts.push('tmt');
    return opts;
  }
  BB.rerollOptions = rerollOptions;

  function* spendReroll(G, p, kind) {
    if (kind === 'team') {
      const T = G.teams[p.team];
      if (T.driveRR > 0) T.driveRR--; else T.rerollsLeft--;
      log(G, `${T.name} 使用隊伍重擲（剩 ${teamRRLeft(T)}）`, 'rr');
      const cap = G.players.find(q => q.team === p.team && q.captain && q.loc === 'pitch');
      if (cap) {
        const r = d(G, 6);
        if (r === 6) {
          T.rerollsLeft++;
          log(G, `隊長 ${pname(cap)} 擲出 6：這次重擲不消耗！`, 'good');
        }
      }
      if (has(p, 'Loner')) {
        const need = lonerNeed(p), r = d(G, 6);
        if (r < need) { log(G, `獨行者（${need}+）：擲出 ${r}，重擲浪費了`, 'bad'); fx(G, p.x, p.y, '獨行者失敗', false); return false; }
        log(G, `獨行者（${need}+）：擲出 ${r}，可以重擲`, 'good');
      }
      return true;
    }
    if (kind === 'pro') {
      if (G.act) G.act.proUsed = true;
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
    if (o.skill && has(p, o.skill) && !o.noSkill && !p.distracted) {
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

  // D6 檢定。回傳 {ok, r, mod}。o.bonus = {value, label, avail(), use()}：失敗時可補上的加值（例如突破）
  function* testEx(G, p, target, mod, o) {
    let r = d(G, 6);
    let ok = okRoll(r, target, mod);
    const bonus = () => {
      if (!ok && o.bonus && r !== 1 && o.bonus.avail() && okRoll(r, target, mod + o.bonus.value)) {
        o.bonus.use(); mod += o.bonus.value; ok = true;
        log(G, `使用${o.bonus.label}（+${o.bonus.value}）`, 'rr');
      }
    };
    bonus();
    log(G, `${pname(p)} ${o.label}（${needStr(target, mod)}）：擲出 ${r}，${ok ? '成功' : '失敗'}`, ok ? 'good' : 'bad');
    fx(G, p.x, p.y, `${o.label} ${r}${ok ? '✓' : '✗'}`, ok);
    if (ok) return { ok, r, mod };
    if (!(yield* useReroll(G, p, o, `${o.label}失敗（需要 ${needStr(target, mod)}，擲出 ${r}）`))) return { ok, r, mod };
    r = d(G, 6);
    ok = okRoll(r, target, mod);
    bonus();
    log(G, `重擲 ${o.label}：擲出 ${r}，${ok ? '成功' : '失敗'}`, ok ? 'good' : 'bad');
    fx(G, p.x, p.y, `重擲 ${r}${ok ? '✓' : '✗'}`, ok);
    return { ok, r, mod };
  }
  function* test(G, p, target, mod, o) { return (yield* testEx(G, p, target, mod, o)).ok; }

  // ---------- 建立比賽狀態 ----------
  BB.newState = function (cfg) {
    const G = {
      seed: cfg.seed >>> 0, rng: (cfg.seed >>> 0) || 1,
      half: 0, turnNo: [0, 0], active: -1, kicking: 0, firstKicker: 0,
      score: [0, 0], teams: [], players: [],
      ball: { x: -1, y: -1, carrier: null, inAir: false },
      weather: 'perfect', log: [], fx: [], fxId: 0,
      tf: {}, turnover: false, touchdown: null, tmt: {}, act: null,
      over: false, drive: 0, pendingBounce: null, phase: 'pregame'
    };
    cfg.teams.forEach((tc, ti) => {
      const def = BB.TEAMS[tc.race];
      G.teams.push({
        name: tc.name || def.name, race: tc.race, color: tc.color || def.colors[0], rules: def.rules.slice(),
        rerolls: tc.rerolls, rerollsLeft: tc.rerolls, driveRR: 0, apo: !!(tc.apothecary && def.apothecary), apoUsed: false,
        bribes: 0, cheerleaders: tc.cheerleaders || 0, coaches: tc.coaches || 0, fans: 1,
        argueBanned: false, briberyUsed: false, cheer: false, cheerActive: false, skipNext: false, leaderHalf: 0
      });
      let num = 1;
      for (const pos of def.positions) {
        for (let i = 0; i < (tc.counts[pos.key] || 0); i++) G.players.push(makePlayer(G, ti, pos, num++, null));
      }
      for (const s of tc.stars) for (const sp of BB.STARS[s].players) G.players.push(makePlayer(G, ti, sp, num++, s));
      // 隊長
      if (def.rules.indexOf('Team Captain') >= 0) {
        const mine = G.players.filter(p => p.team === ti && !p.star && !hasKw(p, 'Big Guy'));
        const pref = ['Thrower', 'Blitzer', 'Catcher', 'Runner', 'Lineman'];
        let cap = tc.captain ? mine.find(p => p.pos === tc.captain) : null;
        for (const k of pref) if (!cap) cap = mine.find(p => hasKw(p, k));
        if (!cap) cap = mine[0];
        if (cap) { cap.captain = true; if (!has(cap, 'Pro')) cap.skills.push('Pro'); }
      }
    });
    if (G.teams[0].color === G.teams[1].color) G.teams[1].color = BB.TEAMS[G.teams[1].race].colors[1];
    return G;
  };

  function makePlayer(G, team, pos, num, starKey) {
    const skills = [], params = {};
    for (const s of pos.skills) {
      const { name, param } = BB.parseSkill(s);
      if (skills.indexOf(name) < 0) skills.push(name);
      if (param) params[name] = param;
    }
    return {
      id: G.players.length, team, num, name: pos.name, pos: pos.key, short: pos.short, star: !!starKey, starKey,
      keywords: pos.keywords.slice(), ma: pos.ma, st: pos.st, ag: pos.ag, pa: pos.pa, av: pos.av,
      skills, params, loc: 'reserve', x: -1, y: -1, status: 'standing',
      activated: false, used: {}, distracted: false, justStunned: false, rooted: false, eyeGouged: false,
      bloodlust: false, snack: false, captain: false, inDrive: false, cas: null
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
    for (const T of G.teams) { T.fans = d3(G) + 1; }
    log(G, `球迷人數：${G.teams[0].name} ${G.teams[0].fans}、${G.teams[1].name} ${G.teams[1].fans}`, 'info');
    rollWeather(G);
    const toss = d(G, 2) - 1;
    log(G, `擲硬幣：${G.teams[toss].name} 贏得選擇權`, 'info');
    const ch = yield* ask(G, { type: 'kickOrReceive', team: toss }, a => a && (a.choice === 'kick' || a.choice === 'receive'));
    G.firstKicker = ch.choice === 'kick' ? toss : 1 - toss;
    log(G, `${G.teams[G.firstKicker].name} 開球`, 'info');

    for (G.half = 1; G.half <= 2; G.half++) {
      G.turnNo = [0, 0];
      for (const T of G.teams) { T.rerollsLeft = T.rerolls; T.skipNext = false; }
      G.kicking = G.half === 1 ? G.firstKicker : 1 - G.firstKicker;
      log(G, `══ 第 ${G.half} 半場 ══`, 'head');
      for (;;) {
        if (G.turnNo[1 - G.kicking] >= 8) break; // 接球方沒有回合了
        yield* startDrive(G);
        let active = 1 - G.kicking, scored = null;
        for (;;) {
          if (G.turnNo[active] >= 8) {
            if (G.turnNo[1 - active] >= 8) break;
            active = 1 - active;
            continue;
          }
          G.turnNo[active]++;
          if (G.teams[active].skipNext) {
            G.teams[active].skipNext = false;
            log(G, `${G.teams[active].name} 還在慶祝對手回合中的達陣，跳過第 ${G.turnNo[active]} 回合`, 'info');
          } else {
            yield* teamTurn(G, active, null);
            if (G.touchdown !== null) { scored = G.touchdown; break; }
          }
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
    G.active = -1; G.tf = {};
    yield* setupPhase(G, G.kicking, { kind: 'kick' });
    yield* setupPhase(G, 1 - G.kicking, { kind: 'receive' });
    for (const t of [G.kicking, 1 - G.kicking]) {
      if (G.teams[t].rules.indexOf('Swarming') >= 0) {
        const n = d3(G);
        log(G, `${G.teams[t].name} 蜂擁而至：可以再派上 ${n} 名線鋒`, 'event');
        yield* setupPhase(G, t, { kind: 'swarm', limit: n });
      }
    }
    for (const t of [0, 1]) {
      const T = G.teams[t];
      if (T.leaderHalf !== G.half && pitchPlayers(G, t).some(p => has(p, 'Leader'))) {
        T.leaderHalf = G.half; T.rerollsLeft++;
        log(G, `${T.name} 有領袖在場上，本半場多 1 次重擲`, 'good');
      }
    }
    for (const p of G.players) if (p.loc === 'pitch') p.inDrive = true;
    yield* kickoff(G);
    for (const p of G.players) if (p.loc === 'heat') p.loc = 'reserve';
    G.phase = 'play';
  }

  function* endDrive(G) {
    G.active = -1; G.tf = {};
    // 秘密武器
    for (const p of G.players) {
      if (!p.inDrive || !has(p, 'Secret Weapon') || ['pitch', 'reserve', 'ko'].indexOf(p.loc) < 0) continue;
      log(G, `${pname(p)} 是秘密武器，裁判要把他罰下場`, 'bad');
      yield* sendOff(G, p, { secret: true });
    }
    if (G.weather === 'heat') {
      const n = d3(G);
      log(G, `酷熱：雙方各有 ${n} 名球員中暑，下一次推進無法上場`, 'bad');
      for (const t of [0, 1]) {
        const on = pitchPlayers(G, t);
        for (let i = 0; i < n && on.length; i++) {
          const p = on.splice(d(G, on.length) - 1, 1)[0];
          toBox(G, p, 'heat');
          log(G, `${pname(p)} 中暑`, 'bad');
        }
      }
    }
    for (const p of pitchPlayers(G)) toBox(G, p, 'reserve');
    for (const p of G.players) {
      if (p.snack) { p.snack = false; p.ma++; p.av++; }
      p.inDrive = false; p.distracted = false; p.rooted = false; p.eyeGouged = false;
    }
    for (const T of G.teams) { T.driveRR = 0; T.cheer = false; }
    G.ball = { x: -1, y: -1, carrier: null, inAir: false };
    // 昏迷球員回復
    for (const p of G.players) {
      if (p.loc === 'ko') {
        const r = d(G, 6);
        if (r >= 4) { p.loc = 'reserve'; log(G, `${pname(p)} 清醒過來（${r}），回到替補席`, 'good'); }
        else log(G, `${pname(p)} 仍然昏迷（${r}）`, 'bad');
      }
    }
  }

  // 罰下場：爭辯判決 → 賄賂。回傳 true 表示真的被罰下場；o.saveNoTurnover 會回報賄賂成功
  function* sendOff(G, p, o) {
    const T = G.teams[p.team];
    let saved = false, bribed = false;
    if (!T.argueBanned) {
      let r = d(G, 6);
      if (r === 1 && T.rules.indexOf('Bribery and Corruption') >= 0 && !T.briberyUsed) {
        T.briberyUsed = true;
        log(G, '爭辯判決擲出 1，賄賂與腐敗：重擲', 'rr');
        r = d(G, 6);
      }
      if (r === 1) { T.argueBanned = true; log(G, `爭辯判決 ${r}：「你給我出去！」本場不能再爭辯`, 'bad'); }
      else if (r === 6) { saved = true; log(G, `爭辯判決 ${r}：「好吧，既然你這麼說……」不罰下場`, 'good'); }
      else log(G, `爭辯判決 ${r}：「我才不管！」`, 'bad');
    }
    if (!saved && T.bribes > 0 && (yield* confirm(G, p.team, 'bribe', `${pname(p)} 要被罰下場，要使用賄賂嗎？（剩 ${T.bribes}）`, { pid: p.id }))) {
      T.bribes--;
      const r = d(G, 6);
      saved = r !== 1; bribed = saved;
      log(G, `賄賂擲出 ${r}：${saved ? '成功，裁判裝沒看到' : '裁判收了錢還是把人趕出去'}`, saved ? 'good' : 'bad');
    }
    if (saved) return { off: false, bribed };
    const hadBall = G.ball.carrier === p.id;
    const x = p.x, y = p.y;
    toBox(G, p, 'sent');
    log(G, `${pname(p)} 被罰下場`, 'bad');
    if (hadBall) { G.ball = { x, y, carrier: null, inAir: false }; yield* bounce(G, x, y); }
    return { off: true, bribed: false };
  }

  // ---------- 布陣 ----------
  const FORM = {
    kick: [[0, 6], [0, 7], [0, 8], [1, 3], [1, 11], [2, 5], [2, 9], [3, 7], [4, 2], [4, 12], [7, 7]],
    receive: [[0, 6], [0, 7], [0, 8], [1, 2], [1, 12], [3, 4], [3, 10], [3, 7], [5, 5], [5, 9], [8, 7]]
  };

  function setupError(G, t, mode) {
    mode = mode || {};
    const on = pitchPlayers(G, t);
    const avail = on.length + G.players.filter(p => p.team === t && p.loc === 'reserve').length;
    if (!mode.swarm && on.length > 11) return '場上最多 11 人';
    if (!mode.noCount && on.length < Math.min(11, avail)) return `必須派上 ${Math.min(11, avail)} 名球員（目前 ${on.length}）`;
    for (const p of on) if (!inHalf(t, p.x)) return '球員必須在己方半場';
    const los = on.filter(p => p.x === losOf(t) && p.y >= 4 && p.y <= 10).length;
    if (los < Math.min(3, on.length)) return `爭球線（中央）至少要 ${Math.min(3, on.length)} 人（目前 ${los}）`;
    if (on.filter(p => p.y <= 3).length > 2) return '上方邊路最多 2 人';
    if (on.filter(p => p.y >= 11).length > 2) return '下方邊路最多 2 人';
    const cap = G.players.find(p => p.team === t && p.captain);
    if (!mode.noCount && cap && cap.loc === 'reserve') return '必須派上隊長';
    return null;
  }
  BB.setupError = setupError;

  function autoSetup(G, t, kind) {
    for (const p of pitchPlayers(G, t)) toBox(G, p, 'reserve');
    const avail = G.players.filter(p => p.team === t && p.loc === 'reserve');
    const slots = FORM[kind === 'receive' ? 'receive' : 'kick'];
    const n = Math.min(11, avail.length);
    const brawn = p => p.st * 10 + (has(p, 'Block') ? 3 : 0) + (p.av || 0) * 0.5 - (has(p, 'Stunty') && p.st < 3 ? 5 : 0) + (p.captain ? -20 : 0);
    const hands = p => (7 - (p.ag || 6)) * 3 + (has(p, 'Catch') ? 2 : 0) + (has(p, 'Sure Hands') ? 2 : 0) + p.ma * 0.5 - (has(p, 'No Ball') ? 50 : 0) - p.st + (p.captain ? 5 : 0);
    const pool = avail.slice();
    // 隊長一定要上場
    const cap = pool.find(p => p.captain);
    const take = (score) => { pool.sort((a, b) => score(b) - score(a)); return pool.shift(); };
    const assign = new Array(n);
    const losN = Math.min(3, n);
    for (let i = 0; i < losN; i++) assign[i] = take(brawn);
    const deep = kind === 'receive' ? [10, 9, 8] : [10];
    for (const i of deep) if (i < n) assign[i] = take(hands);
    for (let i = losN; i < n; i++) if (!assign[i]) assign[i] = take(brawn);
    if (cap && assign.indexOf(cap) < 0) {
      const i = n - 1;
      assign[i] = cap;
    }
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
    const limited = kind === 'solid' || kind === 'quick' || kind === 'swarm';
    const moved = [];
    const orig = {};
    const open = {};
    for (const p of pitchPlayers(G, t)) { orig[p.id] = [p.x, p.y]; open[p.id] = isOpen(G, p); }
    const lineKey = BB.linemanPos(BB.TEAMS[G.teams[t].race]).key;
    if (kind === 'kick' || kind === 'receive') log(G, `${G.teams[t].name} 布陣（${kind === 'kick' ? '開球方' : '接球方'}）`, 'info');
    let err = null;
    for (;;) {
      const a = yield { type: 'setup', team: t, kind, limit: o.limit || 0, moved: moved.slice(), error: err };
      err = null;
      if (!a) { err = '無效的指令'; continue; }
      if (a.type === 'done') {
        if (kind === 'solid' && !moved.length) return;
        if (kind === 'swarm') { err = setupError(G, t, { noCount: true, swarm: true }); if (err) continue; return; }
        if (kind !== 'quick') { err = setupError(G, t, { noCount: kind === 'solid' }); if (err) continue; }
        return;
      }
      if (a.type === 'auto' && !limited) { autoSetup(G, t, kind); continue; }
      if (a.type === 'clear' && !limited) { for (const p of pitchPlayers(G, t)) toBox(G, p, 'reserve'); continue; }
      const p = G.players[a.pid];
      if (!p || p.team !== t) { err = '不是你的球員'; continue; }
      if (a.type === 'remove') {
        if (kind === 'swarm' && moved.indexOf(p.id) >= 0) { toBox(G, p, 'reserve'); moved.splice(moved.indexOf(p.id), 1); continue; }
        if (!limited && p.loc === 'pitch') toBox(G, p, 'reserve');
        continue;
      }
      if (a.type !== 'place') { err = '無效的指令'; continue; }
      const x = a.x, y = a.y;
      if (!onPitch(x, y)) { err = '超出球場'; continue; }
      if (kind === 'swarm') {
        if (p.loc !== 'reserve' && moved.indexOf(p.id) < 0) { err = '只能派上替補席的線鋒'; continue; }
        if (p.pos !== lineKey) { err = '只能派上線鋒'; continue; }
        if (moved.indexOf(p.id) < 0 && moved.length >= o.limit) { err = `最多只能再派 ${o.limit} 人`; continue; }
        if (!inHalf(t, x) || playerAt(G, x, y)) { err = '只能放在己方半場的空格'; continue; }
        p.loc = 'pitch'; p.status = 'standing'; place(G, p, x, y);
        if (moved.indexOf(p.id) < 0) moved.push(p.id);
        continue;
      }
      if (limited) {
        if (p.loc !== 'pitch') { err = '只能移動場上的球員'; continue; }
        if (!open[p.id]) { err = '只能移動開球前沒被盯防的球員'; continue; }
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
      if (occ) {
        if (p.loc === 'pitch') { const px = p.x, py = p.y; place(G, occ, px, py); }
        else toBox(G, occ, 'reserve');
      } else if (p.loc === 'reserve' && pitchPlayers(G, t).length >= 11) { err = '場上已有 11 人'; continue; }
      p.loc = 'pitch'; p.status = 'standing';
      place(G, p, x, y);
    }
  }

  // ---------- 開球 ----------
  function* kickoff(G) {
    const K = G.kicking, R = 1 - K;
    G.phase = 'kickoff';
    const a = yield* ask(G, { type: 'placeKick', team: K },
      v => v && onPitch(v.x, v.y) && inHalf(R, v.x) ? true : '請選擇對方半場的格子');
    const elig = pitchPlayers(G, K).filter(p => p.x !== losOf(K) && p.y >= 4 && p.y <= 10);
    const kicker = elig.find(p => has(p, 'Kick')) || elig[0] || pitchPlayers(G, K)[0];
    const dir = d(G, 8);
    const useKick = kicker && has(kicker, 'Kick');
    const dist = useKick ? d3(G) : d(G, 6);
    const lx = a.x + DIRS[dir - 1][0] * dist, ly = a.y + DIRS[dir - 1][1] * dist;
    log(G, `${G.teams[K].name} 開球${kicker ? `（${pname(kicker)}）` : ''}：偏移${DIR_ZH[dir - 1]} ${dist} 格${useKick ? '（開球手：D3）' : ''}`, 'info');
    G.ball = { x: lx, y: ly, carrier: null, inAir: true };
    yield* kickoffEvent(G);
    G.active = -1; G.tf = {};
    const x = G.ball.x, y = G.ball.y;
    G.ball.inAir = false;
    if (!onPitch(x, y) || !inHalf(R, x)) { yield* touchback(G, R); return; }
    const p = playerAt(G, x, y);
    let res;
    if (p && canCatch(p)) {
      if (yield* catchBall(G, p, 0)) return;
      res = yield* bounce(G, x, y, { kickHalf: R });
    } else {
      log(G, '球落地', 'info');
      res = yield* bounce(G, x, y, { kickHalf: R });
    }
    if (res === 'touchback') yield* touchback(G, R);
  }

  function* touchback(G, R) {
    G.ball.inAir = false;
    log(G, '回場球（Touchback）！接球方可把球交給任一名站著的球員', 'info');
    const cands = pitchPlayers(G, R).filter(p => p.status === 'standing' && !has(p, 'No Ball'));
    if (!cands.length) {
      let bx = R === 0 ? 6 : 19, by = 7;
      while (playerAt(G, bx, by)) by = (by + 1) % H;
      G.ball = { x: bx, y: by, carrier: null, inAir: false };
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
    const lowest = (x0, x1) => (x0 === x1 ? [0, 1] : [x0 < x1 ? 0 : 1]);
    const highest = (x0, x1) => (x0 === x1 ? [0, 1] : [x0 > x1 ? 0 : 1]);
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
        const n = d3(G) + 3;
        log(G, head + `穩固防守：開球方可重新安排最多 ${n} 名未被盯防的球員`, 'event');
        yield* setupPhase(G, K, { kind: 'solid', limit: n });
        break;
      }
      case 5: {
        log(G, head + '高吊球：接球方可派一名未被盯防的球員到球的落點', 'event');
        const bx = G.ball.x, by = G.ball.y;
        if (onPitch(bx, by) && inHalf(R, bx) && !playerAt(G, bx, by)) {
          const cands = pitchPlayers(G, R).filter(p => isOpen(G, p));
          if (cands.length) {
            const v = yield* ask(G, { type: 'highKick', team: R, candidates: cands.map(p => p.id), x: bx, y: by },
              v => v && (v.pid === null || cands.some(p => p.id === v.pid)));
            if (v.pid !== null) { const p = G.players[v.pid]; place(G, p, bx, by); log(G, `${pname(p)} 跑到落點下方`, 'info'); }
          }
        }
        break;
      }
      case 6: {
        const x0 = d(G, 6) + G.teams[0].cheerleaders, x1 = d(G, 6) + G.teams[1].cheerleaders;
        const w = highest(x0, x1);
        for (const t of w) G.teams[t].cheer = true;
        log(G, head + `觀眾歡呼（${x0}:${x1}）：${w.map(t => G.teams[t].name).join('、')} 下回合第一次阻擋多 1 個協助`, 'event');
        break;
      }
      case 7: {
        const x0 = d(G, 6) + G.teams[0].coaches, x1 = d(G, 6) + G.teams[1].coaches;
        const w = highest(x0, x1);
        for (const t of w) G.teams[t].driveRR++;
        log(G, head + `精彩指導（${x0}:${x1}）：${w.map(t => G.teams[t].name).join('、')} 這次推進多 1 次隊伍重擲`, 'event');
        break;
      }
      case 8: {
        log(G, head + '天氣變化', 'event');
        rollWeather(G);
        if (G.weather === 'perfect') {
          for (let i = 0; i < 3; i++) { const dd = d(G, 8); G.ball.x += DIRS[dd - 1][0]; G.ball.y += DIRS[dd - 1][1]; }
          log(G, '一陣強風把球吹偏了（偏移 3 次）', 'info');
        }
        break;
      }
      case 9: {
        const n = d3(G) + 3;
        log(G, head + `快速開球：接球方最多 ${n} 名未被盯防的球員可移動 1 格`, 'event');
        yield* setupPhase(G, R, { kind: 'quick', limit: n });
        break;
      }
      case 10: {
        const n = d3(G) + 3;
        log(G, head + `衝鋒！開球方最多 ${n} 名未被盯防的球員可以行動`, 'event');
        yield* teamTurn(G, K, { limit: n });
        break;
      }
      case 11: {
        const x0 = d(G, 6), x1 = d(G, 6);
        log(G, head + `可疑點心（${x0}:${x1}）`, 'event');
        for (const t of lowest(x0, x1)) {
          const cands = pitchPlayers(G, t);
          if (!cands.length) continue;
          const p = cands[d(G, cands.length) - 1];
          const rr = d(G, 6);
          if (rr === 1) { toBox(G, p, 'reserve'); log(G, `${pname(p)} 吃壞肚子，整個推進都待在廁所裡`, 'bad'); }
          else { p.snack = true; p.ma--; p.av--; log(G, `${pname(p)} 肚子不舒服，這次推進 MA 和 AV -1`, 'bad'); }
        }
        break;
      }
      case 12: {
        const x0 = d(G, 6) + G.teams[0].fans, x1 = d(G, 6) + G.teams[1].fans;
        log(G, head + `球迷闖入球場（${x0}:${x1}）`, 'event');
        for (const t of lowest(x0, x1)) {
          const cands = pitchPlayers(G, t);
          const n = Math.min(d3(G), cands.length);
          for (let i = 0; i < n; i++) {
            const p = cands.splice(d(G, cands.length) - 1, 1)[0];
            p.status = 'stunned'; p.justStunned = false;
            log(G, `${pname(p)} 被球迷打暈`, 'bad');
          }
        }
        break;
      }
    }
  }

  // ---------- 球的移動 ----------
  // mod：基本修正（彈跳、界外球 -1）
  function* catchBall(G, p, mod, o) {
    o = o || {};
    G.ball.x = p.x; G.ball.y = p.y; G.ball.carrier = null; G.ball.inAir = false;
    if (!canCatch(p)) {
      log(G, `${pname(p)} 無法接球`, 'bad');
      return false;
    }
    let m = mod;
    if (!has(p, 'Nerves of Steel')) m -= markersOf(G, p.team, p.x, p.y).length;
    if (G.weather === 'rain') m -= 1;
    if (has(p, 'Extra Arms')) m += 1;
    m -= disturbing(G, p);
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
      if (!canCatch(p)) log(G, `${pname(p)} 沒辦法接球`, 'info');
      x = nx; y = ny;
    }
    return 'ground';
  }

  // 觀眾丟回場內。(x,y) 是球離開球場前最後的格子
  function* throwIn(G, x, y) {
    for (let k = 0; k < 6; k++) {
      let vx, vy;
      const cornerX = x === 0 || x === W - 1, cornerY = y === 0 || y === H - 1;
      if (cornerX && cornerY) {
        // 角落：D3 決定方向（朝場內的三個方向）
        const ix = x === 0 ? 1 : -1, iy = y === 0 ? 1 : -1;
        const opts = [[ix, 0], [ix, iy], [0, iy]];
        [vx, vy] = opts[d3(G) - 1];
      } else {
        let dx = 0, dy = 0;
        if (y === 0) dy = 1; else if (y === H - 1) dy = -1;
        else if (x === 0) dx = 1; else if (x === W - 1) dx = -1;
        else dy = y < H / 2 ? 1 : -1;
        const r = d(G, 6);
        const s = r <= 2 ? -1 : r >= 5 ? 1 : 0;
        vx = dx + (dy !== 0 ? s : 0); vy = dy + (dx !== 0 ? s : 0);
      }
      const dist = d(G, 6) + d(G, 6);
      // 模板下的那一格算第 1 格
      let cx = x, cy = y, lx = x, ly = y;
      for (let i = 1; i < dist; i++) { cx += vx; cy += vy; if (onPitch(cx, cy)) { lx = cx; ly = cy; } }
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
    if (playerAt(G, x, y)) yield* bounce(G, x, y);
  }

  function checkTD(G) {
    if (G.touchdown !== null || G.ball.carrier == null) return;
    const p = G.players[G.ball.carrier];
    if (p.loc === 'pitch' && p.status === 'standing' && p.x === endzoneOf(p.team) && !p.bloodlust) {
      G.touchdown = p.team;
      G.score[p.team]++;
      log(G, `🏈 達陣！${pname(p)} 為 ${G.teams[p.team].name} 得分！比分 ${G.score[0]} : ${G.score[1]}`, 'td');
      fx(G, p.x, p.y, '達陣！', true);
      if (G.active >= 0 && G.active !== p.team) G.teams[p.team].skipNext = true;
    }
  }

  // ---------- 倒地、護甲、傷害 ----------
  // 把持球者的球放下並彈開（穩妥雙手可以改放到相鄰空格）
  function* dropBall(G, p, x, y) {
    if (has(p, 'Safe Pair of Hands') && !p.distracted) {
      let best = null, bs = -99;
      for (const [a, b] of DIRS) {
        const nx = x + a, ny = y + b;
        if (!onPitch(nx, ny) || playerAt(G, nx, ny)) continue;
        const s = -markersOf(G, p.team, nx, ny).length * 3 + pitchPlayers(G, p.team).filter(q => q !== p && cheb(q.x, q.y, nx, ny) <= 1).length;
        if (s > bs) { bs = s; best = [nx, ny]; }
      }
      if (best) {
        G.ball = { x: best[0], y: best[1], carrier: null, inAir: false };
        log(G, `${pname(p)} 用穩妥雙手把球放在旁邊`, 'info');
        return;
      }
    }
    G.ball = { x, y, carrier: null, inAir: false };
    log(G, '球掉了', 'info');
    yield* bounce(G, x, y);
  }

  // 回傳 true 表示真的倒地；穩健步伐擲出 6 則回傳 false
  // o: {mb, claws, armMod, noTurnover, attacker}
  function* knockDown(G, p, o) {
    o = o || {};
    if (has(p, 'Steady Footing') && !has(p, 'Ball & Chain')) {
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
    p.status = 'prone'; p.rooted = false;
    if (hadBall) G.ball.carrier = null;
    log(G, `${pname(p)} 倒地`, 'bad');
    fx(G, x, y, '倒地', false);
    if (p.team === G.active && !o.noTurnover) G.turnover = true;
    yield* armourInjury(G, p, o);
    if (hadBall) yield* dropBall(G, p, x, y);
    else if (loose) { log(G, '球彈開', 'info'); yield* bounce(G, x, y); }
    return true;
  }

  // 倒地放置（不擲護甲）
  function* placeProne(G, p, why) {
    const hadBall = G.ball.carrier === p.id;
    const x = p.x, y = p.y;
    p.status = 'prone'; p.rooted = false;
    log(G, `${pname(p)} ${why || '倒在地上'}`, 'info');
    if (has(p, 'Ball & Chain')) { yield* injuryRoll(G, p, { bnc: true }); }
    if (hadBall) {
      G.ball.carrier = null;
      if (p.team === G.active) G.turnover = true;
      yield* dropBall(G, p, x, y);
    }
  }

  function* armourInjury(G, p, o) {
    o = o || {};
    if (has(p, 'Ball & Chain')) { yield* injuryRoll(G, p, { bnc: true }); return; }
    const ihs = has(p, 'Iron Hard Skin');
    let mb = !!o.mb && !ihs;
    const a = d(G, 6), b = d(G, 6);
    let tot = a + b + (ihs ? 0 : (o.armMod || 0)) + (has(p, 'Chainsaw') && !ihs ? 3 : 0);
    let broken = tot >= p.av || (o.claws && !ihs && a + b >= 8);
    let note = '';
    if (!broken && mb && tot + 1 >= p.av) { broken = true; mb = false; tot++; note = '（+1）'; }
    log(G, `護甲擲骰 ${a}+${b}${tot !== a + b ? ' → ' + tot : ''}${note} 對 ${p.av}+：${broken ? '破甲！' : '擋住了'}`, broken ? 'bad' : 'info');
    if (!broken) return;
    yield* injuryRoll(G, p, { mb: !!o.mb && (mb || ihs) });
  }

  // o: {mb, mod, crowd, bnc}
  function* injuryRoll(G, p, o) {
    const a = d(G, 6), b = d(G, 6);
    const tot = a + b + (o.mod || 0) + (o.mb ? 1 : 0);
    let res;
    const stunty = has(p, 'Stunty');
    if (stunty) res = tot <= 6 ? 'stunned' : tot <= 8 ? 'ko' : 'cas';
    else res = tot <= 7 ? 'stunned' : tot <= 9 ? 'ko' : 'cas';
    if (res === 'ko' && has(p, 'Thick Skull') && tot === (stunty ? 7 : 8)) res = 'stunned';
    if (res === 'stunned' && o.bnc) res = 'ko';
    const zh = { stunned: '擊暈', ko: '昏迷 (KO)', cas: '受傷離場' }[res];
    log(G, `傷害擲骰 ${a}+${b}${o.mb ? '+1' : ''}${o.mod ? '+' + o.mod : ''}=${tot}：${zh}`, res === 'stunned' ? 'info' : 'bad');
    if (p.loc === 'pitch') fx(G, p.x, p.y, zh, false);
    yield* applyInjury(G, p, res, o);
    return { res, doubles: a === b };
  }

  function canApo(G, p) { const T = G.teams[p.team]; return T.apo && !T.apoUsed && !p.star; }

  function* applyInjury(G, p, res, o) {
    if (res === 'stunned') {
      if (o.crowd || p.loc !== 'pitch') toBox(G, p, 'reserve');
      else { p.status = 'stunned'; p.rooted = false; p.justStunned = G.active === p.team; }
      return;
    }
    if (res === 'ko') {
      if (canApo(G, p) && (yield* confirm(G, p.team, 'apothecary', `${pname(p)} 昏迷了，要使用隊醫嗎？`, { pid: p.id }))) {
        G.teams[p.team].apoUsed = true;
        log(G, `隊醫治療 ${pname(p)}`, 'good');
        if (o.crowd || p.loc !== 'pitch') toBox(G, p, 'reserve');
        else { p.status = 'stunned'; p.justStunned = G.active === p.team; }
        return;
      }
      toBox(G, p, 'ko');
      return;
    }
    // 受傷離場：先擲再生
    if (has(p, 'Regeneration')) {
      const r = d(G, 6);
      log(G, `再生擲骰 ${r}：${r >= 4 ? '傷口癒合，回到替補席' : '失敗'}`, r >= 4 ? 'good' : 'bad');
      if (r >= 4) { toBox(G, p, 'reserve'); return; }
    }
    const cas = r => (r <= 8 ? 'bh' : r <= 10 ? 'sh' : r <= 12 ? 'si' : r <= 14 ? 'li' : 'dead');
    const roll = () => Math.min(16, d(G, 16) + (has(p, 'Decay') ? 1 : 0));
    let c = roll();
    log(G, `傷亡擲骰 ${c}：${CAS_ZH[cas(c)]}`, 'bad');
    if (canApo(G, p) && (yield* confirm(G, p.team, 'apothecary', `${pname(p)} ${CAS_ZH[cas(c)]}，要使用隊醫嗎？`, { pid: p.id }))) {
      G.teams[p.team].apoUsed = true;
      const c2 = roll();
      c = Math.min(c, c2);
      log(G, `隊醫重擲傷亡 ${c2}，採用 ${CAS_ZH[cas(c)]}`, 'info');
      if (cas(c) === 'bh') { toBox(G, p, 'reserve'); log(G, `${pname(p)} 包紮後回到替補席`, 'good'); return; }
    }
    toBox(G, p, 'cas');
    p.cas = cas(c);
  }

  // ---------- 回合 ----------
  function canSecure(G) {
    if (G.ball.carrier != null || G.ball.inAir || !onPitch(G.ball.x, G.ball.y)) return false;
    return !G.players.some(q => q.team !== G.active && hasTZ(q) && cheb(q.x, q.y, G.ball.x, G.ball.y) <= 2);
  }
  BB.canSecure = canSecure;

  function legalActions(G, p) {
    const tf = G.tf;
    if (has(p, 'Ball & Chain')) return ['bnc'];
    const L = ['move'];
    const prone = p.status !== 'standing';
    const opps = pitchPlayers(G, 1 - p.team);
    const adjStanding = opps.some(q => q.status === 'standing' && adjacent(p, q));
    if ((!prone || has(p, 'Jump Up')) && adjStanding) L.push('block');
    if (!tf.blitz) L.push('blitz');
    if (!tf.secure && !hasKw(p, 'Big Guy') && !has(p, 'Unsteady') && !has(p, 'No Ball') && canSecure(G)) L.push('secure');
    const myBall = has(p, 'My Ball');
    if (!tf.pass && p.pa != null && !has(p, 'No Ball') && !myBall) L.push('pass');
    if (!tf.handoff && !has(p, 'No Ball') && !myBall) L.push('handoff');
    if (!tf.foul) L.push('foul');
    if (!tf.ttm && has(p, 'Throw Team-mate') &&
      pitchPlayers(G, p.team).some(q => q !== p && has(q, 'Right Stuff'))) L.push('ttm');
    if (!prone) {
      if (has(p, 'Stab') && adjStanding) L.push('stab');
      if (has(p, 'Chainsaw') && opps.some(q => adjacent(p, q))) L.push('chainsaw');
      if (has(p, 'Projectile Vomit') && adjStanding) L.push('vomit');
      if (has(p, 'Breathe Fire') && adjStanding) L.push('fire');
    }
    if (has(p, 'Hypnotic Gaze')) L.push('gaze');
    if (tf.special) return L.filter(a => a === 'move' || (a === 'blitz') || a === 'ttm');
    return L;
  }
  BB.legalActions = legalActions;

  function canActivate(G, p, action) {
    if (!p || p.team !== G.active) return '不是你的球員';
    if (p.loc !== 'pitch') return '球員不在場上';
    if (p.activated) return '這名球員本回合已行動過';
    if (p.status === 'stunned') return '被擊暈的球員不能行動';
    if (G.tf.special && !isOpen(G, p)) return '衝鋒事件只能啟動未被盯防、站著的球員';
    if (legalActions(G, p).indexOf(action) < 0) return '不能宣告這個行動';
    return null;
  }
  BB.canActivate = canActivate;

  function* teamTurn(G, t, special) {
    G.active = t; G.turnover = false;
    G.tf = { blitz: false, pass: false, handoff: false, foul: false, ttm: false, secure: false, special: special || null, count: 0 };
    const T = G.teams[t];
    T.cheerActive = T.cheer && !special; if (!special) T.cheer = false;
    for (const p of G.players) if (p.team === t) { p.activated = false; p.used = {}; }
    if (!special) log(G, `── ${T.name} 第 ${G.turnNo[t]} 回合 ──`, 'turn');
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
    T.cheerActive = false;
    if (!special) {
      for (const p of G.players) {
        if (p.team !== t) continue;
        if (p.loc === 'pitch' && p.status === 'stunned' && !p.justStunned) p.status = 'prone';
        p.justStunned = false;
      }
      // 拉一把：對手（另一隊）的回合結束時觸發
      const helpers = pitchPlayers(G, 1 - t).filter(q => has(q, 'Pick-me-up') && hasTZ(q));
      if (helpers.length) {
        for (const q of pitchPlayers(G, 1 - t)) {
          if (q.status !== 'prone' || !helpers.some(h => h !== q && cheb(h.x, h.y, q.x, q.y) <= 3)) continue;
          const r = d(G, 6);
          if (r >= 5) { q.status = 'standing'; log(G, `拉一把（${r}）：${pname(q)} 被扶起來`, 'good'); }
        }
      }
    }
    G.turnover = false;
    if (special) { G.active = -1; G.tf = {}; }
  }

  function remaining(p, A) { return Math.max(0, p.ma - A.used) + A.rush; }

  // 不擲任何骰子就能達陣（拖延判定）
  function canScoreFree(G, p) {
    if (G.ball.carrier !== p.id || G.tf.special) return false;
    if (['Bone Head', 'Really Stupid', 'Animal Savagery', 'Unchannelled Fury', 'Bloodlust', 'Take Root'].some(s => has(p, s))) return false;
    if (p.status !== 'standing' && p.ma <= 2) return false;
    const ez = endzoneOf(p.team);
    for (const r of BB.reach(G, p).values()) if (r.x === ez && r.prob >= 0.9999 && !r.rushes) return true;
    return false;
  }
  BB.canScoreFree = canScoreFree;

  function* activation(G, p, action) {
    const stalling = canScoreFree(G, p);
    p.activated = true; p.distracted = false; p.eyeGouged = false;
    if (['blitz', 'pass', 'handoff', 'foul', 'ttm', 'secure'].indexOf(action) >= 0) G.tf[action] = true;
    const A = { pid: p.id, action, used: 0, rush: has(p, 'Sprint') ? 3 : 2, blocked: false, finished: false, proUsed: false };
    G.act = A;
    log(G, `${pname(p)} 宣告：${ACTION_ZH[action]}`, 'act');
    const blockish = action === 'block' || action === 'blitz';

    const ok = yield* negatraits(G, p, action, blockish);
    if (ok && p.status === 'prone') {
      if (has(p, 'Jump Up')) {
        if (action === 'block') {
          if (!(yield* test(G, p, p.ag, 1, { label: '彈跳起身' }))) { A.finished = true; }
          else { p.status = 'standing'; log(G, `${pname(p)} 彈起來阻擋`, 'info'); }
        } else { p.status = 'standing'; log(G, `${pname(p)} 彈跳起身`, 'info'); }
      } else if (p.ma <= 2) {
        const help = has(p, 'Timmm-ber!') ? pitchPlayers(G, p.team).filter(q => q !== p && adjacent(p, q) && isOpen(G, q)).length : 0;
        if (!(yield* test(G, p, 4, help, { label: '起身' }))) A.finished = true;
        else { p.status = 'standing'; A.used = p.ma; }
      } else { A.used += 3; p.status = 'standing'; log(G, `${pname(p)} 站起來`, 'info'); }
    }
    if (ok && !A.finished && p.status === 'standing') {
      if (action === 'bnc') yield* bncMove(G, p, A);
      else yield* activationLoop(G, p, A);
    }
    // 嗜血：行動結束時要咬血奴
    if (p.bloodlust && p.loc === 'pitch') {
      p.bloodlust = false;
      const thrall = pitchPlayers(G, p.team).find(q => q !== p && adjacent(p, q) && hasKw(q, 'Thrall'));
      if (thrall) {
        log(G, `${pname(p)} 咬了血奴 ${pname(thrall)}`, 'info');
        const hadBall = G.ball.carrier === thrall.id;
        const tx = thrall.x, ty = thrall.y;
        yield* injuryRoll(G, thrall, {});
        if (hadBall && thrall.loc !== 'pitch') { G.turnover = true; yield* dropBall(G, thrall, tx, ty); }
        checkTD(G);
      } else {
        log(G, `${pname(p)} 嗜血發作卻沒有血奴可咬！失誤`, 'bad');
        p.distracted = true;
        G.turnover = true;
        if (G.ball.carrier === p.id) { G.ball.carrier = null; yield* dropBall(G, p, p.x, p.y); }
      }
    }
    // 拖延
    if (stalling && G.ball.carrier === p.id && G.touchdown === null && !G.turnover && p.loc === 'pitch' && p.status === 'standing') {
      const r = d(G, 6);
      const turn = G.turnNo[p.team];
      log(G, `${pname(p)} 明明可以達陣卻在拖延！觀眾擲 ${r}（回合 ${turn}）`, r >= turn ? 'bad' : 'info');
      if (r >= turn) {
        log(G, '觀眾丟東西砸中他！', 'bad');
        yield* knockDown(G, p, {});
        G.turnover = true;
      }
    }
    G.act = null;
  }

  // 啟動時的負面特性。回傳 false 表示行動直接結束
  function* negatraits(G, p, action, blockish) {
    const A = G.act;
    if (has(p, 'Bone Head')) {
      if (!(yield* test(G, p, 2, 0, { label: '木頭腦袋' }))) { p.distracted = true; log(G, `${pname(p)} 發呆，分心了`, 'bad'); return false; }
    }
    if (has(p, 'Really Stupid')) {
      const help = pitchPlayers(G, p.team).some(q => q !== p && adjacent(p, q) && hasTZ(q) && !has(q, 'Really Stupid'));
      if (!(yield* test(G, p, 4, help ? 2 : 0, { label: '超級笨蛋' }))) { p.distracted = true; log(G, `${pname(p)} 呆住了`, 'bad'); return false; }
    }
    if (has(p, 'Unchannelled Fury')) {
      if (!(yield* test(G, p, 4, blockish ? 2 : 0, { label: '狂怒失控' }))) { log(G, `${pname(p)} 胡亂咆哮，什麼都沒做`, 'bad'); return false; }
    }
    if (has(p, 'Animal Savagery')) {
      if (!(yield* test(G, p, 4, blockish ? 2 : 0, { label: '野性難馴' }))) {
        const mates = pitchPlayers(G, p.team).filter(q => q !== p && q.status === 'standing' && adjacent(p, q));
        if (!mates.length) { p.distracted = true; log(G, `${pname(p)} 失控卻沒人可打，分心了`, 'bad'); return false; }
        mates.sort((a, b) => (G.ball.carrier === a.id ? 1 : 0) - (G.ball.carrier === b.id ? 1 : 0) || a.av - b.av);
        const v = mates[0];
        log(G, `${pname(p)} 失控攻擊了隊友 ${pname(v)}！`, 'bad');
        yield* knockDown(G, v, { mb: has(p, 'Mighty Blow'), claws: has(p, 'Claws'), noTurnover: G.ball.carrier !== v.id });
        if (G.turnover) return false;
      }
    }
    if (has(p, 'Bloodlust')) {
      const need = parseInt(p.params.Bloodlust, 10) || 2;
      const r = d(G, 6), tot = r + (blockish ? 1 : 0);
      const ok = r !== 1 && tot >= need;
      log(G, `嗜血（${need}+）：擲出 ${r}${blockish ? '+1' : ''}，${ok ? '成功' : '失敗，行動結束時必須咬血奴'}`, ok ? 'good' : 'bad');
      if (!ok) p.bloodlust = true;
    }
    if (has(p, 'Take Root') && p.status === 'standing' && !p.rooted) {
      if (!(yield* test(G, p, 2, 0, { label: '生根' }))) { p.rooted = true; log(G, `${pname(p)} 生根了，不能移動`, 'bad'); }
    }
    void A;
    return true;
  }

  function* activationLoop(G, p, A) {
    const action = A.action;
    let err = null;
    for (;;) {
      if (G.turnover || G.touchdown !== null || p.loc !== 'pitch' || p.status !== 'standing' || p.distracted) break;
      if (A.finished) break;
      if (action === 'block' && A.blocked) break;
      const a = yield { type: 'activation', team: p.team, pid: p.id, action, error: err };
      err = checkAct(G, p, A, a);
      if (err) continue;
      if (a.type === 'end') break;
      const before = possession(G);
      if (a.type === 'move') {
        for (let i = 0; i < a.path.length; i++) {
          const [x, y] = a.path[i];
          if (!(yield* moveStep(G, p, A, x, y))) break;
        }
        if (action === 'secure' && !A.finished && p.loc === 'pitch' && p.status === 'standing' && !G.turnover) {
          if (looseAt(G, p.x, p.y)) yield* secureBall(G, p, A);
        }
      } else if (a.type === 'jump') {
        yield* jumpStep(G, p, A, a.x, a.y);
        if (action === 'secure' && !A.finished && looseAt(G, p.x, p.y) && p.status === 'standing') yield* secureBall(G, p, A);
      } else if (a.type === 'block' || (action === 'blitz' && ['stab', 'chainsaw', 'vomit', 'fire'].indexOf(a.type) >= 0)) {
        const def = G.players[a.target];
        if (action === 'blitz') {
          const needRush = A.used >= p.ma;
          A.used++;
          if (needRush) {
            A.rush--;
            if (!(yield* rushRoll(G, p))) { if (yield* knockDown(G, p, {})) break; }
          }
        }
        A.blocked = true;
        if (a.type === 'block') yield* doBlock(G, p, def, { blitz: action === 'blitz', act: A, first: true, declared: action });
        else { A.finished = true; yield* specialAttack(G, p, def, a.type); }
      } else if (a.type === 'pass') {
        A.finished = true;
        yield* passBall(G, p, a.x, a.y, A);
      } else if (a.type === 'handoff') {
        A.finished = true;
        yield* handOff(G, p, G.players[a.target], A);
      } else if (a.type === 'foul') {
        A.finished = true;
        yield* foul(G, p, G.players[a.target], A);
      } else if (a.type === 'ttm') {
        A.finished = true;
        yield* throwTeamMate(G, p, G.players[a.target], a.x, a.y);
      } else if (['stab', 'chainsaw', 'vomit', 'fire', 'gaze'].indexOf(a.type) >= 0) {
        A.finished = true;
        yield* specialAttack(G, p, G.players[a.target], a.type);
      }
      if (before === p.team && possession(G) !== p.team && G.touchdown === null) G.turnover = true;
    }
  }

  // 跳躍的合法目標：距離 2，中間有一格可以跳過（一般跳躍只能跳過倒地球員）
  function jumpTargetOk(G, p, x, y) {
    if (!onPitch(x, y) || cheb(p.x, p.y, x, y) !== 2 || playerAt(G, x, y)) return false;
    const leap = has(p, 'Leap') || has(p, 'Pogo');
    for (const [a, b] of DIRS) {
      const sx = p.x + a, sy = p.y + b;
      if (cheb(sx, sy, x, y) !== 1) continue;
      if (leap) return true;
      const o = playerAt(G, sx, sy);
      if (o && o.status !== 'standing') return true;
    }
    return false;
  }
  BB.jumpTargetOk = jumpTargetOk;

  function checkAct(G, p, A, a) {
    if (!a || typeof a.type !== 'string') return '無效的指令';
    const act = A.action;
    if (a.type === 'end') return null;
    const moveOk = ['block', 'stab', 'chainsaw', 'vomit', 'fire'].indexOf(act) < 0 && !A.noMore;
    if (a.type === 'move') {
      if (!moveOk) return '這個行動不能移動';
      if (p.rooted) return '生根了，不能移動';
      if (!Array.isArray(a.path) || !a.path.length) return '沒有路徑';
      if (a.path.length > remaining(p, A)) return '移動力不足';
      let cx = p.x, cy = p.y;
      for (let i = 0; i < a.path.length; i++) {
        const s = a.path[i];
        if (!Array.isArray(s)) return '路徑錯誤';
        const [x, y] = s;
        if (!onPitch(x, y) || cheb(cx, cy, x, y) !== 1) return '路徑錯誤';
        const o = playerAt(G, x, y);
        if (o && o !== p) return '路徑被擋住';
        cx = x; cy = y;
      }
      if (act === 'secure' && !(G.ball.carrier == null && G.ball.x === cx && G.ball.y === cy)) return '保球行動必須移動到球所在的格子';
      return null;
    }
    if (a.type === 'jump') {
      if (!moveOk) return '這個行動不能跳躍';
      if (p.rooted) return '生根了，不能移動';
      if (!jumpTargetOk(G, p, a.x, a.y)) return '不能跳到那裡';
      if (remaining(p, A) < 2) return '移動力不足';
      return null;
    }
    const tgt = G.players[a.target];
    const adjOpp = q => q && q.team !== p.team && q.loc === 'pitch' && adjacent(p, q);
    if (a.type === 'block') {
      if (act !== 'block' && act !== 'blitz') return '這個行動不能阻擋';
      if (A.blocked) return '已經阻擋過了';
      if (act === 'blitz' && remaining(p, A) < 1) return '移動力不足，無法閃擊';
      if (!adjOpp(tgt) || tgt.status !== 'standing') return '目標必須是相鄰且站著的對手';
      return null;
    }
    if (['stab', 'chainsaw', 'vomit', 'fire'].indexOf(a.type) >= 0) {
      const map = { stab: 'Stab', chainsaw: 'Chainsaw', vomit: 'Projectile Vomit', fire: 'Breathe Fire' };
      if (!has(p, map[a.type])) return '沒有這個能力';
      if (act === 'blitz') {
        if (A.blocked) return '已經阻擋過了';
        if (remaining(p, A) < 1) return '移動力不足';
      } else if (act !== a.type) return '這個行動不能這樣做';
      if (!adjOpp(tgt)) return '目標必須是相鄰的對手';
      if (a.type !== 'chainsaw' && tgt.status !== 'standing') return '目標必須站著';
      return null;
    }
    if (a.type === 'gaze') {
      if (act !== 'gaze') return '這個行動不能催眠凝視';
      if (!adjOpp(tgt) || tgt.status !== 'standing') return '目標必須是相鄰且站著的對手';
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
      if (!tgt || tgt.team !== p.team || tgt === p || !adjacent(p, tgt) || !hasTZ(tgt)) return '目標必須是相鄰、站著的隊友';
      return null;
    }
    if (a.type === 'foul') {
      if (act !== 'foul' || A.fouled) return '這個行動不能犯規';
      if (!adjOpp(tgt) || tgt.status === 'standing') return '目標必須是相鄰、倒地的對手';
      return null;
    }
    if (a.type === 'ttm') {
      if (act !== 'ttm') return '這個行動不能投擲隊友';
      if (!tgt || tgt.team !== p.team || !adjacent(p, tgt) || !has(tgt, 'Right Stuff')) return '必須投擲相鄰、有「可投擲」的隊友';
      if (!onPitch(a.x, a.y)) return '目標超出球場';
      const band = passRange(a.x - p.x, a.y - p.y);
      if (band !== 'quick' && band !== 'short') return '投擲隊友只能用快傳或短傳距離';
      return null;
    }
    return '無效的指令';
  }

  function* rushRoll(G, p) {
    let mod = 0;
    if (G.weather === 'blizzard') mod--;
    if (has(p, 'Drunkard')) mod--;
    return yield* test(G, p, 2, mod, { label: '衝刺', skill: 'Sure Feet' });
  }

  function breakTackleBonus(p) {
    if (!has(p, 'Break Tackle')) return null;
    return {
      value: p.st >= 5 ? 3 : p.st === 4 ? 2 : 1, label: '突破',
      avail: () => !p.used.bt, use: () => { p.used.bt = true; }
    };
  }

  // 離開被盯防的格子時，對手的觸手、飛撲擒抱、如影隨形、鎖臂
  function reactiveFrom(markers, skill) {
    return markers.filter(m => has(m, skill) && !m.distracted);
  }

  function* moveStep(G, p, A, x, y) {
    const fx0 = p.x, fy0 = p.y;
    const marked = markersOf(G, p.team, fx0, fy0);
    const needRush = A.used >= p.ma;
    A.used++;
    if (needRush) {
      A.rush--;
      if (!(yield* rushRoll(G, p))) {
        place(G, p, x, y);
        if (yield* knockDown(G, p, {})) return false;
      }
    }
    if (marked.length) {
      // 觸手：可能把人留在原地
      const tent = reactiveFrom(marked, 'Tentacles').sort((a, b) => b.st - a.st)[0];
      if (tent) {
        const r = d(G, 6), v = r + tent.st - p.st;
        const held = r === 6 || (r !== 1 && v >= 6);
        log(G, `${pname(tent)} 的觸手（${r}+${tent.st}-${p.st}=${v}）：${held ? '抓住了！' : '沒抓到'}`, held ? 'bad' : 'info');
        if (held) { A.finished = true; return false; }
      }
    }
    place(G, p, x, y);
    if (marked.length) {
      const res = yield* dodgeTest(G, p, marked, x, y, false);
      if (res === 'tackled') {
        const dt = reactiveFrom(marked, 'Diving Tackle').find(m => m.status === 'prone');
        if (dt && !playerAt(G, fx0, fy0)) place(G, dt, fx0, fy0);
        if (yield* knockDown(G, p, {})) return false;
      } else if (!res) {
        const ab = reactiveFrom(marked, 'Arm Bar').length > 0;
        if (yield* knockDown(G, p, { mb: ab })) return false;
      } else yield* shadowing(G, p, marked, fx0, fy0);
    }
    if (looseAt(G, x, y)) {
      if (A.action === 'secure') return true;
      if (!(yield* pickUp(G, p))) return false;
    }
    checkTD(G);
    return G.touchdown === null;
  }

  // 閃避檢定（含飛撲擒抱）。回傳是否站穩
  function* dodgeTest(G, p, marked, x, y, jumping) {
    let mod = 0;
    if (!jumping) {
      if (!has(p, 'Stunty')) mod -= markersOf(G, p.team, x, y).filter(m => !has(m, 'Titchy')).length;
      if (has(p, 'Two Heads')) mod++;
      if (has(p, 'Titchy')) mod++;
    }
    if (reactiveFrom(marked, 'Prehensile Tail').length) mod--;
    const tackled = marked.some(m => has(m, 'Tackle') && !m.distracted);
    const r = yield* testEx(G, p, p.ag, mod, {
      label: jumping ? '跳躍' : '閃避', skill: jumping ? null : 'Dodge', noSkill: tackled,
      bonus: jumping ? null : breakTackleBonus(p)
    });
    if (!r.ok) return false;
    const dt = reactiveFrom(marked, 'Diving Tackle').find(m => m.status === 'standing');
    if (dt && r.r !== 6 && !okRoll(r.r, p.ag, r.mod - 2)) {
      log(G, `${pname(dt)} 飛撲擒抱！（-2）`, 'bad');
      dt.status = 'prone';
      return 'tackled';
    }
    return true;
  }

  function* shadowing(G, p, marked, fx0, fy0) {
    const sh = reactiveFrom(marked, 'Shadowing').find(m => m.status === 'standing' && (m.used.shadow || 0) < m.ma && !playerAt(G, fx0, fy0));
    if (!sh) return;
    sh.used.shadow = (sh.used.shadow || 0) + 1;
    const r = d(G, 6);
    if (r >= 4) { place(G, sh, fx0, fy0); log(G, `${pname(sh)} 如影隨形（${r}）跟了上去`, 'info'); }
    else log(G, `${pname(sh)} 如影隨形（${r}）沒跟上`, 'info');
  }

  function* jumpStep(G, p, A, x, y) {
    const fx0 = p.x, fy0 = p.y;
    for (let i = 0; i < 2; i++) {
      const needRush = A.used >= p.ma;
      A.used++;
      if (needRush) {
        A.rush--;
        if (!(yield* rushRoll(G, p))) { if (yield* knockDown(G, p, {})) return; }
      }
    }
    const markedFrom = markersOf(G, p.team, fx0, fy0);
    let worst = Math.max(markedFrom.length, markersOf(G, p.team, x, y).length);
    let mod = -worst;
    if (has(p, 'Pogo')) mod = 0;
    else if (has(p, 'Leap')) mod = mod === 0 ? 0 : Math.min(-1, mod + 1);
    if (has(p, 'Very Long Legs')) mod++;
    if (!has(p, 'Pogo') && reactiveFrom(markedFrom, 'Prehensile Tail').length) mod--;
    const r = yield* testEx(G, p, p.ag, mod, { label: '跳躍' });
    if (!r.ok) {
      if (r.r !== 1) place(G, p, x, y);
      const ab = reactiveFrom(markedFrom, 'Arm Bar').length > 0;
      if (yield* knockDown(G, p, { mb: ab })) return;
    }
    place(G, p, x, y);
    if (looseAt(G, x, y)) { if (A.action === 'secure') return; if (!(yield* pickUp(G, p))) return; }
    checkTD(G);
  }

  function* pickUp(G, p) {
    if (has(p, 'No Ball')) {
      log(G, `${pname(p)} 無法持球，撿球失敗`, 'bad');
      yield* bounce(G, p.x, p.y);
      if (p.team === G.active) G.turnover = true;
      return false;
    }
    let mod = -markersOf(G, p.team, p.x, p.y).length;
    if (G.weather === 'rain') mod--;
    if (has(p, 'Big Hand')) mod = 0;
    if (has(p, 'Extra Arms')) mod++;
    if (yield* test(G, p, p.ag, mod, { label: '撿球', skill: 'Sure Hands' })) {
      G.ball.carrier = p.id;
      return true;
    }
    yield* bounce(G, p.x, p.y);
    if (p.team === G.active) G.turnover = true;
    return false;
  }

  function* secureBall(G, p, A) {
    A.finished = true;
    if (yield* test(G, p, 2, 0, { label: '保球' })) { G.ball.carrier = p.id; checkTD(G); return; }
    yield* bounce(G, p.x, p.y);
    G.turnover = true;
  }

  // ---------- 阻擋 ----------
  function canAssist(G, q, target, blockMode) {
    if (!hasTZ(q) || q.eyeGouged || !adjacent(q, target)) return false;
    const others = markersOf(G, q.team, q.x, q.y).filter(m => m !== target);
    if (!others.length) return true;
    // 防守專家：在對手回合中，被他盯防的球員不能用護衛／補踢
    const defensive = others.some(m => has(m, 'Defensive') && G.active === q.team);
    if (blockMode && has(q, 'Guard') && !defensive) return true;
    if (!blockMode && has(q, 'Put the Boot In') && !defensive) return true;
    return false;
  }
  function assists(G, side, target, blockMode) {
    let c = 0;
    for (const q of G.players) if (q.team === side.team && q !== side && q.loc === 'pitch' && canAssist(G, q, target, blockMode)) c++;
    return c;
  }

  function blockInfo(G, att, def, o) {
    o = o || {};
    let a = (o.baseST || att.st) + (o.blitz && has(att, 'Horns') ? 1 : 0);
    let dd = def.st;
    let aa = 0, da = 0;
    if (att.team !== def.team) {
      aa = assists(G, att, def, true); da = assists(G, def, att, true);
      if (o.cheer) aa++;
    }
    a += aa; dd += da;
    let n, chooser;
    if (a === dd) { n = 1; chooser = att.team; }
    else if (a > dd) { n = a > 2 * dd ? 3 : 2; chooser = att.team; }
    else { n = dd > 2 * a ? 3 : 2; chooser = def.team; }
    return { aST: a, dST: dd, aAssist: aa, dAssist: da, n, chooser };
  }
  BB.blockInfo = function (G, att, def, o) {
    o = o || {};
    if (o.cheer == null) o = Object.assign({}, o, { cheer: G.teams[att.team].cheerActive && G.active === att.team });
    if (o.fromX == null) return blockInfo(G, att, def, o);
    const sx = att.x, sy = att.y;
    att.x = o.fromX; att.y = o.fromY;
    const wasStatus = att.status;
    att.status = 'standing';
    try { return blockInfo(G, att, def, o); }
    finally { att.x = sx; att.y = sy; att.status = wasStatus; }
  };

  function faceOutcome(face, att, def, blitz) {
    const r = { attDown: false, defDown: false, push: false };
    const jug = blitz && has(att, 'Juggernaut');
    if (face === 'AD') r.attDown = true;
    else if (face === 'BD') {
      if (jug) r.push = true;
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
  function faceScore(face, att, def, blitz) {
    const r = faceOutcome(face, att, def, blitz);
    if (r.wrestle) return 0.5;
    return (r.defDown ? 3 : 0) + (r.push ? 1 : 0) - (r.attDown ? 4 : 0);
  }
  BB.faceScore = faceScore;

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

  // 阻擋骰可用的重擲：team（全部重擲）、pro／tmt（單顆）、brawler（雙方倒地）、hatred（攻方倒地）
  function blockRerollOptions(G, att, def, dice, o) {
    const opts = rerollOptions(G, att, { single: true });
    if (has(att, 'Brawler') && o.declared === 'block' && dice.indexOf('BD') >= 0) opts.push('brawler');
    const hk = att.params.Hatred;
    if (has(att, 'Hatred') && dice.indexOf('AD') >= 0 && (hk === 'All' || (hk && hasKw(def, hk)))) opts.push('hatred');
    return opts;
  }

  function* applyBlockReroll(G, att, def, dice, kind, o) {
    const worstIdx = () => {
      let wi = 0, ws = 99;
      dice.forEach((f, i) => { const s = faceScore(f, att, def, o.blitz); if (s < ws) { ws = s; wi = i; } });
      return wi;
    };
    if (kind === 'brawler' || kind === 'hatred') {
      const i = dice.indexOf(kind === 'brawler' ? 'BD' : 'AD');
      dice[i] = FACES[d(G, 6) - 1];
      log(G, `${kind === 'brawler' ? '鬥毆者' : '仇恨'}重擲一顆 → ${diceStr(dice)}`, 'dice');
      return dice;
    }
    if (!(yield* spendReroll(G, att, kind))) return dice;
    if (kind === 'team') { dice = rollBlockDice(G, dice.length); }
    else { const i = worstIdx(); dice[i] = FACES[d(G, 6) - 1]; }
    log(G, `重擲阻擋骰 → ${diceStr(dice)}`, 'dice');
    return dice;
  }

  function* doBlock(G, att, def, o) {
    log(G, `${pname(att)} 阻擋 ${pname(def)}`, 'act');
    if (has(def, 'Foul Appearance') && !o.bnc) {
      const r = d(G, 6);
      if (r === 1) { log(G, `被 ${pname(def)} 的醜陋外表嚇到（${r}），阻擋取消`, 'bad'); if (o.act) o.act.finished = true; return; }
    }
    let baseST = att.st;
    if (has(att, 'Dauntless') && def.st > att.st) {
      const r = d(G, 6);
      if (r + att.st > def.st) { baseST = def.st; log(G, `無畏：擲出 ${r}，力量視為 ${def.st}`, 'good'); }
      else log(G, `無畏：擲出 ${r}，失敗`, 'bad');
    }
    const T = G.teams[att.team];
    const cheer = T.cheerActive && G.active === att.team && att.team !== def.team;
    if (cheer) { T.cheerActive = false; log(G, '觀眾歡呼：這次阻擋多 1 個協助', 'good'); }
    const info = blockInfo(G, att, def, { blitz: o.blitz, baseST, cheer });
    let dice = rollBlockDice(G, info.n);
    const who = info.chooser === att.team ? '攻方' : '守方';
    log(G, `力量 ${info.aST} 對 ${info.dST}：${info.n} 顆阻擋骰（${who}選擇）→ ${diceStr(dice)}`, 'dice');
    const validPick = v => v && Number.isInteger(v.pick) && v.pick >= 0 && v.pick < dice.length;
    const base = { type: 'blockDice', att: att.id, def: def.id, info, blitz: !!o.blitz };
    let rerolled = false;
    const sameTeam = att.team === def.team;
    let face;
    if (info.chooser === att.team || sameTeam) {
      for (;;) {
        const opts = rerolled ? [] : blockRerollOptions(G, att, def, dice, o);
        const a = yield* ask(G, Object.assign({}, base, { team: att.team, dice: dice.slice(), options: opts }),
          v => v && ((v.reroll && opts.indexOf(v.reroll) >= 0) || validPick(v)));
        if (a.reroll) { dice = yield* applyBlockReroll(G, att, def, dice, a.reroll, o); rerolled = true; continue; }
        face = dice[a.pick];
        break;
      }
    } else {
      const opts = blockRerollOptions(G, att, def, dice, o);
      if (opts.length) {
        const a = yield* ask(G, { type: 'reroll', team: att.team, pid: att.id, label: `阻擋骰：${diceStr(dice)}（由對手選擇）`, options: opts, dice },
          v => v && (v.use === null || opts.indexOf(v.use) >= 0));
        if (a.use) dice = yield* applyBlockReroll(G, att, def, dice, a.use, o);
      }
      const a = yield* ask(G, Object.assign({}, base, { team: def.team, dice: dice.slice(), options: [] }), validPick);
      face = dice[a.pick];
    }
    log(G, `選擇：${FACE_ZH[face]}`, 'dice');
    fx(G, def.x, def.y, FACE_ZH[face], face === 'POW' || face === 'DS' ? true : face === 'AD' ? false : null);
    yield* resolveBlock(G, att, def, face, o);
  }

  function* resolveBlock(G, att, def, face, o) {
    const r = faceOutcome(face, att, def, o.blitz);
    const jug = o.blitz && has(att, 'Juggernaut');
    if (r.wrestle && jug && !(!has(att, 'Block') && has(att, 'Wrestle'))) { // 攻城槌：對手不能用摔角
      r.wrestle = false; r.push = true;
    }
    if (r.wrestle) {
      log(G, '摔角！雙方都倒在地上', 'info');
      for (const p of [att, def]) {
        if (p.loc !== 'pitch') continue;
        yield* placeProne(G, p, '倒地（摔角）');
      }
      if (o.act) o.act.finished = true;
      return;
    }
    let followed = false, pushed = false;
    const sx = def.x, sy = def.y;
    if (r.push) {
      const sf = (has(def, 'Stand Firm') && !jug) || def.rooted;
      if (sf) log(G, `${pname(def)} ${def.rooted ? '生了根' : '站穩'}，沒有被推開`, 'info');
      else {
        pushed = true;
        yield* pushPlayer(G, { x: att.x, y: att.y }, def, { chooser: att.team, grab: has(att, 'Grab') && o.declared === 'block' && o.first !== false, att });
        if (has(att, 'Eye Gouge') && def.loc === 'pitch') def.eyeGouged = true;
        if (att.loc === 'pitch' && att.status === 'standing' && !att.rooted && !playerAt(G, sx, sy)) {
          const fendBlocks = has(def, 'Fend') && !o.bnc && !jug;
          let f;
          if (o.bnc) f = true;
          else if (has(def, 'Taunt') && def.team !== att.team) { f = true; log(G, `${pname(def)} 挑釁，攻擊者被迫跟進`, 'info'); }
          else if (fendBlocks) { f = false; log(G, `${pname(def)} 擋開，不能跟進`, 'info'); }
          else if (has(att, 'Frenzy')) f = true;
          else {
            const a = yield* ask(G, { type: 'followUp', team: att.team, pid: att.id, x: sx, y: sy }, isBool);
            f = a.yes;
          }
          if (f) { place(G, att, sx, sy); followed = true; }
        }
      }
    }
    if (pushed && def.loc === 'pitch' && G.ball.carrier === def.id && has(att, 'Strip Ball') && !has(def, 'Sure Hands') && !has(def, 'Monstrous Mouth')) {
      log(G, `${pname(att)} 抄球！`, 'good');
      G.ball.carrier = null;
      yield* bounce(G, def.x, def.y);
    }
    if (r.defDown && def.loc === 'pitch') {
      let sab = false;
      if (has(def, 'Saboteur') && def.team !== att.team) {
        const s = d(G, 6);
        log(G, `破壞者（${s}）：${s >= 4 ? '武器爆炸！' : '沒有爆炸'}`, s >= 4 ? 'bad' : 'info');
        if (s >= 4) {
          sab = true;
          const hadBall = G.ball.carrier === def.id;
          const dx = def.x, dy = def.y;
          toBox(G, def, 'ko');
          if (hadBall) yield* dropBall(G, def, dx, dy);
          if (att.loc === 'pitch' && att.status === 'standing') yield* knockDown(G, att, { noTurnover: G.ball.carrier !== att.id });
        }
      }
      if (!sab) yield* knockDown(G, def, { mb: has(att, 'Mighty Blow'), claws: has(att, 'Claws'), attacker: att });
    }
    if (r.attDown && att.loc === 'pitch') yield* knockDown(G, att, { mb: has(def, 'Mighty Blow') && def.team !== att.team, claws: has(def, 'Claws') });
    if (G.pendingBounce) {
      const [bx, by] = G.pendingBounce;
      G.pendingBounce = null;
      if (looseAt(G, bx, by) && playerAt(G, bx, by)) yield* bounce(G, bx, by);
    }
    checkTD(G);
    void followed;
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
          if (!(yield* rushRoll(G, att))) { if (yield* knockDown(G, att, {})) return; }
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
    if (has(victim, 'Sidestep') && !victim.distracted && around.length && !(o.att && has(o.att, 'Grab'))) { cands = around; chooser = victim.team; }
    else if (o.grab && around.length) cands = around;
    if (!cands) {
      cands = sq.filter(empty);
      if (!cands.length) {
        const off = sq.filter(s => !onPitch(s[0], s[1]));
        if (off.length) cands = off;
        else {
          const movable = sq.filter(s => { const q = playerAt(G, s[0], s[1]); return q && !q.rooted; });
          cands = movable.length ? movable : sq;
        }
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
      const bnc = has(victim, 'Ball & Chain');
      toBox(G, victim, 'reserve');
      if (victim.team === G.active) G.turnover = true;
      if (hadBall) G.ball = { x: lx, y: ly, carrier: null, inAir: false };
      yield* injuryRoll(G, victim, { crowd: true, bnc });
      if (hadBall) yield* throwIn(G, lx, ly);
      return;
    }
    const occ = playerAt(G, tx, ty);
    if (occ) {
      if (occ.rooted) { log(G, `${pname(occ)} 生了根，推不動`, 'info'); return; }
      yield* pushPlayer(G, { x: victim.x, y: victim.y }, occ, { chooser: o.chooser });
    }
    place(G, victim, tx, ty);
    if (looseAt(G, tx, ty)) G.pendingBounce = [tx, ty];
  }

  // ---------- 特殊行動：刺擊、電鋸、噴吐、噴火、催眠凝視 ----------
  function* armourOnly(G, t, mod, unmod) {
    const a = d(G, 6), b = d(G, 6);
    const ihs = has(t, 'Iron Hard Skin');
    const tot = a + b + (unmod || ihs ? 0 : mod);
    const broken = tot >= t.av;
    log(G, `護甲擲骰 ${a}+${b}${tot !== a + b ? ' → ' + tot : ''} 對 ${t.av}+：${broken ? '破甲！' : '擋住了'}`, broken ? 'good' : 'info');
    if (broken) yield* injuryRoll(G, t, {});
    return broken;
  }

  function* specialAttack(G, p, t, kind) {
    const name = { stab: '刺擊', chainsaw: '電鋸攻擊', vomit: '噴吐', fire: '噴火', gaze: '催眠凝視' }[kind];
    log(G, `${pname(p)} 對 ${pname(t)} ${name}`, 'act');
    if (has(t, 'Foul Appearance')) {
      const r = d(G, 6);
      if (r === 1) { log(G, `被 ${pname(t)} 的醜陋外表嚇到（${r}），行動取消`, 'bad'); return; }
    }
    const hadBall = G.ball.carrier === t.id;
    const tx = t.x, ty = t.y;
    if (kind === 'stab') {
      yield* armourOnly(G, t, 0, true);
    } else if (kind === 'chainsaw') {
      if (yield* test(G, p, 2, 0, { label: '電鋸' })) yield* armourOnly(G, t, 3, false);
      else { log(G, '電鋸反彈！', 'bad'); yield* knockDown(G, p, {}); }
    } else if (kind === 'vomit') {
      if (yield* test(G, p, 2, 0, { label: '噴吐' })) yield* armourOnly(G, t, 0, true);
      else { log(G, `${pname(p)} 吐了自己一身`, 'bad'); yield* armourOnly(G, p, 0, true); }
    } else if (kind === 'fire') {
      const r = d(G, 6), m = t.st >= 5 ? -1 : 0, v = r + m;
      log(G, `噴火：擲出 ${r}${m ? m : ''}`, 'dice');
      if (r === 6) yield* knockDown(G, t, {});
      else if (v <= 1) { log(G, '火焰回燒！', 'bad'); yield* knockDown(G, p, {}); }
      else if (v >= 4) yield* placeProne(G, t, '被火焰逼得撲倒在地');
      else log(G, '沒有效果', 'info');
    } else if (kind === 'gaze') {
      if (yield* test(G, p, 3, 0, { label: '催眠凝視' })) { t.distracted = true; log(G, `${pname(t)} 被催眠，分心了`, 'good'); }
    }
    if (hadBall && t.loc !== 'pitch') yield* dropBall(G, t, tx, ty);
    checkTD(G);
  }

  // ---------- 傳球 ----------
  // 近似官方距離尺：用格子中心的直線距離
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
  const RES_ZH = { accurate: '精準', inaccurate: '不準', fumble: '失手掉球' };

  function passMod(G, p, band) {
    let m = RANGE_MOD[band];
    if (!has(p, 'Nerves of Steel')) m -= markersOf(G, p.team, p.x, p.y).length;
    if (G.weather === 'sunny') m--;
    if (has(p, 'Accurate') && (band === 'quick' || band === 'short')) m++;
    if (has(p, 'Cannoneer') && (band === 'long' || band === 'bomb')) m++;
    m -= disturbing(G, p);
    return m;
  }
  BB.passMod = passMod;
  function passResult(r, pa, mod) {
    if (r === 1 || (pa != null && r !== 6 && r + mod <= 1) || (pa == null && r + mod <= 1)) return 'fumble';
    if (pa != null && (r === 6 || r + mod >= pa)) return 'accurate';
    return 'inaccurate';
  }
  BB.passResult = passResult;

  function interceptors(G, p, tx, ty) {
    const ax = p.x, ay = p.y, bx = tx - ax, by = ty - ay;
    const L2 = bx * bx + by * by;
    if (!L2) return [];
    const cloud = has(p, 'Cloud Burster');
    return G.players.filter(q => {
      if (q.team === p.team || !canCatch(q)) return false;
      if (cloud && !has(q, 'Very Long Legs')) return false;
      if (q.x === tx && q.y === ty) return false;
      const t = ((q.x - ax) * bx + (q.y - ay) * by) / L2;
      if (t <= 0 || t >= 1) return false;
      const px = ax + bx * t - q.x, py = ay + by * t - q.y;
      return Math.sqrt(px * px + py * py) <= 0.8;
    });
  }
  BB.interceptors = interceptors;

  function interceptMod(G, q, accurate) {
    let m = accurate ? -3 : -2;
    if (!has(q, 'Nerves of Steel')) m -= markersOf(G, q.team, q.x, q.y).length;
    if (G.weather === 'rain') m--;
    if (has(q, 'Stunty')) m--;
    if (has(q, 'Extra Arms')) m++;
    if (has(q, 'Very Long Legs')) m += 2;
    m -= disturbing(G, q);
    return m;
  }
  BB.interceptMod = interceptMod;

  // 敵意：傳給特定隊友前擲 D6
  function* animosity(G, p, target) {
    if (!has(p, 'Animosity') || !target) return true;
    const k = p.params.Animosity;
    if (k !== 'All' && !hasKw(target, k)) return true;
    const r = d(G, 6);
    log(G, `敵意：擲出 ${r}${r === 1 ? `，${pname(p)} 拒絕把球交給 ${pname(target)}` : ''}`, r === 1 ? 'bad' : 'info');
    return r !== 1;
  }

  function* passBall(G, p, tx, ty, A) {
    const band = passRange(tx - p.x, ty - p.y);
    const recv = playerAt(G, tx, ty);
    if (recv && recv.team === p.team && !(yield* animosity(G, p, recv))) return;
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
    if (res === 'fumble' && r === 1 && has(p, 'Safe Pass')) {
      log(G, `安全傳球：${pname(p)} 沒有出手，仍然持球`, 'info');
      fx(G, p.x, p.y, '安全傳球', null);
      return;
    }
    if (res === 'fumble') {
      fx(G, p.x, p.y, '掉球', false);
      G.ball.carrier = null; G.ball.x = p.x; G.ball.y = p.y;
      yield* bounce(G, p.x, p.y);
      G.turnover = true;
      return;
    }
    // 決定落點
    let lx = tx, ly = ty, out = false;
    if (res === 'inaccurate') {
      for (let i = 0; i < 3; i++) {
        const dir = d(G, 8);
        const nx = lx + DIRS[dir - 1][0], ny = ly + DIRS[dir - 1][1];
        if (!onPitch(nx, ny)) { out = true; break; }
        lx = nx; ly = ny;
      }
      log(G, out ? '球偏出界' : `球偏到 (${lx},${ly})`, 'info');
    }
    // 攔截（看傳到實際落點的路線）
    const ic = interceptors(G, p, lx, ly);
    if (ic.length) {
      const a = yield* ask(G, { type: 'intercept', team: 1 - p.team, candidates: ic.map(q => q.id), from: [p.x, p.y], to: [lx, ly], accurate: res === 'accurate' },
        v => v && (v.pid === null || ic.some(q => q.id === v.pid)));
      if (a.pid !== null) {
        const q = G.players[a.pid];
        if (yield* test(G, q, q.ag, interceptMod(G, q, res === 'accurate'), { label: '攔截' })) {
          G.ball.carrier = q.id; G.ball.x = q.x; G.ball.y = q.y; G.ball.inAir = false;
          log(G, `${pname(q)} 攔截成功！`, 'bad');
          G.turnover = true;
          checkTD(G);
          return;
        }
      }
    }
    G.ball.carrier = null; G.ball.inAir = false;
    if (out) {
      G.ball.x = lx; G.ball.y = ly;
      yield* throwIn(G, lx, ly);
    } else {
      G.ball.x = lx; G.ball.y = ly;
      const q = playerAt(G, lx, ly);
      if (q && canCatch(q)) {
        if (!(yield* catchBall(G, q, 0))) yield* bounce(G, lx, ly);
      } else yield* bounce(G, lx, ly);
    }
    const mine = possession(G) === p.team;
    if (!mine && G.touchdown === null) G.turnover = true;
    else if (mine && band === 'quick' && has(p, 'Give and Go') && G.touchdown === null && p.loc === 'pitch') { A.finished = false; A.noBall = true; }
  }

  function* handOff(G, p, q, A) {
    if (!(yield* animosity(G, p, q))) return;
    log(G, `${pname(p)} 把球手遞給 ${pname(q)}`, 'act');
    G.ball.carrier = null; G.ball.x = q.x; G.ball.y = q.y;
    if (!(yield* catchBall(G, q, 0))) yield* bounce(G, q.x, q.y);
    const mine = possession(G) === p.team;
    if (!mine && G.touchdown === null) G.turnover = true;
    else if (mine && has(p, 'Give and Go') && G.touchdown === null) { A.finished = false; }
  }

  function* foul(G, p, t, A) {
    A.fouled = true;
    log(G, `${pname(p)} 對 ${pname(t)} 犯規！`, 'act');
    const off = assists(G, p, t, false), def = assists(G, t, p, false);
    const ihs = has(t, 'Iron Hard Skin');
    const roll = () => { const a = d(G, 6), b = d(G, 6); return { a, b }; };
    let { a, b } = roll();
    let dp = has(p, 'Dirty Player');
    const total = () => a + b + (ihs ? 0 : off - def);
    let tot = total();
    let broken = tot >= t.av;
    if (!broken && dp && !ihs && tot + 1 >= t.av) { broken = true; dp = false; tot++; }
    log(G, `犯規護甲 ${a}+${b}（協助 +${off} / -${def}）→ ${tot} 對 ${t.av}+：${broken ? '破甲！' : '擋住了'}`, broken ? 'good' : 'info');
    if (!broken && has(p, 'Lone Fouler') && off === 0 && def === 0) {
      log(G, '獨行犯規者：重擲護甲', 'rr');
      ({ a, b } = roll());
      tot = total(); broken = tot >= t.av;
      if (!broken && dp && !ihs && tot + 1 >= t.av) { broken = true; dp = false; tot++; }
      log(G, `犯規護甲 ${a}+${b} → ${tot}：${broken ? '破甲！' : '擋住了'}`, broken ? 'good' : 'info');
    }
    let sentOff = a === b && !(has(p, 'Sneaky Git') && !broken);
    if (broken) {
      const ir = yield* injuryRoll(G, t, { mod: dp ? 1 : 0 });
      if (ir.doubles) sentOff = true;
    }
    if (sentOff) {
      log(G, '裁判看到了！', 'bad');
      fx(G, p.x, p.y, '被罰下場', false);
      const res = yield* sendOff(G, p, { foul: true });
      if (res.off || !res.bribed) G.turnover = true;
      return;
    }
    if (has(p, 'Quick Foul')) A.finished = false;
  }

  function* throwTeamMate(G, p, q, tx, ty) {
    const band = passRange(tx - p.x, ty - p.y);
    if (has(p, 'Always Hungry')) {
      const r = d(G, 6);
      if (r === 1) {
        const r2 = d(G, 6);
        if (r2 === 1) {
          log(G, `永遠很餓：${pname(p)} 把 ${pname(q)} 吃掉了！`, 'bad');
          const hadBall = G.ball.carrier === q.id;
          const qx = q.x, qy = q.y;
          toBox(G, q, 'cas'); q.cas = 'dead';
          if (hadBall) { G.ball = { x: qx, y: qy, carrier: null, inAir: false }; yield* bounce(G, qx, qy); }
          G.turnover = true;
          return;
        }
        log(G, `永遠很餓：${pname(q)} 從嘴裡掙脫，投擲失手`, 'bad');
        return yield* ttmFly(G, p, q, 'fumble', tx, ty);
      }
    }
    let mod = (band === 'quick' ? 0 : -1);
    if (!has(p, 'Nerves of Steel')) mod -= markersOf(G, p.team, p.x, p.y).length;
    if (has(p, 'Strong Arm')) mod++;
    mod -= disturbing(G, p);
    const pa = p.pa == null ? 6 : p.pa;
    let r = d(G, 6);
    let res = passResult(r, pa, mod);
    const RZ = { accurate: '完美投擲', inaccurate: '普通投擲', fumble: '失手' };
    log(G, `${pname(p)} 把 ${pname(q)} 丟出去！（需要 ${needStr(pa, mod)}）擲出 ${r}，${RZ[res]}`, res === 'accurate' ? 'good' : 'bad');
    if (res !== 'accurate') {
      if (yield* useReroll(G, p, {}, `投擲隊友${RZ[res]}（擲出 ${r}）`)) {
        r = d(G, 6);
        res = passResult(r, pa, mod);
        log(G, `重擲：擲出 ${r}，${RZ[res]}`, res === 'accurate' ? 'good' : 'bad');
      }
    }
    yield* ttmFly(G, p, q, res, tx, ty);
  }

  function* ttmFly(G, p, q, res, tx, ty) {
    const hadBall = G.ball.carrier === q.id;
    const wasDown = q.status !== 'standing' || q.distracted;
    let lx, ly;
    if (res === 'fumble') {
      const dir = d(G, 8);
      lx = p.x + DIRS[dir - 1][0]; ly = p.y + DIRS[dir - 1][1];
    } else {
      lx = tx; ly = ty;
      const n = res === 'accurate' && has(p, 'Bullseye') ? 0 : 3;
      for (let i = 0; i < n; i++) { const dir = d(G, 8); lx += DIRS[dir - 1][0]; ly += DIRS[dir - 1][1]; if (!onPitch(lx, ly)) break; }
    }
    const ox = q.x, oy = q.y;
    q.loc = 'air';
    let crashed = false;
    for (let k = 0; k < 10; k++) {
      if (!onPitch(lx, ly)) {
        log(G, `${pname(q)} 飛進了觀眾席！`, 'bad');
        toBox(G, q, 'reserve');
        yield* injuryRoll(G, q, { crowd: true });
        if (hadBall) { G.ball = { x: ox, y: oy, carrier: null, inAir: false }; yield* throwIn(G, ox, oy); }
        G.turnover = true;
        return;
      }
      const occ = playerAt(G, lx, ly);
      if (!occ) break;
      crashed = true;
      log(G, `${pname(q)} 砸在 ${pname(occ)} 身上！`, 'info');
      yield* knockDown(G, occ, { noTurnover: true, mb: has(q, 'Lethal Flight') && occ.team !== q.team });
      const dir = d(G, 8); lx += DIRS[dir - 1][0]; ly += DIRS[dir - 1][1];
    }
    q.loc = 'pitch'; q.status = 'standing';
    place(G, q, lx, ly);
    let landed = false;
    if (!crashed && !wasDown) {
      let m = -markersOf(G, q.team, lx, ly).length;
      if (res !== 'accurate') m--;
      landed = yield* test(G, q, q.ag, m, { label: '落地' });
    } else if (wasDown) log(G, `${pname(q)} 被丟出去時不在狀態，落地失敗`, 'bad');
    if (!landed) {
      yield* knockDown(G, q, { noTurnover: true });
      if (hadBall) G.turnover = true;
      return;
    }
    if (looseAt(G, lx, ly)) yield* bounce(G, lx, ly);
    checkTD(G);
  }

  // ---------- 鏈球（Fungus / 狂熱者） ----------
  function* bncMove(G, p, A) {
    const maxSteps = p.ma + 2;
    for (let i = 0; i < maxSteps; i++) {
      if (G.turnover || G.touchdown !== null || p.loc !== 'pitch' || p.status !== 'standing') return;
      const rushing = i >= p.ma;
      const a = yield* ask(G, { type: 'bncDir', team: p.team, pid: p.id, step: i + 1, of: p.ma, rushing, canStop: i > 0 },
        v => v && ((v.stop === true && i > 0) || [1, 3, 5, 7].indexOf(v.dir) >= 0));
      if (a.stop) return;
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
      let rushFail = false;
      if (rushing) rushFail = !(yield* rushRoll(G, p));
      const nx = p.x + DIRS[dir][0], ny = p.y + DIRS[dir][1];
      if (!onPitch(nx, ny)) {
        log(G, `${pname(p)} 衝進了觀眾席！`, 'bad');
        toBox(G, p, 'reserve');
        yield* injuryRoll(G, p, { crowd: true, bnc: true });
        G.turnover = true;
        return;
      }
      const occ = playerAt(G, nx, ny);
      if (occ) {
        if (occ.status === 'standing') {
          yield* doBlock(G, p, occ, { bnc: true, first: true, declared: 'bnc' });
          if (p.x !== nx || p.y !== ny) return;
        } else {
          log(G, `${pname(p)} 撞上倒地的 ${pname(occ)}`, 'info');
          yield* pushPlayer(G, { x: p.x, y: p.y }, occ, { chooser: p.team });
          if (occ.loc === 'pitch') yield* armourInjury(G, occ, {});
          if (playerAt(G, nx, ny)) return;
          place(G, p, nx, ny);
        }
      } else {
        place(G, p, nx, ny);
        if (looseAt(G, nx, ny)) yield* bounce(G, nx, ny);
      }
      if (rushFail && p.loc === 'pitch' && p.status === 'standing') { yield* knockDown(G, p, {}); return; }
    }
  }

  // ---------- 路徑搜尋（UI 與 AI 共用） ----------
  // 回傳 Map(index -> {x,y,prob,steps,path})，prob 為不含隊伍重擲的成功率（不含撿球）
  BB.reach = function (G, p, o) {
    o = o || {};
    let maLeft, rush;
    if (o.maLeft != null) { maLeft = o.maLeft; rush = o.rush; }
    else if (G.act && G.act.pid === p.id) { maLeft = Math.max(0, p.ma - G.act.used); rush = G.act.rush; }
    else {
      let standCost = 0;
      if (p.status === 'prone' && !has(p, 'Jump Up')) standCost = p.ma <= 2 ? p.ma : 3;
      maLeft = Math.max(0, p.ma - standCost); rush = has(p, 'Sprint') ? 3 : 2;
    }
    if (p.rooted) return new Map();
    if (o.reserve) {
      const take = Math.min(o.reserve, maLeft + rush);
      for (let i = 0; i < take; i++) { if (rush > 0 && maLeft === 0) rush--; else if (maLeft > 0) maLeft--; }
    }
    const total = maLeft + rush;
    const N = W * H;
    const occ = new Int16Array(N).fill(-1);
    for (const q of G.players) if (q.loc === 'pitch' && q !== p) occ[q.y * W + q.x] = q.id;
    const mk = new Int8Array(N), mkDest = new Int8Array(N), tk = new Uint8Array(N), pt = new Int8Array(N);
    for (const q of G.players) {
      if (q.team === p.team || !hasTZ(q)) continue;
      for (const [a, b] of DIRS) {
        const x = q.x + a, y = q.y + b;
        if (!onPitch(x, y)) continue;
        const i = y * W + x;
        mk[i]++;
        if (!has(q, 'Titchy')) mkDest[i]++;
        if (has(q, 'Tackle')) tk[i] = 1;
        if (has(q, 'Prehensile Tail')) pt[i] = 1;
      }
    }
    let rmod = (G.weather === 'blizzard' ? -1 : 0) + (has(p, 'Drunkard') ? -1 : 0);
    let pr1 = BB.prob(2, rmod);
    if (has(p, 'Sure Feet')) pr1 = 1 - (1 - pr1) * (1 - pr1);
    const start = (o.fromY != null ? o.fromY : p.y) * W + (o.fromX != null ? o.fromX : p.x);
    const ballIdx = G.ball.carrier == null && !G.ball.inAir && onPitch(G.ball.x, G.ball.y) ? G.ball.y * W + G.ball.x : -1;
    const isBnc = has(p, 'Ball & Chain');
    const dodgeBase = (from, to) => {
      const mod = (has(p, 'Stunty') ? 0 : -mkDest[to]) + (has(p, 'Two Heads') ? 1 : 0) + (has(p, 'Titchy') ? 1 : 0) - pt[from];
      return BB.prob(p.ag, mod);
    };
    // 狀態 = 格子 + 「本回合的 Dodge 重擲是否已用掉」（u=1 用掉）。
    // 一旦閃避時還能用 Dodge，就保守地假設重擲被用掉了。
    const hasDodge = has(p, 'Dodge');
    const u0 = hasDodge && !p.used.Dodge ? 0 : 1;
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
