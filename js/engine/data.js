/* 球隊、球員與技能資料（純資料，瀏覽器與 Node 共用） */
(function () {
  'use strict';
  const BB = (globalThis.BB = globalThis.BB || {});

  BB.BUDGET = 1000;        // 建隊預算（單位：千金幣）
  BB.APOTHECARY_COST = 50;

  // 技能說明。標記 [未實作] 的技能只顯示，不影響規則。
  BB.SKILLS = {
    'Block': '格擋：擲出「雙方倒地」時，此球員不會倒地。',
    'Dodge': '閃避：每回合一次可重擲失敗的閃避；對手擲出「守方踉蹌」時只會被推開。',
    'Tackle': '擒抱：被此球員盯防的對手閃避時不能使用 Dodge 技能。',
    'Sure Hands': '穩手：可重擲失敗的撿球；對手的 Strip Ball 無效。',
    'Sure Feet': '穩腳：每回合一次可重擲失敗的衝刺（Rush）。',
    'Catch': '接球：可重擲失敗的接球。',
    'Pass': '傳球：可重擲失敗的傳球。',
    'Sprint': '衝刺：每次行動可衝刺 3 次（一般是 2 次）。',
    'Guard': '護衛：即使被盯防，仍可提供協助。',
    'Mighty Blow': '重擊(+1)：擊倒對手時，護甲或傷害擲骰 +1。',
    'Stand Firm': '站穩：不會被推開。',
    'Frenzy': '狂暴：必須跟進；若對手仍站著且相鄰，必須再阻擋一次。',
    'Wrestle': '摔角：擲出「雙方倒地」時，可讓雙方都倒地且不擲護甲（不算失誤）。',
    'Side Step': '側步：被推開時由自己選擇推往哪個相鄰空格。',
    'Strip Ball': '抄球：把持球者推開時，對方會掉球。',
    'Thick Skull': '硬頭殼：傷害擲骰為 8 時只會被擊暈。',
    'Regeneration': '再生：受重傷時擲 D6，4+ 回到替補席。',
    'Loner': '獨行者(4+)：使用隊伍重擲前須擲 4+，失敗則浪費該次重擲。',
    'Bone Head': '木頭腦袋：啟動時擲 D6，擲出 1 則失去行動與擒抱區。',
    'Really Stupid': '超級笨蛋：啟動時擲 D6，需要 4+（旁邊有聰明隊友時 2+），失敗則呆住。',
    'Wild Animal': '野獸：啟動時擲 D6，阻擋/閃擊需 2+，其他行動需 4+。',
    'Throw Team-Mate': '投擲隊友：可把相鄰、有 Right Stuff 的隊友丟出去（快傳或短傳距離）。',
    'Right Stuff': '可投擲：可被有 Throw Team-Mate 的隊友丟出去。',
    'Stunty': '小不點：閃避時無視盯防減值；使用小不點傷害表。',
    'Titchy': '迷你：閃避 +1。',
    'Dirty Player': '骯髒球員(+1)：犯規時護甲或傷害擲骰 +1。',
    'Sneaky Git': '奸詐：犯規時護甲擲出對子不會被罰下場。',
    'Horns': '尖角：閃擊時力量 +1。',
    'Claws': '利爪：護甲擲骰 8+ 一定破甲。',
    'Prehensile Tail': '卷尾：對手閃避離開此球員的擒抱區時 -1。',
    'Two Heads': '雙頭：閃避 +1。',
    'Extra Arms': '多臂：撿球、接球、攔截 +1。',
    'Big Hand': '大手：撿球時無視盯防與雨天減值。',
    'Accurate': '精準：快傳與短傳 +1。',
    'Strong Arm': '強臂：短傳、長傳、長炸彈 +1。',
    'Nerves of Steel': '鋼鐵神經：傳球、接球、攔截時無視盯防。',
    'Pro': '職業球員：每回合一次，擲 3+ 可重擲一顆骰子。',
    'Juggernaut': '攻城槌：閃擊時「雙方倒地」改為推開，並無視 Stand Firm。',
    'Grab': '抓取：阻擋（非閃擊）推人時，可推往對手任一相鄰空格。',
    'Break Tackle': '突破：每次行動第一次閃避時，依力量加值（ST5+ 為 +2，否則 +1）。',
    'Dauntless': '無畏：阻擋較強對手時擲 D6+力量，超過對方力量則視為同力量。',
    'Foul Appearance': '醜陋外表：阻擋此球員的對手先擲 D6，擲出 1 則阻擋失敗。',
    'Disturbing Presence': '擾人存在：3 格內的對手傳球、接球、攔截 -1。',
    'No Hands': '無手：無法持球、撿球或接球。',
    'Secret Weapon': '秘密武器：每次推進（drive）結束時被罰下場。',
    'Ball & Chain': '鏈球：只能移動，每步方向隨機（擲 D6 決定），撞到人就阻擋，不需閃避；倒地時直接擲傷害。',
    'Pogo Stick': '彈簧高蹺：可跳到 2 格內的空格，跳躍檢定無減值。',
    'Kick': '開球手：開球偏移距離減半。',
    'Always Hungry': '永遠很餓：[未實作]',
    'Projectile Vomit': '噴吐：[未實作]',
    'Cloud Burster': '破雲高傳：此球員傳球時，對手不能嘗試攔截。',
    'Safe Pass': '安全傳球：傳球擲出自然 1 時不會失手掉球；球員保留持球，行動立即結束，不算失誤。',
    'My Ball': '我的球：不能宣告傳球或手遞，只有被擊倒、倒地或摔倒等情況才會失去持球。',
    'Steady Footing': '穩健步伐：即將被擊倒或摔倒時擲 D6，擲出 6 則不會倒地；若在自己行動中，可以繼續行動且不算失誤。',
    "Thinking Man's Troll": '會思考的巨魔：每半場一次，可重擲一顆單獨擲出的骰子（不含護甲、傷害、傷亡擲骰）。',
    'Whirling Dervish': '旋轉托缽僧：每次啟動一次，決定移動方向時可重擲 D6。'
  };

  // 中文技能名稱
  BB.SKILL_ZH = {
    'Block': '格擋', 'Dodge': '閃避', 'Tackle': '擒抱', 'Sure Hands': '穩手', 'Sure Feet': '穩腳',
    'Catch': '接球', 'Pass': '傳球', 'Sprint': '衝刺', 'Guard': '護衛', 'Mighty Blow': '重擊',
    'Stand Firm': '站穩', 'Frenzy': '狂暴', 'Wrestle': '摔角', 'Side Step': '側步', 'Strip Ball': '抄球',
    'Thick Skull': '硬頭殼', 'Regeneration': '再生', 'Loner': '獨行者', 'Bone Head': '木頭腦袋',
    'Really Stupid': '超級笨蛋', 'Wild Animal': '野獸', 'Throw Team-Mate': '投擲隊友', 'Right Stuff': '可投擲',
    'Stunty': '小不點', 'Titchy': '迷你', 'Dirty Player': '骯髒球員', 'Sneaky Git': '奸詐', 'Horns': '尖角',
    'Claws': '利爪', 'Prehensile Tail': '卷尾', 'Two Heads': '雙頭', 'Extra Arms': '多臂', 'Big Hand': '大手',
    'Accurate': '精準', 'Strong Arm': '強臂', 'Nerves of Steel': '鋼鐵神經', 'Pro': '職業球員',
    'Juggernaut': '攻城槌', 'Grab': '抓取', 'Break Tackle': '突破', 'Dauntless': '無畏',
    'Foul Appearance': '醜陋外表', 'Disturbing Presence': '擾人存在', 'No Hands': '無手',
    'Secret Weapon': '秘密武器', 'Ball & Chain': '鏈球', 'Pogo Stick': '彈簧高蹺', 'Kick': '開球手',
    'Always Hungry': '永遠很餓', 'Projectile Vomit': '噴吐',
    "Thinking Man's Troll": '會思考的巨魔', 'Whirling Dervish': '旋轉托缽僧',
    'Cloud Burster': '破雲高傳', 'Safe Pass': '安全傳球', 'My Ball': '我的球', 'Steady Footing': '穩健步伐'
  };

  const TROLL = { ma: 4, st: 5, ag: 5, pa: 5, av: 10,
    skills: ['Always Hungry', 'Loner', 'Mighty Blow', 'Projectile Vomit', 'Really Stupid', 'Regeneration', 'Throw Team-Mate'] };

  // 能力值：ag/pa/av 用「需要的點數」表示，例如 ag:3 代表 3+；pa:null 代表不能傳球
  BB.TEAMS = {
    human: {
      name: '人類', colors: ['#1f5fbf', '#d9d9d9'], rerollCost: 50, apothecary: true,
      positions: [
        { key: 'lineman', name: '人類線鋒', short: 'L', max: 16, cost: 50, ma: 6, st: 3, ag: 3, pa: 4, av: 9, skills: [] },
        { key: 'thrower', name: '人類投手', short: 'T', max: 2, cost: 80, ma: 6, st: 3, ag: 3, pa: 2, av: 9, skills: ['Pass', 'Sure Hands'] },
        { key: 'catcher', name: '人類接球手', short: 'C', max: 4, cost: 65, ma: 8, st: 2, ag: 3, pa: 5, av: 8, skills: ['Catch', 'Dodge'] },
        { key: 'blitzer', name: '人類閃擊手', short: 'B', max: 4, cost: 85, ma: 7, st: 3, ag: 3, pa: 4, av: 9, skills: ['Block'] },
        { key: 'halfling', name: '半身人', short: 'h', max: 3, cost: 30, ma: 5, st: 2, ag: 3, pa: 5, av: 7, skills: ['Dodge', 'Right Stuff', 'Stunty'] },
        { key: 'ogre', name: '食人魔', short: 'O', max: 1, cost: 140, ma: 5, st: 5, ag: 4, pa: 5, av: 10, skills: ['Bone Head', 'Loner', 'Mighty Blow', 'Thick Skull', 'Throw Team-Mate'] }
      ],
      defaultRoster: { counts: { thrower: 1, catcher: 2, blitzer: 4, lineman: 4 }, rerolls: 3, apothecary: true, stars: [] }
    },
    orc: {
      name: '獸人', colors: ['#2f7d32', '#c62828'], rerollCost: 60, apothecary: true,
      positions: [
        { key: 'lineman', name: '獸人線鋒', short: 'L', max: 16, cost: 50, ma: 5, st: 3, ag: 3, pa: 4, av: 10, skills: [] },
        { key: 'thrower', name: '獸人投手', short: 'T', max: 2, cost: 65, ma: 5, st: 3, ag: 3, pa: 3, av: 9, skills: ['Pass', 'Sure Hands'] },
        { key: 'blitzer', name: '獸人閃擊手', short: 'B', max: 4, cost: 80, ma: 6, st: 3, ag: 3, pa: 4, av: 10, skills: ['Block'] },
        { key: 'bigun', name: '大塊頭', short: 'U', max: 4, cost: 90, ma: 5, st: 4, ag: 4, pa: null, av: 10, skills: [] },
        { key: 'goblin', name: '哥布林', short: 'g', max: 4, cost: 40, ma: 6, st: 2, ag: 3, pa: 4, av: 8, skills: ['Dodge', 'Right Stuff', 'Stunty'] },
        Object.assign({ key: 'troll', name: '未受訓巨魔', short: 'T', max: 1, cost: 115 }, TROLL, { short: 'R' })
      ],
      defaultRoster: { counts: { thrower: 1, blitzer: 4, bigun: 3, lineman: 3 }, rerolls: 2, apothecary: true, stars: [] }
    },
    goblin: {
      name: '夜地精', colors: ['#6a1b9a', '#f9a825'], rerollCost: 60, apothecary: true,
      positions: [
        { key: 'goblin', name: '地精', short: 'g', max: 16, cost: 40, ma: 6, st: 2, ag: 3, pa: 4, av: 8, skills: ['Dodge', 'Right Stuff', 'Stunty'] },
        { key: 'pogoer', name: '彈簧高蹺手', short: 'P', max: 1, cost: 75, ma: 7, st: 2, ag: 3, pa: 5, av: 7, skills: ['Dodge', 'Pogo Stick', 'Stunty'] },
        { key: 'fanatic', name: '狂熱者', short: 'F', max: 1, cost: 70, ma: 3, st: 7, ag: 3, pa: null, av: 8, skills: ['Ball & Chain', 'No Hands', 'Secret Weapon', 'Stunty'] },
        { key: 'ooligan', name: '流氓', short: 'O', max: 1, cost: 65, ma: 6, st: 2, ag: 3, pa: 6, av: 8, skills: ['Disturbing Presence', 'Dodge', 'Right Stuff', 'Stunty'] },
        Object.assign({ key: 'troll', name: '巨魔', max: 2, cost: 115 }, TROLL, { short: 'R' })
      ],
      defaultRoster: { counts: { goblin: 8, troll: 2, pogoer: 1 }, rerolls: 3, apothecary: true, stars: ['fungus'] }
    },
    skaven: {
      name: '鼠人', colors: ['#5d4037', '#e0e0e0'], rerollCost: 50, apothecary: true,
      positions: [
        { key: 'lineman', name: '鼠人線鋒', short: 'L', max: 16, cost: 50, ma: 7, st: 3, ag: 3, pa: 4, av: 8, skills: [] },
        { key: 'thrower', name: '鼠人投手', short: 'T', max: 2, cost: 85, ma: 7, st: 3, ag: 3, pa: 2, av: 8, skills: ['Pass', 'Sure Hands'] },
        { key: 'runner', name: '溝渠奔跑者', short: 'G', max: 4, cost: 85, ma: 9, st: 2, ag: 2, pa: 4, av: 8, skills: ['Dodge'] },
        { key: 'blitzer', name: '鼠人閃擊手', short: 'B', max: 2, cost: 90, ma: 7, st: 3, ag: 3, pa: 5, av: 9, skills: ['Block'] },
        { key: 'ratogre', name: '鼠魔', short: 'O', max: 1, cost: 150, ma: 6, st: 5, ag: 4, pa: null, av: 9, skills: ['Wild Animal', 'Frenzy', 'Loner', 'Mighty Blow', 'Prehensile Tail'] }
      ],
      defaultRoster: { counts: { thrower: 1, runner: 2, blitzer: 2, lineman: 6 }, rerolls: 3, apothecary: true, stars: [] }
    },
    highelf: {
      name: '高等精靈', colors: ['#efe6c8', '#1565c0'], rerollCost: 50, apothecary: true,
      positions: [
        { key: 'lineman', name: '高等精靈線鋒', short: 'L', max: 16, cost: 65, ma: 6, st: 3, ag: 2, pa: 3, av: 9, skills: [] },
        { key: 'phoenix', name: '神凰修羅', short: 'T', max: 2, cost: 90, ma: 6, st: 3, ag: 2, pa: 2, av: 9, skills: ['Cloud Burster', 'Pass', 'Safe Pass'] },
        { key: 'dragon', name: '真龍皇子', short: 'D', max: 2, cost: 110, ma: 8, st: 3, ag: 2, pa: 4, av: 9, skills: ['Block', 'Catch', 'My Ball'] },
        { key: 'lion', name: '蒼白雄獅', short: 'W', max: 2, cost: 110, ma: 7, st: 3, ag: 2, pa: 3, av: 9, skills: ['Claws', 'Wrestle'] }
      ],
      defaultRoster: { counts: { phoenix: 1, dragon: 2, lion: 1, lineman: 7 }, rerolls: 2, apothecary: false, stars: [] }
    },
    dwarf: {
      name: '矮人', colors: ['#b71c1c', '#455a64'], rerollCost: 50, apothecary: true,
      positions: [
        { key: 'blocker', name: '矮人阻擋者', short: 'L', max: 16, cost: 70, ma: 4, st: 3, ag: 4, pa: 5, av: 10, skills: ['Block', 'Tackle', 'Thick Skull'] },
        { key: 'runner', name: '矮人跑鋒', short: 'R', max: 2, cost: 85, ma: 6, st: 3, ag: 3, pa: 4, av: 9, skills: ['Sure Hands', 'Thick Skull'] },
        { key: 'blitzer', name: '矮人閃擊手', short: 'B', max: 2, cost: 80, ma: 5, st: 3, ag: 3, pa: 4, av: 10, skills: ['Block', 'Thick Skull'] },
        { key: 'slayer', name: '巨魔殺手', short: 'S', max: 2, cost: 95, ma: 5, st: 3, ag: 4, pa: null, av: 9, skills: ['Block', 'Dauntless', 'Frenzy', 'Thick Skull'] },
        { key: 'deathroller', name: '死亡壓路機', short: 'D', max: 1, cost: 170, ma: 4, st: 7, ag: 5, pa: null, av: 11, skills: ['Break Tackle', 'Dirty Player', 'Juggernaut', 'Loner', 'Mighty Blow', 'No Hands', 'Secret Weapon', 'Stand Firm'] }
      ],
      defaultRoster: { counts: { blocker: 6, runner: 1, blitzer: 2, slayer: 2 }, rerolls: 2, apothecary: false, stars: [] }
    }
  };

  // 明星球員。能力值暫用 Blood Bowl 2020 版資料；文章只公布了專屬技能。
  BB.STARS = {
    ripper: {
      key: 'ripper', name: 'Ripper Bolgrot', short: 'RB', cost: 250, star: true,
      ma: 4, st: 6, ag: 5, pa: 4, av: 10,
      skills: ['Grab', 'Mighty Blow', 'Regeneration', 'Throw Team-Mate', 'Loner', "Thinking Man's Troll"],
      teams: ['goblin', 'orc'],
      note: '自由球員巨魔，會思考的巨魔：每半場一次可重擲一顆骰子。'
    },
    fungus: {
      key: 'fungus', name: 'Fungus the Loon', short: 'FL', cost: 80, star: true,
      ma: 4, st: 7, ag: 3, pa: null, av: 8,
      skills: ['Ball & Chain', 'Mighty Blow', 'No Hands', 'Secret Weapon', 'Stunty', 'Loner', 'Whirling Dervish'],
      teams: ['goblin', 'orc'],
      note: '夜地精狂熱者，拖著鏈球亂轉，敵我不分。'
    }
  };

  // 由預設陣容建立 roster 設定
  BB.defaultTeamConfig = function (race) {
    const def = BB.TEAMS[race];
    const r = def.defaultRoster;
    return { race, name: def.name, counts: Object.assign({}, r.counts), rerolls: r.rerolls, apothecary: r.apothecary, stars: r.stars.slice() };
  };

  BB.teamCost = function (tc) {
    const def = BB.TEAMS[tc.race];
    let c = 0;
    for (const p of def.positions) c += (tc.counts[p.key] || 0) * p.cost;
    c += tc.rerolls * def.rerollCost;
    if (tc.apothecary) c += BB.APOTHECARY_COST;
    for (const s of tc.stars) c += BB.STARS[s].cost;
    return c;
  };

  BB.teamPlayerCount = function (tc) {
    let n = tc.stars.length;
    for (const k in tc.counts) n += tc.counts[k];
    return n;
  };
})();
