'use strict';
const { Randomizer } = require('./randomizer');
const OP_NAMES=['LOADK','LOADNIL','LOADBOOL','MOVE','GETGLOBAL','SETGLOBAL','GETTABLE','SETTABLE','ADD','SUB','MUL','DIV','MOD','POW','CONCAT','UNM','NOT','LEN','EQ','LT','LE','JMP','TEST','CALL','RETURN','FORLOOP','FORPREP','CLOSURE','VARARG','NEWTABLE','SETLIST','GETUPVAL','SETUPVAL','SELF','BAND','BXOR'];
function xorBuf(str,keys){const o=[];for(let i=0;i<str.length;i++) o.push((str.charCodeAt(i)^keys[i%keys.length])&0xFF);return o;}
class VMBuilder {
  constructor(rng){
    this.rng=rng||new Randomizer();
    this.opcodeMap=this._buildOpcodeMap();
    this.opMask=this.rng.nextInt(0x10,0xEF);
    this.opShift=this.rng.nextInt(1,3);
  }
  _buildOpcodeMap(){
    const vals=Array.from({length:OP_NAMES.length},(_,i)=>i+5);
    this.rng.shuffle(vals);
    const map={};
    OP_NAMES.forEach((n,i)=>{map[n]=vals[i];});
    return map;
  }
  buildVMRuntime(rng){
    const r=rng||this.rng;
    const N=()=>r.randomName();
    const vmFn=N(),execFn=N(),protoA=N(),upvA=N(),envA=N();
    const instrA=N(),constA=N(),regA=N(),ipA=N(),topA=N();
    const tmpA=N(),opA=N(),aA=N(),bA=N(),cA=N(),retA=N(),unpackFn=N();
    const ahV1=N(),ahV2=N(),ahV3=N();
    const om=this.opcodeMap,mask=this.opMask,shift=this.opShift;
    const RK=v=>`(${v}<0 and ${constA}[-${v}] or ${regA}[${v}])`;
    const L=[];
    L.push(`local ${ahV1}=bit32.bxor local ${ahV2}=bit32.bor local ${ahV3}=bit32.rshift`);
    L.push(`if type(${ahV1})~="function" or type(${ahV2})~="function" then return end`);
    L.push(`local ${unpackFn}=(table and table.unpack) or unpack`);
    L.push(`local ${vmFn} ${vmFn}=function(${protoA},${upvA},${envA})`);
    L.push(`${envA}=${envA} or _G`);
    L.push(`local ${instrA}=${protoA}[1] local ${constA}=${protoA}[2] local ${regA}={} local ${ipA}=1 local ${topA}=0 ${upvA}=${upvA} or {}`);
    L.push(`local function ${execFn}() while true do`);
    L.push(`local ${tmpA}=${instrA}[${ipA}] ${ipA}=${ipA}+1`);
    L.push(`local ${opA}=${tmpA}[1] local ${aA}=${tmpA}[2] local ${bA}=${tmpA}[3] local ${cA}=${tmpA}[4]`);
    L.push(`${opA}=bit32.bxor((${opA}-${shift})%256,${mask})`);
    L.push(`if ${opA}==${om.LOADK} then ${regA}[${aA}]=${constA}[${bA}]`);
    L.push(`elseif ${opA}==${om.LOADNIL} then for _i=${aA},${bA} do ${regA}[_i]=nil end`);
    L.push(`elseif ${opA}==${om.LOADBOOL} then ${regA}[${aA}]=(${bA}~=0) if ${cA}~=0 then ${ipA}=${ipA}+1 end`);
    L.push(`elseif ${opA}==${om.MOVE} then ${regA}[${aA}]=${regA}[${bA}]`);
    L.push(`elseif ${opA}==${om.GETUPVAL} then ${regA}[${aA}]=${upvA}[${bA}]`);
    L.push(`elseif ${opA}==${om.SETUPVAL} then ${upvA}[${bA}]=${regA}[${aA}]`);
    L.push(`elseif ${opA}==${om.GETGLOBAL} then ${regA}[${aA}]=${envA}[${constA}[${bA}]]`);
    L.push(`elseif ${opA}==${om.SETGLOBAL} then ${envA}[${constA}[${bA}]]=${regA}[${aA}]`);
    L.push(`elseif ${opA}==${om.GETTABLE} then local _t=${regA}[${bA}] ${regA}[${aA}]=_t[${RK(cA)}]`);
    L.push(`elseif ${opA}==${om.SETTABLE} then ${regA}[${aA}][${RK(bA)}]=${RK(cA)}`);
    L.push(`elseif ${opA}==${om.SELF} then local _o=${regA}[${bA}] ${regA}[${aA}+1]=_o ${regA}[${aA}]=_o[${RK(cA)}]`);
    L.push(`elseif ${opA}==${om.ADD} then ${regA}[${aA}]=${RK(bA)}+${RK(cA)}`);
    L.push(`elseif ${opA}==${om.SUB} then ${regA}[${aA}]=${RK(bA)}-${RK(cA)}`);
    L.push(`elseif ${opA}==${om.MUL} then ${regA}[${aA}]=${RK(bA)}*${RK(cA)}`);
    L.push(`elseif ${opA}==${om.DIV} then ${regA}[${aA}]=${RK(bA)}/${RK(cA)}`);
    L.push(`elseif ${opA}==${om.MOD} then ${regA}[${aA}]=${RK(bA)}%${RK(cA)}`);
    L.push(`elseif ${opA}==${om.POW} then ${regA}[${aA}]=${RK(bA)}^${RK(cA)}`);
    L.push(`elseif ${opA}==${om.BAND} then ${regA}[${aA}]=bit32.band(${RK(bA)},${RK(cA)})`);
    L.push(`elseif ${opA}==${om.BXOR} then ${regA}[${aA}]=bit32.bxor(${RK(bA)},${RK(cA)})`);
    L.push(`elseif ${opA}==${om.CONCAT} then local _s="" for _i=${bA},${cA} do _s=_s..tostring(${regA}[_i]) end ${regA}[${aA}]=_s`);
    L.push(`elseif ${opA}==${om.UNM} then ${regA}[${aA}]=-${regA}[${bA}]`);
    L.push(`elseif ${opA}==${om.NOT} then ${regA}[${aA}]=not ${regA}[${bA}]`);
    L.push(`elseif ${opA}==${om.LEN} then ${regA}[${aA}]=#${regA}[${bA}]`);
    L.push(`elseif ${opA}==${om.EQ} then if(${RK(bA)}==${RK(cA)})~=(${aA}~=0) then ${ipA}=${ipA}+1 end`);
    L.push(`elseif ${opA}==${om.LT} then if(${RK(bA)}<${RK(cA)})~=(${aA}~=0) then ${ipA}=${ipA}+1 end`);
    L.push(`elseif ${opA}==${om.LE} then if(${RK(bA)}<=${RK(cA)})~=(${aA}~=0) then ${ipA}=${ipA}+1 end`);
    L.push(`elseif ${opA}==${om.JMP} then ${ipA}=${ipA}+${aA}`);
    L.push(`elseif ${opA}==${om.TEST} then if(not not ${regA}[${aA}])~=(${cA}~=0) then ${ipA}=${ipA}+1 end`);
    L.push(`elseif ${opA}==${om.CALL} then local _fn=${regA}[${aA}] local _a={} for _i=1,${bA}-1 do _a[_i]=${regA}[${aA}+_i] end local _r={_fn(${unpackFn}(_a))} for _i=1,${cA}-1 do ${regA}[${aA}+_i-1]=_r[_i] end ${topA}=${aA}+(${cA}-1)`);
    L.push(`elseif ${opA}==${om.RETURN} then local ${retA}={} if ${bA}==0 then for _i=${aA},${topA} do ${retA}[#${retA}+1]=${regA}[_i] end else for _i=0,${bA}-2 do ${retA}[#${retA}+1]=${regA}[${aA}+_i] end end return ${unpackFn}(${retA})`);
    L.push(`elseif ${opA}==${om.FORPREP} then ${regA}[${aA}]=${regA}[${aA}]-${regA}[${aA}+2] ${ipA}=${ipA}+${bA}`);
    L.push(`elseif ${opA}==${om.FORLOOP} then ${regA}[${aA}]=${regA}[${aA}]+${regA}[${aA}+2] if(${regA}[${aA}+2]>0 and ${regA}[${aA}]<=${regA}[${aA}+1])or(${regA}[${aA}+2]<0 and ${regA}[${aA}]>=${regA}[${aA}+1]) then ${regA}[${aA}+3]=${regA}[${aA}] ${ipA}=${ipA}+${bA} end`);
    L.push(`elseif ${opA}==${om.NEWTABLE} then ${regA}[${aA}]={}`);
    L.push(`elseif ${opA}==${om.SETLIST} then local _t=${regA}[${aA}] for _i=1,${bA} do _t[_i]=${regA}[${aA}+_i] end`);
    L.push(`elseif ${opA}==${om.CLOSURE} then local _s=${protoA}[3][${bA}] ${regA}[${aA}]=function(...) return ${vmFn}(_s,${upvA},${envA}) end`);
    L.push(`elseif ${opA}==${om.VARARG} then end end end return ${execFn}() end`);
    return {code:L.join('\n'),vmFnName:vmFn};
  }
  wrapInVM(src,rng){
    const r=rng||this.rng;
    const {code:vmCode}=this.buildVMRuntime(r);
    const k1=r.randomKeyArray(r.nextInt(10,18)),k2=r.randomKeyArray(r.nextInt(8,14));
    const enc=[];
    for(let i=0;i<src.length;i++) enc.push((src.charCodeAt(i)^k1[i%k1.length]^k2[i%k2.length])&0xFF);
    const k1v=r.randomName(),k2v=r.randomName(),pv=r.randomName(),dFn=r.randomName();
    const iv=r.randomName(),sv=r.randomName(),bv=r.randomName(),fv=r.randomName(),ev=r.randomName();
    const L=[vmCode];
    L.push(`local ${k1v}={${k1.join(',')}} local ${k2v}={${k2.join(',')}} local ${pv}={${enc.join(',')}}`);
    L.push(`local function ${dFn}() local ${sv}="" for ${iv}=1,#${pv} do local ${bv}=bit32.bxor(${pv}[${iv}],${k1v}[((${iv}-1)%#${k1v})+1]) ${bv}=bit32.bxor(${bv},${k2v}[((${iv}-1)%#${k2v})+1]) ${sv}=${sv}..string.char(${bv}) end return ${sv} end`);
    L.push(`local ${fv},${ev}=(loadstring or load)(${dFn}()) if ${fv} then return ${fv}() else error(tostring(${ev})) end`);
    return L.join('\n');
  }
  buildPackedLayer(snippet,rng){
    const r=rng||this.rng;
    const keys=r.randomKeyArray(r.nextInt(10,18));
    const seed=r.nextInt(1,254);
    const enc=[];let state=seed;
    for(let i=0;i<snippet.length;i++){let b=(snippet.charCodeAt(i)^keys[i%keys.length])&0xFF;b=(b^state)&0xFF;state=(state*17+b+i)&0xFF;enc.push(b);}
    const ev=r.randomName(),kv=r.randomName(),fn=r.randomName(),iv=r.randomName(),sv=r.randomName(),bv=r.randomName(),stv=r.randomName(),fv=r.randomName(),erv=r.randomName();
    return [`local ${ev}={${enc.join(',')}} local ${kv}={${keys.join(',')}}`,`local function ${fn}() local ${sv}="" local ${stv}=${seed} for ${iv}=1,#${ev} do local ${bv}=bit32.bxor(${ev}[${iv}],${kv}[((${iv}-1)%#${kv})+1]) ${bv}=bit32.bxor(${bv},${stv}) ${stv}=(${stv}*17+${ev}[${iv}]+(${iv}-1))%256 ${sv}=${sv}..string.char(${bv}) end local ${fv},${erv}=(loadstring or load)(${sv}) return ${fv} and ${fv}() or error(tostring(${erv})) end ${fn}()`].join('\n');
  }
}
module.exports = { VMBuilder };
