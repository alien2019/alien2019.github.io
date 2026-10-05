/* ============================================================
   英语陪练 · 主逻辑 v1.0
   ------------------------------------------------------------
   纯前端，无任何外部依赖。
   数据层：localStorage（key: eng_trainer_v1）
   结构：{ version, config:{logo,name,color,voice}, banks:[{id,name,items:[{zh,en}]}] }
   ============================================================ */
(function () {
  'use strict';

  var STORE_KEY = 'eng_trainer_v1';
  var $ = function (id) { return document.getElementById(id); };

  /* ============================================================
     一、默认数据
     ============================================================ */
  var DEFAULT_DATA = {
    version: 1,
    config: { logo: '🎧', name: '英语陪练', color: '#2563EB', voice: '' },
    banks: [
      {
        id: 'primary',
        name: '小学基础 20 句',
        items: [
          { zh: '苹果', en: 'apple' },
          { zh: '香蕉', en: 'banana' },
          { zh: '橙子', en: 'orange' },
          { zh: '学校', en: 'school' },
          { zh: '老师', en: 'teacher' },
          { zh: '学生', en: 'student' },
          { zh: '书', en: 'book' },
          { zh: '铅笔', en: 'pencil' },
          { zh: '书包', en: 'schoolbag' },
          { zh: '教室', en: 'classroom' },
          { zh: '我是一名学生。', en: 'I am a student.' },
          { zh: '这是我的书。', en: 'This is my book.' },
          { zh: '我喜欢苹果。', en: 'I like apples.' },
          { zh: '她是一名老师。', en: 'She is a teacher.' },
          { zh: '你今天好吗？', en: 'How are you today?' },
          { zh: '我很好，谢谢你。', en: 'I am fine, thank you.' },
          { zh: '现在几点了？', en: 'What time is it now?' },
          { zh: '我每天七点起床。', en: 'I get up at seven every day.' },
          { zh: '我有一只猫。', en: 'I have a cat.' },
          { zh: '今天是星期一。', en: 'Today is Monday.' }
        ]
      },
      {
        id: 'daily',
        name: '日常口语 15 句',
        items: [
          { zh: '早上好', en: 'Good morning' },
          { zh: '晚安', en: 'Good night' },
          { zh: '见到你很高兴', en: 'Nice to meet you' },
          { zh: '请问洗手间在哪里？', en: 'Where is the restroom?' },
          { zh: '这个多少钱？', en: 'How much is this?' },
          { zh: '太贵了', en: 'That is too expensive' },
          { zh: '请再说一遍', en: 'Please say that again' },
          { zh: '我听不懂', en: 'I do not understand' },
          { zh: '你能说慢一点吗？', en: 'Could you speak more slowly?' },
          { zh: '我想点一杯咖啡', en: 'I would like a cup of coffee' },
          { zh: '买单，谢谢', en: 'The bill, please' },
          { zh: '不客气', en: 'You are welcome' },
          { zh: '对不起，我迟到了', en: 'Sorry, I am late' },
          { zh: '祝你生日快乐', en: 'Happy birthday to you' },
          { zh: '明天见', en: 'See you tomorrow' }
        ]
      },
      {
        id: 'business',
        name: '职场英语 15 句',
        items: [
          { zh: '我们下周开个会吧。', en: 'Let us have a meeting next week.' },
          { zh: '请查收附件。', en: 'Please find the attachment.' },
          { zh: '我会尽快回复你。', en: 'I will get back to you as soon as possible.' },
          { zh: '这个项目进展如何？', en: 'How is the project going?' },
          { zh: '我们需要更多时间。', en: 'We need more time.' },
          { zh: '感谢你的支持。', en: 'Thank you for your support.' },
          { zh: '我对这个方案有疑问。', en: 'I have some questions about this proposal.' },
          { zh: '请确认一下时间安排。', en: 'Please confirm the schedule.' },
          { zh: '我们会按时交付。', en: 'We will deliver on time.' },
          { zh: '这份报告需要修改。', en: 'This report needs revision.' },
          { zh: '请把资料发给我。', en: 'Please send me the materials.' },
          { zh: '我同意你的看法。', en: 'I agree with you.' },
          { zh: '让我们确认一下细节。', en: 'Let us confirm the details.' },
          { zh: '预算大约是多少？', en: 'What is the approximate budget?' },
          { zh: '期待与您合作。', en: 'Looking forward to working with you.' }
        ]
      }
    ]
  };

  /* ============================================================
     二、数据读写
     ============================================================ */
  var store = {
    read: function () {
      try {
        var raw = localStorage.getItem(STORE_KEY);
        if (!raw) return null;
        var d = JSON.parse(raw);
        if (!d || !Array.isArray(d.banks)) return null;
        // 兼容：补齐缺失字段
        d.config = Object.assign({}, DEFAULT_DATA.config, d.config || {});
        d.banks.forEach(function (b) {
          if (!b.id) b.id = 'bank_' + Math.random().toString(36).slice(2, 8);
          if (!b.name) b.name = '未命名题库';
          if (!Array.isArray(b.items)) b.items = [];
          b.items.forEach(function (it) {
            it.zh = String(it.zh || '').trim();
            it.en = String(it.en || '').trim();
          });
        });
        return d;
      } catch (e) {
        console.warn('读取本地数据失败，已回退默认题库', e);
        return null;
      }
    },
    write: function (data) {
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify(data));
        return true;
      } catch (e) {
        alert('保存失败：本机存储空间已满或被浏览器禁用。\n建议先导出备份后清理。');
        console.error(e);
        return false;
      }
    },
    reset: function () {
      try { localStorage.removeItem(STORE_KEY); } catch (e) {}
      return clone(DEFAULT_DATA);
    }
  };

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  var DATA = store.read() || clone(DEFAULT_DATA);
  function persist() { store.write(DATA); }

  /* ============================================================
     三、全局状态
     ============================================================ */
  var state = {
    mode: 'zh2en',       // zh2en | en2zh | listen | mix
    bankId: null,
    strict: 'smart',     // smart | strict
    count: 10,
    queue: [],           // 本轮题目
    idx: 0,
    score: 0,
    wrong: [],
    answered: false,
    manageBankId: null,
    impTab: 'text',
    fileItems: null
  };

  var MODE_LABEL = { zh2en: '中译英', en2zh: '英译中', listen: '听力朗读', mix: '混合模式' };

  /* ============================================================
     四、工具函数
     ============================================================ */

  /** 拆分「英文」字段的多答案写法：用 / 或 ; 分隔，如 a / an */
  function splitAnswers(en) {
    return String(en).split(/\s*[\/;；|]\s*/).map(function (s) { return s.trim(); }).filter(Boolean);
  }

  /**
   * 归一化
   * @param {string} s 待处理文本
   * @param {boolean} forEn 是否按英文处理
   * @param {boolean} keepCase 是否保留大小写（严格模式下为 true）
   * @param {boolean} keepPunct 是否保留标点（严格模式下为 true）
   */
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

  /** 计算编辑距离 */
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

  /**
   * 判分
   * 严格模式：保留大小写，逐字比对（仍容忍首尾空格）
   * 宽松模式：忽略大小写、标点、空格差异，且编辑距离 ≤1 视为答对
   * @returns { ok:boolean, exact:boolean, best:string, near:boolean }
   */
  function judge(userInput, correctField, strictMode, forEn) {
    var input = String(userInput || '').trim();
    if (!input) return { ok: false, exact: false, best: correctField, near: false };

    var candidates = forEn ? splitAnswers(correctField) : [String(correctField).trim()];
    var strict = (strictMode === 'strict');
    // 严格模式：保留大小写与标点，逐字比对；宽松模式：忽略大小写/标点/空格差异
    var uNorm = normalize(input, forEn, strict, strict);
    var best = candidates[0], bestDist = Infinity, exact = false;

    candidates.forEach(function (c) {
      var cNorm = normalize(c, forEn, strict, strict);
      if (cNorm === uNorm) { exact = true; bestDist = 0; best = c; return; }
      var d = levenshtein(uNorm, cNorm);
      if (d < bestDist) { bestDist = d; best = c; }
    });

    if (exact) return { ok: true, exact: true, best: best, near: false, ratio: 1 };

    if (strict) {
      return { ok: false, exact: false, best: best, near: false, ratio: 0 };
    }

    // 智能宽松：编辑距离 <=1 且原长度 >=4 时算对（容错拼写小错）
    var baseLen = Math.max(uNorm.length, normalize(best, forEn, false, false).length);
    var near = bestDist <= 1 && baseLen >= 4 && uNorm.length > 0;
    return { ok: near, exact: false, best: best, near: near, ratio: baseLen ? 1 - bestDist / baseLen : 0 };
  }

  /** 语音朗读 */
  function speak(text, btnEl) {
    if (!('speechSynthesis' in window)) {
      alert('当前浏览器不支持语音朗读，建议使用 Chrome / Edge / Safari。');
      return;
    }
    try {
      window.speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US';
      u.rate = 0.85;
      u.pitch = 1;
      var voices = window.speechSynthesis.getVoices().filter(function (v) {
        return /^en/i.test(v.lang);
      });
      var chosen = null;
      // 优先用户在后台指定的语音
      if (DATA.config.voice) {
        chosen = voices.filter(function (v) { return v.name === DATA.config.voice; })[0] || null;
      }
      // 其次英语女声
      if (!chosen) {
        chosen = voices.filter(function (v) { return /female|Samantha|Zira|Google US English|Karen|Moira/i.test(v.name); })[0] || null;
      }
      if (!chosen && voices.length) chosen = voices[0];
      if (chosen) u.voice = chosen;

      if (btnEl) { btnEl.disabled = true; }
      u.onend = u.onerror = function () { if (btnEl) btnEl.disabled = false; };
      window.speechSynthesis.speak(u);
    } catch (e) {
      console.warn('朗读失败', e);
      if (btnEl) btnEl.disabled = false;
    }
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

  function uid(prefix) {
    return (prefix || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  /* ============================================================
     五、视图切换
     ============================================================ */
  function goto(view) {
    ['home', 'practice', 'result', 'manage'].forEach(function (v) {
      var el = $('view-' + v);
      if (el) el.classList.toggle('active', v === view);
    });
    document.querySelectorAll('.navbtn').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-view') === view);
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (view === 'manage') renderManage();
  }

  document.querySelectorAll('[data-view]').forEach(function (el) {
    el.addEventListener('click', function () { goto(el.getAttribute('data-view')); });
  });

  /* ============================================================
     六、主题配色
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
     七、首页
     ============================================================ */
  function initHome() {
    // 题型
    document.querySelectorAll('.mode-card').forEach(function (card) {
      card.addEventListener('click', function () {
        state.mode = card.getAttribute('data-mode');
        document.querySelectorAll('.mode-card').forEach(function (c) {
          c.classList.toggle('selected', c === card);
        });
      });
    });
    var first = document.querySelector('.mode-card');
    if (first) first.classList.add('selected');

    // 题库下拉
    var sel = $('bankSelect');
    sel.innerHTML = '<option value="__all__">全部题库（随机抽题）</option>' +
      DATA.banks.map(function (b) {
        return '<option value="' + b.id + '">' + escapeHtml(b.name) + '（' + b.items.length + ' 题）</option>';
      }).join('');
    state.bankId = '__all__';
    sel.addEventListener('change', function () { state.bankId = sel.value; updateBankMeta(); });
    updateBankMeta();

    $('countSelect').addEventListener('change', function () { state.count = parseInt(this.value, 10); });
    $('strictSelect').addEventListener('change', function () { state.strict = this.value; });
    $('startBtn').addEventListener('click', startPractice);
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
      el.textContent = '⚠️ 这个题库还没有题目，请先到「题库管理」添加或导入。';
    } else {
      el.textContent = '共 ' + items.length + ' 道题可用，本次随机抽取。';
    }
  }

  /* ============================================================
     八、练习流程
     ============================================================ */
  function startPractice() {
    var items = collectItems();
    if (!items.length) {
      alert('当前题库没有题目。\n请先到「题库管理」页面添加或导入题目。');
      return;
    }

    // 过滤掉缺字段的题
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
      setTimeout(function () { speak(q.en, speakBtn); }, 350);
    }

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

    if (r.ok) {
      state.score++;
      fb.className = 'feedback show ok';
      fb.innerHTML = '<b>✅ ' + (r.exact ? '完全正确！' : '答对了！（拼写略有差异，已按宽松模式判对）') + '</b>' +
        '<div class="ans-line">参考答案：<span>' + escapeHtml(correctField) + '</span></div>';
      // 听力题：答对后再朗读一遍强化记忆
      if (q.mode === 'listen') speak(q.en, null);
    } else {
      state.wrong.push({
        zh: q.zh, en: q.en, mode: q.mode,
        you: String(input).trim(),
        right: correctField,
        ask: q.mode === 'en2zh' ? q.en : q.zh
      });
      fb.className = 'feedback show bad';
      fb.innerHTML = '<b>❌ 还差一点</b>' +
        '<div class="ans-line">你的答案：<span>' + escapeHtml(String(input).trim()) + '</span></div>' +
        '<div class="ans-line">正确答案：<span>' + escapeHtml(correctField) + '</span></div>' +
        (r.near ? '<div class="ans-line">（很接近了，注意拼写细节）</div>' : '');
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
      ask: q.mode === 'en2zh' ? q.en : q.zh
    });
    var fb = $('feedback');
    fb.className = 'feedback show info';
    fb.innerHTML = '<b>已跳过</b><div class="ans-line">正确答案：<span>' + escapeHtml(correctField) + '</span></div>';
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

    var list = $('wrongList');
    if (!state.wrong.length) {
      list.innerHTML = '<div class="empty">🎯 本轮没有错题，非常棒！</div>';
    } else {
      list.innerHTML = state.wrong.map(function (w) {
        return '<div class="wrong-item">' +
          '<div class="w-zh">' + escapeHtml(w.ask) + '</div>' +
          '<div>你的答案：<span class="w-you">' + escapeHtml(w.you) + '</span></div>' +
          '<div>正确答案：<span class="w-right">' + escapeHtml(w.right) + '</span></div>' +
          '</div>';
      }).join('');
    }
    goto('result');
  }

  function bindPractice() {
    $('submitBtn').addEventListener('click', submitAnswer);
    $('skipBtn').addEventListener('click', skipQuestion);
    $('nextBtn').addEventListener('click', nextQuestion);
    $('speakBtn').addEventListener('click', function () {
      var q = state.queue[state.idx];
      if (q) speak(q.en, this);
    });
    $('quitBtn').addEventListener('click', function () {
      if (confirm('确定退出本次练习吗？当前进度不会保存。')) goto('home');
    });
    $('againBtn').addEventListener('click', function () { startPractice(); });
    // 回车提交（单行场景友好）
    $('answerInput').addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey && !state.answered) {
        e.preventDefault();
        submitAnswer();
      }
    });
  }

  /* ============================================================
     九、题库管理
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
    refreshVoiceList();
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
    // 最多渲染 300 条，避免超长列表卡顿
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
  }

  /* ---------- 解析导入文本 ---------- */
  function parseLines(text) {
    var out = [];
    String(text).split(/\r?\n/).forEach(function (line) {
      var l = line.trim();
      if (!l) return;
      // 跳过表头
      if (/^(中文|english|英文|chinese)\s*[|,，\t]/i.test(l)) return;
      // 优先竖线，其次制表符，最后中英文逗号
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

  function bindManage() {
    /* 题库选择 */
    $('manageBankSelect').addEventListener('change', function () {
      state.manageBankId = this.value;
      renderManage();
    });

    /* 新建题库 */
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

    /* 重命名 */
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

    /* 删除题库 */
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

    /* 导入 Tab */
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

    /* 文件选择 */
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

    /* 执行导入 */
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

    /* 清空题目 */
    $('clearBankBtn').addEventListener('click', function () {
      var b = findBank(state.manageBankId);
      if (!b || !b.items.length) return;
      if (!confirm('确定清空「' + b.name + '」中的全部 ' + b.items.length + ' 道题吗？')) return;
      b.items = [];
      persist();
      renderManage();
      syncHomeSelect();
    });

    /* 手动录入 */
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

    /* 搜索 */
    $('qSearch').addEventListener('input', renderQList);

    /* 导出 */
    $('exportBtn').addEventListener('click', function () {
      var payload = {
        version: DATA.version,
        exportedAt: new Date().toISOString(),
        config: DATA.config,
        banks: DATA.banks
      };
      var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      var d = new Date();
      var stamp = d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
      a.href = url;
      a.download = '英语陪练-题库备份-' + stamp + '.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
      showImpFb('ok', '✅ 备份已导出，请妥善保存该 JSON 文件。');
    });

    /* 导入 JSON 备份 */
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
          if (!confirm('导入将覆盖当前全部题库与设置，确定继续吗？')) { self.value = ''; return; }
          DATA = {
            version: 1,
            config: Object.assign({}, DEFAULT_DATA.config, d.config || {}),
            banks: d.banks
          };
          DATA.banks.forEach(function (b) {
            if (!b.id) b.id = uid('bank');
            if (!Array.isArray(b.items)) b.items = [];
            b.items = b.items.map(function (it) {
              return { zh: String(it.zh || '').trim(), en: String(it.en || '').trim() };
            }).filter(function (it) { return it.zh && it.en; });
          });
          persist();
          applyConfig();
          state.manageBankId = DATA.banks.length ? DATA.banks[0].id : null;
          renderManage();
          syncHomeSelect();
          showImpFb('ok', '✅ 备份导入成功，共 ' + DATA.banks.length + ' 个题库。');
        } catch (err) {
          showImpFb('bad', '❌ 导入失败：文件格式不正确。');
        }
        self.value = '';
      };
      reader.readAsText(f, 'utf-8');
    });

    /* 恢复默认 */
    $('resetBtn').addEventListener('click', function () {
      if (!confirm('将恢复到内置的 3 个示例题库，你现有的题库和设置会被清空。\n确定继续吗？')) return;
      DATA = store.reset();
      persist();
      applyConfig();
      state.manageBankId = DATA.banks[0].id;
      renderManage();
      syncHomeSelect();
      showImpFb('ok', '✅ 已恢复默认题库。');
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
      DATA.config.voice = $('cfgVoice').value;
      persist();
      applyConfig();
      showImpFb('ok', '✅ 外观设置已保存，前端刷新后生效。');
    });
  }

  function showImpFb(type, html) {
    var el = $('importFeedback');
    el.className = 'feedback show ' + type;
    el.innerHTML = html;
  }

  function refreshVoiceList() {
    var sel = $('cfgVoice');
    if (!sel) return;
    if (!('speechSynthesis' in window)) {
      sel.innerHTML = '<option value="">当前浏览器不支持语音</option>';
      return;
    }
    var voices = window.speechSynthesis.getVoices().filter(function (v) {
      return /^en/i.test(v.lang);
    });
    if (!voices.length) {
      sel.innerHTML = '<option value="">自动（英语女声优先）</option>';
      return;
    }
    sel.innerHTML = '<option value="">自动（英语女声优先）</option>' +
      voices.map(function (v) {
        var label = v.name + ' · ' + v.lang;
        return '<option value="' + escapeHtml(v.name) + '"' +
          (DATA.config.voice === v.name ? ' selected' : '') + '>' + escapeHtml(label) + '</option>';
      }).join('');
  }

  /* ============================================================
     十、启动
     ============================================================ */
  function init() {
    applyConfig();
    initHome();
    bindPractice();
    bindManage();
    if ('speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = refreshVoiceList;
      refreshVoiceList();
    }
    // URL hash 路由：#admin / #manage 直达后台管理页，用于独立后台地址
    var h = (location.hash || '').replace('#', '').toLowerCase();
    if (h === 'admin' || h === 'manage') goto('manage');
    window.addEventListener('hashchange', function () {
      var hh = (location.hash || '').replace('#', '').toLowerCase();
      if (hh === 'admin' || hh === 'manage') goto('manage');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // 暴露给调试用
  window.__engTrainer = { DATA: DATA, state: state };
})();
