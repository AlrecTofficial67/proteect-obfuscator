'use strict';
const { Randomizer } = require('./randomizer');

// Arithmetic obfuscation for a number n
function obsNum(n, rng) {
  n = Math.floor(n);
  const a = rng.nextInt(100000, 999999);
  const variants = [
    () => `${n+a}+-${a}`,
    () => `-${a-n}+${a}`,
    () => `${n+a}+(-${a})`,
    () => `-${a}+${a+n}`,
  ];
  return rng.pick(variants)();
}

// Obfuscate string as decimal escape sequence \097\098...
function escStr(s) {
  let out = '"';
  for(let i=0;i<s.length;i++){
    const c=s.charCodeAt(i).toString().padStart(3,'0');
    out += `\\${c}`;
  }
  return out+'"';
}

// Build the "w" string table used by WeAreDev
// Each string gets encoded as escaped decimals
function buildStringTable(strings, rng) {
  // Produce entries like "\097\098\099"
  const entries = strings.map(s => escStr(s));
  return entries;
}

// Obfuscate a table-index access like w[idx+OFFSET]
function tblGet(idx, rng) {
  return `w[${obsNum(idx, rng)}]`;
}

// Generate the full WeAreDev-style obfuscated script
function generateObfuscated(sourceCode, mode, rng) {
  // ── Collect all string literals from source ──
  const stringMap = new Map(); // original -> index
  const strings = [''];        // index 0 = empty placeholder

  // Extract strings
  const strRe = /"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'/g;
  let m;
  const stringSources = [];
  while((m=strRe.exec(sourceCode))!==null){
    const raw = m[1]!==undefined?m[1]:m[2];
    const decoded = raw
      .replace(/\\n/g,'\n').replace(/\\t/g,'\t').replace(/\\r/g,'\r')
      .replace(/\\\\/g,'\\').replace(/\\"/g,'"').replace(/\\'/g,"'");
    if(!stringMap.has(decoded)){
      stringMap.set(decoded, strings.length);
      strings.push(decoded);
    }
    stringSources.push({full:m[0], decoded, start:m.index});
  }

  // Add Lua standard lib strings used by VM
  const luaLibStrings = [
    'string','table','math','bit32','pcall','error','type',
    'tostring','tonumber','pairs','ipairs','select','unpack',
    'string.char','string.byte','string.sub','string.len','string.format',
    'table.concat','table.insert','table.remove','math.floor','math.abs',
    'bit32.bxor','bit32.bor','bit32.band','bit32.rshift','bit32.lshift',
    'getfenv','_ENV','setmetatable','getmetatable','rawget','rawset','newproxy',
  ];
  luaLibStrings.forEach(s => {
    if(!stringMap.has(s)){ stringMap.set(s,strings.length); strings.push(s); }
  });

  // ── Shuffle string table (polymorphic) ──
  const tableOffset = rng.nextInt(200000, 800000);

  // Build string table with base64-like XOR encoding
  const xorKey = rng.randomKeyArray(8);
  const encStrings = strings.map((s,i) => {
    if(i===0) return '""';
    // Encode as escaped decimal + XOR shift
    let out = '"';
    for(let j=0;j<s.length;j++){
      const b = (s.charCodeAt(j) + xorKey[j%xorKey.length]) & 0xFF;
      out += `\\${b.toString().padStart(3,'0')}`;
    }
    return out + '"';
  });

  // ── Replace strings in source with w-table lookups ──
  let processedSource = sourceCode;
  // Replace all string literals with table references
  processedSource = processedSource.replace(strRe, (match, g1, g2) => {
    const raw = g1!==undefined?g1:g2;
    const decoded = raw
      .replace(/\\n/g,'\n').replace(/\\t/g,'\t').replace(/\\r/g,'\r')
      .replace(/\\\\/g,'\\').replace(/\\"/g,'"').replace(/\\'/g,"'");
    const idx = stringMap.get(decoded);
    if(idx===undefined) return match;
    return `v(${obsNum(idx-tableOffset, rng)})`;
  });

  // Replace numeric literals with obfuscated expressions
  processedSource = processedSource.replace(/(?<![.\w])\b(\d+)\b(?!\s*[=.])/g, (match, num) => {
    const n = parseInt(num,10);
    if(n > 99999 || rng.next() > 0.6) return match;
    return `(${obsNum(n, rng)})`;
  });

  // ── Build the string decoder function ──
  // Decode: char = (byte - key[i%keylen]) & 0xFF
  const decFnName = 'v';
  const charFn = rng.randomName();
  const lenFn  = rng.randomName();
  const concatFn = rng.randomName();
  const mathFloor = rng.randomName();

  // String decode function using xorKey
  const keyArr = `{${xorKey.join(',')}}`;
  const decFnBody = [
    `local function ${decFnName}(${mathFloor})`,
    `local ${charFn}=string.char`,
    `local ${lenFn}=${tableOffset}`,
    `return w[${mathFloor}+${lenFn}]`,
    `end`,
  ].join('\n');

  // Actually we just use offset arithmetic — w[v(idx-offset)] = w[idx]
  // The decode fn just adds back the offset
  const simpleDec = `local function v(x) return w[x+(${tableOffset})] end`;

  // ── Generate the string table header ──
  const tableRows = [];
  const ROW = 8;
  for(let i=0;i<encStrings.length;i+=ROW){
    const chunk = encStrings.slice(i,i+ROW).join(',');
    tableRows.push(chunk);
  }
  const tableDecl = `local w={${encStrings.slice(1).join(';')}}`;

  // ── Post-process: decode w table at runtime ──
  // We need to XOR-decode each entry in w
  const decodeLoop = buildDecodeLoop(xorKey, rng);

  // ── Build the iterator shuffle (WeAreDev uses ipairs loop to shuffle) ──
  // This is the for v,O in ipairs({{...},{...}}) shuffle trick
  const shuffleCode = buildShuffleCode(encStrings.length, rng);

  // ── Wrap everything ──
  const credit = `--[[ obfuscator by Alrect proteccT 5.4 ]]`;

  const output = [
    credit,
    `return(function(...)`,
    tableDecl,
    shuffleCode,
    simpleDec,
    `do`,
    decodeLoop,
    `end`,
    `return(function()`,
    processedSource,
    `end)()`,
    `end)(...)`,
  ].join('\n');

  return output;
}

// Build the decode loop that XOR-decodes w table entries
function buildDecodeLoop(xorKey, rng) {
  const lines = [];
  const iV = rng.randomName();
  const jV = rng.randomName();
  const bV = rng.randomName();
  const sV = rng.randomName();
  const wV = 'w';
  const kArr = rng.randomName();
  lines.push(`local ${kArr}={${xorKey.join(',')}}`);
  lines.push(`local ${iV},${jV},${bV},${sV}`);
  lines.push(`for ${iV}=${obsNum(1,rng)},#${wV} do`);
  lines.push(`  ${sV}=${wV}[${iV}]`);
  lines.push(`  if type(${sV})=="string" then`);
  lines.push(`    local _t={}`);
  lines.push(`    for ${jV}=${obsNum(1,rng)},#${sV} do`);
  lines.push(`      ${bV}=string.byte(${sV},${jV})`);
  lines.push(`      ${bV}=(${bV}-${kArr}[((${jV}-(${obsNum(1,rng)}))%#${kArr})+(${obsNum(1,rng)})])%${obsNum(256,rng)}`);
  lines.push(`      _t[${jV}]=string.char(${bV})`);
  lines.push(`    end`);
  lines.push(`    ${wV}[${iV}]=table.concat(_t)`);
  lines.push(`  end`);
  lines.push(`end`);
  return lines.join('\n');
}

// Build the WeAreDev-style shuffle (confuses decompilers)
function buildShuffleCode(tableSize, rng) {
  // Generate 3-4 swap pairs
  const pairs = [];
  const n = Math.min(tableSize-1, rng.nextInt(3,5));
  for(let i=0;i<n;i++){
    const a = rng.nextInt(1, Math.max(1,tableSize-2));
    const b = rng.nextInt(1, Math.max(1,tableSize-2));
    if(a!==b) pairs.push([a,b]);
  }
  if(pairs.length===0) return '';

  const entries = pairs.map(([a,b]) => `{${obsNum(a,rng)},${obsNum(b,rng)}}`);
  const vN = rng.randomName();
  const ON = rng.randomName();

  return [
    `for ${vN},${ON} in ipairs({${entries.join(',')}})do`,
    `  w[${ON}[${obsNum(1,rng)}]],w[${ON}[${obsNum(2,rng)}]]=w[${ON}[${obsNum(2,rng)}]],w[${ON}[${obsNum(1,rng)}]]`,
    `end`,
  ].join('\n');
}

module.exports = { generateObfuscated, escStr, obsNum };
