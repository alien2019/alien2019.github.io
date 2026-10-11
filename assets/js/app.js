/* ============================================================
   英语陪练 · 主逻辑 v2.0  (assets/js/app.js)
   ------------------------------------------------------------
   v2 新增：
   - 多成员档案（小朋友 / 大人独立学习数据）
   - 学习规划（每日目标 / 题库 / 题型 / 练习日）
   - 进度追踪（今日任务 / 连续打卡 / 正确率 / 14 天趋势）
   - 激励机制（积分 / 等级 / 徽章 / 撒花庆祝 / 语音鼓励）
   - 语音交互配置（自动读题 / 读答案 / 语速音调 / 麦克风作答）
   - PWA（Service Worker 注册在 index.html 内联脚本中）
   v1 全部功能保留：三种练习模式、题库导入管理、双判分、备份迁移、外观配置。
   数据层：localStorage（v2，自动迁移 v1）
   ============================================================ */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  /* ============================================================
     一、默认数据（题库 + v2 骨架）
     ------------------------------------------------------------
     默认题库已抽到独立配置文件：assets/js/banks.js（window.EngBanks）
     换默认题库只需改那个文件，不用动本逻辑文件。
     ============================================================ */
  var DEFAULT_BANKS = (function () {
    var cfg = window.EngBanks;
    if (cfg && Array.isArray(cfg.banks) && cfg.banks.length) return cfg.banks;
    console.warn('[app] 未加载到 assets/js/banks.js，默认题库为空（可用后台导入题库）');
    return [];
  })();

  function defaultData() {
    return {
      version: 2,
      activeProfileId: null,
      config: EngStore.clone(EngStore.DEFAULT_CONFIG),
      banks: EngStore.clone(DEFAULT_BANKS),
      profiles: EngStore.defaultProfiles()
    };
  }

  /* ============================================================
     二、数据读写（经 EngStore，含 v1→v2 迁移）
     ============================================================ */
  var DATA = EngStore.load() || defaultData();
  if (!DATA.banks.length) DATA.banks = EngStore.clone(DEFAULT_BANKS);
  EngStore.normalize(DATA);
  persist();   // 启动即落盘：v1 迁移结果与新用户默认数据立刻持久化，避免未操作就关闭页面导致丢失

  function persist() { EngStore.save(DATA); }
  function AP() { return EngStore.activeProfile(DATA); }   // 当前成员
  function SPCFG() { return DATA.config.speech; }          // 语音配置

  /* ============================================================
     三、全局状态
     ============================================================ */
  var state = {
    mode: 'zh2en',
    bankId: null,
    strict: 'smart',
    count: 10,
    queue: [],
    idx: 0,
    score: 0,
    wrong: [],
    answered: false,
    manageBankId: null,
    impTab: 'text',
    fileItems: null,
    roundGained: 0,      // 本轮获得积分
    roundGoalDone: false,// 本轮中是否触发每日目标达成
    hintUsed: []         // v2.1：每题用了几次提示（下标与 queue 对应）
  };

  var MODE_LABEL = { zh2en: '中译英', en2zh: '英译中', listen: '听力朗读', mix: '混合模式' };

  /* ============================================================
     四、工具函数（v1 保留）
     ============================================================ */
  function splitAnswers(en) {
    return String(en).split(/\s*[\/;；|]\s*/).map(function (s) { return s.trim(); }).filter(Boolean);
  }

  function normalize(s, forEn, keepCase, keepPunct) {
    var t = String(s || '').trim();
    t = t.replace(/\s+/g, ' ');
    if (forEn) {
      if (!keepCase) t = t.toLowerCase();
      if (!keepPunct) t = t.replace(/[.,!?;:'"’“”\-–—()\[\]{}]/g, '');
    } else {
      if (!keepPunct) t = t.replace(/[.,!?;:'"’“”。，！？；：、（）《》\-–—\s]/g, '');
      else t = t.replace(/\s+/g, '');
    }
    return t.trim();
  }

  function levenshtein(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    var prev = [], cur = [], i, j;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      cur[0] = i;
      for (j = 1; j <= b.length; j++) {
        cur[j] = Math.min(
          prev[j] + 1,
          cur[j - 1] + 1,
          prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
        );
      }
      prev = cur.slice();
    }
    return prev[b.length];
  }

  function judge(userInput, correctField, strictMode, forEn) {
    var input = String(userInput || '').trim();
    if (!input) return { ok: false, exact: false, best: correctField, near: false };

    var candidates = forEn ? splitAnswers(correctField) : [String(correctField).trim()];
    var strict = (strictMode === 'strict');
    var uNorm = normalize(input, forEn, strict, strict);
    var best = candidates[0], bestDist = Infinity, exact = false;

    candidates.forEach(function (c) {
      var cNorm = normalize(c, forEn, strict, strict);
      if (cNorm === uNorm) { exact = true; bestDist = 0; best = c; return; }
      var d = levenshtein(uNorm, cNorm);
      if (d < bestDist) { bestDist = d; best = c; }
    });

    if (exact) return { ok: true, exact: true, best: best, near: false };

    if (strict) return { ok: false, exact: false, best: best, near: false };

    var baseLen = Math.max(uNorm.length, normalize(best, forEn, false, false).length);
    var near = bestDist <= 1 && baseLen >= 4 && uNorm.length > 0;
    return { ok: near, exact: false, best: best, near: near };
  }

  /* v1 speak() 保留签名，内部走 EngSpeech（可配置） */
  function speak(text, btnEl, opt) {
    opt = opt || {};
    return EngSpeech.speak(text, SPCFG(), {
      forEnglish: opt.forEnglish !== false,
      btn: btnEl || null,
      onend: opt.onend || null
    });
  }

  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function findBank(id) {
    for (var i = 0; i < DATA.banks.length; i++) {
      if (DATA.banks[i].id === id) return DATA.banks[i];
    }
    return null;
  }

  function uid(prefix) { return EngStore.uid(prefix); }

  /* ============================================================
     五、视图切换（v2：增加 plan / profile）
     ============================================================ */
  function goto(view) {
    ['home', 'practice', 'result', 'plan', 'profile', 'manage'].forEach(function (v) {
      var el = $('view-' + v);
      if (el) el.classList.toggle('active', v === view);
    });
    document.querySelectorAll('.navbtn').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-view') === view);
    });
    closeProfileMenu();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (view === 'manage') renderManage();
    if (view === 'plan') renderPlan();
    if (view === 'profile') renderProfileList();
    if (view === 'home') renderTodayCard();
  }

  document.querySelectorAll('[data-view]').forEach(function (el) {
    el.addEventListener('click', function () { goto(el.getAttribute('data-view')); });
  });

  /* ============================================================
     六、主题配色（v1 保留 + 应用语音设置到 UI）
     ============================================================ */
  function applyConfig() {
    var c = DATA.config;
    document.documentElement.style.setProperty('--brand', c.color);
    $('brandLogo').textContent = c.logo || '🎧';
    $('brandName').textContent = c.name || '英语陪练';
    document.title = (c.name || '英语陪练') + ' · 中英默写练习';
    if ($('cfgLogo')) $('cfgLogo').value = c.logo || '';
    if ($('cfgName')) $('cfgName').value = c.name || '';
    if ($('cfgColor')) $('cfgColor').value = c.color || '#2563EB';
    if ($('cfgColorText')) $('cfgColorText').textContent = c.color || '#2563EB';
    try { document.querySelector('meta[name=theme-color]').setAttribute('content', c.color); } catch (e) {}
  }

  /* ============================================================
     七、成员切换器
     ============================================================ */
  function renderProfileChip() {
    var p = AP();
    $('chipAvatar').textContent = p.avatar;
    $('chipName').textContent = p.name;
  }

  function renderProfileMenu() {
    var list = $('pmList');
    list.innerHTML = DATA.profiles.map(function (p) {
      var t = EngStore.todayStat(p);
      var goal = +p.plan.dailyGoal || 10;
      var done = Math.min(t.done, goal);
      return '<button class="pm-item' + (p.id === DATA.activeProfileId ? ' active' : '') + '" data-pid="' + p.id + '">' +
        '<span class="pm-avatar">' + p.avatar + '</span>' +
        '<span class="pm-mid"><b>' + escapeHtml(p.name) + '</b>' +
        '<small>' + (p.type === 'kid' ? '小朋友' : '大人') + ' · ⭐' + p.stats.points + ' · 今日 ' + t.done + '/' + goal + '</small></span>' +
        '<span class="pm-check">' + (p.id === DATA.activeProfileId ? '✓' : '') + '</span>' +
        '</button>';
    }).join('');
    list.querySelectorAll('[data-pid]').forEach(function (b) {
      b.addEventListener('click', function () {
        DATA.activeProfileId = b.getAttribute('data-pid');
        persist();
        closeProfileMenu();
        renderProfileChip();
        applyPlanToHome();
        renderTodayCard();
        renderProfileMenu();
      });
    });
  }

  function closeProfileMenu() {
    $('profileMenu').style.display = 'none';
  }

  function bindProfileChip() {
    $('profileChip').addEventListener('click', function (e) {
      e.stopPropagation();
      var m = $('profileMenu');
      var show = m.style.display === 'none';
      if (show) renderProfileMenu();
      m.style.display = show ? 'block' : 'none';
    });
    document.addEventListener('click', function (e) {
      if (!$('profileMenu').contains(e.target) && e.target !== $('profileChip')) closeProfileMenu();
    });
    $('pmAddBtn').addEventListener('click', function () {
      openProfileEditor(null);
    });
  }

  /* ============================================================
     八、首页（v1 保留 + 应用成员规划 + 今日任务卡）
     ============================================================ */
  function applyPlanToHome() {
    var p = AP();
    // 题型：按规划顺序取第一个
    var mode = (p.plan.modes && p.plan.modes[0]) || 'zh2en';
    state.mode = mode;
    document.querySelectorAll('.mode-card').forEach(function (c) {
      c.classList.toggle('selected', c.getAttribute('data-mode') === mode);
    });
    // 题库
    state.bankId = p.plan.bankId || '__all__';
    var sel = $('bankSelect');
    if (state.bankId !== '__all__' && !findBank(state.bankId)) state.bankId = '__all__';
    sel.value = state.bankId;
    // 判分
    state.strict = p.plan.strict || 'smart';
    $('strictSelect').value = state.strict;
    // 数量默认对齐每日目标（取接近档位）
    var g = +p.plan.dailyGoal || 10;
    var counts = [5, 10, 20, 999];
    var near = counts[0];
    counts.forEach(function (c) { if (Math.abs(c - g) < Math.abs(near - g)) near = c; });
    $('countSelect').value = String(near);
    state.count = near;
    updateBankMeta();
    renderPlanHint();
  }

  function renderPlanHint() {
    var p = AP();
    var el = $('planModeHint');
    var days = ['日', '一', '二', '三', '四', '五', '六'];
    var wd = (p.plan.weekdays || []).map(function (d) { return days[+d]; }).join('、');
    el.innerHTML = '📋 <b>' + escapeHtml(p.name) + '</b> 的规划：每日 ' + p.plan.dailyGoal + ' 题 · ' +
      (wd ? '练习日：周' + wd : '未设置练习日') +
      ' · <a href="#" data-goto="plan">修改规划</a>';
    var a = el.querySelector('[data-goto]');
    if (a) a.addEventListener('click', function (e) { e.preventDefault(); goto('plan'); });
  }

  function renderTodayCard() {
    var p = AP();
    var t = EngStore.todayStat(p);
    var goal = +p.plan.dailyGoal || 10;
    var done = t.done, pct = Math.min(100, Math.round(done / goal * 100));
    $('todayTitle').textContent = p.name + ' · 今日任务';
    $('todayNum').textContent = done + ' / ' + goal + ' 题';
    if (done >= goal) {
      $('todayHint').textContent = '🎉 今日任务已完成，太棒了！';
    } else {
      $('todayHint').textContent = '再练 ' + (goal - done) + ' 题完成今日目标';
    }
    $('ringText').textContent = pct + '%';
    var fg = $('ringFg');
    var C = 2 * Math.PI * 30;
    fg.style.strokeDasharray = C;
    fg.style.strokeDashoffset = C * (1 - pct / 100);
    $('todayStreak').textContent = '🔥 连续 ' + p.stats.streak + ' 天';
    $('todayPoints').textContent = '⭐ ' + p.stats.points + ' 分';
  }

  function initHome() {
    document.querySelectorAll('.mode-card').forEach(function (card) {
      card.addEventListener('click', function () {
        state.mode = card.getAttribute('data-mode');
        document.querySelectorAll('.mode-card').forEach(function (c) {
          c.classList.toggle('selected', c === card);
        });
      });
    });

    var sel = $('bankSelect');
    sel.innerHTML = '<option value="__all__">全部题库（随机抽题）</option>' +
      DATA.banks.map(function (b) {
        return '<option value="' + b.id + '">' + escapeHtml(b.name) + '（' + b.items.length + ' 题）</option>';
      }).join('');
    sel.addEventListener('change', function () { state.bankId = sel.value; updateBankMeta(); });

    $('countSelect').addEventListener('change', function () { state.count = parseInt(this.value, 10); });
    $('strictSelect').addEventListener('change', function () { state.strict = this.value; });
    $('startBtn').addEventListener('click', startPractice);
    applyPlanToHome();
  }

  function collectItems() {
    if (state.bankId === '__all__') {
      var all = [];
      DATA.banks.forEach(function (b) { all = all.concat(b.items); });
      return all;
    }
    var b = findBank(state.bankId);
    return b ? b.items.slice() : [];
  }

  function updateBankMeta() {
    var items = collectItems();
    var el = $('bankMeta');
    if (!items.length) {
      el.textContent = '⚠️ 这个题库还没有题目，请先到「题库」添加或导入。';
    } else {
      el.textContent = '共 ' + items.length + ' 道题可用，本次随机抽取。';
    }
  }

  function syncHomeSelect() {
    var sel = $('bankSelect');
    var cur = state.bankId;
    sel.innerHTML = '<option value="__all__">全部题库（随机抽题）</option>' +
      DATA.banks.map(function (b) {
        return '<option value="' + b.id + '">' + escapeHtml(b.name) + '（' + b.items.length + ' 题）</option>';
      }).join('');
    if (cur && (cur === '__all__' || findBank(cur))) sel.value = cur;
    else { state.bankId = '__all__'; sel.value = '__all__'; }
    updateBankMeta();
    var pb = $('planBank');
    if (pb) {
      pb.innerHTML = '<option value="__all__">全部题库（混合抽题）</option>' +
        DATA.banks.map(function (b) {
          return '<option value="' + b.id + '">' + escapeHtml(b.name) + '（' + b.items.length + ' 题）</option>';
        }).join('');
    }
  }

  /* ============================================================
     九、练习流程（v1 保留 + 进度记录 + 语音交互 + 激励）
     ============================================================ */
  function startPractice() {
    var items = collectItems();
    if (!items.length) {
      alert('当前题库没有题目。\n请先到「题库」页面添加或导入题目。');
      return;
    }
    items = items.filter(function (it) { return it.zh && it.en; });
    if (!items.length) {
      alert('当前题库的题目中文或英文不完整，请先补全。');
      return;
    }

    var n = Math.min(state.count, items.length);
    state.queue = shuffle(items).slice(0, n).map(function (it) {
      var m = state.mode;
      if (m === 'mix') m = ['zh2en', 'en2zh', 'listen'][Math.floor(Math.random() * 3)];
      return { zh: it.zh, en: it.en, mode: m };
    });
    state.idx = 0;
    state.score = 0;
    state.wrong = [];
    state.roundGained = 0;
    state.roundGoalDone = false;
    state.hintUsed = state.queue.map(function () { return 0; });   // v2.1 每题提示次数清零
    goto('practice');
    renderQuestion();
  }

  function renderQuestion() {
    var q = state.queue[state.idx];
    if (!q) return finishPractice();
    state.answered = false;

    $('progText').textContent = '第 ' + (state.idx + 1) + ' / ' + state.queue.length + ' 题';
    $('progScore').textContent = '✅ ' + state.score + ' · ❌ ' + state.wrong.length;
    $('progFill').style.width = (state.idx / state.queue.length * 100) + '%';

    $('qTag').textContent = MODE_LABEL[q.mode] || '练习';

    var promptEl = $('qPrompt');
    var speakBtn = $('speakBtn');
    var cfg = SPCFG();

    if (q.mode === 'zh2en') {
      promptEl.classList.remove('small');
      promptEl.textContent = q.zh;
      speakBtn.style.display = 'none';
      $('answerInput').placeholder = '请默写对应的英文…';
    } else if (q.mode === 'en2zh') {
      promptEl.classList.remove('small');
      promptEl.textContent = q.en;
      speakBtn.style.display = 'none';
      $('answerInput').placeholder = '请写出对应的中文…';
    } else { // listen
      promptEl.classList.add('small');
      promptEl.textContent = '🔊 请点击播放，听发音后写出英文';
      speakBtn.style.display = 'block';
      $('answerInput').placeholder = '请写出你听到的英文…';
    }

    // 麦克风语音作答按钮显隐
    var micRow = $('micRow');
    if (EngSpeech.canRecognize() && cfg.recognize) {
      micRow.style.display = 'flex';
      $('micBtn').textContent = q.mode === 'en2zh' ? '🎙️ 说中文（语音作答）' : '🎙️ 说英文（语音作答）';
      $('micHint').textContent = '';
    } else {
      micRow.style.display = 'none';
    }

    // ---- v2.1：提示区（新题重置） ----
    resetHintBox();

    var input = $('answerInput');
    input.value = '';
    input.disabled = false;
    input.focus();

    var fb = $('feedback');
    fb.className = 'feedback';
    fb.innerHTML = '';
    $('submitBtn').style.display = '';
    $('skipBtn').style.display = '';
    $('nextBtn').style.display = 'none';
    $('submitBtn').disabled = false;
    $('skipBtn').disabled = false;

    // 自动朗读：听力模式必读；其它模式按配置
    if (q.mode === 'listen') {
      setTimeout(function () { speak(q.en, speakBtn); }, Math.max(150, +cfg.listenDelay || 350));
    } else if (cfg.enabled && cfg.readPrompt) {
      var text = (q.mode === 'en2zh') ? q.en : q.zh;
      var forEn = (q.mode === 'en2zh');
      // 中文题干是否朗读也遵循开关；默认读题干能帮助低龄儿童
      speak(text, null, { forEnglish: forEn });
    }
  }

  /* ---------- v2.1：提示功能 ---------- */
  function HCFG() { return DATA.config.hint || {}; }

  /* 新题：隐藏提示区，恢复按钮 */
  function resetHintBox() {
    var cfg = HCFG();
    var btn = $('hintBtn');
    var box = $('hintBox');
    if (btn) {
      btn.style.display = (cfg.enabled === false) ? 'none' : '';
      btn.textContent = '💡 给我点提示';
      btn.disabled = false;
    }
    if (box) { box.style.display = 'none'; box.innerHTML = ''; }
  }

  /* 点一次「给我点提示」→ 提示升级一档 */
  function showHint() {
    var q = state.queue[state.idx];
    if (!q || state.answered) return;
    var cfg = HCFG();
    var max = Math.max(1, Math.min(3, +cfg.maxLevel || 3));
    var used = state.hintUsed[state.idx] || 0;
    if (used >= max) return;

    used += 1;
    state.hintUsed[state.idx] = used;

    var isEn = (q.mode === 'zh2en' || q.mode === 'listen');
    var answer = isEn ? q.en : q.zh;
    var h = window.EngHint.build(answer, isEn, used, max);

    var box = $('hintBox');
    box.style.display = 'block';
    box.innerHTML =
      '<div class="hb-line"><b>💡 提示 ' + used + ' / ' + max + '</b>' +
      (cfg.deduct ? '<span class="hb-tag">本题积分按 ' + Math.round((+cfg.deductRatio || 0.5) * 100) + '% 计</span>' : '') +
      '</div>' +
      '<div class="hb-mask">' + escapeHtml(h.masked) + '</div>' +
      '<div class="hb-tip">' + escapeHtml(h.tip) + '</div>' +
      '<div class="hb-note">' + escapeHtml(h.note) + '</div>';

    var btn = $('hintBtn');
    if (h.done) {
      btn.disabled = true;
      btn.textContent = '💡 提示已用完';
    } else {
      btn.textContent = '💡 再看一点提示（' + used + ' / ' + max + '）';
    }

    // 开着语音时把提示读出来，方便还不识字的小朋友
    if (SPCFG().enabled) speak(h.tip, null, { forEnglish: false });
  }

  function submitAnswer() {
    if (state.answered) return;
    var q = state.queue[state.idx];
    var input = $('answerInput').value;
    if (!String(input).trim()) {
      var fb0 = $('feedback');
      fb0.className = 'feedback show info';
      fb0.innerHTML = '请先输入答案，再点提交。';
      return;
    }

    var forEn = (q.mode === 'zh2en' || q.mode === 'listen');
    var correctField = forEn ? q.en : q.zh;
    var r = judge(input, correctField, state.strict, forEn);

    state.answered = true;
    var fb = $('feedback');
    var cfg = SPCFG();

    // ---- v2：进度 + 激励（v2.1：用过提示的题按折扣计分） ----
    var p = AP();
    var used = state.hintUsed[state.idx] || 0;
    var factor = window.EngHint.factorOf(used, HCFG());
    var ev = EngStore.recordAnswer(p, r.ok, factor);
    state.roundGained += ev.gained;
    if (ev.goalJustDone) state.roundGoalDone = true;
    persist();
    renderTodayCard();
    var hintNote = (used > 0 && factor < 1) ? '<div class="ans-line">（本题用了提示，积分按 ' + Math.round(factor * 100) + '% 计）</div>' : '';

    if (r.ok) {
      state.score++;
      fb.className = 'feedback show ok';
      fb.innerHTML = '<b>✅ ' + (r.exact ? '完全正确！' : '答对了！（拼写略有差异，已按宽松模式判对）') + '</b>' +
        '<div class="ans-line">+ ' + ev.gained + ' 分</div>' + hintNote +
        '<div class="ans-line">参考答案：<span>' + escapeHtml(correctField) + '</span></div>';
      if (cfg.enabled && cfg.readFeedback) speak(r.exact ? 'Great job!' : 'Good! Well done.', null, { forEnglish: true });
      if (cfg.enabled && cfg.readAnswer && forEn) speak(correctField, null, { forEnglish: true });
    } else {
      state.wrong.push({
        zh: q.zh, en: q.en, mode: q.mode,
        you: String(input).trim(),
        right: correctField,
        ask: q.mode === 'en2zh' ? q.en : q.zh,
        hint: used            // v2.1：记录这题用了几次提示
      });
      fb.className = 'feedback show bad';
      fb.innerHTML = '<b>❌ 还差一点</b>' + hintNote +
        '<div class="ans-line">你的答案：<span>' + escapeHtml(String(input).trim()) + '</span></div>' +
        '<div class="ans-line">正确答案：<span>' + escapeHtml(correctField) + '</span></div>' +
        (r.near ? '<div class="ans-line">（很接近了，注意拼写细节）</div>' : '');
      if (cfg.enabled && cfg.readFeedback) speak('Oops! Try to remember.', null, { forEnglish: true });
      if (cfg.enabled && cfg.readAnswer) speak(correctField, null, { forEnglish: forEn });
    }

    $('answerInput').disabled = true;
    $('submitBtn').style.display = 'none';
    $('skipBtn').style.display = 'none';
    $('nextBtn').style.display = 'block';
    $('nextBtn').textContent = (state.idx >= state.queue.length - 1) ? '查看成绩 →' : '下一题 →';
    $('nextBtn').focus();
  }

  function skipQuestion() {
    if (state.answered) return;
    var q = state.queue[state.idx];
    var correctField = (q.mode === 'en2zh') ? q.zh : q.en;
    state.answered = true;
    state.wrong.push({
      zh: q.zh, en: q.en, mode: q.mode,
      you: '（已跳过）', right: correctField,
      ask: q.mode === 'en2zh' ? q.en : q.zh,
      hint: state.hintUsed[state.idx] || 0    // v2.1
    });
    var fb = $('feedback');
    fb.className = 'feedback show info';
    fb.innerHTML = '<b>已跳过</b><div class="ans-line">正确答案：<span>' + escapeHtml(correctField) + '</span></div>';
    if (SPCFG().enabled && SPCFG().readAnswer) speak(correctField, null, { forEnglish: q.mode !== 'en2zh' });
    $('answerInput').disabled = true;
    $('submitBtn').style.display = 'none';
    $('skipBtn').style.display = 'none';
    $('nextBtn').style.display = 'block';
    $('nextBtn').textContent = (state.idx >= state.queue.length - 1) ? '查看成绩 →' : '下一题 →';
  }

  function nextQuestion() {
    if (!state.answered) return;
    state.idx++;
    if (state.idx >= state.queue.length) finishPractice();
    else renderQuestion();
  }

  /* ---------- 撒花（纯 canvas，无依赖） ---------- */
  function confetti(duration) {
    var cv = $('confetti');
    cv.style.display = 'block';
    var ctx = cv.getContext('2d');
    cv.width = window.innerWidth;
    cv.height = window.innerHeight;
    var colors = ['#F43F5E', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6', '#EC4899'];
    var parts = [];
    for (var i = 0; i < 120; i++) {
      parts.push({
        x: Math.random() * cv.width,
        y: -20 - Math.random() * cv.height * 0.5,
        w: 6 + Math.random() * 6,
        h: 8 + Math.random() * 8,
        c: colors[Math.floor(Math.random() * colors.length)],
        vy: 2 + Math.random() * 3.5,
        vx: -1.5 + Math.random() * 3,
        rot: Math.random() * Math.PI,
        vr: -0.1 + Math.random() * 0.2
      });
    }
    var start = Date.now();
    (function frame() {
      ctx.clearRect(0, 0, cv.width, cv.height);
      parts.forEach(function (pt) {
        pt.x += pt.vx; pt.y += pt.vy; pt.rot += pt.vr;
        ctx.save();
        ctx.translate(pt.x, pt.y);
        ctx.rotate(pt.rot);
        ctx.fillStyle = pt.c;
        ctx.fillRect(-pt.w / 2, -pt.h / 2, pt.w, pt.h);
        ctx.restore();
      });
      if (Date.now() - start < duration) requestAnimationFrame(frame);
      else { ctx.clearRect(0, 0, cv.width, cv.height); cv.style.display = 'none'; }
    })();
  }

  function finishPractice() {
    var total = state.queue.length;
    var score = total ? Math.round(state.score / total * 100) : 0;
    $('resultScore').textContent = score;
    $('resultMeta').textContent = '答对 ' + state.score + ' 题 / 共 ' + total + ' 题';

    var emoji = '💪', title = '继续加油！';
    if (score === 100) { emoji = '🏆'; title = '满分！太厉害了'; }
    else if (score >= 80) { emoji = '🎉'; title = '很棒！继续保持'; }
    else if (score >= 60) { emoji = '👍'; title = '不错，再练一轮会更好'; }
    $('resultEmoji').textContent = emoji;
    $('resultTitle').textContent = title;

    // ---- v2：一轮结算（徽章 + 激励展示 + 庆祝） ----
    var p = AP();
    var perfect = (total > 0 && state.score === total);
    var nb = EngStore.recordRound(p, total, state.score, perfect);
    persist();

    var box = $('rewardBox');
    if (state.roundGained > 0 || state.roundGoalDone || nb.length) {
      box.style.display = 'block';
      $('rewardPts').textContent = '本轮 +' + state.roundGained + ' 分';
      var parts = [];
      if (state.roundGoalDone) parts.push('🎉 <b>今日任务达成！</b>');
      nb.forEach(function (id) {
        var b = EngStore.badgeById(id);
        parts.push('<span class="new-badge">' + b.icon + ' 获得新徽章「' + b.name + '」</span>');
      });
      var lv = EngStore.levelOf(p.stats.points);
      parts.push('当前等级：' + lv.cur.icon + ' ' + lv.cur.name + ' · ' + p.stats.points + ' 分');
      $('rewardDetail').innerHTML = parts.join('<br>');
      if (state.roundGoalDone || perfect) {
        confetti(2200);
        if (SPCFG().enabled) {
          speak(perfect ? 'Perfect! You are amazing!' : 'Great! Daily goal completed!', null, { forEnglish: true });
        }
      }
    } else {
      box.style.display = 'none';
    }

    // ---- v2.1：本轮用了提示的题统计 ----
    var hinted = state.hintUsed.filter(function (n) { return n > 0; }).length;
    if (hinted > 0) {
      $('resultMeta').textContent += ' · 其中 ' + hinted + ' 题用了提示';
    }

    var list = $('wrongList');
    if (!state.wrong.length) {
      list.innerHTML = '<div class="empty">🎯 本轮没有错题，非常棒！</div>';
    } else {
      list.innerHTML = state.wrong.map(function (w) {
        return '<div class="wrong-item">' +
          '<div class="w-zh">' + escapeHtml(w.ask) +
          (w.hint ? ' <span class="w-hint">💡 用了 ' + w.hint + ' 次提示</span>' : '') + '</div>' +
          '<div>你的答案：<span class="w-you">' + escapeHtml(w.you) + '</span></div>' +
          '<div>正确答案：<span class="w-right">' + escapeHtml(w.right) + '</span></div>' +
          '</div>';
      }).join('');
    }
    goto('result');
  }

  /* ---------- 麦克风语音作答 ---------- */
  function bindMic() {
    $('micBtn').addEventListener('click', function () {
      if (EngSpeech.isRecognizing()) {
        EngSpeech.stopRecognize();
        return;
      }
      var q = state.queue[state.idx];
      if (!q) return;
      var lang = (q.mode === 'en2zh') ? 'zh-CN' : 'en-US';
      var btn = this;
      btn.classList.add('recording');
      btn.textContent = '🔴 正在聆听… 点此结束';
      $('micHint').textContent = '';
      EngSpeech.startRecognize({
        lang: lang,
        onresult: function (text, isFinal) {
          if (text) $('answerInput').value = text;
          if (isFinal) $('micHint').textContent = '✅ 已识别，请核对后提交';
        },
        onerror: function (msg) {
          $('micHint').textContent = '⚠️ ' + msg;
        },
        onend: function () {
          btn.classList.remove('recording');
          btn.textContent = q.mode === 'en2zh' ? '🎙️ 说中文（语音作答）' : '🎙️ 说英文（语音作答）';
        }
      });
    });
  }

  function bindPractice() {
    $('submitBtn').addEventListener('click', submitAnswer);
    $('skipBtn').addEventListener('click', skipQuestion);
    $('nextBtn').addEventListener('click', nextQuestion);
    $('speakBtn').addEventListener('click', function () {
      var q = state.queue[state.idx];
      if (q) speak(q.en, this);
    });
    // v2.1：提示按钮
    $('hintBtn').addEventListener('click', showHint);
    $('quitBtn').addEventListener('click', function () {
      if (confirm('确定退出本次练习吗？已答题目仍会计入学习进度。')) goto('home');
    });
    $('againBtn').addEventListener('click', function () { startPractice(); });
    $('answerInput').addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey && !state.answered) {
        e.preventDefault();
        submitAnswer();
      }
    });
    bindMic();
  }

  /* ============================================================
     十、我的学习（等级 / 打卡 / 趋势 / 徽章 / 规划）
     ============================================================ */
  function renderPlan() {
    var p = AP();
    $('plAvatar').textContent = p.avatar;
    $('plName').textContent = p.name;
    var lv = EngStore.levelOf(p.stats.points);
    $('plLevel').textContent = lv.cur.icon + ' ' + lv.cur.name + ' · ' + p.stats.points + ' 分';
    $('lvIcon').textContent = lv.cur.icon;
    $('lvName').textContent = lv.cur.name;
    $('lvFill').style.width = Math.round(lv.ratio * 100) + '%';
    $('lvNext').textContent = lv.next
      ? '再练 ' + (lv.next.min - p.stats.points) + ' 分升级为「' + lv.next.name + '」'
      : '已是最高等级，太厉害了！';
    $('lvPts').innerHTML = p.stats.points + '<small>分</small>';
    $('plStreak').textContent = '🔥 连续 ' + p.stats.streak + ' 天（最长 ' + p.stats.bestStreak + '）';

    // 今日 / 目标 / 正确率 / 最长连击
    var t = EngStore.todayStat(p);
    $('stToday').textContent = t.done;
    $('stGoal').textContent = p.plan.dailyGoal;
    $('stAcc').textContent = EngStore.accuracy(p) + '%';
    $('stBest').textContent = p.stats.bestStreak;

    // 本周打卡条（周一为一周起点）
    var days = EngStore.lastDays(p, 14);
    var max = Math.max.apply(null, days.map(function (d) { return d.done; }).concat([p.plan.dailyGoal]));
    $('miniChart').innerHTML = days.map(function (d) {
      var h = max ? Math.round(d.done / max * 100) : 0;
      var hit = d.done >= (+p.plan.dailyGoal || 10);
      return '<div class="bar-col" title="' + d.key + '：' + d.done + ' 题">' +
        '<div class="bar' + (hit ? ' hit' : '') + '" style="height:' + Math.max(4, h) + '%"></div>' +
        '<span>' + d.key.slice(8) + '</span></div>';
    }).join('');

    // 徽章墙
    var badges = EngStore.BADGES;
    $('badgeCount').textContent = p.stats.badges.length + '/' + badges.length;
    $('badgeGrid').innerHTML = badges.map(function (b) {
      var got = p.stats.badges.indexOf(b.id) > -1;
      return '<div class="badge-cell' + (got ? ' got' : '') + '" title="' + b.desc + '">' +
        '<span class="b-icon">' + b.icon + '</span>' +
        '<span class="b-name">' + b.name + '</span>' +
        '</div>';
    }).join('');

    // 规划表单
    $('planGoal').value = String(p.plan.dailyGoal);
    syncHomeSelect();
    $('planBank').value = p.plan.bankId || '__all__';
    document.querySelectorAll('#planModes input').forEach(function (cb) {
      cb.checked = (p.plan.modes || []).indexOf(cb.value) > -1;
    });
    document.querySelectorAll('#planDays input').forEach(function (cb) {
      cb.checked = (p.plan.weekdays || []).indexOf(+cb.value) > -1;
    });
  }

  function bindPlan() {
    $('plSwitchBtn').addEventListener('click', function (e) {
      e.stopPropagation();
      renderProfileMenu();
      $('profileMenu').style.display = 'block';
    });
    $('planSaveBtn').addEventListener('click', function () {
      var p = AP();
      p.plan.dailyGoal = parseInt($('planGoal').value, 10) || 10;
      p.plan.bankId = $('planBank').value || '__all__';
      var modes = [];
      document.querySelectorAll('#planModes input:checked').forEach(function (cb) { modes.push(cb.value); });
      if (!modes.length) { alert('请至少选择一种练习题型。'); return; }
      p.plan.modes = modes;
      var wds = [];
      document.querySelectorAll('#planDays input:checked').forEach(function (cb) { wds.push(+cb.value); });
      p.plan.weekdays = wds.length ? wds : [1, 2, 3, 4, 5, 6, 0];
      persist();
      applyPlanToHome();
      renderTodayCard();
      renderPlanHint();
      showImpFb('ok', '✅ 学习规划已保存');
      goto('manage');
      setTimeout(function () {
        var el = $('importFeedback');
        el.className = 'feedback show ok';
        el.textContent = '✅ 「' + p.name + '」的学习规划已更新。';
      }, 60);
    });
  }

  /* ============================================================
     十一、成员管理
     ============================================================ */
  function renderProfileList() {
    var wrap = $('profileList');
    wrap.innerHTML = DATA.profiles.map(function (p) {
      var t = EngStore.todayStat(p);
      var lv = EngStore.levelOf(p.stats.points);
      var active = p.id === DATA.activeProfileId;
      return '<div class="prof-item' + (active ? ' active' : '') + '" data-pid="' + p.id + '">' +
        '<span class="prof-avatar">' + p.avatar + '</span>' +
        '<div class="prof-mid">' +
        '<b>' + escapeHtml(p.name) + (active ? ' <em class="cur-tag">当前</em>' : '') + '</b>' +
        '<small>' + (p.type === 'kid' ? '小朋友' : '大人') + ' · ' + lv.cur.icon + lv.cur.name + ' · ⭐' + p.stats.points +
        ' · 🔥' + p.stats.streak + ' 天 · 今日 ' + t.done + '/' + p.plan.dailyGoal + '</small>' +
        '</div>' +
        '<div class="prof-ops">' +
        (active ? '' : '<button class="btn btn-ghost" data-use="' + p.id + '">使用</button>') +
        '<button class="btn btn-ghost" data-edit="' + p.id + '">编辑</button>' +
        '<button class="btn btn-ghost" data-del="' + p.id + '">删除</button>' +
        '</div>' +
        '</div>';
    }).join('');

    wrap.querySelectorAll('[data-use]').forEach(function (b) {
      b.addEventListener('click', function () {
        DATA.activeProfileId = b.getAttribute('data-use');
        persist();
        renderProfileChip();
        renderProfileList();
        applyPlanToHome();
        renderTodayCard();
      });
    });
    wrap.querySelectorAll('[data-edit]').forEach(function (b) {
      b.addEventListener('click', function () {
        openProfileEditor(EngStore.findProfile(DATA, b.getAttribute('data-edit')));
      });
    });
    wrap.querySelectorAll('[data-del]').forEach(function (b) {
      b.addEventListener('click', function () {
        var p = EngStore.findProfile(DATA, b.getAttribute('data-del'));
        if (!p) return;
        if (!confirm('确定删除成员「' + p.name + '」吗？\n其学习进度与徽章将一并删除，题库不受影响。')) return;
        EngStore.removeProfile(DATA, p.id);
        persist();
        renderProfileChip();
        renderProfileList();
        applyPlanToHome();
        renderTodayCard();
      });
    });
  }

  function openProfileEditor(profile) {
    var isNew = !profile;
    var name = prompt(isNew ? '新成员的名字：' : '修改名字：', isNew ? '' : profile.name);
    if (name === null) return;
    name = String(name).trim();
    if (!name) { alert('名字不能为空。'); return; }
    var typeInput = prompt('成员类型（输入 1 = 小朋友，2 = 大人）：', isNew ? '1' : (profile.type === 'kid' ? '1' : '2'));
    if (typeInput === null) return;
    var type = String(typeInput).trim() === '1' ? 'kid' : 'adult';
    var av = prompt('头像（可输入一个 emoji，如 🧒👧🦊🐯）：', isNew ? (type === 'kid' ? '🧒' : '🙂') : profile.avatar);
    if (av === null) av = null;
    var goal = prompt('每日目标题数：', isNew ? (type === 'kid' ? '15' : '20') : String(profile.plan.dailyGoal));
    var goalN = Math.max(1, Math.min(200, parseInt(goal, 10) || (type === 'kid' ? 15 : 20)));

    if (isNew) {
      var p = EngStore.addProfile(DATA, name, type, (av || '').trim() || (type === 'kid' ? '🧒' : '🙂'), goalN);
      DATA.activeProfileId = p.id;
    } else {
      profile.name = name;
      profile.type = type;
      if ((av || '').trim()) profile.avatar = av.trim();
      profile.plan.dailyGoal = goalN;
      if (type === 'kid' && profile.plan.modes.indexOf('listen') < 0) profile.plan.modes.push('listen');
    }
    persist();
    renderProfileChip();
    renderProfileList();
    applyPlanToHome();
    renderTodayCard();
  }

  function bindProfileView() {
    $('profAddBtn').addEventListener('click', function () { openProfileEditor(null); });
  }

  /* ============================================================
     十二、题库管理（v1 全部保留 + 备份含成员进度）
     ============================================================ */
  function renderManage() {
    if (!DATA.banks.length) DATA.banks.push({ id: uid('bank'), name: '新题库', items: [] });
    if (!state.manageBankId || !findBank(state.manageBankId)) {
      state.manageBankId = DATA.banks[0].id;
    }

    var sel = $('manageBankSelect');
    sel.innerHTML = DATA.banks.map(function (b) {
      return '<option value="' + b.id + '"' + (b.id === state.manageBankId ? ' selected' : '') + '>' +
        escapeHtml(b.name) + '（' + b.items.length + ' 题）</option>';
    }).join('');

    var bank = findBank(state.manageBankId);
    $('manageBankMeta').textContent = bank
      ? '当前题库：' + bank.name + ' · 共 ' + bank.items.length + ' 道题'
      : '';
    renderQList();
    refreshVoiceUI();
  }

  function renderQList() {
    var bank = findBank(state.manageBankId);
    var kw = ($('qSearch').value || '').trim().toLowerCase();
    var items = bank ? bank.items : [];
    if (kw) {
      items = items.filter(function (it) {
        return it.zh.toLowerCase().indexOf(kw) > -1 || it.en.toLowerCase().indexOf(kw) > -1;
      });
    }
    $('qCount').textContent = (bank ? bank.items.length : 0);

    var list = $('qList');
    if (!items.length) {
      list.innerHTML = '<div class="empty">' + (kw ? '没有匹配的题目' : '题库还是空的，用上面的导入或手动录入添加吧') + '</div>';
      return;
    }
    var shown = items.slice(0, 300);
    list.innerHTML = shown.map(function (it) {
      var idx = bank.items.indexOf(it);
      return '<div class="q-item">' +
        '<div class="q-item-body">' +
        '<div class="q-item-zh">' + (idx + 1) + '. ' + escapeHtml(it.zh) + '</div>' +
        '<div class="q-item-en">' + escapeHtml(it.en) + '</div>' +
        '</div>' +
        '<button class="q-item-del" data-del="' + idx + '" title="删除">✕</button>' +
        '</div>';
    }).join('') + (items.length > 300 ? '<div class="empty">仅显示前 300 条，可用搜索缩小范围</div>' : '');

    list.querySelectorAll('[data-del]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var i = parseInt(btn.getAttribute('data-del'), 10);
        var b = findBank(state.manageBankId);
        if (!b) return;
        if (!confirm('确定删除这条题目吗？\n' + b.items[i].zh)) return;
        b.items.splice(i, 1);
        persist();
        renderManage();
        syncHomeSelect();
      });
    });
  }

  function parseLines(text) {
    var out = [];
    String(text).split(/\r?\n/).forEach(function (line) {
      var l = line.trim();
      if (!l) return;
      if (/^(中文|english|英文|chinese)\s*[|,，\t]/i.test(l)) return;
      var parts = l.split(/\s*\|\s*/);
      if (parts.length < 2) parts = l.split(/\t/);
      if (parts.length < 2) parts = l.split(/[,，]/);
      if (parts.length < 2) return;
      var zh = parts[0].trim();
      var en = parts.slice(1).join(',').trim();
      if (!zh || !en) return;
      out.push({ zh: zh, en: en });
    });
    return out;
  }

  function importItems(items, replace) {
    var bank = findBank(state.manageBankId);
    if (!bank) return 0;
    if (replace) bank.items = [];
    var exist = {};
    bank.items.forEach(function (it) { exist[it.zh + '||' + it.en] = true; });
    var added = 0, dup = 0;
    items.forEach(function (it) {
      var k = it.zh + '||' + it.en;
      if (exist[k]) { dup++; return; }
      exist[k] = true;
      bank.items.push({ zh: it.zh, en: it.en });
      added++;
    });
    persist();
    return { added: added, dup: dup };
  }

  function showImpFb(type, html) {
    var el = $('importFeedback');
    el.className = 'feedback show ' + type;
    el.innerHTML = html;
  }

  function bindManage() {
    $('manageBankSelect').addEventListener('change', function () {
      state.manageBankId = this.value;
      renderManage();
    });

    $('addBankBtn').addEventListener('click', function () {
      var name = prompt('新题库名称：', '我的题库 ' + (DATA.banks.length + 1));
      if (!name) return;
      var b = { id: uid('bank'), name: name.trim() || '未命名题库', items: [] };
      DATA.banks.push(b);
      state.manageBankId = b.id;
      persist();
      renderManage();
      syncHomeSelect();
    });

    $('renameBankBtn').addEventListener('click', function () {
      var b = findBank(state.manageBankId);
      if (!b) return;
      var name = prompt('修改题库名称：', b.name);
      if (!name) return;
      b.name = name.trim() || b.name;
      persist();
      renderManage();
      syncHomeSelect();
    });

    $('delBankBtn').addEventListener('click', function () {
      if (DATA.banks.length <= 1) {
        alert('至少要保留一个题库。');
        return;
      }
      var b = findBank(state.manageBankId);
      if (!b) return;
      if (!confirm('确定删除题库「' + b.name + '」及其全部 ' + b.items.length + ' 道题吗？\n此操作不可撤销。')) return;
      DATA.banks = DATA.banks.filter(function (x) { return x.id !== b.id; });
      state.manageBankId = DATA.banks[0].id;
      persist();
      renderManage();
      syncHomeSelect();
    });

    document.querySelectorAll('.tab').forEach(function (t) {
      t.addEventListener('click', function () {
        state.impTab = t.getAttribute('data-imp');
        document.querySelectorAll('.tab').forEach(function (x) { x.classList.toggle('active', x === t); });
        document.querySelectorAll('.imp-pane').forEach(function (p) {
          p.classList.toggle('active', p.id === 'imp-' + state.impTab);
        });
        $('importFeedback').className = 'feedback';
      });
    });

    $('fileInput').addEventListener('change', function () {
      var f = this.files && this.files[0];
      if (!f) { state.fileItems = null; return; }
      if (f.size > 3 * 1024 * 1024) {
        alert('文件太大（超过 3MB），请拆分后再上传。');
        this.value = '';
        state.fileItems = null;
        return;
      }
      var reader = new FileReader();
      reader.onload = function (e) {
        var text = String(e.target.result || '');
        var items = [];
        if (/\.json$/i.test(f.name)) {
          try {
            var d = JSON.parse(text);
            var arr = Array.isArray(d) ? d : (d.items || (d.banks && d.banks[0] && d.banks[0].items) || []);
            items = arr.map(function (it) {
              return { zh: String(it.zh || it.chinese || '').trim(), en: String(it.en || it.english || '').trim() };
            }).filter(function (it) { return it.zh && it.en; });
          } catch (err) {
            showImpFb('bad', '❌ JSON 解析失败，请检查文件格式。');
            return;
          }
        } else {
          items = parseLines(text);
        }
        state.fileItems = items;
        showImpFb(items.length ? 'info' : 'bad',
          items.length ? '已读取到 ' + items.length + ' 道题，点下方「导入到当前题库」完成导入。'
                       : '❌ 没有解析到有效题目，请检查文件内容格式。');
      };
      reader.readAsText(f, 'utf-8');
    });

    $('doImportBtn').addEventListener('click', function () {
      var items;
      if (state.impTab === 'text') {
        items = parseLines($('importText').value);
      } else {
        items = state.fileItems || [];
      }
      if (!items.length) {
        showImpFb('bad', '❌ 没有解析到有效题目。请按「中文|英文」每行一组的格式填写。');
        return;
      }
      var r = importItems(items, false);
      $('importText').value = '';
      $('fileInput').value = '';
      state.fileItems = null;
      showImpFb('ok', '✅ 成功导入 ' + r.added + ' 道题' + (r.dup ? '（跳过 ' + r.dup + ' 条重复）' : '') + '。');
      renderManage();
      syncHomeSelect();
    });

    $('clearBankBtn').addEventListener('click', function () {
      var b = findBank(state.manageBankId);
      if (!b || !b.items.length) return;
      if (!confirm('确定清空「' + b.name + '」中的全部 ' + b.items.length + ' 道题吗？')) return;
      b.items = [];
      persist();
      renderManage();
      syncHomeSelect();
    });

    $('manAddBtn').addEventListener('click', function () {
      var zh = $('manZh').value.trim();
      var en = $('manEn').value.trim();
      if (!zh || !en) { alert('请把中文和英文都填上。'); return; }
      var r = importItems([{ zh: zh, en: en }], false);
      if (r.added) {
        $('manZh').value = '';
        $('manEn').value = '';
        $('manZh').focus();
        showImpFb('ok', '✅ 已添加：' + zh + ' → ' + en);
      } else {
        showImpFb('info', '这条题目已存在，未重复添加。');
      }
      renderManage();
      syncHomeSelect();
    });
    $('manEn').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); $('manAddBtn').click(); }
    });
    $('manZh').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); $('manEn').focus(); }
    });

    $('qSearch').addEventListener('input', renderQList);

    /* 导出（v2：含成员与进度） */
    $('exportBtn').addEventListener('click', function () {
      var payload = {
        version: DATA.version,
        exportedAt: new Date().toISOString(),
        config: DATA.config,
        banks: DATA.banks,
        profiles: DATA.profiles,
        activeProfileId: DATA.activeProfileId
      };
      var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      var d = new Date();
      var stamp = d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
      a.href = url;
      a.download = '英语陪练-备份-' + stamp + '.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
      showImpFb('ok', '✅ 备份已导出（含题库 + 全部成员进度），请妥善保存该 JSON 文件。');
    });

    /* 导入 JSON 备份（v2 兼容 v1 备份） */
    $('importJsonBtn').addEventListener('click', function () { $('jsonInput').click(); });
    $('jsonInput').addEventListener('change', function () {
      var f = this.files && this.files[0];
      if (!f) return;
      var reader = new FileReader();
      var self = this;
      reader.onload = function (e) {
        try {
          var d = JSON.parse(String(e.target.result || ''));
          if (!d || !Array.isArray(d.banks)) throw new Error('格式不正确');
          if (!confirm('导入将覆盖当前全部题库、成员与进度，确定继续吗？')) { self.value = ''; return; }
          DATA = {
            version: 2,
            activeProfileId: d.activeProfileId || null,
            config: Object.assign(EngStore.clone(EngStore.DEFAULT_CONFIG), d.config || {}),
            banks: d.banks,
            profiles: Array.isArray(d.profiles) && d.profiles.length ? d.profiles : EngStore.defaultProfiles()
          };
          EngStore.normalize(DATA);
          persist();
          applyConfig();
          loadSpeechUI();
          loadHintUI();
          renderProfileChip();
          state.manageBankId = DATA.banks.length ? DATA.banks[0].id : null;
          renderManage();
          syncHomeSelect();
          applyPlanToHome();
          renderTodayCard();
          showImpFb('ok', '✅ 备份导入成功：' + DATA.banks.length + ' 个题库，' + DATA.profiles.length + ' 个成员。');
        } catch (err) {
          showImpFb('bad', '❌ 导入失败：文件格式不正确。');
        }
        self.value = '';
      };
      reader.readAsText(f, 'utf-8');
    });

    /* 恢复默认 */
    $('resetBtn').addEventListener('click', function () {
      if (!confirm('将恢复到内置示例题库，并清空全部成员的学习进度与设置。\n确定继续吗？（建议先导出备份）')) return;
      DATA = defaultData();
      EngStore.clear();
      persist();
      applyConfig();
      loadSpeechUI();
      loadHintUI();
      renderProfileChip();
      state.manageBankId = DATA.banks[0].id;
      renderManage();
      syncHomeSelect();
      applyPlanToHome();
      renderTodayCard();
      showImpFb('ok', '✅ 已恢复默认题库与成员。');
    });

    /* 外观设置 */
    $('cfgColor').addEventListener('input', function () {
      $('cfgColorText').textContent = this.value;
      document.documentElement.style.setProperty('--brand', this.value);
    });
    $('saveCfgBtn').addEventListener('click', function () {
      DATA.config.logo = $('cfgLogo').value.trim() || '🎧';
      DATA.config.name = $('cfgName').value.trim() || '英语陪练';
      DATA.config.color = $('cfgColor').value;
      persist();
      applyConfig();
      showImpFb('ok', '✅ 外观设置已保存，前端刷新后生效。');
    });

    /* ---- 语音设置 ---- */
    var rate = $('spRate'), pitch = $('spPitch');
    rate.addEventListener('input', function () { $('spRateVal').textContent = (+this.value).toFixed(2); });
    pitch.addEventListener('input', function () { $('spPitchVal').textContent = (+this.value).toFixed(1); });

    $('spTestBtn').addEventListener('click', function () {
      EngSpeech.test({
        enabled: true,
        rate: +rate.value,
        pitch: +pitch.value,
        volume: 1,
        repeat: 1,
        voiceName: $('spVoice').value
      }, 'Hello! This is a voice test. Nice to meet you.');
    });

    $('spSaveBtn').addEventListener('click', function () {
      var s = DATA.config.speech;
      s.enabled = $('spEnabled').checked;
      s.readPrompt = $('spReadPrompt').checked;
      s.readAnswer = $('spReadAnswer').checked;
      s.readFeedback = $('spReadFeedback').checked;
      s.recognize = $('spRecognize').checked;
      s.rate = +rate.value;
      s.pitch = +pitch.value;
      s.repeat = parseInt($('spRepeat').value, 10) || 1;
      s.voiceName = $('spVoice').value;
      persist();
      showImpFb('ok', '✅ 语音设置已保存，下轮练习即生效。');
    });
  }

  /* ---------- v2.1：提示设置 UI ---------- */
  function loadHintUI() {
    var h = HCFG();
    if (!$('htEnabled')) return;
    $('htEnabled').checked = (h.enabled !== false);
    $('htMaxLevel').value = String(Math.max(1, Math.min(3, +h.maxLevel || 3)));
    $('htDeduct').checked = !!h.deduct;
    var r = (typeof h.deductRatio === 'number') ? h.deductRatio : 0.5;
    $('htDeductRatio').value = String(r);
  }

  function bindHintSettings() {
    if (!$('hintSaveBtn')) return;
    $('hintSaveBtn').addEventListener('click', function () {
      var h = DATA.config.hint;
      h.enabled = $('htEnabled').checked;
      h.maxLevel = parseInt($('htMaxLevel').value, 10) || 3;
      h.deduct = $('htDeduct').checked;
      h.deductRatio = parseFloat($('htDeductRatio').value);
      if (isNaN(h.deductRatio)) h.deductRatio = 0.5;
      persist();
      loadHintUI();
      var tip = $('hintSaveHint');
      tip.textContent = '✅ 提示设置已保存：' + (h.enabled ? '练习时显示提示按钮' : '已关闭提示') +
        ' · 单题最多 ' + h.maxLevel + ' 次 · ' +
        (h.deduct ? '用过提示的题积分按 ' + Math.round(h.deductRatio * 100) + '% 计' : '用过提示不扣分') + '。';
      if (SPCFG().enabled) speak('提示设置已保存', null, { forEnglish: false });
    });
  }

  /* 语音设置 UI 载入 + 支持情况提示 */
  function loadSpeechUI() {
    var s = SPCFG();
    $('spEnabled').checked = !!s.enabled;
    $('spReadPrompt').checked = !!s.readPrompt;
    $('spReadAnswer').checked = !!s.readAnswer;
    $('spReadFeedback').checked = !!s.readFeedback;
    $('spRecognize').checked = !!s.recognize;
    $('spRate').value = s.rate;
    $('spRateVal').textContent = (+s.rate).toFixed(2);
    $('spPitch').value = s.pitch;
    $('spPitchVal').textContent = (+s.pitch).toFixed(1);
    $('spRepeat').value = String(s.repeat || 1);

    var hint = $('spSupportHint');
    var tips = [];
    if (!EngSpeech.supported) tips.push('当前浏览器不支持语音朗读（建议 Chrome / Edge / Safari）。');
    if (!EngSpeech.recogSupported) tips.push('当前浏览器不支持语音识别作答（Chrome / Edge / 安卓浏览器支持）。');
    if (!tips.length) tips.push('本设备支持语音朗读' + (EngSpeech.recogSupported ? '与语音识别作答' : '') + '。语音识别需要联网并允许麦克风权限。');
    hint.textContent = tips.join(' ');

    refreshVoiceUI();
  }

  function refreshVoiceUI() {
    var sel = $('spVoice');
    if (!sel) return;
    var cur = SPCFG().voiceName || '';
    var voices = EngSpeech.englishVoices();
    if (!voices.length) {
      sel.innerHTML = '<option value="">自动（英语女声优先）</option>';
      return;
    }
    sel.innerHTML = '<option value="">自动（英语女声优先）</option>' +
      voices.map(function (v) {
        return '<option value="' + escapeHtml(v.name) + '"' + (v.name === cur ? ' selected' : '') + '>' +
          escapeHtml(v.name + ' · ' + v.lang) + '</option>';
      }).join('');
  }

  /* ============================================================
     十三、启动
     ============================================================ */
  function init() {
    applyConfig();
    renderProfileChip();
    bindProfileChip();
    bindProfileView();
    initHome();
    bindPractice();
    bindManage();
    bindPlan();
    loadSpeechUI();
    loadHintUI();
    bindHintSettings();
    renderTodayCard();
    renderPlanHint();

    if (EngSpeech.supported) EngSpeech.loadVoices();

    // hash 路由：#admin → 题库后台；#plan → 我的学习；#profile → 成员管理
    function route() {
      var h = (location.hash || '').replace('#', '').toLowerCase();
      if (h === 'admin' || h === 'manage') goto('manage');
      else if (h === 'plan') goto('plan');
      else if (h === 'profile') goto('profile');
    }
    route();
    window.addEventListener('hashchange', route);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.__engTrainer = { DATA: DATA, state: state, EngStore: EngStore, EngSpeech: EngSpeech };
})();
