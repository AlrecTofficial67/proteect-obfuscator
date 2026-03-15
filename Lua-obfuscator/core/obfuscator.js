'use strict';
const {Randomizer}=require('./randomizer');
const {Compiler}=require('./compiler');
const {VMCodegen}=require('./vm_codegen');

function buildCredit(mode){
  const ts=new Date().toISOString().replace('T',' ').slice(0,19);
  return [
    `--[[ obfuscator by Alrect proteccT 5.4`,
    `     Mode    : ${mode==='executor'?'Lua Universal Executor (Luau/Roblox)':'Lua Standard (Multi-Layer VM)'}`,
    `     Build   : ${ts}`,
    `     Engine  : Bytecode Compiler + Polymorphic VM`,
    `     Features:`,
    `       - Polymorphic opcode map (randomized per build)`,
    `       - Bytecode as encrypted binary string (not table)`,
    `       - Per-instruction key mutation + runtime key gen`,
    `       - Dispatch table VM (not if-elseif)`,
    `       - VM fragmentation (4 sub-functions)`,
    `       - Control-flow flattening (state machine)`,
    `       - Self-modifying VM dispatch`,
    `       - Fake obfuscator decoy layer`,
    `       - Anti-HTTPSpy (detect + crash + delete file)`,
    `       - Anti-Dump (checksum + dispatch swap)`,
    `       - Anti-Environment (honeypot + FakeEnv + getfenv hook)`,
    `       - Anti-Debug + Anti-Hook`,
    `       - Dynamic constant encryption (inline decoders)`,
    `       - String reconstruction (char-by-char)`,
    `       - Fake NOP injection`,
    `       - Register scrambling`,
    `       - Multi-layer packing (standard mode)`,
    `--]]`,
  ].join('\n');
}

class Obfuscator{
  constructor(mode){
    this.mode=mode==='executor'?'executor':'standard';
    this.rng=new Randomizer();
  }
  obfuscate(src){
    const compiler=new Compiler();
    let proto;
    try{proto=compiler.compile(src);}
    catch(e){throw new Error(`Compile error: ${e.message}`);}
    const vmgen=new VMCodegen(this.rng);
    const code=vmgen.build(proto,this.rng,this.mode);
    return buildCredit(this.mode)+'\n'+code;
  }
}

module.exports={Obfuscator};
