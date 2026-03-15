'use strict';
const { Randomizer } = require('./randomizer');

// ── Arithmetic expression that evaluates to n at runtime (not obvious) ──
function obsNum(n, rng) {
  n = Math.floor(n);
  const a = rng.nextInt(100000, 999999);
  const b = rng.nextInt(100000, 999999);
  const variants = [
    () => `${n+a}+(-${a})`,
    () => `-${b-n}+${b}`,
    () => `(${n+a+b}-${b}-${a})`,
    () => `(${n+a}+-${a})`,
  ];
  return rng.pick(variants)();
}

// ── Encode string as decimal byte sequence ──
function encodeStr(s, fwdTable) {
  let out = '"';
  for(let i=0;i<s.length;i++){
    const b = fwdTable[s.charCodeAt(i)];
    out += `\\${b.toString().padStart(3,'0')}`;
  }
  return out+'"';
}

// ── Build 256-entry substitution table ──
function buildSubTable(rng) {
  const fwd = Array.from({length:256},(_,i)=>i);
  for(let i=255;i>0;i--){const j=rng.nextInt(0,i);[fwd[i],fwd[j]]=[fwd[j],fwd[i]];}
  const rev = new Array(256);
  fwd.forEach((v,i)=>{rev[v]=i;});
  return {fwd,rev};
}

// ── Generate a runtime key — derived from math, NOT a literal array ──
// The key is computed from several obfuscated arithmetic expressions
// so there's no "key = {x,y,z}" visible in the output
function buildRuntimeKey(keyValues, rng) {
  const N = () => rng.randomName();
  const keyVar = N();
  const lines = [];
  const tempVars = keyValues.map(() => N());

  // Each key byte computed as expression
  keyValues.forEach((k, i) => {
    const a = rng.nextInt(10, 200);
    const b = rng.nextInt(10, 200);
    // k = ((a * b) - (a*b - k)) = k, but looks like math
    const expr = `(${obsNum(a*b - k, rng)}+${obsNum(k, rng)})%256`;
    lines.push(`local ${tempVars[i]}=${expr}`);
  });

  lines.push(`local ${keyVar}={${tempVars.join(',')}}`);

  // Zeroize temps (confuse static analysis)
  tempVars.forEach(v => lines.push(`${v}=nil`));

  return { code: lines.join('\n'), keyVar };
}

// ── Split decoder into 3 chained functions ──
// fn_a does step 1, fn_b does step 2, fn_c assembles
// No single function does the full decode
function buildSplitDecoder(rng, keyVar, period) {
  const N = () => rng.randomName();
  const fnA = N(), fnB = N(), fnC = N();
  const a1=N(),b1=N(),c1=N(),d1=N(),e1=N();
  const a2=N(),b2=N(),c2=N(),d2=N(),e2=N();
  const a3=N(),b3=N(),c3=N(),d3=N();

  // fnA: reverse nibble swap on marked positions → returns intermediate byte array
  const magic = rng.nextInt(20, 200);
  const maskedPeriod = period ^ magic;
  const lines = [];

  lines.push(`local function ${fnA}(${a1})`);
  lines.push(`local ${b1}={} local _p=bit32.bxor(${maskedPeriod},${magic})`);
  lines.push(`for ${c1}=1,#${a1} do`);
  lines.push(`local ${d1}=${a1}[${c1}]`);
  lines.push(`if(${c1}-1)%_p==0 then ${d1}=bit32.bor(bit32.lshift(bit32.band(${d1},15),4),bit32.rshift(${d1},4)) end`);
  lines.push(`${b1}[${c1}]=${d1}`);
  lines.push(`end return ${b1} end`);

  // fnB: apply reverse substitution using split key
  // key is passed in, not embedded here
  lines.push(`local function ${fnB}(${a2},${b2},${c2})`);
  lines.push(`local ${d2}=string.char(${c2}[${a2}[${b2}]+1]) return ${d2} end`);

  // fnC: orchestrate — calls fnA then fnB per byte, assembles result
  const tbl = N(), iv = N(), sv = N(), tmp = N(), rev = N();
  lines.push(`local function ${fnC}(${a3},${b3})`);
  lines.push(`local ${sv}="" local ${tmp}=${fnA}(${a3})`);
  lines.push(`for ${iv}=1,#${tmp} do`);
  lines.push(`${sv}=${sv}..${fnB}(${tmp},${iv},${b3})`);
  lines.push(`end return ${sv} end`);

  return { code: lines.join('\n'), fnC };
}

// ── Build fake control flow — state machine that wraps actual logic ──
function wrapInStateMachine(bodyLines, rng) {
  const N = () => rng.randomName();
  const stateVar = N();
  const resultVar = N();

  // Assign random state IDs
  const numStates = bodyLines.length;
  const stateIds = Array.from({length: numStates}, () => rng.nextInt(100000, 999999));
  // Shuffle execution order
  const order = Array.from({length: numStates}, (_,i) => i);
  rng.shuffle(order);

  const lines = [];
  lines.push(`local ${stateVar}=${obsNum(stateIds[order[0]], rng)}`);
  lines.push(`local ${resultVar}`);
  lines.push(`while true do`);

  order.forEach((realIdx, execIdx) => {
    const sid = stateIds[realIdx];
    const nextIdx = execIdx + 1 < order.length ? order[execIdx + 1] : -1;
    const nextSid = nextIdx >= 0 ? stateIds[nextIdx] : -1;
    lines.push(`if ${stateVar}==${obsNum(sid,rng)} then`);
    lines.push(`  ${bodyLines[realIdx]}`);
    if(nextSid >= 0) lines.push(`  ${stateVar}=${obsNum(nextSid,rng)}`);
    else lines.push(`  break`);
    lines.push(`end`);
  });

  lines.push(`end`);
  return lines.join('\n');
}

// ── Build the rev table split into 8 chunks, assembled in closure ──
function buildRevTableClosure(rev, rng) {
  const N = () => rng.randomName();
  const chunks = [], cvars = [];
  for(let c=0;c<8;c++){
    cvars.push(N());
    chunks.push(rev.slice(c*32,(c+1)*32));
  }
  const outerFn = N(), tbl = N(), iv = N();
  const lines = [];
  chunks.forEach((ch,c) => lines.push(`local ${cvars[c]}={${ch.join(',')}}`));
  lines.push(`local ${outerFn}=(function()`);
  lines.push(`local ${tbl}={}`);
  cvars.forEach((cv,c) => lines.push(`for ${iv}=1,#${cv} do ${tbl}[${c*32}+${iv}]=${cv}[${iv}] end`));
  // Zero out chunks
  cvars.forEach(cv => lines.push(`${cv}=nil`));
  lines.push(`return ${tbl}`);
  lines.push(`end)()`);
  return { code: lines.join('\n'), tblVar: outerFn };
}

// ── Main generator ──
function generateHardObfuscated(sourceCode, rng) {
  // Build sub table
  const subTable = buildSubTable(rng);
  const period = rng.nextInt(2, 6);

  // Collect all strings from source
  const strings = [];
  const strMap = new Map();
  const strRe = /"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*?)'/g;
  let m;
  while((m = strRe.exec(sourceCode)) !== null) {
    const raw = m[1] !== undefined ? m[1] : m[2];
    const decoded = raw
      .replace(/\\n/g,'\n').replace(/\\t/g,'\t').replace(/\\r/g,'\r')
      .replace(/\\\\/g,'\\').replace(/\\"/g,'"').replace(/\\'/g,"'");
    if(!strMap.has(decoded)) {
      strMap.set(decoded, strings.length);
      strings.push(decoded);
    }
  }

  if(strings.length === 0) {
    // No strings — just wrap with dead code + rename
    return buildNoStringOutput(sourceCode, rng);
  }

  // Encode all strings using substitution + nibble swap
  const encodedStrings = strings.map(s => {
    const enc = [];
    for(let i=0;i<s.length;i++){
      let b = subTable.fwd[s.charCodeAt(i)];
      if(i % period === 0) b = ((b&0x0F)<<4)|((b&0xF0)>>4);
      enc.push(b);
    }
    return enc;
  });

  // Build runtime key from math expressions
  const keyLen = rng.nextInt(8, 14);
  const keyValues = rng.randomKeyArray(keyLen);
  const { code: keyCode, keyVar } = buildRuntimeKey(keyValues, rng);

  // Build rev table closure
  const { code: revCode, tblVar: revVar } = buildRevTableClosure(subTable.rev, rng);

  // Build split decoder
  const { code: decoderCode, fnC: decFn } = buildSplitDecoder(rng, keyVar, period);

  // Replace strings in source with decoder calls
  // Each string stored as local variable, not inline
  const strVars = strings.map(() => rng.randomName());
  const strDecls = strings.map((s, i) => {
    const enc = encodedStrings[i];
    return `local ${strVars[i]}=${decFn}({${enc.join(',')}},${revVar})`;
  });

  // Replace string literals in source
  let processedSource = sourceCode;
  // Sort by length desc to avoid partial replacements
  const sortedEntries = [...strMap.entries()].sort((a,b) => b[0].length - a[0].length);
  for(const [str, idx] of sortedEntries) {
    const quotedVariants = [
      `"${str.replace(/\\/g,'\\\\').replace(/"/g,'\\"').replace(/\n/g,'\\n').replace(/\t/g,'\\t')}"`,
      `'${str.replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/\n/g,'\\n').replace(/\t/g,'\\t')}'`,
    ];
    for(const q of quotedVariants) {
      processedSource = processedSource.split(q).join(strVars[idx]);
    }
  }

  // Obfuscate remaining numbers
  processedSource = processedSource.replace(/(?<![.\w])\b([1-9]\d{0,3})\b(?!\s*[=.])/g, (match, num) => {
    const n = parseInt(num, 10);
    if(rng.next() > 0.45) return match;
    return `(${obsNum(n, rng)})`;
  });

  // Add dead code between string declarations
  const strDeclsWithJunk = [];
  const prot = require('./protections');
  const protObj = new (prot.Protections || require('./protections'))(rng);
  strDecls.forEach((decl, i) => {
    strDeclsWithJunk.push(decl);
    if(i % 3 === 0 && rng.next() > 0.4) {
      strDeclsWithJunk.push(buildDeadLocal(rng));
    }
  });

  // Fake string variables (look like decodings but unused)
  const fakeVars = buildFakeStrDecls(rng, decFn, revVar, subTable.fwd, period, rng.nextInt(3,6));

  // Shuffle the string decl order (harder to track index → string)
  const shuffledDecls = [...strDeclsWithJunk];
  // We don't shuffle the actual array because references must match — just add junk between them

  const output = [
    `--[[ obfuscator by Alrect proteccT 5.4 ]]`,
    `return(function(...)`,
    // Rev table as closure — 8 chunks, assembled at runtime
    revCode,
    // Key computed from math, no literal array visible
    keyCode,
    // Split decoder (3 functions)
    decoderCode,
    // Fake unused decodings (noise)
    fakeVars,
    // Actual string decodings
    ...strDeclsWithJunk,
    // The actual code
    `return(function()`,
    processedSource,
    `end)()`,
    `end)(...)`,
  ].join('\n');

  return output;
}

function buildDeadLocal(rng) {
  const v1 = rng.randomName(), v2 = rng.randomName();
  const a = rng.nextInt(1,999);
  return rng.pick([
    `do local ${v1}=${obsNum(a,rng)} local _=${v1}+0 end`,
    `if false then local ${v1}=${a} end`,
    `do local ${v1}=nil if ${v1} then local _=${v2} end end`,
  ]);
}

function buildFakeStrDecls(rng, decFn, revVar, fwd, period, count) {
  const lines = [];
  for(let i=0;i<count;i++){
    const fakeStr = generateFakeStr(rng);
    const enc = [];
    for(let j=0;j<fakeStr.length;j++){
      let b = fwd[fakeStr.charCodeAt(j)];
      if(j%period===0) b=((b&0x0F)<<4)|((b&0xF0)>>4);
      enc.push(b);
    }
    const vn = rng.randomName();
    // Declare but never use (confuse reverse engineer into thinking these are real strings)
    lines.push(`local ${vn}=${decFn}({${enc.join(',')}},${revVar})`);
  }
  return lines.join('\n');
}

function generateFakeStr(rng) {
  const pool = ['debug','hook','getinfo','environment','sandbox','dump','bytecode','chunk','proto','upvalue'];
  return rng.pick(pool) + rng.nextInt(1,99);
}

function buildNoStringOutput(sourceCode, rng) {
  // No strings to encrypt — just add dead code wrapper
  return [
    `--[[ obfuscator by Alrect proteccT 5.4 ]]`,
    `return(function(...)`,
    `return(function()`,
    sourceCode,
    `end)()`,
    `end)(...)`,
  ].join('\n');
}

module.exports = { generateHardObfuscated };
