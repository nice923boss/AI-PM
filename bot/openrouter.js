// ─── OpenRouter API 呼叫（移植自 line-ai-assistant） ───

const AI_MODEL = () => process.env.AI_MODEL || 'anthropic/claude-sonnet-4';
const API_KEY = () => process.env.OPENROUTER_API_KEY;

async function callOpenRouter(messages, options = {}) {
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY()}`,
        'HTTP-Referer': 'https://ai-pm.local',
        'X-Title': 'AI-PM Bot',
      },
      body: JSON.stringify({
        model: options.model || AI_MODEL(),
        messages,
        max_tokens: options.maxTokens || 1500,
        temperature: options.temperature ?? 0.7,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`OpenRouter error [${res.status}]: ${errText}`);
      return null;
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content || null;
  } catch (err) {
    console.error('OpenRouter call failed:', err.message);
    return null;
  }
}

module.exports = { callOpenRouter };
