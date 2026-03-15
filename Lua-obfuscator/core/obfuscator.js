'use strict';
const { Randomizer }  = require('./randomizer');
const { Encoder }     = require('./encoder');
const { VMBuilder }   = require('./vm_builder');
const { Protections } = require('./protections');
const { generateHardObfuscated } = require('./codegen');

const LUA_RESERVED = new Set([
  'and','break','do','else','elseif','end','false','for','function','goto','if','in',
  'local','nil','not','or','repeat','return','then','true','until','while',
  '_G','_ENV','_VERSION','assert','collectgarbage','dofile','error','getmetatable',
  'ipairs','load','loadfile','loadstring','next','pairs','pcall','print','rawequal',
  'rawget','rawlen','rawset','require','select','setmetatable','tonumber','tostring',
  'type','unpack','warn','xpcall','bit32','coroutine','debug','io','math','os',
  'package','string','table','game','workspace','script','task','wait','spawn',
  'delay','Instance','UDim','UDim2','Vector2','Vector3','CFrame','Color3','BrickColor',
  'Enum','tick','time','typeof',
]);

function escRe(s){return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}

function layer1_rename(code, rng) {
  const map=new Map(), seen=new Set();
  const re=/\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g; let m;
  while((m=re.exec(code))!==null){ const id=m[1]; if(!LUA_RESERVED.has(id)&&id.length>=2) seen.add(id); }
  seen.forEach(id=>map.set(id,rng.randomName()));
  let result=code;
  for(const[orig,rep] of map) result=result.replace(new RegExp(`(?<![\\w'"])\\b${escRe(orig)}\\b(?![\\w'"])`, 'g'),rep);
  return result;
}

// Standard string encryption (for standard/VM mode)
function layer2_encryptStrings(code,rng,encoder){
  const xorFn=rng.randomName(),rotFn=rng.randomName();
  const kXor=rng.randomKeyArray(rng.nextInt(8,16)),kRot=rng.randomKeyArray(rng.nextInt(8,16));
  const kXorV=rng.randomName(),kRotV=rng.randomName();
  const xorDecl=encoder.buildXorDecryptor(xorFn,rng);
  const rotDecl=encoder.buildRotDecryptor(rotFn,rng);
  let cnt=0;
  const rep=code.replace(/"((?:[^"\\]|\\.)*?)"|'((?:[^'\\]|\\.)*?)'/g,(match,g1,g2)=>{
    const raw=g1!==undefined?g1:g2;
    const str=raw.replace(/\\n/g,'\n').replace(/\\t/g,'\t').replace(/\\r/g,'\r').replace(/\\\\/g,'\\').replace(/\\"/g,'"').replace(/\\'/g,"'");
    if(str.length===0) return '""';
    cnt++;
    if(rng.next()>0.5) return `${xorFn}({${encoder.xorEncrypt(str,kXor).join(',')}},${kXorV})`;
    return `${rotFn}({${encoder.rotEncrypt(str,kRot).join(',')}},${kRotV})`;
  });
  if(cnt===0) return code;
  return [xorDecl,rotDecl,`local ${kXorV}={${kXor.join(',')}}`,`local ${kRotV}={${kRot.join(',')}}`,rep].join('\n');
}

function layer3_flow(code,rng,prot){
  const lines=code.split('\n'),out=[];
  for(let i=0;i<lines.length;i++){
    out.push(lines[i]);
    if((i+1)%9===0&&rng.next()>0.5) out.push(prot.buildDeadCode(rng));
    if((i+1)%15===0&&rng.next()>0.5) out.push(prot.buildOpaque(rng));
  }
  return out.join('\n');
}

function buildCredit(mode){
  const ts=new Date().toISOString().replace('T',' ').slice(0,19);
  const ml=mode==='executor'?'Lua Universal Executor (Luau/Roblox)':'Lua Standard';
  return `--[[ obfuscator by Alrect proteccT 5.4\n     Mode  : ${ml}\n     Build : ${ts}\n     Compat: Luau, Roblox, Delta, KRNL\n--]]`;
}

class Obfuscator {
  constructor(mode){
    this.mode=mode==='executor'?'executor':'standard';
    this.rng=new Randomizer();
    this.enc=new Encoder(this.rng);
    this.vm=new VMBuilder(this.rng);
    this.prot=new Protections(this.rng);
  }

  obfuscate(src){
    if(this.mode==='executor'){
      // WeAreDev-style: string table with decimal escapes + XOR decode + shuffle trick
      return generateHardObfuscated(src, this.rng);
    } else {
      // Standard: rename + string encrypt + VM pipeline
      let code=src;
      code=layer1_rename(code,this.rng);
      code=layer2_encryptStrings(code,this.rng,this.enc);
      code=layer3_flow(code,this.rng,this.prot);
      code=this.vm.wrapInVM(code,this.rng);
      code=this.vm.buildPackedLayer(code,this.rng);
      const hdr=this.prot.buildFullHeader('standard',code,this.rng);
      code=hdr+'\n'+code;
      return buildCredit(this.mode)+'\n'+code;
    }
  }
}

module.exports = { Obfuscator };
