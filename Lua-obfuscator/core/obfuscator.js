'use strict';

const { Randomizer }  = require('./randomizer');
const { Encoder }     = require('./encoder');
const { VMBuilder }   = require('./vm_builder');
const { Protections } = require('./protections');

const LUA_RESERVED = new Set([
  'and','break','do','else','elseif','end','false','for','function',
  'goto','if','in','local','nil','not','or','repeat','return','then',
  'true','until','while',
  '_G','_ENV','_VERSION',
  'assert','collectgarbage','dofile','error','getmetatable','ipairs',
  'load','loadfile','loadstring','next','pairs','pcall','print','rawequal',
  'rawget','rawlen','rawset','require','select','setmetatable','tonumber',
  'tostring','type','unpack','warn','xpcall','bit32',
  'coroutine','debug','io','math','os','package','string','table',
  'game','workspace','script','task','wait','spawn','delay',
  'Instance','UDim','UDim2','Vector2','Vector3','CFrame','Color3',
  'BrickColor','Enum','tick','time','typeof',
]);

function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'); }

function layer1_rename(code, rng) {
  const nameMap = new Map();
  const identRe = /\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g;
  const seen = new Set();
  let m;
  while ((m = identRe.exec(code)) !== null) {
    const id = m[1];
    if (!LUA_RESERVED.has(id) && id.length >= 2) seen.add(id);
  }
  seen.forEach(id => nameMap.set(id, rng.randomName()));
  let result = code;
  for (const [orig, rep] of nameMap) {
    const re = new RegExp(`(?<![\\w'"])\\b${escRe(orig)}\\b(?![\\w'"])`, 'g');
    result = result.replace(re, rep);
  }
  return result;
}

function layer2_encryptStrings(code, rng, encoder) {
  const xorFn = rng.randomName();
  const rotFn = rng.randomName();
  const kXor  = rng.randomKeyArray(rng.nextInt(8, 16));
  const kRot  = rng.randomKeyArray(rng.nextInt(8, 16));
  const kXorV = rng.randomName();
  const kRotV = rng.randomName();

  const xorDecl = encoder.buildXorDecryptor(xorFn, rng);
  const rotDecl = encoder.buildRotDecryptor(rotFn, rng);

  let counter = 0;
  const replaced = code.replace(/"((?:[^"\\]|\\.)*?)"|'((?:[^'\\]|\\.)*?)'/g, (match, g1, g2) => {
    const raw = g1 !== undefined ? g1 : g2;
    const str = raw
      .replace(/\\n/g,'\n').replace(/\\t/g,'\t').replace(/\\r/g,'\r')
      .replace(/\\\\/g,'\\').replace(/\\"/g,'"').replace(/\\'/g,"'");
    if (str.length === 0) return '""';
    counter++;
    if (rng.next() > 0.5) {
      const enc = encoder.xorEncrypt(str, kXor);
      return `${xorFn}({${enc.join(',')}},${kXorV})`;
    } else {
      const enc = encoder.rotEncrypt(str, kRot);
      return `${rotFn}({${enc.join(',')}},${kRotV})`;
    }
  });

  if (counter === 0) return code;

  const header = [
    xorDecl, rotDecl,
    `local ${kXorV}={${kXor.join(',')}}`,
    `local ${kRotV}={${kRot.join(',')}}`,
  ].join('\n') + '\n';

  return header + replaced;
}

function layer2b_encodeNumbers(code, rng, encoder) {
  return code.replace(/(?<![.\w])\b([1-9]\d{0,3})\b(?!\s*[=.])/g, (match, num) => {
    const n = parseInt(num, 10);
    if (rng.next() > 0.45) return match;
    return encoder.obfuscateNumber(n, rng);
  });
}

function layer3_controlFlow(code, rng, prot) {
  const lines = code.split('\n');
  const out = [];
  let counter = 0;
  for (let i = 0; i < lines.length; i++) {
    out.push(lines[i]);
    counter++;
    if (counter % 8 === 0 && rng.next() > 0.5) out.push(prot.buildDeadCode(rng));
    if (counter % 13 === 0 && rng.next() > 0.55) out.push(prot.buildOpaquePredicate(rng));
  }
  return out.join('\n');
}

function buildCredit(mode) {
  const ts = new Date().toISOString().replace('T',' ').slice(0,19);
  const modeLabel = (mode === 'executor') ? 'Lua Universal Executor (Luau/Roblox)' : 'Lua Standard';
  return [
    `--[[ obfuscator by Alrect proteccT 5.4`,
    `     Mode  : ${modeLabel}`,
    `     Build : ${ts}`,
    `     Compat: Luau, Roblox, Delta, KRNL`,
    `--]]`,
  ].join('\n');
}

class Obfuscator {
  constructor(mode) {
    this.mode = mode === 'executor' ? 'executor' : 'standard';
    this.rng  = new Randomizer();
    this.enc  = new Encoder(this.rng);
    this.vm   = new VMBuilder(this.rng);
    this.prot = new Protections(this.rng);
  }

  obfuscate(src) {
    let code = src;

    code = layer1_rename(code, this.rng);

    code = layer2_encryptStrings(code, this.rng, this.enc);

    if (this.mode === 'standard') {
      code = layer2b_encodeNumbers(code, this.rng, this.enc);
    }

    code = layer3_controlFlow(code, this.rng, this.prot);

    code = this.vm.wrapInVM(code, this.rng);

    code = this.vm.buildMiniVM(code, this.rng);

    code = this.prot.buildFullHeader(this.mode, code, this.rng) + '\n' + code;

    return buildCredit(this.mode) + '\n' + code;
  }
}

module.exports = { Obfuscator };
