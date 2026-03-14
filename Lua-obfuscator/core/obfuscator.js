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
  'tostring','type','unpack','warn','xpcall',
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
  const xorFn  = rng.randomName();
  const rotFn  = rng.randomName();
  const kXor   = rng.randomKeyArray(rng.nextInt(8, 20));
  const kRot   = rng.randomKeyArray(rng.nextInt(8, 20));
  const iV=rng.randomName(), sV=rng.randomName(), dV=rng.randomName(), eV=rng.randomName();

  const xorDecl = [
    `local function ${xorFn}(${eV},${iV})`,
    `local ${sV}=""`,
    `for ${dV}=1,#${eV} do`,
    `${sV}=${sV}..string.char(${eV}[${dV}]~${iV}[((${dV}-1)%#${iV})+1])`,
    `end`,
    `return ${sV}`,
    `end`,
  ].join('\n');

  const iV2=rng.randomName(), sV2=rng.randomName(), dV2=rng.randomName(), eV2=rng.randomName(), tV=rng.randomName();
  const rotDecl = [
    `local function ${rotFn}(${eV2},${iV2})`,
    `local ${sV2}=""`,
    `for ${dV2}=1,#${eV2} do`,
    `local ${tV}=(${eV2}[${dV2}]-${iV2}[((${dV2}-1)%#${iV2})+1]+256)%256`,
    `${sV2}=${sV2}..string.char(${tV})`,
    `end`,
    `return ${sV2}`,
    `end`,
  ].join('\n');

  const kXorVar = rng.randomName();
  const kRotVar = rng.randomName();
  let counter = 0;

  const replaced = code.replace(/"((?:[^"\\]|\\.)*?)"|'((?:[^'\\]|\\.)*?)'/g, (match, g1, g2) => {
    const raw = g1 !== undefined ? g1 : g2;
    const str = raw
      .replace(/\\n/g,'\n').replace(/\\t/g,'\t').replace(/\\r/g,'\r')
      .replace(/\\\\/g,'\\').replace(/\\"/g,'"').replace(/\\'/g,"'");
    if (str.length === 0) return '""';

    counter++;
    if (rng.next() > 0.5) {
      const enc = [];
      for (let i = 0; i < str.length; i++) enc.push((str.charCodeAt(i) ^ kXor[i % kXor.length]) & 0xFF);
      return `${xorFn}({${enc.join(',')}},${kXorVar})`;
    } else {
      const enc = [];
      for (let i = 0; i < str.length; i++) enc.push((str.charCodeAt(i) + kRot[i % kRot.length]) & 0xFF);
      return `${rotFn}({${enc.join(',')}},${kRotVar})`;
    }
  });

  if (counter === 0) return code;

  const header = [
    xorDecl, rotDecl,
    `local ${kXorVar}={${kXor.join(',')}}`,
    `local ${kRotVar}={${kRot.join(',')}}`,
  ].join('\n') + '\n';

  return header + replaced;
}

function layer2b_encodeNumbers(code, rng, encoder) {
  return code.replace(/\b(\d+)\b/g, (match, num) => {
    const n = parseInt(num, 10);
    if (n < 0 || n > 9999 || rng.next() > 0.55) return match;
    return encoder.obfuscateNumber(n, rng);
  });
}

function layer3_controlFlow(code, rng, prot) {
  const lines = code.split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    out.push(lines[i]);
    if (i > 0 && i % 8 === 0 && rng.next() > 0.45) out.push(prot.buildDeadCode(rng));
    if (i > 0 && i % 12 === 0 && rng.next() > 0.55) out.push(prot.buildOpaquePredicate(rng));
  }
  return out.join('\n');
}

function layer4_vm(code, vmBuilder, rng) {
  return vmBuilder.wrapInVM(code, rng);
}

function layer4b_miniVMWrap(code, vmBuilder, rng) {
  return vmBuilder.buildMiniVM(code, rng);
}

function layer5_protections(code, mode, prot, rng) {
  const header = prot.buildFullHeader(mode, code, rng);
  return header + '\n' + code;
}

function buildCreditBlock(mode) {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  return [
    `--[[ obfuscator by Alrect proteccT 5.4`,
    `     Mode    : ${mode === 'executor' ? 'Lua Universal Executor' : 'Lua Standard'}`,
    `     Build   : ${ts}`,
    `     Layers  : Rename + StrEncrypt + ControlFlow + VM + RuntimeProt`,
    `     VM      : Custom bytecode · Encrypted pool · Rand opcodes`,
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

    code = layer4_vm(code, this.vm, this.rng);

    code = layer4b_miniVMWrap(code, this.vm, this.rng);

    code = layer5_protections(code, this.mode, this.prot, this.rng);

    const credit = buildCreditBlock(this.mode);
    return credit + '\n' + code;
  }
}

module.exports = { Obfuscator };
