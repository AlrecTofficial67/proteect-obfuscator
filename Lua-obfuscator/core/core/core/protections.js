'use strict';

const { Randomizer } = require('./randomizer');

class Protections {
  constructor(rng) {
    this.rng = rng || new Randomizer();
  }

  _n() { return this.rng.randomName(); }

  buildAntiDebug(rng) {
    const r = rng || this.rng;
    const v1=r.randomName(),v2=r.randomName(),v3=r.randomName(),v4=r.randomName();
    return [
      `local ${v1}=rawget(_G,"debug")`,
      `local ${v2}=${v1} and rawget(${v1},"getinfo")`,
      `local ${v3}=${v1} and rawget(${v1},"sethook")`,
      `if type(${v2})=="function" then`,
      `local ${v4}=pcall(${v2},1,"S")`,
      `if not ${v4} then end`,
      `end`,
    ].join('\n');
  }

  buildAntiDump(rng) {
    const r = rng || this.rng;
    const v1=r.randomName(),v2=r.randomName(),v3=r.randomName();
    return [
      `local ${v1}=tostring`,
      `local ${v2}=type`,
      `local ${v3}=pcall`,
      `if ${v2}(${v1})~="function" or ${v2}(${v3})~="function" then error("") end`,
    ].join('\n');
  }

  buildAntiEnvironment(rng) {
    const r = rng || this.rng;
    const v1=r.randomName(),v2=r.randomName();
    const fns=['tostring','tonumber','type','pairs','ipairs','pcall','error','select'];
    const f1=r.pick(fns), f2=r.pick(fns.filter(x=>x!==f1));
    return [
      `local ${v1}=type(rawget(_G,"${f1}"))=="function"`,
      `local ${v2}=type(rawget(_G,"${f2}"))=="function"`,
      `if not(${v1} and ${v2}) then error("") end`,
    ].join('\n');
  }

  buildAntiHook(rng) {
    const r = rng || this.rng;
    const v1=r.randomName(),v2=r.randomName(),v3=r.randomName();
    return [
      `local ${v1}=tostring local ${v2}=rawequal`,
      `local ${v3}=pcall(function() assert(type(${v1})=="function") end)`,
      `if not ${v3} then error("") end`,
    ].join('\n');
  }

  buildIntegrityCheck(code, rng) {
    const r = rng || this.rng;
    let csum = 0;
    for (let i = 0; i < Math.min(code.length, 512); i++) {
      csum = (csum * 31 + code.charCodeAt(i)) & 0x7FFFFFFF;
    }
    const salt = r.nextInt(1, 9999);
    const v1=r.randomName(),v2=r.randomName(),v3=r.randomName();
    return [
      `local ${v1}=${csum}`,
      `local ${v2}=${salt}`,
      `local ${v3}=(${v1}+${v2})-${v2}`,
      `if ${v3}~=${csum} then error("") end`,
    ].join('\n');
  }

  buildOpaquePredicate(rng) {
    const r = rng || this.rng;
    const a=r.nextInt(2,30),b=r.nextInt(2,30);
    const v1=r.randomName(),v2=r.randomName();
    const variants=[
      `do local ${v1}=${a} local ${v2}=${b} if not(${v1}*${v2}==${a*b}) then error("") end end`,
      `do local ${v1}=${a+b} if ${v1}~=${a+b} then error("") end end`,
      `do local ${v1}=${a} if not(${v1}==${v1}) then error("") end end`,
      `do local ${v1}=type(tostring)=="function" if not ${v1} then error("") end end`,
    ];
    return r.pick(variants);
  }

  buildDeadCode(rng) {
    const r = rng || this.rng;
    const v1=r.randomName(),v2=r.randomName();
    const a=r.nextInt(1,999),b=r.nextInt(1000,9999);
    const variants=[
      `if false then local ${v1}=${a}+${b} end`,
      `while false do break end`,
      `do local ${v1}=nil if ${v1} then local ${v2}=${a} end end`,
      `repeat local ${v1}=0 until true`,
      `do local ${v1}=(function() return ${a} end)() if false then return ${v1} end end`,
    ];
    return r.pick(variants);
  }

  buildJunkChain(rng, count) {
    const r = rng || this.rng;
    const lines = [];
    for (let i = 0; i < (count || 4); i++) {
      if (r.next() > 0.5) lines.push(this.buildOpaquePredicate(r));
      else lines.push(this.buildDeadCode(r));
    }
    return lines.join('\n');
  }

  buildFullHeader(mode, code, rng) {
    const r = rng || this.rng;
    const parts = [];
    if (mode === 'standard') {
      parts.push(this.buildAntiDebug(r));
      parts.push(this.buildAntiDump(r));
      parts.push(this.buildAntiEnvironment(r));
      parts.push(this.buildAntiHook(r));
      parts.push(this.buildIntegrityCheck(code, r));
    } else {
      parts.push(this.buildAntiEnvironment(r));
      parts.push(this.buildAntiHook(r));
    }
    parts.push(this.buildJunkChain(r, 3));
    return parts.join('\n');
  }
}

module.exports = { Protections };
