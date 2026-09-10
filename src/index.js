// src/index.js — entry point
require('dotenv').config();

const express = require('express');
const path = require('path');
const { initDb } = require('./db');
const { verifyWebhook } = require('./whatsapp');
const { handleIncomingMessage } = require('./bot');
const apiRoutes = require('./routes/api');

initDb();

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// ----- WhatsApp webhook -----
app.get('/webhook', verifyWebhook);

app.post('/webhook', (req, res) => {
  res.sendStatus(200); // always answer Meta quickly
  try {
    const body = req.body;
    const entries = body.entry || [];
    for (const entry of entries) {
      for (const change of entry.changes || []) {
        const value = change.value;
        if (!value || !value.messages) continue;
        for (const msg of value.messages) {
          if (msg.type !== 'text') continue;
          const phone = msg.from;
          const text = msg.text.body || '';
          const profileName = value.contacts?.[0]?.profile?.name || null;
          console.log(`[msg] ${phone}: ${text.slice(0, 80)}`);
          handleIncomingMessage(phone, text, profileName).catch((e) =>
            console.error('[bot] error:', e)
          );
        }
      }
    }
  } catch (e) {
    console.error('[webhook] parse error:', e);
  }
});

// ----- Dashboard API -----
app.use('/api', apiRoutes);

// ----- Dashboard static files -----
app.use(express.static(path.join(__dirname, '..', 'public')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════════╗
  ║   DZ WhatsApp Shop running on port ${PORT}   ║
  ║   Dashboard: http://localhost:${PORT}       ║
  ║   Webhook:   http://localhost:${PORT}/webhook ║
  ╚══════════════════════════════════════════╝
  VERIFY_TOKEN set: ${!!process.env.VERIFY_TOKEN}
  WHATSAPP_TOKEN set: ${!!process.env.WHATSAPP_TOKEN}
  KIMI_API_KEY set:   ${!!process.env.KIMI_API_KEY}
  `);
});
