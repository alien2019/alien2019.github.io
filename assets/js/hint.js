/* ============================================================
   英语陪练 · 提示引擎  (assets/js/hint.js)
   ------------------------------------------------------------
   作用：练习中遇到不会的题，给小朋友「循序渐进」的提示，
        既不直接给答案，又能让他继续练下去。

   提示分 3 级（单题最多点到配置的 maxLevel 次）：
     第 1 次：告诉「答案有多长 + 第一个字母/字」（如 a____、我__）
     第 2 次：揭示约 40%（如 app__、我__果）
     第 3 次：揭示约 70%（如 appl_、我_果_）

   设计原则：
   - 永远不把最后一个字符也揭示完，始终留一点思考空间
   - 空格、标点位置保留，方便小朋友按词形推断
   - 用过提示的题，积分按配置的折扣计算（见 factorOf），
     避免「一路点提示」刷分，但不影响继续练习
   ------------------------------------------------------------
   对外 API：
     EngHint.build(answer, isEn, level, maxLevel) -> 提示对象
     EngHint.factorOf(usedCount, hintCfg)         -> 积分系数 0~1
   ============================================================ */
window.EngHint = (function () {
  'use strict';

  /* 一个答案里可能有多个可接受答案（a / an），取第一个做提示 */
  function firstAnswer(answer) {
    var parts = String(answer || '').split(/\s*[\/;；|]\s*/).map(function (s) { return s.trim(); }).filter(Boolean);
    return parts.length ? parts[0] : String(answer || '');
  }

  /* 把文本按 ratio 比例揭示，其余用 _ 遮盖（空格与标点保留位置） */
  function maskText(text, ratio) {
    var chars = String(text).split('');
    var n = chars.length;
    if (!n) return '';

    var show = Math.max(1, Math.ceil(n * ratio));
    // 至少保留 1 个未知字符，不把答案直接给完
    if (show >= n) show = Math.max(0, n - 1);
    if (n <= 2) show = 0;   // 极短答案（如 a、an）只给长度和首字母提示

    return chars.map(function (c, i) {
      if (i < show) return c;
      if (c === ' ') return ' ';
      return '_';
    }).join('');
  }

  /* 统计信息文案：英文看字母数与单词数，中文看字数 */
  function lengthTip(text, isEn) {
    if (isEn) {
      var words = text.split(/\s+/).filter(Boolean);
      var letters = text.replace(/[^A-Za-z]/g, '').length;
      if (words.length > 1) return '共 ' + words.length + ' 个单词 · ' + letters + ' 个字母';
      return '共 ' + letters + ' 个字母';
    }
    return '共 ' + text.replace(/\s/g, '').length + ' 个字';
  }

  /**
   * 生成某道题的提示
   * @param {string} answer  正确答案（可含 a / an 多答案）
   * @param {boolean} isEn   答案是否为英文（中译英/听力=true，英译中=false）
   * @param {number} level   本次是第几次提示（从 1 开始）
   * @param {number} maxLevel 最多允许提示几次（1~3）
   * @returns {{level:number, tip:string, masked:string, done:boolean, note:string}}
   */
  function build(answer, isEn, level, maxLevel) {
    var text = firstAnswer(answer);
    var lv = Math.max(1, Math.min(3, +level || 1));
    var max = Math.max(1, Math.min(3, +maxLevel || 3));
    if (lv > max) lv = max;

    var masked, tip;

    if (lv === 1) {
      var head = text.charAt(0) || '';
      masked = maskText(text, 0);
      // 首字母/首字直接露出，其余遮盖
      masked = head + masked.slice(1);
      tip = lengthTip(text, isEn) + ' · 开头是「' + head + '」';
    } else if (lv === 2) {
      masked = maskText(text, 0.4);
      tip = '再给你看一点点：' + masked;
    } else {
      masked = maskText(text, 0.7);
      tip = '已经揭示大部分啦：' + masked;
    }

    var done = (lv >= max);
    return {
      level: lv,
      tip: tip,
      masked: masked,
      done: done,
      note: done ? '提示用完啦～ 再想一想，实在不会可以点「跳过」看答案。' : '还想再看一点？再点一次「给我点提示」。'
    };
  }

  /**
   * 用过提示后，本题积分按什么系数计算
   * @param {number} usedCount 本题用了几次提示（0 表示没用）
   * @param {object} cfg       config.hint
   * @returns {number} 0~1，1 表示不打折
   */
  function factorOf(usedCount, cfg) {
    if (!usedCount) return 1;
    var c = cfg || {};
    if (!c.deduct) return 1;
    var r = (typeof c.deductRatio === 'number') ? c.deductRatio : 0.5;
    return Math.max(0, Math.min(1, r));
  }

  return {
    build: build,
    factorOf: factorOf,
    firstAnswer: firstAnswer,
    maskText: maskText
  };
})();
