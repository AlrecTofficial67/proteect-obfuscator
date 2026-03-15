'use strict';

const { Randomizer } = require('./randomizer');

class Protections {
  constructor(rng) {
    this.rng = rng || new Randomizer();
  }

  // Anti-hook: store references to critical functions before any hook can replace them
  buildAntiHook(rng) {
    const r = rng || this.rng;
    const v1=r.randomName(), v2=r.randomName(), v3=r.randomName();
    const v4=r.randomName(), v5=r.randomName();
    return [
      `local ${v1}=string.char`,
      `local ${v2}=string.byte`,
      `local ${v3}=bit32.bxor`,
      `local ${v4}=bit32.bor`,
      `local ${v5}=bit32.rshift`,
    ].join('\n');
  }

  // Anti-debug for standard mode only
  buildAntiDebug(rng) {
    const r = rng || this.rng;
    const v1=r.randomName(), v2=r.randomName(), v3=r.randomName();
    return [
      `local ${v1}=type(debug)=="table" and debug`,
      `local ${v2}=${v1} and type(${v1}.getinfo)=="function"`,
      `if ${v2} then`,
      `local ${v3}=pcall(${v1}.getinfo,1,"S")`,
      `if not ${v3} then end`,
      `end`,
    ].join('\n');
  }

  buildIntegrityCheck(code, rng) {
    const r = rng || this.rng;
    let csum = 0;
    for (let i = 0; i < Math.min(code.length, 256); i++) csum = (csum * 31 + code.charCodeAt(i)) & 0x7FFFFFFF;
    const salt = r.nextInt(1, 9999);
    const v1=r.randomName(), v2=r.randomName(), v3=r.randomName();
    return [
      `local ${v1}=${csum} local ${v2}=${salt}`,
      `local ${v3}=(${v1}+${v2})-${v2}`,
      `if ${v3}~=${csum} then error("") end`,
    ].join('\n');
  }

  buildDeadCode(rng) {
    const r = rng || this.rng;
    const v1=r.randomName(), v2=r.randomName();
    const a=r.nextInt(1,999);
    return r.pick([
      `if false then local ${v1}=${a} end`,
      `while false do break end`,
      `do local ${v1}=nil if ${v1} then local ${v2}=${a} end end`,
      `repeat local ${v1}=0 until true`,
      `do local ${v1}=${a} ${v1}=${v1}+0 end`,
    ]);
  }

  buildOpaque(rng) {
    const r = rng || this.rng;
    const a=r.nextInt(2,20), b=r.nextInt(2,20);
    const v1=r.randomName(), v2=r.randomName();
    return r.pick([
      `do local ${v1}=${a} local ${v2}=${b} local _=${v1}*${v2} end`,
      `do local ${v1}=${a+b} local _=${v1}+0 end`,
      `do local ${v1}=type(bit32.bxor) local _=${v1} end`,
    ]);
  }

  buildJunkChain(rng, count) {
    const r = rng || this.rng;
    const lines = [];
    for (let i = 0; i < (count||2); i++) {
      lines.push(r.next()>0.5 ? this.buildDeadCode(r) : this.buildOpaque(r));
    }
    return lines.join('\n');
  }

  buildFullHeader(mode, code, rng) {
    const r = rng || this.rng;
    const parts = [];
    parts.push(this.buildAntiHook(r));
    if (mode === 'standard') {
      parts.push(this.buildAntiDebug(r));
      parts.push(this.buildIntegrityCheck(code, r));
    }
    parts.push(this.buildJunkChain(r, 2));
    return parts.join('\n');
  }
}

module.exports = { Protections };
