require('dotenv').config();

const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Load config
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));

// Load system prompt (fill in your SKILL prompt in system-prompt.js)
const systemPrompt = require('./system-prompt');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- API Proxy (protects API Key from frontend) ---
app.post('/api/chat', async (req, res) => {
  const { messages } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array is required' });
  }

  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API_KEY not configured' });
  }

  const fullMessages = [
    { role: 'system', content: systemPrompt },
    ...messages,
  ];

  try {
    const apiRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': config.brand.siteUrl || 'https://ai-tool.local',
        'X-Title': config.brand.toolName || 'AI Tool',
      },
      body: JSON.stringify({
        model: process.env.API_MODEL || config.api.model || 'anthropic/claude-sonnet-4',
        messages: fullMessages,
        max_tokens: config.api.maxTokens || 2000,
        temperature: config.api.temperature ?? 0.7,
      }),
    });

    if (!apiRes.ok) {
      const errText = await apiRes.text();
      console.error(`API error [${apiRes.status}]: ${errText}`);
      return res.status(apiRes.status).json({ error: 'AI API error' });
    }

    const data = await apiRes.json();
    const content = data.choices?.[0]?.message?.content || '';
    res.json({ content });
  } catch (err) {
    console.error('API call failed:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- Config endpoint (safe brand info only, no API keys) ---
app.get('/api/config', (req, res) => {
  res.json({ brand: config.brand });
});

// --- Health Check ---
app.get('/health', (req, res) => {
  res.json({ status: 'ok', tool: config.brand.toolName });
});

// --- SPA Fallback ---
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- Keep-Alive ---
const KEEP_ALIVE_URL = process.env.RENDER_EXTERNAL_URL || process.env.KEEP_ALIVE_URL;
if (KEEP_ALIVE_URL) {
  setInterval(() => { fetch(KEEP_ALIVE_URL).catch(() => {}); }, 14 * 60 * 1000);
}

app.listen(PORT, () => {
  console.log(`${config.brand.toolName} running on port ${PORT}`);
});
