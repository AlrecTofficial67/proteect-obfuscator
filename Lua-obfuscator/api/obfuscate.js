'use strict';

const { Obfuscator } = require('../core/obfuscator');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'Invalid JSON' }); }
  }

  const { code, mode } = body || {};
  if (!code || typeof code !== 'string') return res.status(400).json({ error: 'Missing code' });
  if (code.length > 500000) return res.status(413).json({ error: 'Code too large (max 500KB)' });

  try {
    const obf = new Obfuscator(mode === 'executor' ? 'executor' : 'standard');
    const obfuscated = obf.obfuscate(code);
    return res.status(200).json({
      obfuscated,
      mode: obf.mode,
      inputSize: code.length,
      outputSize: obfuscated.length,
      ratio: ((obfuscated.length / code.length) * 100).toFixed(1) + '%',
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Obfuscation failed', detail: err.message });
  }
};
