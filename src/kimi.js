// src/kimi.js — Kimi (Moonshot) API client with strict JSON output
const KIMI_API_KEY = process.env.KIMI_API_KEY;
const KIMI_BASE_URL = process.env.KIMI_BASE_URL || 'https://api.moonshot.ai/v1';
const KIMI_MODEL = process.env.KIMI_MODEL || 'kimi-k2-0905-preview';

/**
 * Call Kimi chat completion.
 * @param {Array<{role:string, content:string}>} messages
 * @param {number} temperature
 * @returns {Promise<string>} assistant content (JSON string when jsonMode=true)
 */
async function kimiChat(messages, { temperature = 0.2, jsonMode = true } = {}) {
  if (!KIMI_API_KEY) {
    throw new Error('KIMI_API_KEY is not set');
  }
  const res = await fetch(`${KIMI_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${KIMI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: KIMI_MODEL,
      messages,
      temperature,
      response_format: jsonMode ? { type: 'json_object' } : undefined,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('[kimi] error:', res.status, JSON.stringify(data).slice(0, 500));
    throw new Error(`Kimi API error: ${res.status}`);
  }
  return data.choices?.[0]?.message?.content || '';
}

/** Parse JSON from Kimi output, tolerant to code fences. Retries once on failure. */
async function kimiJson(messages, opts = {}) {
  let raw = await kimiChat(messages, opts);
  raw = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  try {
    return JSON.parse(raw);
  } catch (e) {
    console.warn('[kimi] JSON parse failed, retrying once. Raw:', raw.slice(0, 200));
    raw = await kimiChat(messages, { ...opts, temperature: 0 });
    raw = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
    return JSON.parse(raw);
  }
}

module.exports = { kimiChat, kimiJson };
