/* 介面：選單、球隊編輯、比賽畫面與滑鼠操作。 */
(function () {
  'use strict';
  const BB = globalThis.BB;
  const W = BB.W, H = BB.H;
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const S = {
    cfgs: [BB.defaultTeamConfig('human'), BB.defaultTeamConfig('orc')],
    ctrl: ['human', 'ai'],
    speed: 'normal',
    game: null, renderer: null, timer: null, lastPrompt: null, logSeen: 0, aiErr: 0,
    hover: null, sel: null, mode: 'move', ttmPid: null, setupSel: null, queued: null, showTZ: false,
    fx: [], reachKey: null, reachVal: null
  };
  const SPEED = { fast: 40, normal: 320, slow: 800 };

  // ================= 選單 =================
  function buildMenu() {
    const box = $('#teamEditors');
    box.innerHTML = '';
    [0, 1].forEach(i => box.appendChild(editor(i)));
  }

  function editor(i) {
    const tc = S.cfgs[i];
    const def = BB.TEAMS[tc.race];
    const d = document.createElement('div');
    d.className = 'editor';
    const raceOpts = Object.keys(BB.TEAMS).map(k => `<option value="${k}" ${k === tc.race ? 'selected' : ''}>${BB.TEAMS[k].name}</option>`).join('');
    const stat = (v, plus) => v == null ? '-' : v + (plus ? '+' : '');
    const rows = def.positions.map(p => `
      <tr>
        <td class="l">${esc(p.name)}</td>
        <td>${p.ma}</td><td>${p.st}</td><td>${stat(p.ag, 1)}</td><td>${stat(p.pa, 1)}</td><td>${stat(p.av, 1)}</td>
        <td class="skills">${p.skills.map(s => BB.SKILL_ZH[s] || s).join('、') || '—'}</td>
        <td>${p.cost}k</td>
        <td class="qty"><button data-a="dec" data-k="${p.key}">−</button><span>${tc.counts[p.key] || 0}</span><button data-a="inc" data-k="${p.key}">+</button><small>/${p.max}</small></td>
      </tr>`).join('');
    const stars = Object.values(BB.STARS).filter(s => s.teams.indexOf(tc.race) >= 0).map(s => `
      <label class="star"><input type="checkbox" data-a="star" data-k="${s.key}" ${tc.stars.indexOf(s.key) >= 0 ? 'checked' : ''}>
        ★ <b>${esc(s.name)}</b>（${s.cost}k）MA${s.ma} ST${s.st} AG${s.ag}+ PA${stat(s.pa, 1)} AV${s.av}+<br>
        <small>${s.skills.map(k => BB.SKILL_ZH[k] || k).join('、')}｜${esc(s.note)}</small></label>`).join('');
    const cost = BB.teamCost(tc), n = BB.teamPlayerCount(tc);
    const bad = cost > BB.BUDGET || n < 11 || n > 16;
    d.innerHTML = `
      <h2><span class="swatch" style="background:${def.colors[i === 1 && S.cfgs[0].race === tc.race ? 1 : 0]}"></span>
        ${i === 0 ? '主隊' : '客隊'}
        <select data-a="race">${raceOpts}</select>
        <select data-a="ctrl"><option value="human" ${S.ctrl[i] === 'human' ? 'selected' : ''}>玩家操作</option><option value="ai" ${S.ctrl[i] === 'ai' ? 'selected' : ''}>電腦 AI</option></select>
        <button data-a="default">預設陣容</button>
      </h2>
      <table>
        <tr><th class="l">位置</th><th>MA</th><th>ST</th><th>AG</th><th>PA</th><th>AV</th><th class="l">技能</th><th>費用</th><th>人數</th></tr>
        ${rows}
      </table>
      <div class="extras">
        <span class="qty">隊伍重擲（${def.rerollCost}k）<button data-a="rrdec">−</button><span>${tc.rerolls}</span><button data-a="rrinc">+</button></span>
        <label><input type="checkbox" data-a="apo" ${tc.apothecary ? 'checked' : ''} ${def.apothecary ? '' : 'disabled'}> 隊醫（${BB.APOTHECARY_COST}k）</label>
      </div>
      ${stars ? `<div class="stars"><b>可雇用的明星球員</b>${stars}</div>` : ''}
      <div class="total ${bad ? 'over' : ''}">球員 ${n} 人（需 11–16 人）｜花費 ${cost}k / ${BB.BUDGET}k</div>`;
    d.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      const a = b.dataset.a, k = b.dataset.k;
      const pos = k && def.positions.find(p => p.key === k);
      if (a === 'inc' && (tc.counts[k] || 0) < pos.max) tc.counts[k] = (tc.counts[k] || 0) + 1;
      if (a === 'dec' && (tc.counts[k] || 0) > 0) tc.counts[k]--;
      if (a === 'rrinc' && tc.rerolls < 8) tc.rerolls++;
      if (a === 'rrdec' && tc.rerolls > 0) tc.rerolls--;
      if (a === 'default') S.cfgs[i] = BB.defaultTeamConfig(tc.race);
      buildMenu();
    });
    d.addEventListener('change', e => {
      const a = e.target.dataset.a;
      if (a === 'race') S.cfgs[i] = BB.defaultTeamConfig(e.target.value);
      if (a === 'ctrl') S.ctrl[i] = e.target.value;
      if (a === 'apo') tc.apothecary = e.target.checked;
      if (a === 'star') {
        const k = e.target.dataset.k;
        if (e.target.checked) { if (tc.stars.indexOf(k) < 0) tc.stars.push(k); }
        else tc.stars = tc.stars.filter(s => s !== k);
      }
      buildMenu();
    });
    return d;
  }

  function hashSeed(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  function startGame() {
    for (const i of [0, 1]) {
      const tc = S.cfgs[i];
      const n = BB.teamPlayerCount(tc), c = BB.teamCost(tc);
      if (n < 11 || n > 16) { $('#menuError').textContent = `${i ? '客隊' : '主隊'}球員人數必須是 11–16 人`; return; }
      if (c > BB.BUDGET) { $('#menuError').textContent = `${i ? '客隊' : '主隊'}超出預算`; return; }
    }
    $('#menuError').textContent = '';
    const seedTxt = $('#seedInput').value.trim();
    const seed = seedTxt ? (/^\d+$/.test(seedTxt) ? Number(seedTxt) >>> 0 : hashSeed(seedTxt)) : (Math.random() * 4294967296) >>> 0;
    const cfg = { seed, teams: S.cfgs.map(tc => ({ race: tc.race, counts: tc.counts, rerolls: tc.rerolls, apothecary: tc.apothecary, stars: tc.stars })) };
    S.speed = $('#speedSel').value;
    $('#speedSel2').value = S.speed;
    S.game = new BB.Game(cfg);
    window.bbGame = S.game; // 方便除錯
    BB.AI.reset();
    Object.assign(S, { lastPrompt: null, logSeen: 0, sel: null, hover: null, queued: null, setupSel: null, fx: [], aiErr: 0 });
    $('#log').innerHTML = '';
    $('#menu').classList.add('hidden');
    $('#game').classList.remove('hidden');
    resize();
    update();
  }

  // ================= 比賽主迴圈 =================
  const G = () => S.game.G;
  const P = () => S.game.prompt;
  const isHuman = pr => pr && pr.team != null && S.ctrl[pr.team] === 'human';
  const isAI = pr => pr && pr.team != null && S.ctrl[pr.team] === 'ai';

  function act(ans) {
    if (!S.game) return;
    S.game.act(ans);
    update();
  }

  function update() {
    const g = G(), pr = P();
    // 紀錄
    const logEl = $('#log');
    if (g.log.length < S.logSeen) { logEl.innerHTML = ''; S.logSeen = 0; }
    if (g.log.length > S.logSeen) {
      const frag = document.createDocumentFragment();
      for (let i = S.logSeen; i < g.log.length; i++) {
        const div = document.createElement('div');
        div.className = g.log[i].cls;
        div.textContent = g.log[i].text;
        frag.appendChild(div);
      }
      logEl.appendChild(frag);
      S.logSeen = g.log.length;
      while (logEl.childNodes.length > 400) logEl.removeChild(logEl.firstChild);
      $('#logBox').scrollTop = $('#logBox').scrollHeight;
    }
    // 浮動文字
    if (g.fx.length) {
      const now = performance.now();
      const count = {};
      for (const f of g.fx) {
        const k = f.x + ',' + f.y;
        count[k] = (count[k] || 0);
        S.fx.push(Object.assign({}, f, { t0: now + count[k] * 250, row: 0 }));
        count[k]++;
      }
      g.fx.length = 0;
      animate();
    }
    if (pr !== S.lastPrompt) { S.lastPrompt = pr; onNewPrompt(pr); }
    renderScoreboard();
    renderSide();
    draw();
    scheduleAI();
  }

  function onNewPrompt(pr) {
    S.mode = 'move'; S.ttmPid = null; S.aiErr = 0;
    if (pr.type === 'activation') {
      S.sel = pr.pid;
      if (S.queued && S.queued.pid === pr.pid && isHuman(pr)) {
        const q = S.queued.ans;
        S.queued = null;
        setTimeout(() => act(q), 0);
        return;
      }
    } else if (pr.type === 'turn') {
      const p = S.sel != null ? G().players[S.sel] : null;
      if (!p || p.activated || p.team !== pr.team) S.sel = null;
    } else if (pr.type !== 'setup') S.sel = null;
    S.queued = null;
    if (pr.type !== 'setup') S.setupSel = null;
  }

  function scheduleAI() {
    clearTimeout(S.timer);
    const pr = P();
    if (!isAI(pr)) return;
    if (pr.error) S.aiErr++;
    let delay = SPEED[S.speed];
    if (pr.type !== 'turn' && pr.type !== 'activation' && pr.type !== 'bncDir') delay = Math.round(delay * 0.5);
    S.timer = setTimeout(() => {
      const cur = P();
      if (cur !== pr || !isAI(cur)) return;
      const a = S.aiErr > 3 ? fallbackAnswer(cur) : BB.AI.decide(S.game, cur);
      act(a);
    }, delay);
  }

  function fallbackAnswer(pr) {
    switch (pr.type) {
      case 'turn': return { type: 'endTurn' };
      case 'activation': return { type: 'end' };
      case 'setup': return { type: S.aiErr % 2 ? 'auto' : 'done' };
      default: return BB.AI.decide(S.game, pr);
    }
  }

  let animating = false;
  function animate() {
    if (animating) return;
    animating = true;
    const loop = () => {
      const now = performance.now();
      S.fx = S.fx.filter(f => now - f.t0 < 1600);
      draw();
      if (S.fx.length) requestAnimationFrame(loop);
      else animating = false;
    };
    requestAnimationFrame(loop);
  }

  // ================= 記分板 =================
  function renderScoreboard() {
    const g = G();
    const T = g.teams;
    const pips = t => '●'.repeat(Math.max(0, t.rerollsLeft)) + '○'.repeat(Math.max(0, t.rerolls - t.rerollsLeft));
    const side = (i) => {
      const t = T[i];
      const extras = [`重擲 <span class="rr">${pips(t) || '—'}</span>`];
      if (t.apo) extras.push(t.apoUsed ? '隊醫（已用）' : '隊醫 ✚');
      if (t.bribes) extras.push(`賄賂 ×${t.bribes}`);
      extras.push(S.ctrl[i] === 'ai' ? '電腦' : '玩家');
      const name = `<span class="sb-name ${g.active === i ? 'active' : ''}" style="background:${t.color};color:${lum(t.color) > 150 ? '#111' : '#fff'}">${esc(t.name)}</span>`;
      const info = `<div class="sb-info">${extras.join('｜')}</div>`;
      return i === 0
        ? `<div class="sb-team">${name}<div>${info}<div class="sb-info">回合 ${g.turnNo[0]}/8</div></div><span class="sb-score">${g.score[0]}</span></div>`
        : `<div class="sb-team right"><span class="sb-score">${g.score[1]}</span><div style="text-align:right">${info}<div class="sb-info">回合 ${g.turnNo[1]}/8</div></div>${name}</div>`;
    };
    const half = g.over ? '終場' : g.half ? `第 ${g.half} 半場` : '賽前';
    $('#scoreboard').innerHTML = `${side(0)}<div class="sb-mid"><b>${half}</b><br>天氣：${BB.WEATHER_ZH[g.weather]}</div>${side(1)}`;
  }
  function lum(hex) {
    const n = parseInt(hex.slice(1), 16);
    return (((n >> 16) & 255) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000;
  }

  // ================= 側邊欄 =================
  const pn = p => `#${p.num} ${p.name}`;
  const teamSpan = i => `<span style="color:${G().teams[i].color};filter:brightness(1.4)">${esc(G().teams[i].name)}</span>`;

  function btn(label, onClick, cls, disabled) {
    const b = document.createElement('button');
    b.innerHTML = label;
    if (cls) b.className = cls;
    if (disabled) b.disabled = true;
    b.addEventListener('click', onClick);
    return b;
  }
  function row(...kids) { const d = document.createElement('div'); d.className = 'row'; kids.forEach(k => k && d.appendChild(k)); return d; }
  function hint(text, cls) { const d = document.createElement('div'); d.className = cls || 'hint'; d.innerHTML = text; return d; }

  function renderSide() {
    const g = G(), pr = P();
    const box = $('#promptBox');
    box.innerHTML = '';
    const banner = $('#banner');
    if (pr.type === 'gameOver') {
      banner.innerHTML = g.winner == null ? `比賽結束：平手 ${g.score[0]} : ${g.score[1]}` : `比賽結束：${teamSpan(g.winner)} 獲勝！ ${g.score[0]} : ${g.score[1]}`;
      box.appendChild(row(btn('回到選單', toMenu, 'primary'), btn('再比一場（相同陣容）', () => startGame())));
      renderCard();
      return;
    }
    if (!isHuman(pr)) {
      banner.innerHTML = `${teamSpan(pr.team)}（電腦）思考中…`;
      renderCard();
      return;
    }
    banner.innerHTML = `${teamSpan(pr.team)} 教練：${promptTitle(pr)}`;
    if (pr.error) box.appendChild(hint(esc(pr.error), 'err'));
    const fn = SIDE[pr.type];
    if (fn) fn(pr, box, g);
    renderCard();
  }

  function promptTitle(pr) {
    switch (pr.type) {
      case 'kickOrReceive': return '贏得擲硬幣';
      case 'setup': return { kick: '布陣（開球方）', receive: '布陣（接球方）', solid: '穩固防守', quick: '快速開球' }[pr.kind];
      case 'placeKick': return '選擇開球落點';
      case 'touchback': return '回場球：選擇拿球的球員';
      case 'highKick': return '高吊球';
      case 'turn': return pr.special ? '閃擊！開球事件（額外行動）' : `第 ${G().turnNo[pr.team]} 回合`;
      case 'activation': { const p = G().players[pr.pid]; return `${pn(p)}：${BB.ACTION_ZH[pr.action]}`; }
      case 'reroll': return '要重擲嗎？';
      case 'blockDice': return '選擇阻擋骰';
      case 'push': return '選擇推擠方向';
      case 'followUp': return '要跟進嗎？';
      case 'intercept': return '要嘗試攔截嗎？';
      case 'confirm': return '請決定';
      case 'bncDir': return '鏈球方向';
      default: return pr.type;
    }
  }

  const SIDE = {
    kickOrReceive(pr, box) {
      box.appendChild(hint('你贏得擲硬幣，要先開球還是先接球？'));
      box.appendChild(row(btn('接球', () => act({ choice: 'receive' }), 'primary'), btn('開球', () => act({ choice: 'kick' }))));
    },
    setup(pr, box, g) {
      const limited = pr.kind === 'solid' || pr.kind === 'quick';
      if (limited) {
        box.appendChild(hint(pr.kind === 'quick'
          ? `點選己方球員，再點相鄰的空格（最多 ${pr.limit} 人，每人 1 格）。已移動 ${pr.moved.length} 人。`
          : `點選己方球員，再點己方半場的空格重新擺放（最多 ${pr.limit} 人）。已移動 ${pr.moved.length} 人。`));
        box.appendChild(row(btn('完成', () => act({ type: 'done' }), 'primary')));
        return;
      }
      const on = BB.pitchPlayers(g, pr.team).length;
      box.appendChild(hint(`點選替補球員，再點己方半場的格子放置；點場上球員可移動或交換；右鍵移回替補席。<br>規定：場上 11 人、中央爭球線至少 3 人、每側邊路最多 2 人。目前場上 ${on} 人。`));
      const res = g.players.filter(p => p.team === pr.team && p.loc === 'reserve');
      const chips = document.createElement('div');
      chips.className = 'chips';
      for (const p of res) {
        const c = btn(`${p.short} ${pn(p)}`, () => { S.setupSel = p.id; S.sel = p.id; renderSide(); draw(); }, 'chip' + (S.setupSel === p.id ? ' sel' : ''));
        c.addEventListener('mouseenter', () => { S.cardPid = p.id; renderCard(); });
        chips.appendChild(c);
      }
      if (res.length) box.appendChild(chips);
      const out = g.players.filter(p => p.team === pr.team && (p.loc === 'ko' || p.loc === 'cas' || p.loc === 'sent' || p.loc === 'heat'));
      if (out.length) box.appendChild(hint('無法上場：' + out.map(p => `${pn(p)}（${{ ko: '昏迷', cas: '受傷', sent: '罰下', heat: '中暑' }[p.loc]}）`).join('、')));
      const err = BB.setupError(g, pr.team);
      box.appendChild(row(
        btn('自動排陣', () => act({ type: 'auto' })),
        btn('清空', () => act({ type: 'clear' })),
        btn('完成布陣', () => act({ type: 'done' }), 'primary', !!err)));
      if (err) box.appendChild(hint(err));
    },
    placeKick(pr, box) { box.appendChild(hint('點選對方半場的一格作為開球目標。球會偏移 D8 方向、D6 格。')); },
    touchback(pr, box, g) {
      box.appendChild(hint('球落在場外或你方半場以外：點選一名己方球員拿球。'));
      box.appendChild(row(...pr.candidates.map(id => btn(pn(g.players[id]), () => act({ pid: id }), 'chip'))));
    },
    highKick(pr, box, g) {
      box.appendChild(hint('可以派一名未被盯防的球員跑到落點下方（黃框）。'));
      box.appendChild(row(...pr.candidates.map(id => btn(pn(g.players[id]), () => act({ pid: id }), 'chip')), btn('不用', () => act({ pid: null }))));
    },
    turn(pr, box, g) {
      const p = S.sel != null ? g.players[S.sel] : null;
      if (pr.special) box.appendChild(hint(`閃擊事件：已行動 ${g.tf.count}/${g.tf.special.limit} 人，只能移動或閃擊，不能使用隊伍重擲。`));
      if (p && p.team === pr.team && !p.activated && p.loc === 'pitch') {
        const legal = BB.legalActions(g, p);
        box.appendChild(hint(`已選擇 ${pn(p)}。選擇行動，或直接點亮起的格子移動、點相鄰對手阻擋。`));
        const order = ['move', 'block', 'blitz', 'pass', 'handoff', 'foul', 'ttm'];
        box.appendChild(row(...order.filter(a => legal.indexOf(a) >= 0).map(a =>
          btn(BB.ACTION_ZH[a], () => act({ type: 'activate', pid: p.id, action: a }), a === 'move' ? 'primary' : ''))));
      } else box.appendChild(hint('點選一名尚未行動的己方球員。'));
      box.appendChild(row(btn('結束回合', () => act({ type: 'endTurn' }), 'danger')));
    },
    activation(pr, box, g) {
      const p = g.players[pr.pid];
      const A = g.act;
      if (A) {
        const ma = Math.max(0, p.ma - A.used);
        box.appendChild(hint(`剩餘移動力 ${ma}，可衝刺 ${A.rush} 次。${A.blocked ? '（已阻擋）' : ''}`));
      }
      const carry = g.ball.carrier === p.id;
      const r = row();
      if (pr.action === 'pass' && carry) r.appendChild(btn(S.mode === 'pass' ? '取消傳球' : '選擇傳球目標', () => { S.mode = S.mode === 'pass' ? 'move' : 'pass'; renderSide(); draw(); }, S.mode === 'pass' ? 'primary' : ''));
      if (pr.action === 'ttm') r.appendChild(btn(S.mode === 'ttm' ? '取消投擲' : '選擇要丟的隊友', () => { S.mode = S.mode === 'ttm' ? 'move' : 'ttm'; S.ttmPid = null; renderSide(); draw(); }, S.mode === 'ttm' ? 'primary' : ''));
      if ((BB.has(p, 'Pogo Stick') || BB.has(p, 'Leap')) && A && !A.leaped && pr.action !== 'block')
        r.appendChild(btn(S.mode === 'leap' ? '取消跳躍' : '跳躍', () => { S.mode = S.mode === 'leap' ? 'move' : 'leap'; renderSide(); draw(); }, S.mode === 'leap' ? 'primary' : ''));
      r.appendChild(btn('結束行動', () => act({ type: 'end' }), 'danger'));
      box.appendChild(r);
      const tips = {
        move: '點亮起的格子移動：白色＝安全，黃色/紅色＝需要閃避或衝刺（越紅越危險，淡色＝衝刺）。',
        block: '點相鄰、站著的對手進行阻擋。',
        blitz: '可以先移動，再點相鄰對手阻擋（阻擋消耗 1 格移動力）。',
        pass: '移動到想要的位置後，按「選擇傳球目標」再點目標格。',
        handoff: '移動後點相鄰的隊友手遞球。',
        foul: '移動後點相鄰、倒地的對手犯規。',
        ttm: '按「選擇要丟的隊友」，點相鄰隊友，再點落點。'
      };
      box.appendChild(hint(S.mode === 'pass' ? '點目標格傳球。框線顏色：綠=快傳 黃=短傳 橘=長傳 紅=長炸彈。'
        : S.mode === 'ttm' ? (S.ttmPid == null ? '點一名相鄰、有 Right Stuff 的隊友。' : '點落點（快傳或短傳距離）。')
          : S.mode === 'leap' ? '點 2 格外的空格跳過去。' : tips[pr.action]));
    },
    reroll(pr, box) {
      box.appendChild(hint(esc(pr.label)));
      const T = G().teams[pr.team];
      const names = { team: `使用隊伍重擲（剩 ${T.rerollsLeft}）`, pro: '使用職業球員', tmt: '使用「會思考的巨魔」' };
      box.appendChild(row(...pr.options.map(o => btn(names[o], () => act({ use: o }), 'primary')), btn('不重擲', () => act({ use: null }))));
    },
    blockDice(pr, box, g) {
      const att = g.players[pr.att], def = g.players[pr.def];
      const mine = pr.team === att.team;
      box.appendChild(hint(`${pn(att)} 阻擋 ${pn(def)}：力量 ${pr.info.aST} 對 ${pr.info.dST}，${pr.info.n} 顆骰，由${mine ? '你（攻方）' : '你（守方）'}選擇。`));
      const r = row();
      pr.dice.forEach((f, i) => {
        const s = BB.faceScore(f, att, def, pr.blitz);
        const good = mine ? s >= 1 : s < 1;
        r.appendChild(btn(`${FACE_ICON[f]}<br>${BB.FACE_ZH[f]}`, () => act({ pick: i }), 'die ' + (good ? 'good' : 'bad')));
      });
      box.appendChild(r);
      if (pr.options && pr.options.length) {
        const T = g.teams[pr.team];
        const names = { team: `隊伍重擲（剩 ${T.rerollsLeft}）`, pro: '職業球員重擲', tmt: '會思考的巨魔重擲' };
        box.appendChild(row(...pr.options.map(o => btn(names[o], () => act({ reroll: o })))));
      }
    },
    push(pr, box, g) {
      const v = g.players[pr.pid];
      box.appendChild(hint(`選擇 ${pn(v)} 被推往哪一格（紅框，可以點球場）。`));
      box.appendChild(row(...pr.squares.map(([x, y]) => {
        const off = !BB.onPitch(x, y);
        const dir = BB.DIR_ZH[BB.DIRS.findIndex(([a, b]) => a === x - v.x && b === y - v.y)] || '';
        return btn(off ? `推出場外（${dir}）` : `往${dir}`, () => act({ x, y }), off ? 'primary' : '');
      })));
    },
    followUp(pr, box) {
      box.appendChild(hint('攻擊者可以跟進到對手原本的位置（黃框）。'));
      box.appendChild(row(btn('跟進', () => act({ yes: true }), 'primary'), btn('留在原地', () => act({ yes: false }))));
    },
    intercept(pr, box, g) {
      box.appendChild(hint('對手傳球經過你的球員，可以選一名嘗試攔截（-3 或 -2）。'));
      box.appendChild(row(...pr.candidates.map(id => btn(pn(g.players[id]), () => act({ pid: id }), 'primary')), btn('不攔截', () => act({ pid: null }))));
    },
    confirm(pr, box) {
      box.appendChild(hint(esc(pr.text)));
      box.appendChild(row(btn('是', () => act({ yes: true }), 'primary'), btn('否', () => act({ yes: false }))));
    },
    bncDir(pr, box, g) {
      const p = g.players[pr.pid];
      box.appendChild(hint(`${pn(p)} 第 ${pr.step}/${pr.of} 步：選擇大致方向（點相鄰格或下方按鈕）。擲 D6：1–2 偏左、3–4 直走、5–6 偏右。`));
      const grid = document.createElement('div');
      grid.className = 'compass';
      const arrows = ['↖', '↑', '↗', '→', '↘', '↓', '↙', '←'];
      const layout = [0, 1, 2, 7, -1, 3, 6, 5, 4];
      for (const i of layout) {
        if (i < 0) { grid.appendChild(document.createElement('span')); continue; }
        grid.appendChild(btn(arrows[i], () => act({ dir: i })));
      }
      box.appendChild(grid);
    }
  };
  const FACE_ICON = { AD: '💀', BD: '⚔', PU: '➜', DS: '❗', POW: '💥' };

  function renderCard() {
    const g = G();
    const id = S.cardPid != null ? S.cardPid : S.sel;
    const p = id != null ? g.players[id] : null;
    const el = $('#playerCard');
    if (!p) { el.innerHTML = '<span class="muted">滑鼠移到球員上可查看能力值。</span>'; return; }
    const st = v => v == null ? '-' : v + '+';
    const status = [];
    if (p.loc === 'pitch') status.push({ standing: '站立', prone: '倒地', stunned: '擊暈' }[p.status]);
    else status.push({ reserve: '替補席', ko: '昏迷', cas: '受傷離場', sent: '罰下場', heat: '中暑' }[p.loc] || p.loc);
    if (g.ball.carrier === p.id) status.push('持球');
    if (p.activated && p.team === g.active) status.push('已行動');
    if (p.lostTZ) status.push('失去擒抱區');
    el.innerHTML = `
      <div class="pc-head"><span style="color:${g.teams[p.team].color};filter:brightness(1.4)">■</span> ${p.star ? '★ ' : ''}${esc(pn(p))} <span class="muted">（${esc(g.teams[p.team].name)}｜${status.join('、')}）</span></div>
      <div class="stats"><div><small>MA</small>${p.ma}</div><div><small>ST</small>${p.st}</div><div><small>AG</small>${st(p.ag)}</div><div><small>PA</small>${st(p.pa)}</div><div><small>AV</small>${st(p.av)}</div></div>
      <div>${p.skills.map(s => `<span class="sk" title="${esc(BB.SKILLS[s] || s)}">${esc(BB.SKILL_ZH[s] || s)}</span>`).join('') || '<span class="muted">無技能</span>'}</div>`;
  }

  // ================= 繪圖覆蓋層 =================
  function reachFor(p) {
    const key = S.game.history.length + ':' + p.id;
    if (S.reachKey !== key) { S.reachKey = key; S.reachVal = BB.reach(G(), p); }
    return S.reachVal;
  }

  function overlay() {
    const g = G(), pr = P();
    const ui = { sel: S.sel, showTZ: S.showTZ, fx: S.fx, areas: [], targets: [] };
    if (!isHuman(pr)) {
      if (pr.type === 'activation') ui.sel = pr.pid;
      return ui;
    }
    const hv = S.hover;
    switch (pr.type) {
      case 'setup': {
        const t = pr.team;
        if (pr.kind === 'quick') {
          const p = S.sel != null ? g.players[S.sel] : null;
          if (p && p.loc === 'pitch' && p.team === t) for (const [a, b] of BB.DIRS) if (BB.onPitch(p.x + a, p.y + b) && !BB.playerAt(g, p.x + a, p.y + b)) ui.targets.push({ x: p.x + a, y: p.y + b });
        } else {
          ui.areas.push({ x: t === 0 ? 0 : 13, y: 0, w: 13, h: H, color: '#ffffff', alpha: 0.07 });
          ui.areas.push({ x: BB.losOf(t), y: 4, w: 1, h: 7, color: '#ffd54f', alpha: 0.18 });
        }
        break;
      }
      case 'placeKick': {
        const R = 1 - pr.team;
        ui.areas.push({ x: R === 0 ? 0 : 13, y: 0, w: 13, h: H, color: '#ffd54f', alpha: 0.12 });
        if (hv && BB.onPitch(hv.x, hv.y) && BB.inHalf(R, hv.x)) ui.targets.push({ x: hv.x, y: hv.y, label: '目標' });
        break;
      }
      case 'touchback':
      case 'intercept':
        for (const id of pr.candidates) { const p = g.players[id]; ui.targets.push({ x: p.x, y: p.y }); }
        if (pr.type === 'intercept') ui.passLine = [pr.from, pr.to];
        break;
      case 'highKick':
        for (const id of pr.candidates) { const p = g.players[id]; ui.targets.push({ x: p.x, y: p.y }); }
        ui.targets.push({ x: pr.x, y: pr.y, color: '#ffeb3b', label: '落點' });
        break;
      case 'turn': {
        const p = S.sel != null ? g.players[S.sel] : null;
        if (p && p.team === pr.team && !p.activated && p.loc === 'pitch' && p.status !== 'stunned' && !BB.has(p, 'Ball & Chain')) {
          ui.reach = reachFor(p);
          addPathHover(ui, p, ui.reach, hv);
          if (BB.legalActions(g, p).indexOf('block') >= 0) addBlockTargets(ui, g, p, false);
        }
        break;
      }
      case 'activation': {
        const p = g.players[pr.pid];
        ui.sel = p.id;
        const A = g.act;
        if (S.mode === 'pass') {
          for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) {
            const band = BB.passRange(x - p.x, y - p.y);
            if (!band || (x === p.x && y === p.y)) continue;
            if (g.weather === 'blizzard' && (band === 'long' || band === 'bomb')) continue;
            ui.areas.push({ x, y, color: { quick: '#4caf50', short: '#ffeb3b', long: '#ff9800', bomb: '#f44336' }[band], alpha: 0.13 });
          }
          if (hv && BB.onPitch(hv.x, hv.y)) {
            const band = BB.passRange(hv.x - p.x, hv.y - p.y);
            if (band) {
              const mod = BB.passMod(g, p, band);
              ui.passLine = [[p.x, p.y], [hv.x, hv.y]];
              ui.targets.push({ x: hv.x, y: hv.y, label: `${BB.RANGE_ZH[band]} ${Math.max(2, Math.min(6, p.pa - mod))}+` });
            }
          }
        } else if (S.mode === 'ttm') {
          if (S.ttmPid == null) {
            for (const q of BB.pitchPlayers(g, p.team)) if (q !== p && BB.adjacent(p, q) && q.status === 'standing' && BB.has(q, 'Right Stuff')) ui.targets.push({ x: q.x, y: q.y });
          } else {
            for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) {
              const band = BB.passRange(x - p.x, y - p.y);
              if (band === 'quick' || band === 'short') ui.areas.push({ x, y, color: band === 'quick' ? '#4caf50' : '#ffeb3b', alpha: 0.13 });
            }
            if (hv) ui.targets.push({ x: hv.x, y: hv.y, label: '落點' });
          }
        } else if (S.mode === 'leap') {
          for (let x = p.x - 2; x <= p.x + 2; x++) for (let y = p.y - 2; y <= p.y + 2; y++)
            if (BB.onPitch(x, y) && BB.cheb(x, y, p.x, p.y) === 2 && !BB.playerAt(g, x, y)) ui.targets.push({ x, y, color: '#81d4fa' });
        } else {
          if (pr.action !== 'block') {
            ui.reach = reachFor(p);
            addPathHover(ui, p, ui.reach, hv);
          }
          if ((pr.action === 'block' || pr.action === 'blitz') && A && !A.blocked) addBlockTargets(ui, g, p, pr.action === 'blitz');
          if (pr.action === 'handoff' && g.ball.carrier === p.id)
            for (const q of BB.pitchPlayers(g, p.team)) if (q !== p && BB.adjacent(p, q) && BB.canCatch(q)) ui.targets.push({ x: q.x, y: q.y, color: '#81d4fa', label: '手遞' });
          if (pr.action === 'foul')
            for (const q of BB.pitchPlayers(g, 1 - p.team)) if (q.status !== 'standing' && BB.adjacent(p, q)) ui.targets.push({ x: q.x, y: q.y, color: '#ff7043', label: '犯規' });
        }
        break;
      }
      case 'blockDice': {
        const a = g.players[pr.att], d = g.players[pr.def];
        ui.targets.push({ x: a.x, y: a.y, color: '#ffeb3b' }, { x: d.x, y: d.y, color: '#ff5252' });
        break;
      }
      case 'push':
        for (const [x, y] of pr.squares) ui.targets.push({ x, y, color: '#ff5252', label: BB.onPitch(x, y) ? '' : '場外' });
        break;
      case 'followUp':
        ui.sel = pr.pid;
        ui.targets.push({ x: pr.x, y: pr.y, color: '#ffeb3b', label: '跟進' });
        break;
      case 'bncDir': {
        const p = g.players[pr.pid];
        ui.sel = p.id;
        for (const [a, b] of BB.DIRS) ui.targets.push({ x: p.x + a, y: p.y + b, color: '#ce93d8' });
        break;
      }
      case 'reroll':
      case 'confirm':
        if (pr.pid != null) ui.sel = pr.pid;
        break;
    }
    return ui;
  }

  function addPathHover(ui, p, reach, hv) {
    if (!hv) return;
    const r = reach.get(hv.y * W + hv.x);
    if (!r) return;
    ui.path = r.path;
    ui.pathFrom = { x: p.x, y: p.y };
    const g = G();
    let label = `${Math.round(r.prob * 100)}%`;
    if (g.ball.carrier == null && !g.ball.inAir && g.ball.x === r.x && g.ball.y === r.y) label += ' 撿球';
    ui.targets.push({ x: r.x, y: r.y, color: '#ffffff', label });
  }

  function addBlockTargets(ui, g, p, blitz) {
    for (const q of BB.pitchPlayers(g, 1 - p.team)) {
      if (q.status !== 'standing' || !BB.adjacent(p, q)) continue;
      const info = BB.blockInfo(g, p, q, { blitz, fromX: p.x, fromY: p.y });
      const mine = info.chooser === p.team;
      ui.targets.push({ x: q.x, y: q.y, color: mine ? '#ff5252' : '#ff9800', label: `${info.n}骰${mine ? '' : '!'}` });
    }
  }

  function draw() {
    if (!S.game) return;
    S.renderer.draw(G(), overlay());
  }

  // ================= 滑鼠 =================
  function cellFromEvent(e) {
    const rect = $('#pitch').getBoundingClientRect();
    return S.renderer.cellAt(e.clientX - rect.left, e.clientY - rect.top);
  }

  function onMove(e) {
    if (!S.game) return;
    const c = cellFromEvent(e);
    if (S.hover && S.hover.x === c.x && S.hover.y === c.y) return;
    S.hover = c;
    const p = BB.onPitch(c.x, c.y) ? BB.playerAt(G(), c.x, c.y) : null;
    const newCard = p ? p.id : null;
    if (newCard !== S.cardPid) { S.cardPid = newCard; renderCard(); }
    draw();
  }

  function onClick(e) {
    if (!S.game) return;
    const pr = P();
    if (!isHuman(pr)) return;
    const c = cellFromEvent(e);
    const g = G();
    const on = BB.onPitch(c.x, c.y);
    const who = on ? BB.playerAt(g, c.x, c.y) : null;
    switch (pr.type) {
      case 'setup': {
        if (who && who.team === pr.team && (S.setupSel == null || S.setupSel === who.id || pr.kind === 'quick' || pr.kind === 'solid')) {
          S.setupSel = S.setupSel === who.id ? null : who.id; S.sel = S.setupSel; renderSide(); draw(); return;
        }
        if (S.setupSel != null && on) {
          const id = S.setupSel;
          S.setupSel = null; S.sel = null;
          act({ type: 'place', pid: id, x: c.x, y: c.y });
        }
        return;
      }
      case 'placeKick': if (on) act({ x: c.x, y: c.y }); return;
      case 'touchback':
      case 'highKick':
      case 'intercept':
        if (who && pr.candidates.indexOf(who.id) >= 0) act({ pid: who.id });
        return;
      case 'push':
        if (pr.squares.some(([x, y]) => x === c.x && y === c.y)) act({ x: c.x, y: c.y });
        return;
      case 'followUp':
        if (c.x === pr.x && c.y === pr.y) act({ yes: true });
        return;
      case 'bncDir': {
        const p = g.players[pr.pid];
        const i = BB.DIRS.findIndex(([a, b]) => a === c.x - p.x && b === c.y - p.y);
        if (i >= 0) act({ dir: i });
        return;
      }
      case 'turn': return clickTurn(pr, g, c, who);
      case 'activation': return clickActivation(pr, g, c, who);
    }
  }

  function clickTurn(pr, g, c, who) {
    const sel = S.sel != null ? g.players[S.sel] : null;
    if (who && who.team === pr.team) {
      S.sel = who.id === S.sel ? null : who.id;
      renderSide(); draw(); return;
    }
    if (!sel || sel.team !== pr.team || sel.activated) return;
    const legal = BB.legalActions(g, sel);
    if (who && who.team !== pr.team && who.status === 'standing' && BB.adjacent(sel, who) && legal.indexOf('block') >= 0) {
      S.queued = { pid: sel.id, ans: { type: 'block', target: who.id } };
      act({ type: 'activate', pid: sel.id, action: 'block' });
      return;
    }
    if (!who && BB.onPitch(c.x, c.y) && !BB.has(sel, 'Ball & Chain')) {
      const r = reachFor(sel).get(c.y * W + c.x);
      if (r) {
        S.queued = { pid: sel.id, ans: { type: 'move', path: r.path } };
        act({ type: 'activate', pid: sel.id, action: 'move' });
        return;
      }
    }
    S.sel = null; renderSide(); draw();
  }

  function clickActivation(pr, g, c, who) {
    const p = g.players[pr.pid];
    if (S.mode === 'pass') { if (BB.onPitch(c.x, c.y)) act({ type: 'pass', x: c.x, y: c.y }); return; }
    if (S.mode === 'leap') { act({ type: 'leap', x: c.x, y: c.y }); return; }
    if (S.mode === 'ttm') {
      if (S.ttmPid == null) {
        if (who && who.team === p.team && who !== p) { S.ttmPid = who.id; renderSide(); draw(); }
        return;
      }
      act({ type: 'ttm', target: S.ttmPid, x: c.x, y: c.y });
      return;
    }
    if (who) {
      if (who.team !== p.team && who.status === 'standing' && (pr.action === 'block' || pr.action === 'blitz')) { act({ type: 'block', target: who.id }); return; }
      if (who.team !== p.team && who.status !== 'standing' && pr.action === 'foul') { act({ type: 'foul', target: who.id }); return; }
      if (who.team === p.team && who !== p && pr.action === 'handoff') { act({ type: 'handoff', target: who.id }); return; }
      return;
    }
    if (!BB.onPitch(c.x, c.y) || pr.action === 'block') return;
    const r = reachFor(p).get(c.y * W + c.x);
    if (r) act({ type: 'move', path: r.path });
  }

  function onRightClick(e) {
    e.preventDefault();
    if (!S.game) return;
    const pr = P();
    if (!isHuman(pr)) return;
    const c = cellFromEvent(e);
    if (pr.type === 'setup' && BB.onPitch(c.x, c.y)) {
      const who = BB.playerAt(G(), c.x, c.y);
      if (who && who.team === pr.team) { S.setupSel = null; S.sel = null; act({ type: 'remove', pid: who.id }); }
      return;
    }
    // 右鍵取消選擇
    S.sel = null; S.mode = 'move'; renderSide(); draw();
  }

  function resize() {
    if (!S.renderer) return;
    const wrap = $('#pitchWrap');
    const narrow = window.innerWidth <= 1000;
    const maxW = wrap.clientWidth - 12;
    const maxH = narrow ? 2000 : wrap.clientHeight - 12;
    S.renderer.resize(maxW, maxH);
    draw();
  }

  function toMenu() {
    clearTimeout(S.timer);
    S.game = null;
    $('#game').classList.add('hidden');
    $('#menu').classList.remove('hidden');
    buildMenu();
  }

  // ================= 初始化 =================
  function init() {
    buildMenu();
    S.renderer = new BB.Renderer($('#pitch'));
    $('#startBtn').addEventListener('click', startGame);
    $('#menuBtn').addEventListener('click', () => { if (confirm('放棄這場比賽並回到選單？')) toMenu(); });
    const cv = $('#pitch');
    cv.addEventListener('mousemove', onMove);
    cv.addEventListener('mouseleave', () => { S.hover = null; draw(); });
    cv.addEventListener('click', onClick);
    cv.addEventListener('contextmenu', onRightClick);
    $('#speedSel2').addEventListener('change', e => { S.speed = e.target.value; });
    $('#tzToggle').addEventListener('change', e => { S.showTZ = e.target.checked; draw(); });
    window.addEventListener('resize', resize);
    window.addEventListener('keydown', e => {
      if (!S.game || e.target.tagName === 'INPUT') return;
      const pr = P();
      if (!isHuman(pr)) return;
      if (e.key === 'Escape') { S.sel = null; S.mode = 'move'; renderSide(); draw(); }
      if ((e.key === 'e' || e.key === 'E') && pr.type === 'activation') act({ type: 'end' });
    });
  }

  BB.App = S; // 除錯用
  init();
})();
