'use strict';

const http = require('http');
const fs   = require('fs');
const path = require('path');
const { Obfuscator } = require('./core/obfuscator');

const PORT = process.env.PORT || 3000;
const MIME = {
  '.html':'text/html','.css':'text/css',
  '.js':'application/javascript','.ico':'image/x-icon',
};

http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin','*');
    res.setHeader('Access-Control-Allow-Methods','POST,GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers','Content-Type');
    return res.writeHead(200).end();
  }

  if (req.url === '/api/obfuscate' && req.method === 'POST') {
    let raw = '';
    req.on('data', d => raw += d);
    req.on('end', () => {
      res.setHeader('Access-Control-Allow-Origin','*');
      res.setHeader('Content-Type','application/json');
      try {
        const { code, mode } = JSON.parse(raw);
        if (!code) { res.writeHead(400); return res.end(JSON.stringify({error:'Missing code'})); }
        const obf = new Obfuscator(mode);
        const result = obf.obfuscate(code);
        res.writeHead(200);
        res.end(JSON.stringify({
          obfuscated: result, mode: obf.mode,
          inputSize: code.length, outputSize: result.length,
          ratio: ((result.length/code.length)*100).toFixed(1)+'%',
        }));
      } catch(e) {
        res.writeHead(500);
        res.end(JSON.stringify({error:e.message}));
      }
    });
    return;
  }

  let fp = req.url === '/' ? '/frontend/index.html' : '/frontend' + req.url;
  fp = path.join(__dirname, fp);
  fs.readFile(fp, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.setHeader('Content-Type', MIME[path.extname(fp)] || 'text/plain');
    res.writeHead(200); res.end(data);
  });
}).listen(PORT, () => console.log(`\n  ProteccT Dev → http://localhost:${PORT}\n`));
