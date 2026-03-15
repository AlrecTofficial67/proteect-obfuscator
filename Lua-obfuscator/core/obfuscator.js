'use strict';
const { Randomizer }  = require('./randomizer');
const { Compiler }    = require('./compiler');
const { VMCodegen }   = require('./vm_codegen');
const { Protections } = require('./protections');

function obsN(n, rng) {
  const a=rng.nextInt(100000,999999);
  return rng.pick([`${n+a}+(-${a})`,`-${a-n}+${a}`]);
}

// Pack the VM output into an encrypted string payload
function packIntoEncryptedPayload(vmCode, rng) {
  const keys = rng.randomKeyArray(rng.nextInt(10,18));
  const seed  = rng.nextInt(1,254);
  const enc   = [];
  let state   = seed;
  for(let i=0;i<vmCode.length;i++){
    let b = (vmCode.charCodeAt(i) ^ keys[i%keys.length]) & 0xFF;
    b = (b ^ state) & 0xFF;
    state = (state*17 + b + i) & 0xFF;
    enc.push(b);
  }
  const ev=rng.randomName(),kv=rng.randomName(),fn=rng.randomName();
  const iv=rng.randomName(),sv=rng.randomName(),bv=rng.randomName();
  const stv=rng.randomName(),fv=rng.randomName(),erv=rng.randomName();
  return [
    `local ${ev}={${enc.join(',')}}`,
    `local ${kv}={${keys.join(',')}}`,
    `local function ${fn}()`,
    `local ${sv}="" local ${stv}=${seed}`,
    `for ${iv}=1,#${ev} do`,
    `local ${bv}=bit32.bxor(${ev}[${iv}],${kv}[((${iv}-1)%#${kv})+1])`,
    `${bv}=bit32.bxor(${bv},${stv})`,
    `${stv}=(${stv}*17+${ev}[${iv}]+(${iv}-1))%256`,
    `${sv}=${sv}..string.char(${bv})`,
    `end`,
    `local ${fv},${erv}=(loadstring or load)(${sv})`,
    `return ${fv} and ${fv}() or error(tostring(${erv}))`,
    `end`,
    `${fn}()`,
  ].join('\n');
}

function buildCredit(mode) {
  const ts = new Date().toISOString().replace('T',' ').slice(0,19);
  const ml = mode==='executor'?'Lua Universal Executor (Luau/Roblox)':'Lua Standard (VM Bytecode)';
  return `--[[ obfuscator by Alrect proteccT 5.4\n     Mode  : ${ml}\n     Build : ${ts}\n     Engine: Custom Bytecode Compiler + VM Interpreter\n     Opcodes: ${Object.keys(require('./compiler').OP).length} (randomized per build)\n--]]`;
}

class Obfuscator {
  constructor(mode){
    this.mode = mode==='executor'?'executor':'standard';
    this.rng  = new Randomizer();
    this.prot = new Protections(this.rng);
  }

  obfuscate(src) {
    // Step 1: Compile Lua source → custom bytecode proto
    const compiler = new Compiler();
    let proto;
    try {
      proto = compiler.compile(src);
    } catch(e) {
      throw new Error(`Compile error: ${e.message}`);
    }

    // Step 2: Generate VM + encrypted bytecode
    const vmgen = new VMCodegen(this.rng);
    const vmCode = vmgen.build(proto, this.rng);

    let code;
    if(this.mode === 'executor') {
      // Executor: NO loadstring wrapper (Roblox LocalScript blocks it)
      // Instead: inline VM runtime directly, no outer load()
      code = vmCode;
    } else {
      // Standard: wrap VM code in encrypted payload (loadstring/load)
      code = packIntoEncryptedPayload(vmCode, this.rng);
    }

    // Step 3: Add anti-hook captures
    const antiHook = this.prot.buildAntiHook(this.rng);
    code = antiHook + '\n' + code;

    return buildCredit(this.mode) + '\n' + code;
  }
}

module.exports = { Obfuscator };
