// src/common/storage.js
// 存储层:设置 + 出题模板放 chrome.storage.sync(小、跨设备同步);
// 错题本放 chrome.storage.local(量大,避开 sync 配额),按 notebookId 分键。
// 同时被 content script 与 options 页加载。
(function () {
  const NS = (window.NBLMPlus = window.NBLMPlus || {});
  const sync = chrome.storage.sync;
  const local = chrome.storage.local;

  const SETTINGS_KEY = 'nblm_settings';
  const TEMPLATES_KEY = 'nblm_templates';
  const wrongKey = (id) => 'nblm_wrong:' + (id || 'default');
  const goodKey = (id) => 'nblm_good:' + (id || 'default');
  const reviewStatsKey = (id) => 'nblm_review_stats:' + (id || 'default');
  const quizHistoryKey = (id) => 'nblm_quiz_history:' + (id || 'default');
  const quizSessionKey = (id) => 'nblm_quiz_sessions:' + (id || 'default');
  const EMPTY_REVIEW_STATS = { attempts: 0, correct: 0, mastered: 0, lastReviewedAt: 0 };

  const DEFAULTS = {
    settings: {
      toolbar: {},
      // 出题默认参数
      quizDefaults: {
        types: ['single'],      // single | multi | truefalse
        count: 10,
        difficulty: 'medium',   // easy | medium | hard
        scope: '',
        language: 'auto',       // auto | zh | en
        avoidDuplicates: true,
        duplicateStrictness: 'standard', // loose | standard | strict
        dedupLimit: 30,
      },
      // 错题本:答对几次后移出
      review: { retireAfter: 2 },
      obsidian: { vaultName: '', defaultFolder: '' },
      notion: {
        token: '',
        targetId: '35433b6448168009a33ecfd7c44346db',
        targetType: 'page',
        databaseId: '',
        autoSyncWrong: false,
        autoSyncGood: false,
      },
      // 当前选用的出题模板 id
      activeTemplateId: 'default',
      // 对话区宽度 (0表示默认)
      chatWidth: 0,
    },
    prompts: [],
    templates: [
      {
        id: 'default',
        title: '默认出题模板',
        body:
          '请严格依据本笔记本的来源内容,生成一套测验题。\n' +
          '要求:\n' +
          '- 题型:{{types}}\n' +
          '- 题目数量:{{count}} 题\n' +
          '- 难度:{{difficulty}}\n' +
          '- 覆盖范围:{{scope}}\n' +
          '- 语言:{{language}}\n' +
          '每道选择题给出 4 个选项并标明唯一/全部正确答案;判断题答案为「对/错」。\n' +
          '题目必须基于来源,不要引入来源以外的信息;答案需可在来源中找到依据。',
      },
    ],
  };

  // —— promise 包装(兼容旧版回调式 API)——
  function callStorage(area, method, value) {
    return new Promise((resolve, reject) => {
      area[method](value, (result) => {
        const err = chrome.runtime.lastError;
        if (err) {
          reject(new Error(err.message || String(err)));
          return;
        }
        resolve(result);
      });
    });
  }
  const get = (area, key) => callStorage(area, 'get', key);
  const set = (area, obj) => callStorage(area, 'set', obj);
  const del = (area, key) => callStorage(area, 'remove', key);

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  // 深合并(对象递归,数组/标量直接覆盖)
  function deepMerge(base, patch) {
    if (patch == null) return base;
    const out = Array.isArray(base) ? base.slice() : Object.assign({}, base);
    for (const k of Object.keys(patch)) {
      const pv = patch[k];
      if (pv && typeof pv === 'object' && !Array.isArray(pv) &&
          out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])) {
        out[k] = deepMerge(out[k], pv);
      } else {
        out[k] = pv;
      }
    }
    return out;
  }

  async function getSettings() {
    const o = await get(sync, SETTINGS_KEY);
    const stored = o[SETTINGS_KEY] || {};
    const settings = deepMerge(clone(DEFAULTS.settings), stored);
    const storedNotion = stored.notion || {};
    if (storedNotion.databaseId && !Object.prototype.hasOwnProperty.call(storedNotion, 'targetId')) {
      settings.notion.targetId = storedNotion.databaseId;
      settings.notion.targetType = 'database';
    }
    return settings;
  }
  async function setSettings(patch) {
    const next = deepMerge(await getSettings(), patch);
    await set(sync, { [SETTINGS_KEY]: next });
    return next;
  }

  async function getTemplates() {
    const o = await get(sync, TEMPLATES_KEY);
    const arr = o[TEMPLATES_KEY];
    return arr && arr.length ? arr : clone(DEFAULTS.templates);
  }
  async function setTemplates(arr) {
    await set(sync, { [TEMPLATES_KEY]: arr });
  }

  const PROMPTS_KEY = 'nblm_prompts';
  async function getPrompts() {
    // 优先从 local 读取（容量大），如果为空则尝试从 sync 读取（兼容老数据）
    let o = await get(local, PROMPTS_KEY);
    let arr = o[PROMPTS_KEY];
    if (!arr || !arr.length) {
      o = await get(sync, PROMPTS_KEY);
      arr = o[PROMPTS_KEY];
    }
    return arr && arr.length ? arr : clone(DEFAULTS.prompts);
  }
  async function setPrompts(arr) {
    // 写入 local 以突破 sync 单个 key 8KB 的容量限制
    await set(local, { [PROMPTS_KEY]: arr });
  }

  function normalizeChapter(value) {
    return String(value || '').trim() || '全部来源内容';
  }

  async function getQuizHistory(id, chapter) {
    const key = quizHistoryKey(id);
    const data = await get(local, key);
    const items = Array.isArray(data[key]) ? data[key] : [];
    const target = normalizeChapter(chapter);
    return items.filter((item) => normalizeChapter(item.chapter) === target);
  }

  async function addQuizHistory(id, chapter, questions, threshold) {
    const key = quizHistoryKey(id);
    const data = await get(local, key);
    const all = Array.isArray(data[key]) ? data[key] : [];
    const target = normalizeChapter(chapter);
    const chapterItems = all.filter((item) => normalizeChapter(item.chapter) === target);
    const dedup = NS.questionDedup;
    const report = { total: 0, added: 0, exact: 0, similar: 0, newRate: 100 };

    for (const question of questions || []) {
      const stem = String(question.stem || question.question || '').replace(/<[^>]+>/g, '').trim();
      if (!stem) continue;
      report.total++;
      const match = dedup && dedup.findDuplicate
        ? dedup.findDuplicate(stem, chapterItems, threshold || 0.72)
        : chapterItems.find((item) => item.stem === stem) ? { kind: 'exact' } : null;
      if (match) {
        report[match.kind]++;
        continue;
      }
      const item = {
        id: 'qh_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        chapter: target,
        stem,
        normalizedStem: dedup && dedup.normalizeQuestion ? dedup.normalizeQuestion(stem) : stem,
        options: (question.options || question.answerOptions || []).map((option) =>
          typeof option === 'string'
            ? option
            : option.text || option.optionText || option.content || ''),
        createdAt: Date.now(),
      };
      all.push(item);
      chapterItems.push(item);
      report.added++;
    }
    report.newRate = report.total ? Math.round(report.added / report.total * 100) : 100;
    await set(local, { [key]: all });
    return report;
  }

  async function clearQuizHistory(id, chapter) {
    const key = quizHistoryKey(id);
    if (chapter == null) {
      await del(local, key);
      return;
    }
    const data = await get(local, key);
    const target = normalizeChapter(chapter);
    const items = (data[key] || []).filter((item) => normalizeChapter(item.chapter) !== target);
    await set(local, { [key]: items });
  }

  function hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
  }

  function getQuestionHash(stem, options) {
    const optsStr = (options || []).map(o => String(o).trim()).join('|');
    return hashCode(String(stem).trim() + '##' + optsStr);
  }

  async function getWrong(id) {
    const k = wrongKey(id);
    const o = await get(local, k);
    return o[k] || [];
  }
  async function setWrong(id, arr) {
    await set(local, { [wrongKey(id)]: arr });
  }
  async function addWrong(id, item) {
    const arr = await getWrong(id);
    const hash = getQuestionHash(item.stem, item.options);
    item.dedupHash = hash;

    if (arr.some((x) => (x.dedupHash && x.dedupHash === hash) || (!x.dedupHash && x.stem === item.stem))) {
      return arr; // 去重:同 notebook 同联合哈希(或旧格式同题干)
    }
    arr.push(item);
    await setWrong(id, arr);
    return arr;
  }
  async function updateWrong(id, itemId, patch) {
    const arr = await getWrong(id);
    const i = arr.findIndex((x) => x.id === itemId);
    if (i >= 0) {
      arr[i] = Object.assign({}, arr[i], patch);
      await setWrong(id, arr);
    }
    return arr;
  }
  async function removeWrong(id, itemId) {
    const arr = (await getWrong(id)).filter((x) => x.id !== itemId);
    await setWrong(id, arr);
    return arr;
  }
  async function clearWrong(id) {
    await del(local, wrongKey(id));
  }

  async function getGood(id) {
    const k = goodKey(id);
    const o = await get(local, k);
    return o[k] || [];
  }
  async function setGood(id, arr) {
    await set(local, { [goodKey(id)]: arr });
  }
  async function addGood(id, item) {
    const arr = await getGood(id);
    const hash = getQuestionHash(item.stem, item.options);
    item.dedupHash = hash;

    if (arr.some((x) => (x.dedupHash && x.dedupHash === hash) || (!x.dedupHash && x.stem === item.stem))) {
      return arr; // 去重
    }
    arr.push(item);
    await setGood(id, arr);
    return arr;
  }
  async function removeGood(id, itemId) {
    const arr = (await getGood(id)).filter((x) => x.id !== itemId);
    await setGood(id, arr);
    return arr;
  }
  async function updateGood(id, itemId, patch) {
    const arr = await getGood(id);
    const i = arr.findIndex((x) => x.id === itemId);
    if (i >= 0) {
      arr[i] = Object.assign({}, arr[i], patch);
      await setGood(id, arr);
    }
    return arr;
  }
  async function clearGood(id) {
    await del(local, goodKey(id));
  }

  async function getQuizSessions(id) {
    const k = quizSessionKey(id);
    const o = await get(local, k);
    return o[k] || [];
  }

  async function saveQuizSession(id, session) {
    const k = quizSessionKey(id);
    let arr = await getQuizSessions(id);
    const idx = arr.findIndex(s => s.id === session.id);
    if (idx >= 0) {
      arr[idx] = Object.assign({}, arr[idx], session);
    } else {
      arr.push(session);
    }
    arr.sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
    if (arr.length > 20) {
      arr = arr.slice(0, 20);
    }
    await set(local, { [k]: arr });
    return arr;
  }

  async function getReviewStats(id) {
    const key = reviewStatsKey(id);
    const data = await get(local, key);
    return Object.assign({}, EMPTY_REVIEW_STATS, data[key] || {});
  }

  async function recordReviewResult(id, correct, mastered) {
    const stats = await getReviewStats(id);
    const next = {
      attempts: stats.attempts + 1,
      correct: stats.correct + (correct ? 1 : 0),
      mastered: stats.mastered + (mastered ? 1 : 0),
      lastReviewedAt: Date.now(),
    };
    await set(local, { [reviewStatsKey(id)]: next });
    return next;
  }

  async function clearReviewData(id) {
    await del(local, [wrongKey(id), reviewStatsKey(id)]);
  }

  async function listAllWrongNotebooks() {
    const items = await get(local, null);
    const result = [];
    for (const k of Object.keys(items)) {
      if (k.startsWith('nblm_wrong:')) {
        const notebookId = k.slice('nblm_wrong:'.length);
        result.push({
          notebookId,
          wrongList: items[k] || [],
        });
      }
    }
    return result;
  }

  async function listAllGoodNotebooks() {
    const items = await get(local, null);
    const result = [];
    for (const k of Object.keys(items)) {
      if (k.startsWith('nblm_good:')) {
        const notebookId = k.slice('nblm_good:'.length);
        result.push({
          notebookId,
          goodList: items[k] || [],
        });
      }
    }
    return result;
  }

  async function listReviewNotebooks() {
    const items = await get(local, null);
    const ids = new Set();
    for (const key of Object.keys(items)) {
      if (key.startsWith('nblm_wrong:')) ids.add(key.slice('nblm_wrong:'.length));
      if (key.startsWith('nblm_review_stats:')) ids.add(key.slice('nblm_review_stats:'.length));
    }
    return Array.from(ids, (notebookId) => ({
      notebookId,
      wrongList: items[wrongKey(notebookId)] || [],
      stats: Object.assign({}, EMPTY_REVIEW_STATS, items[reviewStatsKey(notebookId)] || {}),
    }));
  }

  // 当前 notebook id 共享:顶层页面写入,测验 iframe 读取(iframe 的 URL 没有 notebook id)
  const ACTIVE_KEY = 'nblm_active_notebook';
  async function setActiveNotebook(id) { await set(local, { [ACTIVE_KEY]: id }); }
  async function getActiveNotebook() { const o = await get(local, ACTIVE_KEY); return o[ACTIVE_KEY] || null; }

  function onChanged(cb) {
    chrome.storage.onChanged.addListener(cb);
  }

  // —— 数据迁移逻辑 ——
  const SCHEMA_VERSION_KEY = 'nblm_schema_version';
  const CURRENT_SCHEMA_VERSION = 1;

  async function runMigration() {
    const o = await get(local, SCHEMA_VERSION_KEY);
    const version = o[SCHEMA_VERSION_KEY] || 0;
    if (version >= CURRENT_SCHEMA_VERSION) return;

    const allItems = await get(local, null);
    const updates = {};
    for (const key of Object.keys(allItems)) {
      if (key.startsWith('nblm_wrong:')) {
        const list = allItems[key];
        if (Array.isArray(list)) {
          const newList = [];
          const seenHashes = new Set();
          for (const item of list) {
            const hash = getQuestionHash(item.stem, item.options);
            item.dedupHash = hash;
            if (!seenHashes.has(hash)) {
              seenHashes.add(hash);
              newList.push(item);
            }
          }
          updates[key] = newList;
        }
      }
    }
    updates[SCHEMA_VERSION_KEY] = CURRENT_SCHEMA_VERSION;
    await set(local, updates);
  }

  // 执行迁移
  runMigration().catch((e) => console.warn('[NotebookLM Plus] Migration error:', e));

  NS.storage = {
    DEFAULTS,
    getSettings, setSettings,
    getTemplates, setTemplates,
    getPrompts, setPrompts,
    getQuizHistory, addQuizHistory, clearQuizHistory,
    getQuizSessions, saveQuizSession,
    getWrong, addWrong, updateWrong, removeWrong, clearWrong,
    getGood, addGood, updateGood, removeGood, clearGood,
    getReviewStats, recordReviewResult, clearReviewData,
    listAllWrongNotebooks, listReviewNotebooks, listAllGoodNotebooks,
    setActiveNotebook, getActiveNotebook,
    onChanged,
  };
})();
