'use strict';

const { Randomizer } = require('./randomizer');

const OP_NAMES = [
  'LOADK','LOADNIL','LOADBOOL','MOVE','GETGLOBAL','SETGLOBAL',
  'GETTABLE','SETTABLE','ADD','SUB','MUL','DIV','MOD','POW',
  'CONCAT','UNM','NOT','LEN','EQ','LT','LE','JMP','TEST',
  'CALL','RETURN','FORLOOP','FORPREP','CLOSURE','VARARG',
  'NEWTABLE','SETLIST','GETUPVAL','SETUPVAL','SELF',
];

class VMBuilder {
  constructor(rng) {
    this.rng = rng || new Randomizer();
    this.opcodeMap = this._buildOpcodeMap();
  }

  _buildOpcodeMap() {
    const vals = Array.from({ length: OP_NAMES.length }, (_, i) => i + 10);
    this.rng.shuffle(vals);
    const map = {};
    OP_NAMES.forEach((n, i) => { map[n] = vals[i]; });
    return map;
  }

  op(name) { return this.opcodeMap[name]; }

  buildVMRuntime(rng) {
    const r = rng || this.rng;
    const N = () => r.randomName();
    const vmFn=N(),execFn=N(),protoA=N(),upvA=N(),envA=N();
    const instrA=N(),constA=N(),regA=N(),ipA=N(),topA=N();
    const tmpA=N(),opA=N(),aA=N(),bA=N(),cA=N(),retA=N();
    const om = this.opcodeMap;
    const RK = (v) => `(${v}<0 and ${constA}[-${v}] or ${regA}[${v}])`;

    const L = [];
    L.push(`local ${vmFn}`);
    L.push(`${vmFn}=function(${protoA},${upvA},${envA})`);
    L.push(`${envA}=${envA} or _G`);
    L.push(`local ${instrA}=${protoA}[1]`);
    L.push(`local ${constA}=${protoA}[2]`);
    L.push(`local ${regA}={}`);
    L.push(`local ${ipA}=1`);
    L.push(`local ${topA}=0`);
    L.push(`${upvA}=${upvA} or {}`);
    L.push(`local function ${execFn}()`);
    L.push(`while true do`);
    L.push(`local ${tmpA}=${instrA}[${ipA}]`);
    L.push(`${ipA}=${ipA}+1`);
    L.push(`local ${opA}=${tmpA}[1]`);
    L.push(`local ${aA}=${tmpA}[2]`);
    L.push(`local ${bA}=${tmpA}[3]`);
    L.push(`local ${cA}=${tmpA}[4]`);

    L.push(`if ${opA}==${om.LOADK} then`);
    L.push(`${regA}[${aA}]=${constA}[${bA}]`);

    L.push(`elseif ${opA}==${om.LOADNIL} then`);
    L.push(`for _i=${aA},${bA} do ${regA}[_i]=nil end`);

    L.push(`elseif ${opA}==${om.LOADBOOL} then`);
    L.push(`${regA}[${aA}]=(${bA}~=0)`);
    L.push(`if ${cA}~=0 then ${ipA}=${ipA}+1 end`);

    L.push(`elseif ${opA}==${om.MOVE} then`);
    L.push(`${regA}[${aA}]=${regA}[${bA}]`);

    L.push(`elseif ${opA}==${om.GETUPVAL} then`);
    L.push(`${regA}[${aA}]=${upvA}[${bA}]`);

    L.push(`elseif ${opA}==${om.SETUPVAL} then`);
    L.push(`${upvA}[${bA}]=${regA}[${aA}]`);

    L.push(`elseif ${opA}==${om.GETGLOBAL} then`);
    L.push(`${regA}[${aA}]=${envA}[${constA}[${bA}]]`);

    L.push(`elseif ${opA}==${om.SETGLOBAL} then`);
    L.push(`${envA}[${constA}[${bA}]]=${regA}[${aA}]`);

    L.push(`elseif ${opA}==${om.GETTABLE} then`);
    L.push(`local _t=${regA}[${bA}]`);
    L.push(`local _k=${RK(cA)}`);
    L.push(`${regA}[${aA}]=_t[_k]`);

    L.push(`elseif ${opA}==${om.SETTABLE} then`);
    L.push(`local _t=${regA}[${aA}]`);
    L.push(`local _k=${RK(bA)}`);
    L.push(`local _v=${RK(cA)}`);
    L.push(`_t[_k]=_v`);

    L.push(`elseif ${opA}==${om.SELF} then`);
    L.push(`local _obj=${regA}[${bA}]`);
    L.push(`${regA}[${aA}+1]=_obj`);
    L.push(`${regA}[${aA}]=_obj[${RK(cA)}]`);

    L.push(`elseif ${opA}==${om.ADD} then`);
    L.push(`${regA}[${aA}]=${RK(bA)}+${RK(cA)}`);

    L.push(`elseif ${opA}==${om.SUB} then`);
    L.push(`${regA}[${aA}]=${RK(bA)}-${RK(cA)}`);

    L.push(`elseif ${opA}==${om.MUL} then`);
    L.push(`${regA}[${aA}]=${RK(bA)}*${RK(cA)}`);

    L.push(`elseif ${opA}==${om.DIV} then`);
    L.push(`${regA}[${aA}]=${RK(bA)}/${RK(cA)}`);

    L.push(`elseif ${opA}==${om.MOD} then`);
    L.push(`${regA}[${aA}]=${RK(bA)}%${RK(cA)}`);

    L.push(`elseif ${opA}==${om.POW} then`);
    L.push(`${regA}[${aA}]=${RK(bA)}^${RK(cA)}`);

    L.push(`elseif ${opA}==${om.CONCAT} then`);
    L.push(`local _s=""`);
    L.push(`for _i=${bA},${cA} do _s=_s..tostring(${regA}[_i]) end`);
    L.push(`${regA}[${aA}]=_s`);

    L.push(`elseif ${opA}==${om.UNM} then`);
    L.push(`${regA}[${aA}]=-${regA}[${bA}]`);

    L.push(`elseif ${opA}==${om.NOT} then`);
    L.push(`${regA}[${aA}]=not ${regA}[${bA}]`);

    L.push(`elseif ${opA}==${om.LEN} then`);
    L.push(`${regA}[${aA}]=#${regA}[${bA}]`);

    L.push(`elseif ${opA}==${om.EQ} then`);
    L.push(`if (${RK(bA)}==${RK(cA)})~=(${aA}~=0) then ${ipA}=${ipA}+1 end`);

    L.push(`elseif ${opA}==${om.LT} then`);
    L.push(`if (${RK(bA)}<${RK(cA)})~=(${aA}~=0) then ${ipA}=${ipA}+1 end`);

    L.push(`elseif ${opA}==${om.LE} then`);
    L.push(`if (${RK(bA)}<=${RK(cA)})~=(${aA}~=0) then ${ipA}=${ipA}+1 end`);

    L.push(`elseif ${opA}==${om.JMP} then`);
    L.push(`${ipA}=${ipA}+${aA}`);

    L.push(`elseif ${opA}==${om.TEST} then`);
    L.push(`if (not not ${regA}[${aA}])~=(${cA}~=0) then ${ipA}=${ipA}+1 end`);

    L.push(`elseif ${opA}==${om.CALL} then`);
    L.push(`local _fn=${regA}[${aA}]`);
    L.push(`local _args={}`);
    L.push(`for _i=1,${bA}-1 do _args[_i]=${regA}[${aA}+_i] end`);
    L.push(`local _res={_fn(table.unpack(_args))}`);
    L.push(`for _i=1,${cA}-1 do ${regA}[${aA}+_i-1]=_res[_i] end`);
    L.push(`${topA}=${aA}+(${cA}-1)`);

    L.push(`elseif ${opA}==${om.RETURN} then`);
    L.push(`local ${retA}={}`);
    L.push(`if ${bA}==0 then`);
    L.push(`for _i=${aA},${topA} do ${retA}[#${retA}+1]=${regA}[_i] end`);
    L.push(`else`);
    L.push(`for _i=0,${bA}-2 do ${retA}[#${retA}+1]=${regA}[${aA}+_i] end`);
    L.push(`end`);
    L.push(`return table.unpack(${retA})`);

    L.push(`elseif ${opA}==${om.FORPREP} then`);
    L.push(`${regA}[${aA}]=${regA}[${aA}]-${regA}[${aA}+2]`);
    L.push(`${ipA}=${ipA}+${bA}`);

    L.push(`elseif ${opA}==${om.FORLOOP} then`);
    L.push(`${regA}[${aA}]=${regA}[${aA}]+${regA}[${aA}+2]`);
    L.push(`if (${regA}[${aA}+2]>0 and ${regA}[${aA}]<=${regA}[${aA}+1]) or (${regA}[${aA}+2]<0 and ${regA}[${aA}]>=${regA}[${aA}+1]) then`);
    L.push(`${regA}[${aA}+3]=${regA}[${aA}]`);
    L.push(`${ipA}=${ipA}+${bA}`);
    L.push(`end`);

    L.push(`elseif ${opA}==${om.NEWTABLE} then`);
    L.push(`${regA}[${aA}]={}`);

    L.push(`elseif ${opA}==${om.SETLIST} then`);
    L.push(`local _t=${regA}[${aA}]`);
    L.push(`for _i=1,${bA} do _t[_i+(${cA}-1)*50]=${regA}[${aA}+_i] end`);

    L.push(`elseif ${opA}==${om.CLOSURE} then`);
    L.push(`local _subp=${protoA}[3][${bA}]`);
    L.push(`${regA}[${aA}]=function(...)`);
    L.push(`return ${vmFn}(_subp,${upvA},${envA})`);
    L.push(`end`);

    L.push(`elseif ${opA}==${om.VARARG} then`);
    L.push(`end`);
    L.push(`end`);
    L.push(`end`);
    L.push(`return ${execFn}()`);
    L.push(`end`);

    return { code: L.join('\n'), vmFnName: vmFn };
  }

  wrapInVM(luaSource, rng) {
    const r = rng || this.rng;
    const { code: vmCode, vmFnName } = this.buildVMRuntime(r);

    const keys1 = r.randomKeyArray(r.nextInt(12, 24));
    const keys2 = r.randomKeyArray(r.nextInt(8, 16));
    const encrypted = [];
    for (let i = 0; i < luaSource.length; i++) {
      encrypted.push((luaSource.charCodeAt(i) ^ keys1[i % keys1.length] ^ keys2[i % keys2.length]) & 0xFF);
    }

    const decFn=r.randomName(),k1V=r.randomName(),k2V=r.randomName();
    const payV=r.randomName(),iV=r.randomName(),sV=r.randomName();
    const bV=r.randomName(),fnV=r.randomName(),errV=r.randomName();

    const L = [];
    L.push(vmCode);
    L.push(`local function ${decFn}(${payV},${k1V},${k2V})`);
    L.push(`local ${sV}=""`);
    L.push(`for ${iV}=1,#${payV} do`);
    L.push(`local ${bV}=bit32.bxor(${payV}[${iV}],${k1V}[((${iV}-1)%#${k1V})+1])`);
    L.push(`${bV}=bit32.bxor(${bV},${k2V}[((${iV}-1)%#${k2V})+1])`);
    L.push(`${sV}=${sV}..string.char(${bV})`);
    L.push(`end`);
    L.push(`return ${sV}`);
    L.push(`end`);
    L.push(`local ${k1V}={${keys1.join(',')}}`);
    L.push(`local ${k2V}={${keys2.join(',')}}`);
    L.push(`local ${fnV},${errV}=load(${decFn}({${encrypted.join(',')}},${k1V},${k2V}))`);
    L.push(`if ${fnV} then return ${fnV}() else error(tostring(${errV})) end`);

    return L.join('\n');
  }

  buildMiniVM(snippet, rng) {
    const r = rng || this.rng;
    const keys = r.randomKeyArray(r.nextInt(8, 18));
    const encrypted = [];
    for (let i = 0; i < snippet.length; i++) {
      encrypted.push((snippet.charCodeAt(i) ^ keys[i % keys.length]) & 0xFF);
    }
    const fn=r.randomName(),kV=r.randomName(),eV=r.randomName();
    const iV=r.randomName(),sV=r.randomName(),bV=r.randomName();
    const fV=r.randomName(),erV=r.randomName();
    return [
      `local function ${fn}(${eV},${kV})`,
      `local ${sV}=""`,
      `for ${iV}=1,#${eV} do`,
      `local ${bV}=bit32.bxor(${eV}[${iV}],${kV}[((${iV}-1)%#${kV})+1])`,
      `${sV}=${sV}..string.char(${bV})`,
      `end`,
      `local ${fV},${erV}=load(${sV})`,
      `return ${fV} and ${fV}() or error(tostring(${erV}))`,
      `end`,
      `${fn}({${encrypted.join(',')}},{${keys.join(',')}})`,
    ].join('\n');
  }

  buildTableVM(snippet, rng) {
    const r = rng || this.rng;
    const tblName = r.randomName();
    const keys = r.randomKeyArray(r.nextInt(6, 14));
    const k2 = r.nextInt(1, 254);
    const encrypted = [];
    for (let i = 0; i < snippet.length; i++) {
      const b = (snippet.charCodeAt(i) ^ keys[i % keys.length] ^ k2) & 0xFF;
      encrypted.push(b);
    }
    const fn=r.randomName(),iV=r.randomName(),sV=r.randomName(),bV=r.randomName();
    const fV=r.randomName(),erV=r.randomName(),kV=r.randomName();
    return [
      `local ${tblName}={${encrypted.join(',')}}`,
      `local ${kV}={${keys.join(',')}}`,
      `local function ${fn}()`,
      `local ${sV}=""`,
      `for ${iV}=1,#${tblName} do`,
      `local ${bV}=bit32.bxor(${tblName}[${iV}],${kV}[((${iV}-1)%#${kV})+1])`,
      `${bV}=bit32.bxor(${bV},${k2})`,
      `${sV}=${sV}..string.char(${bV})`,
      `end`,
      `local ${fV},${erV}=load(${sV})`,
      `return ${fV} and ${fV}() or error(tostring(${erV}))`,
      `end`,
      `${fn}()`,
    ].join('\n');
  }
}

module.exports = { VMBuilder };
