// src/common/ai-client.js
(function() {
  const NS = (globalThis.NBLMPlus = globalThis.NBLMPlus || {});

  const SYSTEM_PROMPT = `
You are a tutor analyzing a student's quiz session.
Output ONLY valid JSON. No markdown wrappers, no explanations.

Expected JSON Format:
{
  "summary": "本次表现总结 (String)",
  "weakTopics": [
    {
      "topic": "Topic Name (String)",
      "mastery": "0-100 (Number)",
      "evidenceQuestionIds": ["q1", "q2"],
      "reason": "Why weak (String)",
      "priority": "high/medium/low (String)"
    }
  ],
  "mistakePatterns": [
    {
      "type": "Pattern Name (String)",
      "description": "Description (String)",
      "evidenceQuestionIds": ["q1"]
    }
  ],
  "studyActions": ["Action 1", "Action 2"],
  "nextQuizSpec": {
    "focusTopics": [{"topic": "Topic", "count": 2, "reason": "Reason"}],
    "questionCount": 10,
    "difficulty": "medium",
    "specialRequirements": ["Req 1"]
  },
  "externalKnowledge": ["Fact 1", "Fact 2"]
}
`;

  async function requestDeepSeek(apiKey, model, messages, jsonSchema = true) {
    const url = 'https://api.deepseek.com/chat/completions';
    
    const payload = {
      model: model || 'deepseek-chat',
      messages,
      temperature: 0.1,
      response_format: jsonSchema ? { type: 'json_object' } : { type: 'text' }
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`API Error: ${res.status} ${err}`);
    }
    
    const data = await res.json();
    return data.choices[0].message.content;
  }

  async function requestGLM(apiKey, model, messages, jsonSchema = true) {
    const url = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
    
    const payload = {
      model: model || 'glm-4.6v',
      messages,
      temperature: 0.1
    };
    if (jsonSchema) {
      payload.response_format = { type: 'json_object' };
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`GLM API Error: ${res.status} ${err}`);
    }
    
    const data = await res.json();
    return data.choices[0].message.content;
  }

  function parseJsonResponse(text) {
    text = text.trim();
    const match = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (match) {
      text = match[1].trim();
    }
    return JSON.parse(text);
  }

  async function generateReview(sessionData, settings) {
    if (!settings || !settings.provider || settings.provider === 'none') {
      throw new Error('未配置 AI 服务商');
    }

    const { apiKey, model, provider } = settings;
    if (provider !== 'mock' && !apiKey) throw new Error('API Key 未配置');

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Quiz Session Data: \n${JSON.stringify(sessionData)}` }
    ];

    let lastError = null;
    let requestFn = requestDeepSeek;

    if (provider === 'glm') {
      requestFn = requestGLM;
    }

    // Strategy 1: strict json_object
    try {
      const raw = await requestFn(apiKey, model, messages, true);
      const parsed = parseJsonResponse(raw);
      if (parsed && parsed.summary) return { result: parsed };
    } catch (err) {
      lastError = err;
    }

    // Strategy 2: fallback without response_format json_object
    try {
      const raw = await requestFn(apiKey, model, messages, false);
      const parsed = parseJsonResponse(raw);
      if (parsed && parsed.summary) return { result: parsed };
    } catch (err) {
      lastError = err;
    }

    throw new Error('AI 分析失败，无法解析 JSON 结果: ' + (lastError ? lastError.message : '未知错误'));
  }

  NS.aiClient = { generateReview };
})();
