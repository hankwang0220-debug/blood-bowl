/*
 * 電腦對電腦的壓力測試。在瀏覽器主控台載入後執行：
 *   var s = document.createElement('script'); s.src = 'tests/sim.js'; document.body.appendChild(s);
 *   BB.sim(100, 1)   // 打 100 場，種子從 1 開始
 * 回傳每場是否打完、引擎錯誤、AI 錯誤，以及各種行動出現的次數。
 */
(function () {
  'use strict';
  const BB = globalThis.BB;
  const WORDS = ['宣告：傳球', '快傳', '短傳', '長傳', '長炸彈', '攔截成功', '宣告：投擲隊友', '跳躍', '手遞給', '達陣！', '失誤',
    '宣告：保球', '刺擊', '電鋸', '噴吐', '噴火', '拖延', '分心', '生根', '爭辯判決', '衝鋒！', '可疑點心', '蜂擁而至', '隊長', '嗜血',
    '野性難馴', '狂怒失控', '觸手', '飛撲擒抱', '如影隨形', '穩健步伐', '鏈球', '旋轉', '跳過第'];

  BB.sim = function (N, seed0) {
    const races = Object.keys(BB.TEAMS);
    const results = [], errors = [], aiErrs = [], count = {};
    const t0 = Date.now();
    const orig = console.error;
    console.error = e => { if (aiErrs.length < 5) aiErrs.push(String((e && e.stack) || e).split('\n').slice(0, 3).join(' | ')); };
    try {
      for (let n = 0; n < N; n++) {
        const a = races[(seed0 + n) % races.length], b = races[((seed0 + n) * 7 + 3) % races.length];
        const cfg = { seed: seed0 + n, teams: [BB.defaultTeamConfig(a), BB.defaultTeamConfig(b)] };
        if (n % 3 === 0 && BB.STARS.ripper.teams.indexOf(a) >= 0) cfg.teams[0].stars = ['ripper', 'fungus'];
        const g = new BB.Game(cfg);
        BB.AI.reset();
        let steps = 0, stuck = 0;
        while (g.prompt.type !== 'gameOver' && steps < 30000) {
          const ans = BB.AI.decide(g, g.prompt);
          if (!g.act(ans)) errors.push({ n, msg: g.lastError.message, stack: g.lastError.stack.split('\n').slice(0, 5).join(' | ') });
          if (g.prompt.error) {
            if (++stuck > 30) { errors.push({ n, stuck: g.prompt.type, err: g.prompt.error, ans: JSON.stringify(ans) }); break; }
          } else stuck = 0;
          steps++;
        }
        for (const l of g.G.log) for (const w of WORDS) if (l.text.indexOf(w) >= 0) count[w] = (count[w] || 0) + 1;
        g.G.fx.length = 0;
        results.push({ score: g.G.score, over: g.G.over });
        if (errors.length > 8) break;
      }
    } finally { console.error = orig; }
    return {
      ms: Date.now() - t0, games: results.length,
      unfinished: results.filter(r => !r.over).length,
      avgTD: +(results.reduce((s, r) => s + r.score[0] + r.score[1], 0) / results.length).toFixed(2),
      errors: errors.slice(0, 8), aiErrs, count
    };
  };
})();
