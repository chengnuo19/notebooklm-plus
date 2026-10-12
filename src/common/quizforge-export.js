(function () {
  const NS = (window.NBLMPlus = window.NBLMPlus || {});
  const SCHEMA_VERSION = 1;
  const SOURCE = 'notebooklm-plus';

  function cleanString(value) {
    return String(value || '').trim();
  }

  function cloneIndexes(value) {
    return Array.isArray(value)
      ? value.filter((item) => Number.isInteger(item) && item >= 0)
      : [];
  }

  function normalizeQuestion(item) {
    return {
      id: cleanString(item.id),
      type: cleanString(item.type) || 'single',
      stem: cleanString(item.stem),
      options: Array.isArray(item.options) ? item.options.map(cleanString) : [],
      correct: cloneIndexes(item.correct),
      mine: cloneIndexes(item.mine),
      ts: Number(item.ts) || 0,
      wrongCount: Number(item.wrongCount) || 1,
      reviewCount: Number(item.reviewCount) || 0,
    };
  }

  function isExportableQuestion(question) {
    return question.stem && question.options.length > 0 && question.correct.length > 0;
  }

  function buildQuizForgeExport(records, options) {
    const now = options && Number.isFinite(options.now) ? options.now : Date.now();
    const notebooks = [];

    for (const record of records || []) {
      const notebookId = cleanString(record.notebookId) || 'default';
      const notebookTitle = cleanString(record.notebookTitle) || notebookId;
      const wrongQuestions = (record.wrongList || [])
        .map(normalizeQuestion)
        .filter(isExportableQuestion);

      if (wrongQuestions.length > 0) {
        notebooks.push({ notebookId, notebookTitle, wrongQuestions });
      }
    }

    return { schemaVersion: SCHEMA_VERSION, source: SOURCE, exportedAt: now, notebooks };
  }

  function downloadQuizForgeExport(payload) {
    const date = new Date(payload.exportedAt || Date.now()).toISOString().slice(0, 10);
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `notebooklm-quizforge-export-${date}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function exportWrongQuestions(storage) {
    const records = await storage.listAllWrongNotebooks();
    const payload = buildQuizForgeExport(records);
    downloadQuizForgeExport(payload);
    const questionCount = payload.notebooks.reduce(
      (sum, notebook) => sum + notebook.wrongQuestions.length,
      0,
    );
    return { notebookCount: payload.notebooks.length, questionCount };
  }

  NS.quizforgeExport = {
    buildQuizForgeExport,
    downloadQuizForgeExport,
    exportWrongQuestions,
  };
})();
