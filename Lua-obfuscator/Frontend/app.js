'use strict';

(function gridBg() {
  const c = document.getElementById('grid-canvas');
  const ctx = c.getContext('2d');
  function resize() {
    c.width = innerWidth; c.height = innerHeight;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.strokeStyle = 'rgba(255,107,53,0.8)';
    ctx.lineWidth = 0.5;
    const gs = 48;
    for (let x = 0; x < c.width; x += gs) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, c.height); ctx.stroke();
    }
    for (let y = 0; y < c.height; y += gs) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(c.width, y); ctx.stroke();
    }
  }
  resize();
  window.addEventListener('resize', resize);
})();

const $ = id => document.getElementById(id);
const inEd = $('in-ed'), outEd = $('out-ed');
const inLn = $('in-ln'), outLn = $('out-ln');
const inStat = $('in-stat'), outStat = $('out-stat');
const outTags = $('out-tags'), outPh = $('out-ph');
const btnObf = $('btn-obf'), btnCopy = $('btn-copy'), btnDl = $('btn-dl');
const btnSample = $('btn-sample'), btnClear = $('btn-clear');
const fileInput = $('file-input');
const sbDot = $('sb-dot'), sbTxt = $('sb-txt'), sbTime = $('sb-time'), sbMode = $('sb-mode');
const spDot = document.querySelector('.spill-dot'), spTxt = $('spill-txt');
const obfProg = $('obf-prog');
const pipeSteps = document.querySelectorAll('.pt-step');
const modeBtns = document.querySelectorAll('.mode-btn');
const chipsRows = document.querySelectorAll('.chips-row');
const outModeLbl = $('out-mode-lbl');
const toast = $('toast');

let currentMode = 'standard';
let outputCode = '';
let loading = false;

function updateLines(ta, ln) {
  const n = ta.value.split('\n').length;
  ln.innerHTML = Array.from({length: n}, (_, i) => `<div>${i+1}</div>`).join('');
  ln.scrollTop = ta.scrollTop;
}

inEd.addEventListener('input', () => {
  updateLines(inEd, inLn);
  const lines = inEd.value.split('\n').length;
  const chars = inEd.value.length;
  inStat.textContent = `${lines} lines · ${chars.toLocaleString()} chars`;
});
inEd.addEventListener('scroll', () => { inLn.scrollTop = inEd.scrollTop; });
updateLines(inEd, inLn);

inEd.addEventListener('keydown', e => {
  if (e.key === 'Tab') {
    e.preventDefault();
    const s = inEd.selectionStart;
    inEd.value = inEd.value.slice(0, s) + '  ' + inEd.value.slice(inEd.selectionEnd);
    inEd.selectionStart = inEd.selectionEnd = s + 2;
    inEd.dispatchEvent(new Event('input'));
  }
});

modeBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    modeBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentMode = btn.dataset.mode;
    chipsRows.forEach(r => r.classList.remove('active'));
    document.querySelector(`.chips-row[data-mode="${currentMode}"]`)?.classList.add('active');
    outModeLbl.textContent = currentMode === 'executor' ? 'Executor' : 'Standard';
    sbMode.textContent = currentMode === 'executor' ? 'Executor' : 'Standard';
  });
});

const SAMPLE = `-- ProteccT 5.4 sample by Alrect
local config = {
  name = "TestScript",
  version = "1.0",
  debug = false
}

local function hashStr(s)
  local h = 5381
  for i = 1, #s do
    h = h * 33 + string.byte(s, i)
    h = h % 0x7FFFFFFF
  end
  return h
end

local function makeLoader(key, data)
  local out = {}
  for i = 1, #data do
    out[i] = string.byte(data, i) ~ key
  end
  return out
end

local seed = hashStr(config.name .. config.version)
local loader = makeLoader(seed % 256, "Protected by Alrect")

print("Script:", config.name)
print("Seed:", seed)

for i = 1, 10 do
  local val = i * seed % 256
  if val > 100 then
    print("Range A:", val)
  else
    print("Range B:", val)
  end
end
`;

btnSample.addEventListener('click', () => {
  inEd.value = SAMPLE;
  inEd.dispatchEvent(new Event('input'));
  toast_show('Sample loaded');
});

btnClear.addEventListener('click', () => {
  inEd.value = '';
  inEd.dispatchEvent(new Event('input'));
  toast_show('Cleared');
});

fileInput.addEventListener('change', e => {
  const f = e.target.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = ev => {
    inEd.value = ev.target.result;
    inEd.dispatchEvent(new Event('input'));
    toast_show(`Loaded: ${f.name}`);
  };
  r.readAsText(f);
  e.target.value = '';
});

function setStatus(type, txt) {
  sbDot.className = `sb-dot ${type}`;
  spDot.className = `spill-dot ${type}`;
  sbTxt.textContent = txt;
  spTxt.textContent = type === 'idle' ? 'Ready' : type === 'working' ? 'Working…' : type === 'success' ? 'Done' : 'Error';
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function animPipe() {
  for (let i = 0; i < pipeSteps.length; i++) {
    pipeSteps[i].classList.add('lit');
    await sleep(160);
  }
}
function resetPipe() { pipeSteps.forEach(s => s.classList.remove('lit','done')); }
function donePipe() { pipeSteps.forEach(s => { s.classList.remove('lit'); s.classList.add('done'); }); }

btnObf.addEventListener('click', doObfuscate);
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); doObfuscate(); }
});

async function doObfuscate() {
  const code = inEd.value.trim();
  if (!code) { toast_show('Paste some Lua code first'); return; }
  if (loading) return;
  loading = true;

  btnObf.classList.add('loading');
  btnObf.disabled = true;
  setStatus('working', 'Obfuscating…');
  resetPipe();
  obfProg.style.width = '0%';
  outPh.style.display = 'flex';
  outEd.style.display = 'none';
  outLn.style.display = 'none';
  outStat.textContent = '';
  outTags.innerHTML = '';
  btnCopy.disabled = true;
  btnDl.disabled = true;
  outputCode = '';

  animPipe();

  let prog = 0;
  const progTimer = setInterval(() => {
    prog = Math.min(prog + Math.random() * 9, 88);
    obfProg.style.width = prog + '%';
  }, 100);

  const t0 = Date.now();
  try {
    const res = await fetch('/api/obfuscate', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ code, mode: currentMode }),
    });
    const data = await res.json();
    clearInterval(progTimer);
    obfProg.style.width = '100%';

    if (!res.ok || data.error) throw new Error(data.detail || data.error || 'Failed');

    const ms = Date.now() - t0;
    outputCode = data.obfuscated;
    donePipe();
    showOutput(data, ms);
    setStatus('success', `Done — ${ms}ms`);
    sbTime.textContent = `${ms}ms`;
    toast_show(`Obfuscated in ${ms}ms`);

  } catch(err) {
    clearInterval(progTimer);
    obfProg.style.width = '0%';
    resetPipe();
    setStatus('error', `Error: ${err.message}`);
    toast_show(`Error: ${err.message}`);
  } finally {
    loading = false;
    btnObf.classList.remove('loading');
    btnObf.disabled = false;
    setTimeout(() => { obfProg.style.width = '0%'; }, 900);
  }
}

function showOutput(data, ms) {
  outPh.style.display = 'none';
  outEd.style.display = 'block';
  outLn.style.display = 'block';
  outEd.value = data.obfuscated;
  updateLines(outEd, outLn);
  outEd.addEventListener('scroll', () => { outLn.scrollTop = outEd.scrollTop; });

  const lines = data.obfuscated.split('\n').length;
  outStat.textContent = `${lines} lines · ${data.obfuscated.length.toLocaleString()} chars`;

  outTags.innerHTML = `
    <span class="otag grn">Protected</span>
    <span class="otag org">${data.mode === 'executor' ? 'Executor' : 'Standard'}</span>
    <span class="otag dim">${data.ratio}</span>
    <span class="otag dim">${ms}ms</span>
  `;
  btnCopy.disabled = false;
  btnDl.disabled = false;
}

btnCopy.addEventListener('click', async () => {
  if (!outputCode) return;
  try {
    await navigator.clipboard.writeText(outputCode);
    toast_show('Copied to clipboard');
  } catch {
    outEd.select();
    document.execCommand('copy');
    toast_show('Copied');
  }
});

btnDl.addEventListener('click', () => {
  if (!outputCode) return;
  const blob = new Blob([outputCode], {type:'text/plain'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `protected_${Date.now()}.lua`;
  a.click(); URL.revokeObjectURL(url);
  toast_show('Downloaded');
});

let toastTm;
function toast_show(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTm);
  toastTm = setTimeout(() => toast.classList.remove('show'), 2200);
}

document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', e => {
    const t = document.querySelector(a.getAttribute('href'));
    if (t) { e.preventDefault(); t.scrollIntoView({behavior:'smooth'}); }
  });
});

setStatus('idle', 'Ready · Alrect ProteccT 5.4');
sbMode.textContent = 'Standard';
