/* ============================================================
   英语陪练 · 数据层 v2  (assets/js/store.js)
   ------------------------------------------------------------
   职责：多成员档案 / 学习规划 / 学习进度 / 积分激励机制
   兼容：自动把 v1 数据（eng_trainer_v1）迁移到 v2，
        老用户的题库(banks)与外观配置(config)原样保留，不丢失。
   ------------------------------------------------------------
   v2 数据结构
   {
     version: 2,
     activeProfileId: 'p_xxx',
     config: { logo, name, color, voice, speech:{...} },
     banks: [ {id, name, items:[{zh,en}]} ],
     profiles: [ {
       id, name, type:'kid'|'adult', avatar,
       plan: { dailyGoal, bankId, modes:[], strict, weekdays:[] },
       stats: { points, totalDone, totalRight, streak, bestStreak,
                lastDay:'YYYY-MM-DD', days:{ 'YYYY-MM-DD': {done, right} },
                badges:[], rounds:0 }
     } ]
   }
   ============================================================ */
window.EngStore = (function () {
  'use strict';

  var V2_KEY = 'eng_trainer_v2';
  var V1_KEY = 'eng_trainer_v1';

  /* ============================================================
     默认配置
     ============================================================ */
  var DEFAULT_CONFIG = {
    logo: '🎧',
    name: '英语陪练',
    color: '#2563EB',
    voice: '',
    speech: {
      enabled: true,        // 总开关：是否自动朗读
      readPrompt: true,     // 出题后自动朗读题干
      readAnswer: true,     // 判分后自动朗读正确答案
      readFeedback: true,   // 判分后朗读"答对/答错"提示语
      rate: 0.85,           // 语速 0.1~2（小学生建议 0.75~0.85）
      pitch: 1,             // 音调 0~2
      volume: 1,            // 音量 0~1
      repeat: 1,            // 重复朗读次数 1~3
      listenDelay: 350,     // 听力模式进题后延迟朗读毫秒
      voiceName: '',        // 指定语音名，空=自动
      recognize: false,     // 是否启用麦克风语音作答
      recogLang: 'en-US'    // 识别语言（英文题 en-US，中文题 zh-CN 自动切换）
    }
  };

  /* 等级体系 */
  var LEVELS = [
    { min: 0,    name: '英语新芽', icon: '🌱' },
    { min: 100,  name: '单词小苗', icon: '🌿' },
    { min: 300,  name: '进步之星', icon: '⭐' },
    { min: 700,  name: '实力选手', icon: '🏅' },
    { min: 1500, name: '英语达人', icon: '🏆' },
    { min: 3000, name: '词汇大师', icon: '👑' },
    { min: 6000, name: '传奇学者', icon: '🎓' }
  ];

  /* 徽章体系 */
  var BADGES = [
    { id: 'first',      icon: '🎉', name: '开张大吉',   desc: '完成第一次练习' },
    { id: 'goal1',      icon: '✅', name: '今日达标',   desc: '第一次完成每日目标' },
    { id: 'streak3',    icon: '🔥', name: '连续 3 天',  desc: '连续打卡 3 天' },
    { id: 'streak7',    icon: '⚡', name: '连续 7 天',  desc: '连续打卡 7 天' },
    { id: 'streak30',   icon: '💎', name: '连续 30 天', desc: '连续打卡 30 天' },
    { id: 'right100',   icon: '💯', name: '百题正确',   desc: '累计答对 100 题' },
    { id: 'right500',   icon: '🌟', name: '五百正确',   desc: '累计答对 500 题' },
    { id: 'perfect',    icon: '🏆', name: '满分一轮',   desc: '单轮练习全部答对' },
    { id: 'total500',   icon: '📚', name: '练习 500 题', desc: '累计练习 500 题' },
    { id: 'earlybird',  icon: '🌅', name: '晨读达人',   desc: '在早上 8 点前完成练习' },
    { id: 'nightowl',   icon: '🌙', name: '睡前勤练',   desc: '在晚上 9 点后完成练习' }
  ];

  var POINTS = {
    right: 10,        // 答对
    wrong: 3,         // 答错（鼓励完成，给参与分）
    goalDone: 50,     // 完成每日目标
    streakBonus: 20   // 连续打卡每日额外奖励
  };

  /* ============================================================
     工具
     ============================================================ */
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function uid(p) { return (p || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  function todayKey(d) {
    d = d || new Date();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }

  function dayOffset(key, n) {
    var p = key.split('-');
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    d.setDate(d.getDate() + n);
    return todayKey(d);
  }

  /* ============================================================
     默认档案
     ============================================================ */
  function defaultProfiles() {
    return [
      newProfile('小朋友', 'kid', '🧒', { dailyGoal: 15 }),
      newProfile('大人', 'adult', '🙂', { dailyGoal: 20 })
    ];
  }

  function newProfile(name, type, avatar, planOpt) {
    var isKid = (type === 'kid');
    return {
      id: uid('p'),
      name: name || '新成员',
      type: type || 'adult',
      avatar: avatar || (isKid ? '🧒' : '🙂'),
      plan: {
        dailyGoal: (planOpt && planOpt.dailyGoal) || (isKid ? 15 : 20),
        bankId: '__all__',
        modes: isKid ? ['zh2en', 'listen'] : ['zh2en', 'en2zh', 'listen'],
        strict: isKid ? 'smart' : 'smart',
        weekdays: [1, 2, 3, 4, 5, 6, 0]   // 默认每天
      },
      stats: {
        points: 0,
        totalDone: 0,
        totalRight: 0,
        rounds: 0,
        streak: 0,
        bestStreak: 0,
        lastDay: '',
        days: {},
        badges: []
      }
    };
  }

  /* ============================================================
     读取 / 迁移 / 保存
     ============================================================ */
  function normalizeData(d) {
    if (!d || typeof d !== 'object') return null;
    d.config = Object.assign(clone(DEFAULT_CONFIG), d.config || {});
    // speech 子对象也要补齐，避免旧数据缺字段
    d.config.speech = Object.assign(clone(DEFAULT_CONFIG.speech), d.config.speech || {});
    if (!Array.isArray(d.banks)) d.banks = [];
    d.banks.forEach(function (b) {
      if (!b.id) b.id = uid('bank');
      if (!b.name) b.name = '未命名题库';
      if (!Array.isArray(b.items)) b.items = [];
      b.items.forEach(function (it) {
        it.zh = String(it.zh || '').trim();
        it.en = String(it.en || '').trim();
      });
    });
    if (!Array.isArray(d.profiles)) d.profiles = [];
    if (!d.profiles.length) d.profiles = defaultProfiles();
    d.profiles.forEach(function (p) {
      if (!p.id) p.id = uid('p');
      if (!p.name) p.name = '未命名';
      if (!p.type) p.type = 'adult';
      if (!p.avatar) p.avatar = (p.type === 'kid' ? '🧒' : '🙂');
      p.plan = Object.assign(newProfile('t', p.type).plan, p.plan || {});
      if (!Array.isArray(p.plan.modes) || !p.plan.modes.length) p.plan.modes = ['zh2en'];
      if (!Array.isArray(p.plan.weekdays) || !p.plan.weekdays.length) p.plan.weekdays = [1,2,3,4,5,6,0];
      var s = p.stats || {};
      s.points = +s.points || 0;
      s.totalDone = +s.totalDone || 0;
      s.totalRight = +s.totalRight || 0;
      s.rounds = +s.rounds || 0;
      s.streak = +s.streak || 0;
      s.bestStreak = +s.bestStreak || 0;
      s.lastDay = s.lastDay || '';
      s.days = (s.days && typeof s.days === 'object') ? s.days : {};
      s.badges = Array.isArray(s.badges) ? s.badges : [];
      p.stats = s;
    });
    if (!d.activeProfileId || !findProfile(d, d.activeProfileId)) {
      d.activeProfileId = d.profiles[0].id;
    }
    d.version = 2;
    return d;
  }

  function findProfile(d, id) {
    for (var i = 0; i < d.profiles.length; i++) if (d.profiles[i].id === id) return d.profiles[i];
    return null;
  }

  /** 从 v1 迁移：保留 banks / config，新增默认档案 */
  function migrateV1() {
    var raw = null;
    try { raw = localStorage.getItem(V1_KEY); } catch (e) { return null; }
    if (!raw) return null;
    try {
      var v1 = JSON.parse(raw);
      if (!v1 || !Array.isArray(v1.banks)) return null;
      var d = {
        version: 2,
        config: Object.assign(clone(DEFAULT_CONFIG), v1.config || {}),
        banks: v1.banks,
        profiles: defaultProfiles(),
        activeProfileId: null
      };
      d.config.speech = Object.assign(clone(DEFAULT_CONFIG.speech), (v1.config && v1.config.speech) || {});
      console.log('[EngStore] 已从 v1 迁移数据，题库 ' + d.banks.length + ' 个');
      return d;
    } catch (e) {
      console.warn('[EngStore] v1 数据解析失败', e);
      return null;
    }
  }

  function load() {
    var d = null;
    try {
      var raw = localStorage.getItem(V2_KEY);
      if (raw) d = JSON.parse(raw);
    } catch (e) { console.warn('[EngStore] v2 读取失败', e); }
    if (!d) d = migrateV1();          // 回退：尝试迁移 v1
    d = normalizeData(d);
    if (!d) return null;              // 没有老数据 → 由调用方用默认 v2 数据
    return d;
  }

  function save(d) {
    try {
      localStorage.setItem(V2_KEY, JSON.stringify(d));
      return true;
    } catch (e) {
      alert('保存失败：本机存储空间已满或被浏览器禁用。\n建议先导出备份后清理。');
      console.error(e);
      return false;
    }
  }

  function clear() {
    try { localStorage.removeItem(V2_KEY); localStorage.removeItem(V1_KEY); } catch (e) {}
  }

  /* ============================================================
     档案 CRUD
     ============================================================ */
  function addProfile(d, name, type, avatar, dailyGoal) {
    var p = newProfile(name, type, avatar, { dailyGoal: dailyGoal });
    d.profiles.push(p);
    return p;
  }

  function removeProfile(d, id) {
    if (d.profiles.length <= 1) return false;
    d.profiles = d.profiles.filter(function (p) { return p.id !== id; });
    if (d.activeProfileId === id) d.activeProfileId = d.profiles[0].id;
    return true;
  }

  function activeProfile(d) {
    return findProfile(d, d.activeProfileId) || d.profiles[0];
  }

  /* ============================================================
     进度统计
     ============================================================ */
  function todayStat(p) {
    var k = todayKey();
    if (!p.stats.days[k]) p.stats.days[k] = { done: 0, right: 0 };
    return p.stats.days[k];
  }

  /**
   * 记录一次答题
   * @param {object} p 档案
   * @param {boolean} ok 是否答对
   * @returns {object} 本次产生的激励事件 { gained, newBadges:[], goalJustDone:bool }
   */
  function recordAnswer(p, ok) {
    var k = todayKey();
    var day = todayStat(p);
    var res = { gained: 0, newBadges: [], goalJustDone: false };

    day.done += 1;
    p.stats.totalDone += 1;
    if (ok) { day.right += 1; p.stats.totalRight += 1; }

    res.gained += ok ? POINTS.right : POINTS.wrong;
    p.stats.points += (ok ? POINTS.right : POINTS.wrong);

    // 每日目标达成（只奖励一次：当天 done 首次达到目标）
    var goal = +p.plan.dailyGoal || 10;
    if (day.done === goal) {
      p.stats.points += POINTS.goalDone;
      res.gained += POINTS.goalDone;
      res.goalJustDone = true;
    }

    // 连续打卡：当天首次答题时结算
    if (p.stats.lastDay !== k) {
      var yesterday = dayOffset(k, -1);
      if (p.stats.lastDay === yesterday) {
        p.stats.streak += 1;
      } else if (p.stats.lastDay === '') {
        p.stats.streak = 1;
      } else {
        p.stats.streak = 1;   // 中断，重新计数
      }
      p.stats.lastDay = k;
      if (p.stats.streak > p.stats.bestStreak) p.stats.bestStreak = p.stats.streak;
      if (p.stats.streak > 1) {
        p.stats.points += POINTS.streakBonus;
        res.gained += POINTS.streakBonus;
      }
    }

    // 徽章判定
    res.newBadges = checkBadges(p, k);
    return res;
  }

  /** 一轮练习结束 */
  function recordRound(p, totalCount, rightCount, perfect) {
    p.stats.rounds += 1;
    if (perfect && totalCount > 0) {
      if (p.stats.badges.indexOf('perfect') < 0) { p.stats.badges.push('perfect'); return ['perfect']; }
    }
    return [];
  }

  function checkBadges(p, k) {
    var got = [];
    function give(id) {
      if (p.stats.badges.indexOf(id) < 0) { p.stats.badges.push(id); got.push(id); }
    }
    var s = p.stats;
    var hour = new Date().getHours();

    if (s.rounds > 0 || s.totalDone > 0) give('first');
    if (s.days[k] && (+p.plan.dailyGoal || 10) > 0 && s.days[k].done >= (+p.plan.dailyGoal || 10)) give('goal1');
    if (s.streak >= 3) give('streak3');
    if (s.streak >= 7) give('streak7');
    if (s.streak >= 30) give('streak30');
    if (s.totalRight >= 100) give('right100');
    if (s.totalRight >= 500) give('right500');
    if (s.totalDone >= 500) give('total500');
    if (hour < 8) give('earlybird');
    if (hour >= 21) give('nightowl');
    return got;
  }

  /* ============================================================
     等级 / 展示
     ============================================================ */
  function levelOf(points) {
    var cur = LEVELS[0], next = null;
    for (var i = 0; i < LEVELS.length; i++) {
      if (points >= LEVELS[i].min) cur = LEVELS[i];
      if (points < LEVELS[i].min && !next) next = LEVELS[i];
    }
    var prevMin = cur.min;
    var nextMin = next ? next.min : null;
    var ratio = nextMin ? Math.min(1, (points - prevMin) / (nextMin - prevMin)) : 1;
    return { cur: cur, next: next, ratio: ratio, points: points };
  }

  function badgeById(id) {
    for (var i = 0; i < BADGES.length; i++) if (BADGES[i].id === id) return BADGES[i];
    return { id: id, icon: '🏵', name: id, desc: '' };
  }

  function accuracy(p) {
    return p.stats.totalDone ? Math.round(p.stats.totalRight / p.stats.totalDone * 100) : 0;
  }

  /** 最近 N 天的答题量（用于迷你柱状图） */
  function lastDays(p, n) {
    var out = [];
    var k = todayKey();
    for (var i = n - 1; i >= 0; i--) {
      var key = dayOffset(k, -i);
      var d = p.stats.days[key] || { done: 0, right: 0 };
      out.push({ key: key, done: d.done, right: d.right });
    }
    return out;
  }

  /* ============================================================
     导出接口
     ============================================================ */
  return {
    KEY: V2_KEY,
    DEFAULT_CONFIG: DEFAULT_CONFIG,
    LEVELS: LEVELS,
    BADGES: BADGES,
    POINTS: POINTS,
    load: load,
    save: save,
    clear: clear,
    normalize: normalizeData,
    newProfile: newProfile,
    defaultProfiles: defaultProfiles,
    addProfile: addProfile,
    removeProfile: removeProfile,
    findProfile: findProfile,
    activeProfile: activeProfile,
    todayKey: todayKey,
    todayStat: todayStat,
    recordAnswer: recordAnswer,
    recordRound: recordRound,
    levelOf: levelOf,
    badgeById: badgeById,
    accuracy: accuracy,
    lastDays: lastDays,
    uid: uid,
    clone: clone
  };
})();
