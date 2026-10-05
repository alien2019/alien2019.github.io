/* ============================================================
   英语陪练 · 语音交互模块  (assets/js/speech.js)
   ------------------------------------------------------------
   1. 朗读（TTS）：可配置开关、语速、音调、音量、语音角色、重复次数
   2. 识别（ASR）：麦克风语音作答，英文题用 en-US，中文题用 zh-CN
   依赖浏览器 Web Speech API；不支持时全部静默降级，不影响正常答题。
   ============================================================ */
window.EngSpeech = (function () {
  'use strict';

  var supported = ('speechSynthesis' in window);
  var recogSupported = !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  /* ---------------- 语音列表 ---------------- */
  var voicesCache = [];
  function loadVoices() {
    if (!supported) return [];
    voicesCache = window.speechSynthesis.getVoices() || [];
    return voicesCache;
  }
  if (supported) {
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }

  function englishVoices() {
    if (!voicesCache.length) loadVoices();
    return voicesCache.filter(function (v) { return /^en/i.test(v.lang); });
  }
  function chineseVoices() {
    if (!voicesCache.length) loadVoices();
    return voicesCache.filter(function (v) { return /^zh/i.test(v.lang); });
  }

  /** 选语音：配置指定 > 英语女声 > 任意英语语音 */
  function pickVoice(cfgVoiceName, forEnglish) {
    var list = forEnglish ? englishVoices() : chineseVoices();
    if (!list.length) return null;
    if (cfgVoiceName) {
      var hit = list.filter(function (v) { return v.name === cfgVoiceName; })[0];
      if (hit) return hit;
    }
    if (forEnglish) {
      return list.filter(function (v) {
        return /female|Samantha|Zira|Karen|Moira|Google US English|Google UK English Female/i.test(v.name);
      })[0] || list[0];
    }
    return list[0];
  }

  /* ---------------- 朗读 ---------------- */
  var lastUtter = null;

  /**
   * 朗读文本
   * @param {string} text
   * @param {object} cfg  config.speech
   * @param {object} opt  { forEnglish:bool, btn:element, onend:function }
   */
  function speak(text, cfg, opt) {
    opt = opt || {};
    cfg = cfg || {};
    if (!supported || !cfg.enabled) { if (opt.onend) opt.onend(); return false; }
    var t = String(text || '').trim();
    if (!t) { if (opt.onend) opt.onend(); return false; }

    var forEnglish = opt.forEnglish !== false;   // 默认按英文处理
    var repeat = Math.max(1, Math.min(3, +cfg.repeat || 1));
    var btn = opt.btn || null;

    if (btn) btn.disabled = true;
    try { window.speechSynthesis.cancel(); } catch (e) {}

    function build() {
      var u = new SpeechSynthesisUtterance(t);
      u.lang = forEnglish ? 'en-US' : 'zh-CN';
      u.rate = Math.max(0.1, Math.min(2, +cfg.rate || 0.85));
      u.pitch = Math.max(0, Math.min(2, +cfg.pitch || 1));
      u.volume = Math.max(0, Math.min(1, +cfg.volume == null ? 1 : +cfg.volume));
      var v = pickVoice(cfg.voiceName, forEnglish);
      if (v) u.voice = v;
      return u;
    }

    var remaining = repeat;
    function next() {
      if (remaining <= 0) {
        if (btn) btn.disabled = false;
        if (opt.onend) opt.onend();
        return;
      }
      remaining--;
      var u = build();
      lastUtter = u;
      u.onend = function () { setTimeout(next, 260); };
      u.onerror = function () { if (btn) btn.disabled = false; if (opt.onend) opt.onend(); };
      window.speechSynthesis.speak(u);
    }
    next();
    return true;
  }

  function stop() {
    if (supported) { try { window.speechSynthesis.cancel(); } catch (e) {} }
  }

  /** 测试朗读（后台设置页用） */
  function test(cfg, sampleText) {
    speak(sampleText || 'Hello, this is a voice test.', cfg, { forEnglish: true });
  }

  /* ---------------- 语音识别（麦克风作答） ---------------- */
  var recog = null;
  var recognizing = false;

  function canRecognize() { return recogSupported; }

  /**
   * 开始识别
   * @param {object} opt { lang, onresult(text), onerror(msg), onend() }
   */
  function startRecognize(opt) {
    opt = opt || {};
    if (!recogSupported) {
      if (opt.onerror) opt.onerror('当前浏览器不支持语音识别，建议使用 Chrome / Edge 或安卓自带浏览器。');
      return false;
    }
    var Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    try { recog = new Ctor(); } catch (e) {
      if (opt.onerror) opt.onerror('语音识别初始化失败。');
      return false;
    }
    recog.lang = opt.lang || 'en-US';
    recog.interimResults = true;
    recog.continuous = false;
    recog.maxAlternatives = 1;

    var finalText = '';
    recog.onresult = function (ev) {
      var interim = '';
      for (var i = ev.resultIndex; i < ev.results.length; i++) {
        var tr = ev.results[i][0].transcript;
        if (ev.results[i].isFinal) finalText += tr;
        else interim += tr;
      }
      if (opt.onresult) opt.onresult((finalText || interim).trim(), !!ev.results[ev.results.length - 1].isFinal);
    };
    recog.onerror = function (ev) {
      var msg = '识别失败';
      if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') msg = '麦克风权限被拒绝，请在浏览器设置里允许使用麦克风。';
      else if (ev.error === 'no-speech') msg = '没有听到声音，请再试一次。';
      else if (ev.error === 'network') msg = '语音识别需要联网，请检查网络。';
      if (opt.onerror) opt.onerror(msg);
    };
    recog.onend = function () {
      recognizing = false;
      if (opt.onend) opt.onend();
    };

    try { recog.start(); recognizing = true; } catch (e) {
      if (opt.onerror) opt.onerror('无法启动麦克风：' + e.message);
      return false;
    }
    return true;
  }

  function stopRecognize() {
    if (recog && recognizing) { try { recog.stop(); } catch (e) {} }
    recognizing = false;
  }

  function isRecognizing() { return recognizing; }

  /* ---------------- 导出 ---------------- */
  return {
    supported: supported,
    recogSupported: recogSupported,
    loadVoices: loadVoices,
    englishVoices: englishVoices,
    chineseVoices: chineseVoices,
    pickVoice: pickVoice,
    speak: speak,
    stop: stop,
    test: test,
    canRecognize: canRecognize,
    startRecognize: startRecognize,
    stopRecognize: stopRecognize,
    isRecognizing: isRecognizing
  };
})();
