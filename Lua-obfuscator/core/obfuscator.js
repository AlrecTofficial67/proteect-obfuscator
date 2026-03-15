'use strict';
const {Randomizer}=require('./randomizer');
const {Compiler}=require('./compiler');
const {VMCodegen}=require('./vm_codegen');

function buildCredit(mode){
  const ts=new Date().toISOString().replace('T',' ').slice(0,19);
  const ml=mode==='executor'?'Lua Universal Executor (Luau/Roblox)':'Lua Standard (Multi-Layer VM)';
  return [
    `--[[ obfuscator by Alrect proteccT 5.4`,
    `     Mode    : ${ml}`,
    `     Build   : ${ts}`,
    `     Engine  : Lua Compiler + VM Bytecode + Dispatch Table`,
    `     Features: Encrypted bytecode string, per-instruction key mutation,`,
    `               dispatch table VM, control-flow flattening, constant`,
    `               virtualization, self-modifying keys, multi-layer packing,`,
    `               anti-hook, anti-debug, fake NOP injection`,
    `--]]`,
  ].join('\n');
}

class Obfuscator{
  constructor(mode){
    this.mode=mode==='executor'?'executor':'standard';
    this.rng=new Randomizer();
  }

  obfuscate(src){
    // Compile Lua → custom bytecode
    const compiler=new Compiler();
    let proto;
    try{ proto=compiler.compile(src); }
    catch(e){ throw new Error(`Compile error: ${e.message}`); }

    // Generate VM + encrypted bytecode
    const vmgen=new VMCodegen(this.rng);
    const code=vmgen.build(proto,this.rng,this.mode);

    return buildCredit(this.mode)+'\n'+code;
  }
}

module.exports={Obfuscator};
