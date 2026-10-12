// src/common/question-dedup.js
// 轻量题目归一化与相似度检测，不依赖外部服务。
(function () {
  const NS = (window.NBLMPlus = window.NBLMPlus || {});

  function normalizeQuestion(value) {
    return String(value || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/^\s*(?:第\s*)?\d+\s*[.、．:：)）]\s*/i, '')
      .replace(/^\s*[（(]\s*\d+\s*[）)]\s*/, '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '');
  }

  function bigrams(value) {
    const text = normalizeQuestion(value);
    if (text.length < 2) return text ? [text] : [];
    const result = [];
    for (let index = 0; index < text.length - 1; index++) {
      result.push(text.slice(index, index + 2));
    }
    return result;
  }

  function similarity(left, right) {
    const a = normalizeQuestion(left);
    const b = normalizeQuestion(right);
    if (!a || !b) return 0;
    if (a === b) return 1;
    const aPairs = bigrams(a);
    const bPairs = bigrams(b);
    const counts = new Map();
    for (const pair of aPairs) counts.set(pair, (counts.get(pair) || 0) + 1);
    let overlap = 0;
    for (const pair of bPairs) {
      const count = counts.get(pair) || 0;
      if (count > 0) {
        overlap++;
        counts.set(pair, count - 1);
      }
    }
    return (2 * overlap) / (aPairs.length + bPairs.length);
  }

  function findDuplicate(stem, history, threshold) {
    const normalized = normalizeQuestion(stem);
    let best = null;
    for (const item of history || []) {
      const candidate = item.normalizedStem || normalizeQuestion(item.stem);
      if (!candidate) continue;
      if (candidate === normalized) return { kind: 'exact', score: 1, item };
      const score = similarity(normalized, candidate);
      if (score >= (threshold || 0.72) && (!best || score > best.score)) {
        best = { kind: 'similar', score, item };
      }
    }
    return best;
  }

  function buildExclusionBlock(history, limit) {
    const recent = (history || []).slice(-(limit || 30));
    if (!recent.length) return '';
    return '\n\n防重复要求（必须遵守）：\n' +
      '以下题目已经生成过，本次禁止重复或仅做同义改写。请改考尚未覆盖的概念、条件、应用、比较关系和易错点：\n' +
      recent.map((item, index) => `${index + 1}. ${String(item.stem || '').trim()}`).join('\n');
  }

  NS.questionDedup = {
    normalizeQuestion,
    similarity,
    findDuplicate,
    buildExclusionBlock,
  };
})();
