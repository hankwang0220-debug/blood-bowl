/*
 * 球隊、球員、技能資料（Blood Bowl 2025 版／第三版）。
 * 數值依據 https://bloodbowlbase.ru/bb2025/ 整理；技能說明是中文摘要，不是原文翻譯。
 * 純資料，瀏覽器與 Node 共用。
 */
(function () {
  'use strict';
  const BB = (globalThis.BB = globalThis.BB || {});

  BB.BUDGET = 1000;          // 建隊預算（千金幣）
  BB.APOTHECARY_COST = 50;
  BB.STAFF_COST = 10;        // 啦啦隊、助理教練
  BB.MAX_STARS = 2;

  // ---------- 技能與特性 ----------
  // 類別：A 敏捷、D 詭計、G 一般、M 突變、P 傳球、S 力量、T 特性
  // 格式：英文名|中文名|類別|說明
  const SKILL_TABLE = `
Catch|接球|A|接球失敗時可以重擲。
Diving Catch|飛撲接球|A|傳球、界外球或開球落在擒抱區內時可以撲接；站在傳球目標格接球時 +1。
Diving Tackle|飛撲擒抱|A|對手閃避或跳躍離開擒抱區時，可讓對方檢定 -2，自己倒在對方離開的格子。
Dodge|閃避|A|每回合一次可重擲失敗的閃避；被阻擋擲出「踉蹌」時只會被推開。
Defensive|防守專家|A|對手回合中，被此球員盯防的對手不能使用護衛（Guard）或補踢（Put the Boot In）。
Hit and Run|打了就跑|A|阻擋或刺擊後，可以無視擒抱區免費移動 1 格，且移動後不能盯防任何人。
Jump Up|彈跳起身|A|倒地時可免費站起；也可以在倒地時宣告阻擋，敏捷檢定 +1 成功就起身阻擋。
Leap|飛躍|A|移動時可飛越任何一個相鄰格；跳躍的負面修正減少 1（最少 -1）。
Safe Pair of Hands|穩妥雙手|A|持球被擊倒或倒地前，可把球放到相鄰空格，而不是讓球彈開。
Sidestep|側步|A|被推開時由自己選擇推往哪個相鄰空格。
Sprint|衝刺|A|每次移動可以多衝刺（Rush）1 次。
Sure Feet|穩腳|A|每回合一次可重擲失敗的衝刺。
Dirty Player|骯髒球員|D|犯規時護甲或傷害擲骰 +1。
Eye Gouge|挖眼|D|被此球員推開的對手，在下次行動前不能提供協助。
Fumblerooski|假掉球|D|持球移動時，可以把球留在離開的格子，不算失誤。
Lethal Flight|致命飛行|D|被投擲並撞倒落點的對手時，護甲或傷害擲骰 +1。
Lone Fouler|獨行犯規者|D|犯規時若雙方都沒有協助，可重擲護甲擲骰。
Pile Driver|打樁機|D|阻擋擊倒對手後，可以免費對他犯規，之後自己倒地並結束行動。
Put the Boot In|補踢|D|隊友犯規時，即使被盯防也能提供協助。
Quick Foul|快速犯規|D|犯規後行動不會結束，可以用剩下的移動力繼續移動。
Saboteur|破壞者|D|被阻擋擊倒時擲 D6，4+ 武器爆炸讓對手也倒地，自己直接昏迷。
Shadowing|如影隨形|D|對手閃避離開擒抱區時擲 D6，4+ 就跟進到對方離開的格子。
Sneaky Git|奸詐|D|犯規時護甲擲出對子但沒破甲，不會被罰下場。
Violent Innovator|暴力創新者|D|用特殊行動造成傷亡時獲得明星點數（聯賽用）。
Block|格擋|G|擲出「雙方倒地」時可以選擇不倒地。
Dauntless|無畏|G|阻擋力量較高的對手時擲 D6+力量，超過對方力量就視為同力量。
Fend|擋開|G|被阻擋推開時，對手不能跟進。
Frenzy|狂暴|G|必須跟進；對手被推開後仍站著時，必須再阻擋一次。
Kick|開球手|G|擔任開球球員時，偏移距離可改為 D3。
Pro|職業球員|G|行動中可嘗試重擲一顆骰子，先擲 3+ 才能重擲。
Steady Footing|穩健步伐|G|即將被擊倒或摔倒時擲 D6，擲出 6 就不會倒地，也不算失誤。
Strip Ball|抄球|G|阻擋持球對手並推開他時，對方會在被推到的格子掉球。
Sure Hands|穩手|G|撿球失敗可以重擲（保球行動除外）；對手的抄球對他無效。
Tackle|擒抱|G|閃避離開此球員擒抱區的對手不能用閃避技能；阻擋擲出踉蹌時對方的閃避無效。
Taunt|挑釁|G|被阻擋推開時，可以強迫對手跟進。
Wrestle|摔角|G|擲出「雙方倒地」時可以讓雙方都直接倒地，不擲護甲。
Big Hand|大手|M|撿球時無視所有負面修正。
Claws|利爪|M|阻擋擊倒對手時，護甲擲出 8 以上一定破甲。
Disturbing Presence|擾人存在|M|3 格內的對手傳球、投擲、攔截、接球 -1。
Extra Arms|多臂|M|接球、撿球、攔截 +1。
Foul Appearance|醜陋外表|M|對手要阻擋或用特殊行動針對他時先擲 D6，擲出 1 就取消並結束行動。
Horns|尖角|M|閃擊時力量 +1。
Iron Hard Skin|鐵皮|M|對手對他擲護甲時不能加任何修正，利爪也無效。
Monstrous Mouth|血盆大口|M|可用「咬住」特殊行動，3+ 讓被盯防的對手無法離開格子；抄球對他無效。
Prehensile Tail|卷尾|M|對手閃避或跳躍離開他的擒抱區時再 -1。
Tentacles|觸手|M|對手閃避或跳躍離開擒抱區時擲 D6+己方力量-對方力量，6 以上對方被留在原地。
Two Heads|雙頭|M|閃避 +1。
Very Long Legs|超長腿|M|跳躍 +1、攔截 +2，並無視破雲高傳。
Accurate|精準|P|快傳和短傳 +1。
Cannoneer|加農砲|P|長傳和長炸彈 +1。
Cloud Burster|破雲高傳|P|他傳球時對手不能攔截。
Dump-off|緊急出手|P|被阻擋或被特殊行動針對前，可以先快傳出去，不會造成失誤。
Give and Go|傳了就跑|P|快傳或手遞成功後，可以繼續用剩下的移動力移動。
Hail Mary Pass|萬福瑪麗傳球|P|可以把球丟向場上任何一格，當成長炸彈且最多只算不準，也不能被攔截。
Leader|領袖|P|半場開始時若在場上，球隊多一次領袖重擲。
Nerves of Steel|鋼鐵神經|P|接球和傳球時無視被盯防的減值。
On the Ball|眼觀四方|P|對手傳球時可先移動最多 3 格；開球時接球方一名球員也可以移動。
Pass|傳球|P|傳球失敗時可以重擲。
Punt|踢球|P|可用特殊行動把球往前踢。
Safe Pass|安全傳球|P|傳球擲出自然 1 時不會失手；保留持球、行動結束，不算失誤。
Arm Bar|鎖臂|S|對手閃避或跳躍離開擒抱區而摔倒時，護甲或傷害擲骰 +1。
Brawler|鬥毆者|S|阻擋時可以重擲一顆「雙方倒地」。
Break Tackle|突破|S|每回合一次閃避時加值：力量 3 以下 +1、力量 4 +2、力量 5 以上 +3。
Bullseye|正中紅心|S|投擲隊友精準時，隊友直接落在目標格不偏移。
Grab|抓取|S|阻擋推人時可推往對手任一相鄰空格，對手也不能用側步。
Guard|護衛|S|即使被盯防也能在阻擋中提供協助。
Juggernaut|攻城槌|S|閃擊時「雙方倒地」可當成推開，對手不能用擋開、站穩、摔角。
Mighty Blow|重擊|S|阻擋擊倒對手時，護甲或傷害擲骰 +1。
Multiple Block|多重阻擋|S|可同時阻擋兩名對手，但力量各 -2 且不能跟進。
Stand Firm|站穩|S|被推開時可以選擇留在原地。
Strong Arm|強臂|S|投擲隊友時 +1。
Thick Skull|硬頭殼|S|傷害擲骰 8 只會被擊暈（小不點則是 7）。
Always Hungry|永遠很餓|T|投擲隊友前擲 D6，擲出 1 可能把隊友吃掉。
Animal Savagery|野性難馴|T|啟動時擲 D6（阻擋/閃擊 +2），1–3 會攻擊旁邊的隊友。
Animosity|敵意|T|傳球或手遞給特定隊友時擲 D6，擲出 1 就拒絕並結束行動。
Ball & Chain|鏈球|T|只能用鏈球行動，方向隨機移動，撞到人就阻擋；倒地時直接擲傷害。
Bloodlust|嗜血|T|啟動時擲 D6（阻擋/閃擊 +1），失敗則行動結束時要咬相鄰的血奴，否則失誤。
Bombardier|投彈手|T|可用特殊行動丟炸彈。
Bone Head|木頭腦袋|T|啟動時擲 D6，擲出 1 就分心。
Breathe Fire|噴火|T|可對盯防的對手噴火，4+ 讓對方倒地。
Chainsaw|電鋸|T|可用電鋸攻擊，2+ 對被盯防的對手擲護甲 +3；擲出 1 自己倒地。
Decay|腐朽|T|對他擲傷亡表時 +1。
Drunkard|醉漢|T|衝刺時 -1。
Hatred|仇恨|T|阻擋特定種族時可以重擲一顆「攻方倒地」。
Hypnotic Gaze|催眠凝視|T|可移動後對相鄰對手凝視，3+ 讓對方分心。
Insignificant|微不足道|T|建隊時這種球員的數量不能超過其他球員。
Kick Team-mate|踢飛隊友|T|可以把隊友踢出去，像投擲隊友一樣。
Loner|獨行者|T|使用隊伍重擲前要擲出指定點數，失敗就浪費那次重擲。
My Ball|我的球|T|不能傳球或手遞，只會因為倒地等情況失去持球。
No Ball|無球|T|永遠不能持球；接球、撿球自動失敗，也不能攔截。
Pick-me-up|拉一把|T|對手回合結束時，3 格內倒地的隊友擲 D6，5+ 可以站起來。
Plague Ridden|瘟疫纏身|T|用阻擋殺死對手時，可以多一名線鋒（聯賽用）。
Pogo|彈簧高蹺|T|移動時可跳過一個相鄰格，跳躍無視所有負面修正。
Projectile Vomit|噴吐|T|可對相鄰對手噴吐，2+ 對他擲護甲；擲出 1 噴到自己。
Really Stupid|超級笨蛋|T|啟動時擲 D6（旁邊有清醒隊友 +2），1–3 就分心。
Regeneration|再生|T|受傷離場前擲 D6，4+ 回到替補席。
Right Stuff|可投擲|T|可以被隊友投擲，倒地時也可以。
Secret Weapon|秘密武器|T|有上場的推進結束時會被罰下場。
Stab|刺擊|T|可刺擊相鄰對手，直接擲護甲（不能修正）。
Stunty|小不點|T|閃避時無視被盯防的減值；攔截 -1；使用小不點傷害表。
Swoop|俯衝|T|被投擲時可改用界外球模板決定落點，落地可重擲。
Take Root|生根|T|啟動時擲 D6，擲出 1 就生根，不能移動也不會被推開。
Throw Team-mate|投擲隊友|T|可以把相鄰、有「可投擲」的隊友丟出去。
Timmm-ber!|倒囉！|T|移動力 2 以下站起來時，每個相鄰空閒隊友 +1。
Titchy|迷你|T|閃避 +1；對手閃避進入他的擒抱區時不受他的減值。
Trickster|詭術師|T|被阻擋或被特殊行動針對前，可以瞬移到攻擊者旁邊的另一格。
Unchannelled Fury|狂怒失控|T|啟動時擲 D6（阻擋/閃擊 +2），1–3 就呆站著結束行動。
Unsteady|站不穩|T|不能宣告保球行動。
Grab|抓取|S|阻擋推人時可推往對手任一相鄰空格，對手也不能用側步。
`;
  BB.SKILLS = {};
  BB.SKILL_ZH = {};
  BB.SKILL_CAT = {};
  for (const line of SKILL_TABLE.trim().split('\n')) {
    const [en, zh, cat, desc] = line.split('|');
    BB.SKILLS[en] = desc; BB.SKILL_ZH[en] = zh; BB.SKILL_CAT[en] = cat;
  }
  BB.CAT_ZH = { A: '敏捷', D: '詭計', G: '一般', M: '突變', P: '傳球', S: '力量', T: '特性' };

  // 解析「Loner (4+)」這類帶參數的技能
  BB.parseSkill = function (s) {
    const m = /^(.*?) \((.*)\)$/.exec(s);
    return m ? { name: m[1], param: m[2] } : { name: s, param: null };
  };

  // ---------- 聯賽與球隊特殊規則 ----------
  BB.LEAGUE_ZH = {
    'Lustrian Superleague': '盧斯特里亞超級聯賽', 'Badlands Brawl': '荒地亂鬥', 'Old World Classic': '舊世界經典賽',
    'Chaos Clash': '混沌衝突', 'Elven Kingdoms League': '精靈王國聯賽', 'Worlds Edge Superleague': '世界邊緣超級聯賽',
    'Halfling Thimble Cup': '半身人頂針盃', 'Woodland League': '林地聯賽', 'Underworld Challenge': '地底挑戰賽',
    'Sylvanian Spotlight': '希爾瓦尼亞聚光燈'
  };
  BB.TEAM_RULES = {
    'Team Captain': ['隊長', '建隊時指定一名非大塊頭球員為隊長，免費獲得職業球員；隊長在場上時使用隊伍重擲，擲出 6 則不消耗重擲。'],
    "Brawlin' Brutes": ['鬥毆蠻漢', '聯賽中造成傷亡得 3 點、達陣得 2 點明星點數（單場比賽沒有影響）。'],
    'Bribery and Corruption': ['賄賂與腐敗', '每場一次，爭辯判決擲出 1 時可以重擲。'],
    'Favoured of...': ['受混沌眷顧', '建隊時選擇效忠的混沌神，會影響可雇用的明星球員。'],
    'Favoured of Hashut': ['受哈舒特眷顧', '影響可雇用的明星球員。'],
    'Favoured of Khorne': ['受恐虐眷顧', '影響可雇用的明星球員。'],
    'Favoured of Nurgle': ['受納垢眷顧', '影響可雇用的明星球員。'],
    'Favoured of Slaanesh': ['受色孽眷顧', '影響可雇用的明星球員。'],
    'Favoured of Tzeentch': ['受奸奇眷顧', '影響可雇用的明星球員。'],
    'Favoured of Undivided': ['受混沌眾神眷顧', '影響可雇用的明星球員。'],
    'Favoured of Khorne (Chaos Clash)': ['受恐虐眷顧（混沌衝突）', '參加混沌衝突聯賽時效忠恐虐。'],
    'Low Cost Linemen': ['廉價線鋒', '聯賽計算球隊身價時線鋒不計（單場比賽沒有影響）。'],
    'Masters of Undeath': ['不死大師', '每場一次，對手被殺死時可以多一名線鋒（聯賽用）。'],
    'Swarming': ['蜂擁而至', '雙方布陣後，可以額外派上 D3 名線鋒，場上可超過 11 人。']
  };

  // ---------- 球隊 ----------
  // 標頭：#key|中文名|英文名|等級|聯賽(;分隔)|特殊規則(;分隔)|重擲費用|隊醫(1/0)|大塊頭上限|主色|副色
  // 位置：上限|key|中文名|英文名|縮寫|關鍵字|MA|ST|AG|PA|AV|技能(,分隔)|主修|副修|費用|*(大塊頭共用上限)
  const TEAM_TABLE = `
#amazon|亞馬遜|Amazon|1|Lustrian Superleague||60|1|0|#2e7d32|#f9a825
16|eagle|鷹戰士|Eagle Warrior|L|Lineman,Human|6|3|3+|4+|8+|Dodge|G|A S|50
2|python|巨蟒戰士|Python Warrior|T|Thrower,Human|6|3|3+|3+|8+|Dodge,On the Ball,Pass,Safe Pass|G P|A S|80
2|piranha|食人魚戰士|Piranha Warrior|B|Blitzer,Human|7|3|3+|4+|8+|Dodge,Hit and Run,Jump Up|A G|S|90
2|jaguar|美洲豹戰士|Jaguar Warrior|J|Blocker,Human|6|4|3+|4+|9+|Defensive,Dodge|G S|A|110
#blackorc|黑獸人|Black Orc|3|Badlands Brawl|Bribery and Corruption;Brawlin' Brutes|60|1|0|#263238|#ff6f00
16|bruiser|哥布林打手|Goblin Bruiser|g|Lineman,Goblin|6|2|3+|4+|8+|Dodge,Right Stuff,Stunty,Thick Skull|A D|G P S|45
6|blackorc|黑獸人|Black Orc|O|Blocker,Orc|4|4|4+|5+|10+|Brawler,Grab|G S|A D|90
1|troll|受訓巨魔|Trained Troll|R|Big Guy,Troll|4|5|5+|5+|10+|Always Hungry,Mighty Blow,Projectile Vomit,Really Stupid,Regeneration,Throw Team-mate|S|A G P|115
#bretonnian|布列塔尼亞|Bretonnian|2|Old World Classic||60|1|0|#1565c0|#c62828
16|squire|侍從|Bretonnian Squire|L|Lineman,Human|6|3|3+|4+|8+|Wrestle|G|A S|50
2|kcatcher|騎士接球手|Bretonnian Knight Catcher|C|Catcher,Human|7|3|3+|4+|9+|Catch,Dauntless,Nerves of Steel|A G|S|85
2|kthrower|騎士投手|Bretonnian Knight Thrower|T|Thrower,Human|6|3|3+|3+|9+|Dauntless,Nerves of Steel,Pass|G P|A S|80
2|grail|聖杯騎士|Grail Knight|G|Blitzer,Human|7|3|3+|4+|10+|Block,Dauntless,Steady Footing|G S|A|95
#chaoschosen|混沌選民|Chaos Chosen|3|Chaos Clash|Favoured of...|50|1|1|#5d1010|#9e9e9e
16|beastman|野獸人線鋒|Beastman Lineman|L|Lineman,Beastman|6|3|3+|3+|9+|Horns,Thick Skull|G M|A P S D|55
4|chosen|混沌選民|Chaos Chosen|C|Blocker,Human|5|4|3+|5+|10+|Arm Bar|G M S|A D|100
1|troll|巨魔|Troll|R|Big Guy,Troll|4|5|5+|5+|10+|Always Hungry,Loner (4+),Mighty Blow,Projectile Vomit,Really Stupid,Regeneration,Throw Team-mate|M S|A G P|115|*
1|ogre|食人魔|Ogre|O|Big Guy,Ogre|5|5|4+|5+|10+|Bone Head,Loner (4+),Mighty Blow,Thick Skull,Throw Team-mate|M S|A G|140|*
1|minotaur|牛頭人|Minotaur|M|Big Guy,Minotaur|5|5|4+|6+|9+|Frenzy,Horns,Loner (4+),Mighty Blow,Thick Skull,Unchannelled Fury|M S|A G|150|*
#chaosdwarf|混沌矮人|Chaos Dwarf|1|Badlands Brawl;Chaos Clash|Favoured of Hashut|70|1|0|#4e342e|#ff7043
16|hobgoblin|大哥布林線鋒|Hobgoblin Lineman|L|Lineman,Goblin|6|3|3+|4+|8+||D|A G S|40
2|stabba|偷刺客|Sneaky Stabba|S|Special,Goblin|6|3|3+|5+|8+|Shadowing,Stab|D G|A S|60
4|cdblocker|混沌矮人阻擋者|Chaos Dwarf Blocker|D|Blocker,Dwarf|4|3|4+|6+|10+|Block,Iron Hard Skin,Thick Skull|G S|A D M|70
2|flamesmith|火焰鐵匠|Flamesmith|F|Special,Dwarf|5|3|4+|6+|10+|Brawler,Breathe Fire,Disturbing Presence,Thick Skull|G S|A D M|80
2|centaur|牛人馬|Bull Centaur|B|Blitzer,Dwarf|6|4|4+|6+|10+|Sprint,Sure Feet,Thick Skull,Unsteady|G S|A D M|130
1|minotaur|牛頭人|Minotaur|M|Big Guy,Minotaur|5|5|4+|6+|9+|Frenzy,Horns,Loner (4+),Mighty Blow,Thick Skull,Unchannelled Fury|M S|A G|150
#renegades|混沌叛軍|Chaos Renegades|3|Chaos Clash|Favoured of...|70|1|3|#6a1b9a|#c0ca33
16|human|叛軍人類|Renegade Human|L|Lineman,Human|6|3|3+|4+|9+|Animosity (All)|D G M|A S|50
1|goblin|叛軍哥布林|Renegade Goblin|g|Goblin,Lineman|6|2|3+|4+|8+|Animosity (All),Dodge,Right Stuff,Stunty|A D M|G P|40
1|orc|叛軍獸人|Renegade Orc|O|Lineman,Orc|5|3|3+|4+|10+|Animosity (All)|D G M|A S|50
1|skaven|叛軍鼠人|Renegade Skaven|S|Lineman,Skaven|7|3|3+|4+|8+|Animosity (All)|D G M|A S|50
1|darkelf|叛軍黑暗精靈|Renegade Dark Elf|E|Elf,Lineman|6|3|2+|3+|9+|Animosity (All)|A D G M|S|65
1|thrower|叛軍人類投手|Renegade Human Thrower|T|Human,Thrower|6|3|3+|3+|9+|Animosity (All),Pass,Sure Hands|D G M P|A S|75
1|troll|巨魔|Troll|R|Big Guy,Troll|4|5|5+|5+|10+|Always Hungry,Loner (4+),Mighty Blow,Projectile Vomit,Really Stupid,Regeneration,Throw Team-mate|S|A G M P|115|*
1|ogre|食人魔|Ogre|M|Big Guy,Ogre|5|5|4+|5+|10+|Bone Head,Loner (3+),Mighty Blow,Thick Skull,Throw Team-mate|S|A G M|140|*
1|minotaur|牛頭人|Minotaur|N|Big Guy,Minotaur|5|5|4+|6+|9+|Frenzy,Horns,Loner (4+),Mighty Blow,Thick Skull,Unchannelled Fury|S|A G M|150|*
1|ratogre|鼠魔|Rat Ogre|Q|Big Guy,Skaven|6|5|4+|6+|9+|Animal Savagery,Frenzy,Loner (4+),Mighty Blow,Prehensile Tail|S|A G M|150|*
#darkelf|黑暗精靈|Dark Elf|1|Elven Kingdoms League||50|1|0|#311b92|#b71c1c
16|lineman|黑暗精靈線鋒|Dark Elf Lineman|L|Lineman,Elf|6|3|2+|3+|9+||A G|S D|65
2|runner|黑暗精靈跑鋒|Dark Elf Runner|R|Runner,Elf|7|3|2+|3+|8+|Dump-off,Punt|A G P|S D|80
2|assassin|刺客|Dark Elf Assassin|A|Special,Elf|7|3|2+|4+|8+|Hit and Run,Shadowing,Stab|A D|G S|90
2|blitzer|黑暗精靈閃擊手|Dark Elf Blitzer|B|Blitzer,Elf|7|3|2+|3+|9+|Block|A G|P S D|105
2|witch|巫精靈|Witch Elf|W|Special,Elf|7|3|2+|4+|8+|Dodge,Frenzy,Jump Up|A G|S D|110
#dwarf|矮人|Dwarf|2|Worlds Edge Superleague|Brawlin' Brutes;Bribery and Corruption|60|1|0|#b71c1c|#455a64
16|lineman|矮人線鋒|Dwarf Lineman|L|Lineman,Dwarf|4|3|4+|5+|10+|Block,Defensive,Thick Skull|D G|S|70
2|runner|矮人跑鋒|Dwarf Runner|R|Runner,Dwarf|6|3|3+|4+|9+|Sprint,Sure Hands,Thick Skull|G P|A S|80
2|blitzer|矮人閃擊手|Dwarf Blitzer|B|Blitzer,Dwarf|5|3|4+|4+|10+|Block,Diving Tackle,Tackle,Thick Skull|G S|P|100
2|slayer|巨魔殺手|Troll Slayer|S|Special,Dwarf|5|3|4+|5+|9+|Block,Dauntless,Frenzy,Hatred (Troll),Thick Skull|G S|D|95
1|deathroller|死亡壓路機|Deathroller|D|Big Guy,Dwarf,Special|5|7|5+|-|11+|Break Tackle,Dirty Player,Juggernaut,Loner (4+),Mighty Blow,No Ball,Secret Weapon,Stand Firm|D S|G|170
#elvenunion|精靈聯盟|Elven Union|2|Elven Kingdoms League||50|1|0|#00838f|#ffd54f
16|lineman|精靈線鋒|Elf Lineman|L|Lineman,Elf|6|3|2+|3+|8+|Fumblerooski|A G|S|65
2|thrower|精靈投手|Elf Thrower|T|Thrower,Elf|6|3|2+|2+|8+|Hail Mary Pass,Pass|A G P|S|75
2|catcher|精靈接球手|Elf Catcher|C|Catcher,Elf|8|3|2+|4+|8+|Catch,Diving Catch,Nerves of Steel|A G|S|100
2|blitzer|精靈閃擊手|Elf Blitzer|B|Blitzer,Elf|7|3|2+|3+|9+|Block,Sidestep|A G|P S|115
#gnome|地侏|Gnome|4|Halfling Thimble Cup;Woodland League||50|1|0|#558b2f|#8d6e63
16|lineman|地侏線鋒|Gnome Lineman|L|Lineman,Gnome|5|2|3+|4+|7+|Jump Up,Right Stuff,Stunty,Wrestle|A|G S D|40
2|fox|林地狐狸|Woodland Fox|F|Runner,Animal|7|2|2+|-|6+|Dodge,My Ball,Sidestep,Stunty|-|A|50
2|illusionist|地侏幻術師|Gnome Illusionist|I|Special,Gnome|5|2|3+|3+|7+|Jump Up,Stunty,Trickster,Wrestle|A P|G D|50
2|beastmaster|地侏馴獸師|Gnome Beastmaster|M|Blocker,Gnome|5|2|3+|4+|8+|Guard,Jump Up,Stunty,Wrestle|A|D G S|55
2|treeman|阿爾騰森林樹人|Altern Forest Treeman|T|Big Guy,Treeman|2|6|5+|5+|11+|Mighty Blow,Stand Firm,Strong Arm,Take Root,Thick Skull,Throw Team-mate,Timmm-ber!|S|A G P|120
#goblin|哥布林|Goblin|4|Badlands Brawl;Underworld Challenge|Bribery and Corruption|60|1|0|#6a1b9a|#f9a825
16|lineman|哥布林線鋒|Goblin Lineman|g|Goblin,Lineman|6|2|3+|4+|8+|Dodge,Right Stuff,Stunty|A D|G P S|40
1|looney|瘋子|Looney|Y|Goblin,Special|6|2|3+|-|8+|Chainsaw,No Ball,Secret Weapon,Stunty|D|A G S|40
1|bomma|炸彈手|Bomma|X|Goblin,Special|6|2|3+|4+|8+|Bombardier,Dodge,Secret Weapon,Stunty|D P|A G S|45
1|ooligan|流氓|'Ooligan|O|Goblin,Special|6|2|3+|5+|8+|Dirty Player,Disturbing Presence,Dodge,Right Stuff,Stunty,Taunt|A D|G S|60
1|diver|末日飛人|Doom Diver|V|Goblin,Special|6|2|3+|6+|8+|Dodge,Right Stuff,Stunty,Swoop|A|D G S|65
1|fanatic|狂熱者|Fanatic|F|Goblin,Special|3|7|3+|-|8+|Ball & Chain,No Ball,Secret Weapon,Stunty|D S|A G|70
1|pogoer|彈簧高蹺手|Pogoer|P|Goblin,Special|7|2|3+|4+|8+|Dodge,Pogo,Stunty|A|D G S|75
2|troll|受訓巨魔|Trained Troll|R|Big Guy,Troll|4|5|5+|5+|10+|Always Hungry,Mighty Blow,Projectile Vomit,Really Stupid,Regeneration,Throw Team-mate|S|A G P|115
#halfling|半身人|Halfling|4|Halfling Thimble Cup;Woodland League||60|1|0|#ef6c00|#33691e
16|hopeful|半身人新秀|Halfling Hopeful|h|Lineman,Halfling|5|2|3+|4+|7+|Dodge,Right Stuff,Stunty|A|G S D|30
2|hefty|半身人壯漢|Halfling Hefty|H|Blocker,Halfling|5|2|3+|3+|8+|Dodge,Fend,Stunty|A P|G S D|50
2|catcher|半身人接球手|Halfling Catcher|C|Catcher,Halfling|5|2|3+|4+|7+|Catch,Dodge,Right Stuff,Sprint,Stunty|A|G S D|55
2|treeman|艾瑟森林樹人|Athel Forest Treeman|T|Big Guy,Treeman|2|6|5+|5+|11+|Mighty Blow,Stand Firm,Strong Arm,Take Root,Thick Skull,Throw Team-mate,Timmm-ber!|S|A G P D|120
#highelf|高等精靈|High Elf|1|Elven Kingdoms League||50|1|0|#efe6c8|#1565c0
16|lineman|高等精靈線鋒|High Elf Lineman|L|Lineman,Elf|6|3|2+|3+|9+||A G|S|65
2|phoenix|神凰修羅|Phoenix Warrior|T|Thrower,Elf|6|3|2+|2+|9+|Cloud Burster,Pass,Safe Pass|A G P|S|90
2|dragon|真龍皇子|Dragon Prince|D|Blitzer,Elf,Runner|8|3|2+|4+|9+|Block,My Ball,Steady Footing|A G|S|110
2|lion|蒼白雄獅|White Lion|W|Blitzer,Elf|7|3|2+|3+|9+|Claws,Wrestle|A G|P S|110
#human|人類|Human|2|Old World Classic|Team Captain|50|1|0|#1f5fbf|#d9d9d9
16|lineman|人類線鋒|Human Lineman|L|Lineman,Human|6|3|3+|4+|9+||G|A D S|50
3|halfling|半身人新秀|Halfling Hopeful|h|Lineman,Halfling|5|2|3+|4+|7+|Dodge,Right Stuff,Stunty|A|D G S|30
2|catcher|人類接球手|Human Catcher|C|Catcher,Human|8|3|3+|4+|8+|Catch,Dodge|A G|D P S|75
2|thrower|人類投手|Human Thrower|T|Thrower,Human|6|3|3+|3+|9+|Pass,Sure Hands|G P|A D S|75
2|blitzer|人類閃擊手|Human Blitzer|B|Blitzer,Human|7|3|3+|4+|9+|Block,Tackle|G S|A D|85
1|ogre|食人魔|Ogre|O|Big Guy,Ogre|5|5|4+|5+|10+|Bone Head,Loner (3+),Mighty Blow,Thick Skull,Throw Team-mate|S|A G M|140
#imperial|帝國貴族|Imperial Nobility|2|Old World Classic||60|1|0|#4a148c|#fbc02d
16|retainer|帝國侍從|Imperial Retainer|L|Lineman,Human|6|3|3+|4+|8+|Fend|G|A S|45
2|thrower|帝國投手|Imperial Thrower|T|Thrower,Human|6|3|3+|2+|9+|Give and Go,Pass,Pro|G P|A S|75
4|bodyguard|保鏢|Bodyguard|K|Blocker,Human|5|3|3+|4+|9+|Stand Firm,Wrestle|G S|A|85
2|noble|貴族閃擊手|Noble Blitzer|B|Blitzer,Human|7|3|3+|4+|9+|Block,Catch,Pro|A G|P S|90
1|ogre|食人魔|Ogre|O|Big Guy,Ogre|5|5|4+|5+|10+|Bone Head,Loner (3+),Mighty Blow,Thick Skull,Throw Team-mate|S|A G M|140
#khorne|恐虐|Khorne|3|Chaos Clash|Favoured of Khorne;Brawlin' Brutes|60|1|0|#b71c1c|#212121
16|marauder|血生掠奪者|Bloodborn Marauder|L|Lineman,Human|6|3|3+|4+|8+|Frenzy|G M|A S D|50
2|khorngor|恐虐角獸|Khorngor|K|Runner,Beastman|6|3|3+|4+|9+|Horns,Juggernaut,Jump Up,Thick Skull|G M S|A P D|70
4|bloodseeker|嗜血者|Bloodseeker|S|Blocker,Human|5|4|4+|6+|10+|Frenzy|G M S|A D|105
1|bloodspawn|血之魔物|Bloodspawn|X|Big Guy,Spawn|5|5|4+|6+|9+|Claws,Frenzy,Loner (4+),Mighty Blow,Unchannelled Fury|M S|A G|160
#lizardmen|蜥蜴人|Lizardmen|1|Lustrian Superleague||70|1|0|#00695c|#ffb300
16|skink|石蜥線鋒|Skink Lineman|k|Lineman,Lizardman|8|2|3+|4+|8+|Dodge,Stunty|A|G P S D|60
2|chameleon|變色石蜥|Chameleon Skink|C|Thrower,Lizardman|7|2|3+|3+|8+|Dodge,On the Ball,Shadowing,Stunty|A P|G S D|70
6|saurus|蜥人阻擋者|Saurus Blocker|S|Blocker,Lizardman|6|4|5+|6+|10+|Juggernaut,Unsteady|G S|A|90
1|kroxigor|巨蜥|Kroxigor|X|Big Guy,Lizardman|6|5|5+|6+|10+|Bone Head,Loner (4+),Mighty Blow,Prehensile Tail,Thick Skull|S|A G|140
#necro|死靈恐怖|Necromantic Horror|2|Sylvanian Spotlight|Masters of Undeath|70|0|0|#37474f|#7cb342
16|zombie|殭屍線鋒|Zombie Lineman|Z|Human,Lineman,Undead,Zombie|4|3|4+|6+|9+|Eye Gouge,Regeneration,Unsteady|D G|A S|40
2|ghoul|食屍鬼跑鋒|Ghoul Runner|G|Ghoul,Runner,Undead|7|3|3+|3+|8+|Dodge,Regeneration|A G|D P S|75
2|wraith|怨靈|Wraith|W|Blocker,Undead,Wraith|6|3|3+|-|9+|Block,Foul Appearance,No Ball,Regeneration,Sidestep|G S|A D|85
2|golem|血肉魔像|Flesh Golem|F|Blocker,Construct,Undead|4|4|4+|6+|10+|Regeneration,Stand Firm,Thick Skull,Unsteady|G S|A D|110
2|werewolf|狼人|Werewolf|X|Blitzer,Undead,Werewolf|8|3|3+|3+|9+|Claws,Frenzy,Regeneration|A G|D P S|120
#norse|諾斯|Norse|1|Old World Classic;Chaos Clash|Favoured of Khorne (Chaos Clash)|60|1|0|#0d47a1|#eceff1
16|raider|諾斯掠奪者|Norse Raider|L|Lineman,Human|6|3|3+|4+|8+|Block,Drunkard,Thick Skull,Unsteady|G|A P S|50
2|boar|啤酒野豬|Beer Boar|p|Special,Animal|5|1|3+|-|6+|Dodge,No Ball,Pick-me-up,Stunty,Titchy||A|20
2|berserker|狂戰士|Norse Berserker|B|Blitzer,Human|6|3|3+|5+|8+|Block,Frenzy,Jump Up|G S|A P|90
2|valkyrie|女武神|Valkyrie|V|Catcher,Human,Thrower|7|3|3+|3+|8+|Catch,Dauntless,Pass,Strip Ball|A G P|S|95
2|ulfwerener|狼化戰士|Ulfwerener|U|Blocker,Human|6|4|4+|6+|9+|Frenzy,Unsteady|G S|A|105
1|yhetee|雪怪|Yhetee|Y|Big Guy,Yhetee|5|5|4+|6+|9+|Claws,Disturbing Presence,Frenzy,Loner (4+),Unchannelled Fury|S|A G|140
#nurgle|納垢|Nurgle|3|Chaos Clash|Favoured of Nurgle;Brawlin' Brutes|60|0|0|#827717|#4e342e
16|rotter|腐朽者|Rotter|L|Lineman,Human|5|3|4+|6+|9+|Decay,Plague Ridden|G M D|A S|40
2|pestigor|瘟疫角獸|Pestigor|P|Runner,Beastman|6|3|3+|4+|9+|Horns,Plague Ridden,Regeneration,Steady Footing,Thick Skull|G M S|A P D|70
4|bloater|膨脹者|Bloater|B|Blocker,Human|4|4|4+|6+|10+|Disturbing Presence,Foul Appearance,Plague Ridden,Regeneration,Stand Firm,Unsteady|G M S|A D|110
1|rotspawn|腐爛魔物|Rotspawn|X|Big Guy,Spawn|4|5|5+|6+|10+|Disturbing Presence,Foul Appearance,Loner (4+),Mighty Blow,Pick-me-up,Plague Ridden,Really Stupid,Regeneration,Tentacles|S|G M D|140
#ogre|食人魔|Ogre|4|Badlands Brawl;Worlds Edge Superleague|Brawlin' Brutes;Low Cost Linemen|70|1|0|#795548|#ff8f00
16|gnoblar|諾布拉線鋒|Gnoblar Lineman|n|Gnoblar,Lineman|5|1|3+|4+|6+|Dodge,Right Stuff,Sidestep,Stunty,Titchy|A D|G|15
5|blocker|食人魔阻擋者|Ogre Blocker|O|Big Guy,Blocker,Ogre|5|5|4+|5+|10+|Bone Head,Mighty Blow,Thick Skull,Throw Team-mate|S|A D G P|140
1|punter|食人魔踢手|Ogre Runt Punter|P|Big Guy,Ogre,Thrower|5|5|4+|4+|10+|Bone Head,Kick Team-mate,Mighty Blow,Thick Skull|P S|A D G|145
#owa|舊世界聯盟|Old World Alliance|1|Old World Classic||70|1|1|#283593|#d84315
16|human|人類線鋒|Human Lineman|L|Lineman,Human|6|3|3+|4+|9+||G|A S|50
3|halfling|半身人新秀|Halfling Hopeful|h|Lineman,Halfling|5|2|3+|4+|7+|Dodge,Right Stuff,Stunty|A|G S|30
1|hcatcher|人類接球手|Human Catcher|C|Catcher,Human|8|3|3+|4+|8+|Catch,Dodge|A G|P S|75
3|dwarf|矮人線鋒|Dwarf Lineman|D|Lineman,Dwarf|4|3|4+|5+|10+|Block,Defensive,Thick Skull|G D|S|70
1|hthrower|人類投手|Human Thrower|T|Thrower,Human|6|3|3+|3+|9+|Pass,Sure Hands|G P|A S|75
1|drunner|矮人跑鋒|Dwarf Runner|R|Runner,Dwarf|6|3|3+|4+|9+|Sprint,Sure Hands,Thick Skull|G P|A S|80
1|hblitzer|人類閃擊手|Human Blitzer|B|Blitzer,Human|7|3|3+|4+|9+|Block,Tackle|G S|A|85
1|dblitzer|矮人閃擊手|Dwarf Blitzer|Z|Blitzer,Dwarf|5|3|4+|4+|10+|Block,Diving Tackle,Tackle,Thick Skull|G S|P|100
1|slayer|巨魔殺手|Troll Slayer|S|Special,Dwarf|5|3|4+|5+|9+|Block,Dauntless,Frenzy,Hatred (Troll),Thick Skull|G S|A|95
1|ogre|食人魔|Ogre|O|Big Guy,Ogre|5|5|4+|5+|10+|Bone Head,Loner (3+),Mighty Blow,Thick Skull,Throw Team-mate|S|A G|140|*
1|treeman|阿爾騰森林樹人|Altern Forest Treeman|E|Big Guy,Treeman|2|6|5+|5+|11+|Loner (4+),Mighty Blow,Stand Firm,Strong Arm,Take Root,Thick Skull,Throw Team-mate,Timmm-ber!|S|A G P|120|*
#orc|獸人|Orc|2|Badlands Brawl|Brawlin' Brutes;Team Captain|60|1|0|#2f7d32|#c62828
16|lineman|獸人線鋒|Orc Lineman|L|Lineman,Orc|5|3|3+|4+|10+||G S|A D|50
4|goblin|哥布林|Goblin Lineman|g|Lineman,Goblin|6|2|3+|4+|8+|Dodge,Right Stuff,Stunty|A D|G P S|40
2|thrower|獸人投手|Orc Thrower|T|Thrower,Orc|6|3|3+|3+|9+|Pass,Sure Hands|G P|A S D|75
2|blitzer|獸人閃擊手|Orc Blitzer|B|Blitzer,Orc|6|3|3+|4+|10+|Block,Break Tackle|G S|A D|85
2|bigun|大塊頭|Big Un Blocker|U|Blocker,Orc|5|4|4+|6+|10+|Mighty Blow,Taunt,Thick Skull,Unsteady|G S|A D|95
1|troll|巨魔|Troll|R|Big Guy,Troll|4|5|5+|5+|10+|Always Hungry,Loner (4+),Mighty Blow,Projectile Vomit,Really Stupid,Regeneration,Throw Team-mate|S|A G P|115
#undead|蹣跚不死|Shambling Undead|2|Sylvanian Spotlight|Masters of Undeath|70|0|0|#424242|#9ccc65
16|skeleton|骷髏線鋒|Skeleton Lineman|S|Human,Lineman,Skeleton,Undead|5|3|4+|6+|8+|Regeneration,Thick Skull|G|A D S|40
16|zombie|殭屍線鋒|Zombie Lineman|Z|Human,Lineman,Undead,Zombie|4|3|4+|6+|9+|Eye Gouge,Regeneration,Unsteady|D G|A S|40
2|ghoul|食屍鬼跑鋒|Ghoul Runner|G|Ghoul,Runner,Undead|7|3|3+|3+|8+|Dodge,Regeneration|A G|D P S|75
2|wight|屍妖閃擊手|Wight Blitzer|W|Blitzer,Human,Skeleton,Undead|6|3|3+|5+|9+|Block,Regeneration,Tackle,Thick Skull|G S|A D|95
2|mummy|木乃伊|Mummy|M|Big Guy,Blocker,Human,Undead|3|5|5+|6+|10+|Mighty Blow,Regeneration|S|A G|125
#skaven|鼠人|Skaven|2|Underworld Challenge||50|1|0|#5d4037|#e0e0e0
16|clanrat|氏族鼠|Skaven Clanrat|L|Lineman,Skaven|7|3|3+|4+|8+||G D|A M S|50
2|thrower|鼠人投手|Skaven Thrower|T|Thrower,Skaven|7|3|3+|2+|8+|Pass,Sure Hands|G P|A D M S|80
2|runner|溝渠奔跑者|Gutter Runner|G|Runner,Skaven|9|2|2+|4+|8+|Dodge,Stab|A G D|M S|85
2|blitzer|鼠人閃擊手|Skaven Blitzer|B|Blitzer,Skaven|8|3|3+|4+|9+|Block,Strip Ball|G S|A D M|90
1|ratogre|鼠魔|Rat Ogre|O|Big Guy,Skaven|6|5|4+|6+|9+|Animal Savagery,Frenzy,Loner (4+),Mighty Blow,Prehensile Tail|S|A G M|150
#snotling|鼻涕精|Snotling|4|Underworld Challenge|Bribery and Corruption;Low Cost Linemen;Swarming|70|1|0|#9e9d24|#6d4c41
16|lineman|鼻涕精線鋒|Snotling Lineman|s|Lineman,Snotling|5|1|3+|4+|6+|Dodge,Insignificant,Right Stuff,Sidestep,Stunty,Titchy|A D|G|15
2|hoppa|跳跳鼻涕精|Fun-hoppa|P|Snotling,Special|6|1|3+|4+|6+|Dodge,Pogo,Right Stuff,Sidestep,Stunty|A D|G|20
2|stilty|高蹺跑手|Stilty Runna|R|Runner,Snotling|6|1|3+|4+|6+|Dodge,Right Stuff,Sidestep,Sprint,Stunty|A D|G|20
2|flinga|蘑菇投手|Fungus Flinga|F|Snotling,Special|5|1|3+|4+|6+|Bombardier,Dodge,Right Stuff,Secret Weapon,Sidestep,Stunty,Titchy|A D P|G|30
2|wagon|抽水車|Pump Wagon|W|Big Guy,Snotling,Special|5|5|5+|6+|9+|Dirty Player,Juggernaut,Mighty Blow,Really Stupid,Stand Firm|D S|A G|100
2|troll|受訓巨魔|Trained Troll|T|Big Guy,Troll|4|5|5+|5+|10+|Always Hungry,Mighty Blow,Projectile Vomit,Really Stupid,Regeneration,Throw Team-mate|S|A G P|115
#tombkings|古墓王|Tomb Kings|2|Sylvanian Spotlight|Masters of Undeath|60|0|0|#c8a951|#0277bd
16|skeleton|骷髏線鋒|Skeleton Lineman|S|Human,Lineman,Skeleton,Undead|5|3|4+|6+|8+|Regeneration,Thick Skull|G|A D S|40
2|thrower|古墓王投手|Tomb Kings Thrower|T|Human,Skeleton,Thrower,Undead|6|3|4+|3+|9+|Pass,Regeneration,Sure Hands,Thick Skull|G P|A D S|65
2|blitzer|古墓王閃擊手|Tomb Kings Blitzer|B|Blitzer,Human,Skeleton,Undead|6|3|4+|5+|9+|Block,Regeneration,Thick Skull|G S|A D|85
4|guardian|古墓守衛|Tomb Guardian|G|Big Guy,Blocker,Human,Undead|4|5|5+|6+|10+|Brawler,Decay,Regeneration|S|A G|115
#underworld|地底居民|Underworld Denizens|1|Underworld Challenge|Bribery and Corruption|70|1|1|#33691e|#aa00ff
16|goblin|哥布林線鋒|Goblin Lineman|g|Goblin,Lineman|6|2|3+|4+|8+|Dodge,Right Stuff,Stunty|A D M|G P S|40
6|snotling|鼻涕精線鋒|Snotling Lineman|s|Lineman,Snotling|5|1|3+|4+|6+|Dodge,Insignificant,Right Stuff,Sidestep,Stunty,Titchy|A D M|G|15
3|clanrat|氏族鼠|Skaven Clanrat|L|Lineman,Skaven|7|3|3+|4+|8+|Animosity (Goblin)|G M D|A S|50
1|thrower|鼠人投手|Skaven Thrower|T|Skaven,Thrower|7|3|3+|2+|8+|Animosity (Goblin),Pass,Sure Hands|G M P|A D S|80
1|runner|溝渠奔跑者|Gutter Runner|G|Runner,Skaven|9|2|2+|4+|8+|Animosity (Goblin),Dodge,Stab|A G M D|S|85
1|blitzer|鼠人閃擊手|Skaven Blitzer|B|Blitzer,Skaven|8|3|3+|4+|9+|Animosity (Goblin),Block,Strip Ball|G M S|A P|90
1|troll|巨魔|Troll|R|Big Guy,Troll|4|5|5+|5+|10+|Always Hungry,Loner (4+),Mighty Blow,Projectile Vomit,Really Stupid,Regeneration,Throw Team-mate|M S|A G P|115|*
1|ratogre|鼠魔|Rat Ogre|O|Big Guy,Skaven|6|5|4+|6+|9+|Animal Savagery,Frenzy,Loner (4+),Mighty Blow,Prehensile Tail|M S|A G|150|*
#vampire|吸血鬼|Vampire|2|Sylvanian Spotlight|Masters of Undeath|60|1|0|#880e4f|#212121
16|thrall|血奴線鋒|Thrall Lineman|L|Human,Lineman,Thrall|6|3|3+|4+|8+||G|A S|40
2|runner|吸血鬼跑鋒|Vampire Runner|R|Runner,Undead,Vampire|8|3|2+|3+|8+|Bloodlust (2+),Hypnotic Gaze,Regeneration|A G|P S|100
2|thrower|吸血鬼投手|Vampire Thrower|T|Thrower,Undead,Vampire|6|4|2+|2+|9+|Bloodlust (2+),Hypnotic Gaze,Pass,Regeneration|A G P|S|110
2|blitzer|吸血鬼閃擊手|Vampire Blitzer|B|Blitzer,Undead,Vampire|6|4|2+|4+|9+|Bloodlust (3+),Hypnotic Gaze,Juggernaut,Regeneration|A G S||110
1|vargheist|吸血魔|Vargheist|V|Big Guy,Undead,Vampire|5|5|4+|6+|10+|Bloodlust (3+),Claws,Frenzy,Loner (4+),Regeneration|S|A G|150
#woodelf|木精靈|Wood Elf|1|Elven Kingdoms League;Woodland League||50|1|0|#558b2f|#fff176
16|lineman|木精靈線鋒|Wood Elf Lineman|L|Lineman,Elf|7|3|2+|3+|8+||A G|S|65
2|thrower|木精靈投手|Wood Elf Thrower|T|Thrower,Elf|7|3|2+|2+|8+|Pass,Safe Pair of Hands|A G P|S|85
2|catcher|木精靈接球手|Wood Elf Catcher|C|Catcher,Elf|8|2|2+|3+|8+|Catch,Dodge,Sprint|A G|P S|90
2|wardancer|戰舞者|Wardancer|W|Blitzer,Elf|8|3|2+|3+|8+|Block,Dodge,Leap|A G|P S|130
1|treeman|洛倫森林樹人|Loren Forest Treeman|E|Big Guy,Treeman|2|6|5+|5+|11+|Loner (4+),Mighty Blow,Stand Firm,Strong Arm,Take Root,Thick Skull,Throw Team-mate|S|A G|120
`;

  const num = v => (v === '-' || v === '' ? null : parseInt(v, 10));
  BB.TEAMS = {};
  BB.TEAM_ORDER = [];
  const EN_TO_KEY = {};
  let cur = null;
  for (const line of TEAM_TABLE.trim().split('\n')) {
    const f = line.split('|');
    if (line[0] === '#') {
      const [key, zh, en, tier, leagues, rules, rr, apo, bigMax, c1, c2] = [f[0].slice(1), ...f.slice(1)];
      cur = {
        key, name: zh, nameEn: en, tier: +tier,
        leagues: leagues ? leagues.split(';') : [], rules: rules ? rules.split(';') : [],
        rerollCost: +rr, apothecary: apo === '1', bigGuyMax: +bigMax || 0, colors: [c1, c2], positions: []
      };
      BB.TEAMS[key] = cur; BB.TEAM_ORDER.push(key); EN_TO_KEY[en] = key;
      continue;
    }
    const [max, key, zh, en, short, kw, ma, st, ag, pa, av, skills, pri, sec, cost, star] = f;
    cur.positions.push({
      key, name: zh, nameEn: en, short, max: +max, cost: +cost,
      keywords: kw.split(','), ma: +ma, st: +st, ag: num(ag), pa: num(pa), av: num(av),
      skills: skills ? skills.split(',') : [], primary: pri, secondary: sec, bigGuyShared: star === '*'
    });
  }
  BB.teamKeyFromEn = en => EN_TO_KEY[en];

  // ---------- 明星球員 ----------
  // 標頭：#key|名稱|費用|MEGA|可效力球隊(英文,逗號分隔；ANY 為全部)|專屬規則英文名|專屬規則中文名|中文說明
  // 球員：名稱|MA|ST|AG|PA|AV|關鍵字|技能
  const STAR_TABLE = `
#akhorne|Akhorne The Squirrel|80||ANY|Blind Rage|盲目狂怒|使用無畏時可以重擲 D6。
Akhorne The Squirrel|7|1|2+|-|6+|Blitzer,Squirrel|Claws,Dauntless,Dodge,Frenzy,Jump Up,Loner (4+),No Ball,Sidestep,Stunty,Titchy
#anqi|Anqi Panqi|190||Amazon,Lizardmen|Savage Blow|野蠻一擊|每場一次，阻擋時可以重擲任意數量的阻擋骰。
Anqi Panqi|7|4|5+|6+|10+|Blocker,Lizardman|Block,Grab,Loner (4+),Stand Firm,Unsteady
#barik|Barik Farblast|80||Bretonnian,Dwarf,Human,Imperial Nobility,Norse,Ogre,Old World Alliance|Blast It!|轟了它！|萬福瑪麗傳球時可重擲偏移，接球的隊友 +1。
Barik Farblast|6|3|4+|3+|9+|Dwarf,Thrower|Cannoneer,Hail Mary Pass,Loner (4+),Pass,Secret Weapon,Sure Hands,Thick Skull
#bilerot|Bilerot Vomitflesh|180||Chaos Chosen,Chaos Renegades,Nurgle|Putrid Regurgitation|腐臭反芻|每半場一次可以使用噴吐，即使本回合已經阻擋過。
Bilerot Vomitflesh|4|5|4+|6+|10+|Blocker,Human|Dirty Player,Disturbing Presence,Foul Appearance,Lone Fouler,Loner (4+),Regeneration,Unsteady
#boa|Boa Kon'ssstriktr|180||Amazon,Lizardmen|Look Into My Eyes|看著我的眼睛|每場一次，開始行動時盯防持球對手，擲 2+ 直接搶走球並結束行動。
Boa Kon'ssstriktr|6|3|3+|4+|9+|Runner,Snakeman|Dodge,Fend,Hypnotic Gaze,Loner (4+),Prehensile Tail,Safe Pair of Hands,Sidestep
#bomber|Bomber Dribblesnot|80||Black Orc,Chaos Dwarf,Goblin,Ogre,Orc,Skaven,Snotling,Underworld Denizens|Kaboom!|轟隆！|每場一次，對手接住他的炸彈時可以讓炸彈直接爆炸。
Bomber Dribblesnot|6|2|3+|3+|8+|Goblin,Special|Accurate,Bombardier,Dodge,Loner (4+),Right Stuff,Secret Weapon,Stunty
#karina|Captain Karina von Riesz|230||Necromantic Horror,Tomb Kings,Shambling Undead,Vampire|Tasty Morsel|美味點心|每場一次，嗜血失敗時可以咬力量 3 以下的對手代替血奴。
Captain Karina von Riesz|7|4|2+|3+|9+|Runner,Vampire|Bloodlust (2+),Dodge,Hypnotic Gaze,Jump Up,Loner (4+),Regeneration
#cindy|Cindy Piewhistle|100||Bretonnian,Gnome,Halfling,Human,Imperial Nobility,Norse,Old World Alliance|All You Can Eat|吃到飽|每場一次可以連丟兩次炸彈，之後擲 1–3 會被罰下場。
Cindy Piewhistle|5|2|3+|3+|7+|Halfling,Special|Accurate,Bombardier,Dodge,Loner (4+),Secret Weapon,Stunty
#luthor|Count Luthor von Drakenborg|300||Necromantic Horror,Tomb Kings,Shambling Undead,Vampire|Star of the Show|全場焦點|每場一次，他達陣時球隊在下一次推進多一次隊伍重擲。
Count Luthor von Drakenborg|6|5|2+|3+|10+|Blocker,Vampire|Block,Hypnotic Gaze,Loner (4+),Regeneration,Sidestep
#deeproot|Deeproot Strongbranch|280||Gnome,Halfling,Wood Elf|Reliable|可靠|投擲隊友失手時，被丟的隊友照常彈開但一定安全落地。
Deeproot Strongbranch|2|7|5+|4+|11+|Big Guy,Treeman|Block,Bullseye,Loner (4+),Mighty Blow,Stand Firm,Strong Arm,Thick Skull,Throw Team-mate,Timmm-ber!
#dribl|Dribl and Drull|230||Amazon,Lizardmen|A Sneaky Pair|鬼祟二人組|必須一起雇用；對兩人共同盯防的對手犯規或刺擊時 +1。
Dribl|8|2|3+|4+|8+|Skink,Special|Dirty Player,Dodge,Loner (4+),Quick Foul,Sidestep,Sneaky Git,Stunty
Drull|8|2|3+|4+|8+|Skink,Special|Dodge,Loner (4+),Sidestep,Stab,Stunty
#eldril|Eldril Sidewinder|220||Dark Elf,Elven Union,High Elf,Wood Elf|Mesmerising Dance|迷幻之舞|每半場一次，催眠凝視可以重擲。
Eldril Sidewinder|8|3|2+|3+|8+|Catcher,Elf|Catch,Dodge,Hypnotic Gaze,Loner (4+),Nerves of Steel,On the Ball
#estelle|Estelle la Veneaux|190||Amazon,Lizardmen|Baleful Hex|惡毒詛咒|每場一次，讓 5 格內的一名對手擲 2+ 分心，下回合不能行動。
Estelle la Veneaux|6|3|3+|4+|8+|Human,Lineman|Disturbing Presence,Dodge,Guard,Loner (4+),Sidestep
#fungus|Fungus the Loon|80||Black Orc,Chaos Dwarf,Goblin,Ogre,Orc,Skaven,Snotling,Underworld Denizens|Whirling Dervish|旋轉托缽僧|每次行動一次，決定移動方向時可以重擲 D6。
Fungus the Loon|4|7|3+|-|8+|Goblin,Special|Ball & Chain,Loner (4+),Mighty Blow,No Ball,Secret Weapon,Stunty
#glart|Glart Smashrip|175||Goblin,Skaven,Snotling,Underworld Denizens|Frenzied Rush|狂暴衝鋒|每半場一次，閃擊時可獲得狂暴（該回合不能用抓取）。
Glart Smashrip|5|4|4+|6+|9+|Blocker,Skaven|Block,Claws,Grab,Juggernaut,Loner (4+),Stand Firm
#gloriel|Gloriel Summerbloom|150||Dark Elf,Elven Union,High Elf,Wood Elf|Shot to Nothing|孤注一擲|每場一次，行動時獲得萬福瑪麗傳球。
Gloriel Summerbloom|7|2|2+|2+|8+|Elf,Thrower|Accurate,Dodge,Loner (3+),Pass,Sidestep,Sure Hands
#glotl|Glotl Stop|260||Amazon,Lizardmen|Primal Savagery|原始兇性|每場一次，野性難馴失敗時可以改攻擊對手。
Glotl Stop|6|6|5+|6+|10+|Big Guy,Lizardman|Animal Savagery,Frenzy,Loner (4+),Mighty Blow,Prehensile Tail,Stand Firm,Thick Skull
#grak|Grak and Crumbleberry|250||ANY|I'll Carry You|我來背你|必須一起雇用；每半場一次，Grak 可以背著相鄰的 Crumbleberry 移動。
Grak|5|5|4+|4+|10+|Big Guy,Ogre|Bone Head,Kick Team-mate,Loner (4+),Mighty Blow,Thick Skull
Crumbleberry|5|2|3+|5+|7+|Halfling,Lineman|Dodge,Lethal Flight,Loner (4+),Right Stuff,Stunty,Sure Hands
#grashnak|Grashnak Blackhoof|240||Chaos Chosen,Chaos Dwarf,Chaos Renegades,Khorne,Norse,Nurgle|Gored by the Bull|蠻牛頂撞|每場一次，閃擊時多擲一顆阻擋骰（最多 3 顆）。
Grashnak Blackhoof|6|6|4+|6+|9+|Big Guy,Minotaur|Frenzy,Horns,Loner (4+),Mighty Blow,Thick Skull,Unchannelled Fury
#gretchen|Gretchen Wächter|180||Necromantic Horror,Tomb Kings,Shambling Undead,Vampire|Incorporeal|虛無之軀|每場一次，該次行動離開擒抱區不用閃避。
Gretchen Wächter|7|3|2+|-|9+|Special,Undead,Wraith|Disturbing Presence,Dodge,Foul Appearance,Jump Up,Loner (4+),No Ball,Regeneration,Shadowing,Sidestep
#griff|Griff Oberwald|300|MEGA|Bretonnian,Human,Imperial Nobility,Norse,Old World Alliance|Consummate Professional|完美職業素養|每場一次，敏捷檢定擲完後可以 +1。
Griff Oberwald|7|4|2+|3+|9+|Blitzer,Human|Block,Dodge,Fend,Loner (3+),Sprint,Sure Feet
#grim|Grim Ironjaw|190||Dwarf,Ogre|Slayer|屠戮者|每場一次，阻擋擊倒對方大塊頭時護甲或傷害 +1。
Grim Ironjaw|5|4|3+|6+|9+|Dwarf,Special|Block,Dauntless,Frenzy,Hatred (Big Guy),Loner (4+),Multiple Block,Thick Skull
#grombrindal|Grombrindal|170||Bretonnian,Dwarf,Gnome,Halfling,Human,Imperial Nobility,Norse,Ogre,Old World Alliance|Wisdom of the White Dwarf|白矮人的智慧|每場一次，讓 2 格內一名隊友本回合獲得突破、無畏、重擊或穩腳之一。
Grombrindal|5|3|3+|4+|10+|Blocker,Dwarf|Block,Break Tackle,Dauntless,Loner (4+),Mighty Blow,Stand Firm,Sure Feet,Thick Skull
#guffle|Guffle Pusmaw|150||Chaos Chosen,Chaos Renegades,Nurgle|Quick Bite|迅速一咬|每場一次，盯防的對手接到球時可以對他擲護甲，破甲就搶到球。
Guffle Pusmaw|5|4|4+|6+|10+|Blocker,Human|Foul Appearance,Loner (4+),Monstrous Mouth,Nerves of Steel,On the Ball,Plague Ridden
#hakflem|Hakflem Skuttlespike|200|MEGA|Goblin,Skaven,Snotling,Underworld Denizens|Treacherous|背信棄義|每場一次，可以搶走相鄰隊友的球，那名隊友倒地（不算失誤）。
Hakflem Skuttlespike|8|3|2+|3+|8+|Runner,Skaven|Dodge,Extra Arms,Loner (4+),Prehensile Tail,Two Heads
#helmut|Helmut Wulf|140||Bretonnian,Human,Imperial Nobility,Norse,Old World Alliance|Old Pro|老將|每場一次，職業球員可以用來重擲護甲擲骰中的一顆骰子。
Helmut Wulf|6|3|3+|-|9+|Human,Special|Chainsaw,Loner (4+),No Ball,Pro,Secret Weapon,Stand Firm
#hthark|H'thark the Unstoppable|300|MEGA|Black Orc,Chaos Chosen,Chaos Dwarf,Goblin,Ogre,Orc|Unstoppable Momentum|勢不可擋|閃擊中的阻擋可以重擲一顆阻擋骰。
H'thark the Unstoppable|6|6|4+|6+|10+|Blitzer,Dwarf|Block,Break Tackle,Defensive,Juggernaut,Loner (4+),Sprint,Sure Feet,Thick Skull,Unsteady
#ivan|Ivan 'the Animal' Deathshroud|210|MEGA|Necromantic Horror,Tomb Kings,Shambling Undead,Vampire|Dwarven Scourge|矮人剋星|每場一次，阻擋擊倒對手時護甲或傷害 +1（矮人 +2）。
Ivan 'the Animal' Deathshroud|6|4|4+|5+|9+|Blitzer,Human,Skeleton,Undead|Block,Disturbing Presence,Hatred (Dwarf),Juggernaut,Loner (4+),Regeneration,Strip Ball,Tackle
#ivar|Ivar Eriksson|215||Bretonnian,Human,Imperial Nobility,Norse,Old World Alliance|Raiding Party|突襲隊|每次推進一次，讓 5 格內一名空閒隊友移動 1 格去盯防對手。
Ivar Eriksson|6|4|3+|4+|9+|Blitzer,Human|Block,Guard,Loner (4+),Tackle
#jeremiah|Jeremiah Kool|300||Dark Elf,Elven Union,High Elf,Wood Elf|The Flashing Blade|閃光之刃|每場一次，行動開始時先刺擊盯防的對手，再移動。
Jeremiah Kool|8|3|1+|2+|9+|Elf,Runner|Block,Dodge,Diving Catch,Dump-off,Loner (4+),Nerves of Steel,On the Ball,Pass,Sidestep
#jordell|Jordell Freshbreeze|280||Dark Elf,Elven Union,Gnome,Halfling,High Elf,Wood Elf|Swift as the Breeze|疾如清風|每場一次，一次閃避、飛躍或衝刺檢定 2+ 必定成功。
Jordell Freshbreeze|8|3|1+|3+|8+|Blitzer,Elf|Block,Diving Catch,Dodge,Leap,Loner (4+),Sidestep,Steady Footing
#josef|Josef Bugman|180||Bretonnian,Dwarf,Human,Imperial Nobility,Norse,Ogre,Old World Alliance|Dwarfen Grit|矮人毅力|每場一次，護甲被打破時可以要求重擲護甲。
Josef Bugman|5|3|3+|4+|9+|Blocker,Dwarf|Block,Drunkard,Fend,Loner (3+),Tackle,Taunt,Thick Skull
#karla|Karla von Kill|210||Amazon,Bretonnian,Human,Imperial Nobility,Lizardmen,Norse,Old World Alliance|Indomitable|不屈|每場一次，無畏成功時力量變成對手的兩倍。
Karla von Kill|6|4|3+|3+|9+|Blitzer,Human|Block,Dauntless,Dodge,Jump Up,Loner (4+)
#kiroth|Kiroth Krakeneye|160||Dark Elf,Elven Union,High Elf,Wood Elf|Black Ink|墨汁|每場一次，行動開始時讓一名盯防的對手分心。
Kiroth Krakeneye|7|3|2+|3+|8+|Elf,Runner|Disturbing Presence,Foul Appearance,Loner (4+),On the Ball,Tackle,Tentacles
#kreek|Kreek Rustgouger|180||Goblin,Skaven,Snotling,Underworld Denizens|I'll Be Back!|我會回來的！|第一次因秘密武器要被罰下場時，可以留在比賽中。
Kreek Rustgouger|4|7|4+|-|10+|Big Guy,Skaven,Special|Ball & Chain,Loner (4+),Mighty Blow,No Ball,Prehensile Tail,Secret Weapon
#borak|Lord Borak the Despoiler|270||Chaos Chosen,Chaos Dwarf,Chaos Renegades,Khorne,Norse,Nurgle|Lord of Chaos|混沌領主|每場一次，阻擋時可以重擲一顆阻擋骰。
Lord Borak the Despoiler|5|5|3+|5+|10+|Blocker,Human|Block,Dirty Player,Leader,Loner (3+),Mighty Blow,Put the Boot In,Sneaky Git
#maple|Maple Highgrove|210||Gnome,Halfling,Wood Elf|Vicious Vines|兇猛藤蔓|每半場一次，可以阻擋 2 格外的對手（不能跟進）。
Maple Highgrove|3|5|5+|5+|11+|Big Guy,Treeman|Brawler,Grab,Loner (4+),Mighty Blow,Stand Firm,Tentacles,Thick Skull
#max|Max Spleenripper|130||Chaos Chosen,Chaos Renegades,Khorne,Norse|Maximum Carnage|極致殺戮|每場一次，電鋸攻擊後可以立刻再攻擊另一名對手。
Max Spleenripper|5|4|4+|-|9+|Human,Special|Chainsaw,Loner (4+),No Ball,Secret Weapon
#morg|Morg 'n' Thorg|340|MEGA|Amazon,Black Orc,Bretonnian,Chaos Chosen,Chaos Dwarf,Chaos Renegades,Dark Elf,Dwarf,Elven Union,Goblin,Halfling,High Elf,Human,Imperial Nobility,Khorne,Lizardmen,Norse,Nurgle,Ogre,Old World Alliance,Orc,Skaven,Snotling,Underworld Denizens,Wood Elf|The Ballista|攻城弩|每場一次，投擲隊友時可以重擲傳球檢定。
Morg 'n' Thorg|6|6|3+|4+|11+|Big Guy,Ogre|Block,Bullseye,Hatred (Undead),Loner (4+),Mighty Blow,Thick Skull,Throw Team-mate
#nobbla|Nobbla Blackwart|120||Black Orc,Chaos Dwarf,Goblin,Ogre,Orc,Skaven,Snotling,Underworld Denizens|Kick 'em While They're Down!|落井下石|每場一次，可以用電鋸攻擊倒地的對手，不算犯規。
Nobbla Blackwart|6|2|3+|-|8+|Goblin,Special|Block,Chainsaw,Dodge,Loner (4+),No Ball,Saboteur,Secret Weapon,Stunty
#puggy|Puggy Baconbreath|130||Bretonnian,Gnome,Halfling,Human,Imperial Nobility,Norse,Old World Alliance|Halfling Luck|半身人好運|每場一次，可以重擲一顆骰子（護甲、傷害、傷亡除外）。
Puggy Baconbreath|5|3|3+|3+|8+|Blitzer,Halfling|Block,Dodge,Loner (3+),Nerves of Steel,Right Stuff,Stunty
#rashnak|Rashnak Backstabber|130||Black Orc,Chaos Dwarf,Goblin,Ogre,Orc|Toxin Connoisseur|毒藥行家|每場一次，刺擊破甲後傷害 +1。
Rashnak Backstabber|7|3|3+|5+|8+|Goblin,Special|Loner (4+),Shadowing,Sidestep,Sneaky Git,Stab
#ripper|Ripper Bolgrot|250||Black Orc,Chaos Dwarf,Goblin,Ogre,Orc,Skaven,Snotling,Underworld Denizens|Thinking Man's Troll|會思考的巨魔|每半場一次，可以重擲一顆骰子（護甲、傷害、傷亡除外）。
Ripper Bolgrot|5|6|5+|4+|10+|Big Guy,Troll|Bullseye,Grab,Loner (4+),Mighty Blow,Regeneration,Throw Team-mate
#rodney|Rodney Roachbait|70||Gnome,Halfling,Wood Elf|Catch of the Day|今日漁獲|每半場一次，站著且 3 格內有地上的球時擲 3+ 直接拿到球。
Rodney Roachbait|6|2|3+|4+|7+|Gnome,Special|Catch,Diving Catch,Jump Up,Loner (4+),On the Ball,Sidestep,Stunty,Wrestle
#rowana|Rowana Forestfoot|160||Gnome,Halfling,Wood Elf|Bounding Leap|彈跳飛躍|每場一次，飛躍無視負面修正且可以重擲。
Rowana Forestfoot|6|3|3+|4+|8+|Blocker,Gnome|Dodge,Dump-off,Guard,Horns,Jump Up,Leap,Loner (4+)
#roxanna|Roxanna Darknail|270||Dark Elf,Elven Union,High Elf,Wood Elf|Slashing Nails|利爪撕裂|每半場一次，閃擊時獲得利爪。
Roxanna Darknail|8|3|1+|3+|8+|Elf,Special|Dodge,Frenzy,Jump Up,Juggernaut,Leap,Loner (4+)
#rumbelow|Rumbelow Sheepskin|170||Gnome,Halfling|Ram|衝撞|每場一次，阻擋擊倒對手時護甲或傷害 +1。
Rumbelow Sheepskin|6|3|3+|5+|8+|Blitzer,Halfling|Block,Horns,Juggernaut,Loner (4+),Tackle,Thick Skull
#scrappa|Scrappa Sorehead|120||Black Orc,Chaos Dwarf,Goblin,Ogre,Orc,Skaven,Snotling,Underworld Denizens|Yoink!|搶來！|每場一次，攔截時擲 2+ 直接攔截成功。
Scrappa Sorehead|7|2|3+|4+|8+|Goblin,Special|Dirty Player,Dodge,Loner (4+),Pogo,Right Stuff,Sprint,Stunty,Sure Feet
#scyla|Scyla Anfingrimm|200||Chaos Chosen,Chaos Renegades,Khorne,Norse|Fury of the Blood God|血神之怒|每場一次，狂怒失控擲出 1 時改為可以阻擋兩次。
Scyla Anfingrimm|5|5|4+|6+|10+|Big Guy,Spawn|Claws,Frenzy,Loner (4+),Mighty Blow,Prehensile Tail,Thick Skull,Unchannelled Fury
#skitter|Skitter Stab-Stab|170||Goblin,Skaven,Snotling,Underworld Denizens|Master Assassin|刺客大師|每場一次，刺擊時可以重擲護甲擲骰。
Skitter Stab-Stab|9|2|2+|4+|8+|Runner,Skaven|Dodge,Loner (4+),Prehensile Tail,Shadowing,Stab
#skrorg|Skrorg Snowpelt|240||Bretonnian,Dwarf,Halfling,Human,Imperial Nobility,Norse,Ogre,Old World Alliance|Pump Up the Crowd|炒熱氣氛|每場一次，阻擋造成傷亡時本次推進多一次隊伍重擲。
Skrorg Snowpelt|5|5|4+|6+|9+|Big Guy,Yhetee|Block,Claws,Disturbing Presence,Juggernaut,Loner (4+),Mighty Blow
#skrull|Skrull Halfheight|150||Dwarf,Necromantic Horror,Ogre,Shambling Undead,Tomb Kings,Vampire|Strong Passing Game|強力傳球|每場一次，傳球檢定可以加上自己的力量（最多到 6）。
Skrull Halfheight|6|3|4+|3+|9+|Dwarf,Skeleton,Thrower,Undead|Accurate,Loner (4+),Nerves of Steel,Pass,Regeneration,Sure Hands,Thick Skull
#swiftvine|Swiftvine Glimmershard|110||Gnome,Halfling,Wood Elf|Furious Outburst|暴怒爆發|每半場一次，瞬移到 3 格內的對手旁刺擊，再瞬移離開（算作閃擊）。
Swiftvine Glimmershard|7|2|3+|5+|7+|Special,Spite|Disturbing Presence,Fend,Loner (4+),Sidestep,Stab,Stunty
#gobbo|The Black Gobbo|210||Black Orc,Chaos Dwarf,Goblin,Ogre,Orc,Skaven,Snotling,Underworld Denizens|Sneakiest of the Lot|最陰險的傢伙|球隊每回合可以犯規兩次，其中一次必須是他自己。
The Black Gobbo|6|2|3+|3+|8+|Goblin,Special|Bombardier,Disturbing Presence,Dodge,Loner (3+),Sidestep,Sneaky Git,Stab
#zug|The Mighty Zug|220||Amazon,Bretonnian,Human,Imperial Nobility,Lizardmen,Norse,Old World Alliance|Crushing Blow|粉碎一擊|每場一次，阻擋擊倒對手時護甲 +1。
The Mighty Zug|5|5|4+|6+|10+|Blocker,Human|Block,Loner (4+),Mighty Blow,Unsteady
#swift|The Swift Twins|300||Dark Elf,Elven Union,High Elf,Wood Elf|Working In Tandem|默契合作|必須一起雇用；Lucien 阻擋 Valen 也盯防的對手時，可以重擲一顆阻擋骰。
Lucien Swift|7|3|2+|3+|9+|Blitzer,Elf|Block,Loner (4+),Mighty Blow,Tackle
Valen Swift|7|3|2+|2+|9+|Elf,Thrower|Accurate,Loner (4+),Nerves of Steel,Pass,Safe Pass,Sure Hands
#thorsson|Thorsson Stoutmead|170||Bretonnian,Dwarf,Human,Imperial Nobility,Norse,Ogre,Old World Alliance|Beer Barrel Bash|啤酒桶重擊|每次推進一次，對 3 格內的對手丟酒桶：3+ 擊倒，1 自己摔倒。
Thorsson Stoutmead|6|3|4+|3+|8+|Human,Lineman|Block,Drunkard,Loner (4+),Thick Skull
#varag|Varag Ghoul-Chewer|260||Black Orc,Chaos Dwarf,Goblin,Ogre,Orc|Krump and Smash|痛毆粉碎|每場一次，阻擋擊倒對手時可以重擲護甲。
Varag Ghoul-Chewer|6|5|3+|5+|10+|Blocker,Orc|Block,Hatred (Undead),Jump Up,Loner (4+),Mighty Blow,Thick Skull,Unsteady
#wilhelm|Wilhelm Chaney|220||Necromantic Horror,Tomb Kings,Shambling Undead,Vampire|Savage Mauling|野蠻撕咬|每場一次，對對手擲傷害時可以重擲。
Wilhelm Chaney|8|4|3+|4+|9+|Blitzer,Undead,Werewolf|Catch,Claws,Frenzy,Loner (4+),Regeneration,Wrestle
#willow|Willow Rosebark|160||Gnome,Halfling,Wood Elf|Woodland Fury|林地之怒|每場一次，阻擋會讓自己倒地時可以重擲一顆阻擋骰。
Willow Rosebark|6|4|3+|5+|9+|Blitzer,Dryad|Dauntless,Loner (4+),Sidestep,Thick Skull
#withergrasp|Withergrasp Doubledrool|170||Chaos Chosen,Chaos Renegades,Nurgle|Watch Out!|小心！|每次推進第一次被阻擋時，視為擁有閃避。
Withergrasp Doubledrool|6|3|3+|4+|9+|Beastman,Blocker|Foul Appearance,Loner (4+),Prehensile Tail,Tackle,Tentacles,Two Heads,Wrestle
#zolcath|Zolcath the Zoat|220||Amazon,Dark Elf,Elven Union,High Elf,Lizardmen,Wood Elf|"Excuse me, are you a Zoat?"|「請問你是佐亞特嗎？」|每場一次，行動時讓 3 格內一名對手分心。
Zolcath the Zoat|5|5|4+|5+|10+|Big Guy,Zoat|Disturbing Presence,Juggernaut,Loner (4+),Mighty Blow,Prehensile Tail,Regeneration,Sure Feet
#zzharg|Zzharg Madeye|130||Chaos Chosen,Chaos Dwarf|"Blastin' Solves Everything"|「轟一下就解決了」|每半場一次，對 3 格內一名站著的對手開火：3+ 命中並擲護甲，1 打到自己。
Zzharg Madeye|4|4|4+|3+|10+|Dwarf,Special|Cannoneer,Hail Mary Pass,Loner (4+),Nerves of Steel,Secret Weapon,Thick Skull
`;

  BB.STARS = {};
  BB.STAR_ORDER = [];
  let star = null;
  for (const line of STAR_TABLE.trim().split('\n')) {
    const f = line.split('|');
    if (line[0] === '#') {
      const [key, name, cost, mega, teams, spEn, spZh, spDesc] = [f[0].slice(1), ...f.slice(1)];
      const teamKeys = teams === 'ANY' ? BB.TEAM_ORDER.slice() : teams.split(',').map(t => EN_TO_KEY[t]).filter(Boolean);
      star = { key, name, cost: +cost, mega: mega === 'MEGA', teams: teamKeys, special: { en: spEn, zh: spZh, desc: spDesc }, players: [] };
      BB.STARS[key] = star; BB.STAR_ORDER.push(key);
      continue;
    }
    const [name, ma, st, ag, pa, av, kw, skills] = f;
    star.players.push({
      key: star.key + (star.players.length ? '_' + star.players.length : ''), name, short: '★', star: true,
      keywords: kw.split(','), ma: +ma, st: +st, ag: num(ag), pa: num(pa), av: num(av),
      skills: skills.split(',').concat([star.special.en])
    });
  }
  // 明星的專屬規則也當成技能顯示
  for (const k of BB.STAR_ORDER) {
    const s = BB.STARS[k].special;
    if (!BB.SKILLS[s.en]) { BB.SKILLS[s.en] = '明星專屬：' + s.desc; BB.SKILL_ZH[s.en] = s.zh; BB.SKILL_CAT[s.en] = '★'; }
  }

  // ---------- 建隊工具 ----------
  BB.isBigGuy = pos => pos.keywords.indexOf('Big Guy') >= 0;
  BB.linemanPos = team => team.positions.filter(p => p.max >= 16).sort((a, b) => a.cost - b.cost)[0];

  BB.teamCost = function (tc) {
    const def = BB.TEAMS[tc.race];
    let c = 0;
    for (const p of def.positions) c += (tc.counts[p.key] || 0) * p.cost;
    c += tc.rerolls * def.rerollCost;
    if (tc.apothecary && def.apothecary) c += BB.APOTHECARY_COST;
    c += ((tc.cheerleaders || 0) + (tc.coaches || 0)) * BB.STAFF_COST;
    for (const s of tc.stars) c += BB.STARS[s].cost;
    return c;
  };

  BB.teamPlayerCount = function (tc) {
    let n = 0;
    for (const s of tc.stars) n += BB.STARS[s].players.length;
    for (const k in tc.counts) n += tc.counts[k];
    return n;
  };

  // 回傳錯誤訊息陣列（空陣列代表合法）
  BB.teamErrors = function (tc) {
    const def = BB.TEAMS[tc.race];
    const err = [];
    const n = BB.teamPlayerCount(tc), cost = BB.teamCost(tc);
    if (n < 11) err.push(`球員至少 11 人（目前 ${n}）`);
    if (n > 16) err.push(`球員最多 16 人（目前 ${n}）`);
    if (cost > BB.BUDGET) err.push(`超出預算（${cost}k / ${BB.BUDGET}k）`);
    if (tc.rerolls > 8) err.push('隊伍重擲最多 8 次');
    if ((tc.cheerleaders || 0) > 6 || (tc.coaches || 0) > 6) err.push('啦啦隊與助理教練各最多 6 名');
    if (tc.stars.length > BB.MAX_STARS) err.push(`明星球員最多 ${BB.MAX_STARS} 組`);
    for (const p of def.positions) if ((tc.counts[p.key] || 0) > p.max) err.push(`${p.name} 最多 ${p.max} 名`);
    if (def.bigGuyMax) {
      let big = 0;
      for (const p of def.positions) if (p.bigGuyShared) big += tc.counts[p.key] || 0;
      if (big > def.bigGuyMax) err.push(`標示＊的大塊頭合計最多 ${def.bigGuyMax} 名`);
    }
    let insig = 0, other = 0;
    for (const p of def.positions) {
      const c = tc.counts[p.key] || 0;
      if (p.skills.indexOf('Insignificant') >= 0) insig += c; else other += c;
    }
    for (const s of tc.stars) other += BB.STARS[s].players.length;
    if (insig > other) err.push(`「微不足道」的球員（${insig}）不能比其他球員（${other}）多`);
    for (const s of tc.stars) if (BB.STARS[s].teams.indexOf(tc.race) < 0) err.push(`${BB.STARS[s].name} 不能為這支球隊效力`);
    return err;
  };

  // 自動產生一份合法的預設陣容
  BB.defaultTeamConfig = function (race) {
    const def = BB.TEAMS[race];
    const line = BB.linemanPos(def);
    const tc = { race, counts: {}, rerolls: 2, apothecary: false, cheerleaders: 0, coaches: 0, stars: [], captain: null };
    const budget = () => BB.BUDGET - BB.teamCost(tc);
    const count = () => BB.teamPlayerCount(tc);
    const fits = (extra, players) => {
      // 加入後仍要負擔得起把人數補到 11 人
      const need = Math.max(0, 11 - count() - players);
      return budget() - extra - need * line.cost >= 0;
    };
    const add = (p, n) => {
      for (let i = 0; i < n; i++) {
        if ((tc.counts[p.key] || 0) >= p.max || count() >= 16 || !fits(p.cost, 1)) return;
        tc.counts[p.key] = (tc.counts[p.key] || 0) + 1;
        if (BB.teamErrors(tc).some(e => e.indexOf('微不足道') >= 0 || e.indexOf('＊') >= 0)) { tc.counts[p.key]--; return; }
      }
    };
    const others = def.positions.filter(p => p !== line && p.skills.indexOf('Secret Weapon') < 0 && p.skills.indexOf('Insignificant') < 0);
    const big = others.filter(BB.isBigGuy), small = others.filter(p => !BB.isBigGuy(p));
    if (big.length) add(big.sort((a, b) => a.cost - b.cost)[0], def.tier === 4 ? 2 : 1);
    for (const p of small) add(p, Math.min(2, p.max));
    if (race === 'ogre') add(def.positions.find(p => p.key === 'blocker'), 4);
    while (count() < 11 && budget() >= line.cost) {
      const before = count();
      add(line, 1);
      if (count() === before) { // 線鋒受限（例如微不足道）：改補其他便宜位置
        const alt = def.positions.filter(p => p !== line && (tc.counts[p.key] || 0) < p.max).sort((a, b) => a.cost - b.cost)[0];
        if (!alt) break;
        add(alt, 1);
        if (count() === before) break;
      }
    }
    if (def.apothecary && budget() >= BB.APOTHECARY_COST) tc.apothecary = true;
    while (tc.rerolls < 3 && budget() >= def.rerollCost) tc.rerolls++;
    while (count() < 12 && budget() >= line.cost) { const b = count(); add(line, 1); if (count() === b) break; }
    return tc;
  };
})();
