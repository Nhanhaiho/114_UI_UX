import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const profile = path.join(os.tmpdir(), 'chrome-diag-' + Date.now());
fs.mkdirSync(profile, { recursive: true });
const portFile = path.join(profile, 'DevToolsActivePort');

const child = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new',
  '--user-data-dir=' + profile,
  '--remote-debugging-port=0',
  '--no-sandbox',
  '--autoplay-policy=no-user-gesture-required',
  'about:blank'
]);

async function run() {
  await new Promise(r => setTimeout(r, 1000));
  const port = parseInt(fs.readFileSync(portFile, 'utf8'), 10);
  const ver = await (await fetch('http://127.0.0.1:' + port + '/json/version')).json();
  const ws = new WebSocket(ver.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r, { once: true }));

  let id = 0;
  const pend = new Map();
  ws.addEventListener('message', e => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  });

  const send = (method, params = {}, sessionId) => new Promise(r => {
    const i = ++id;
    pend.set(i, r);
    ws.send(JSON.stringify({ id: i, method, params, sessionId }));
  });

  const { result: { targetId } } = await send('Target.createTarget', { url: 'http://localhost:5173' });
  const { result: { sessionId } } = await send('Target.attachToTarget', { targetId, flatten: true });
  const S = (m, p) => send(m, p, sessionId);
  const ev = async x => {
    const res = await S('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true });
    console.log('CDP res:', JSON.stringify(res));
    return res.result?.value;
  };

  await new Promise(r => setTimeout(r, 2000));

  // Switch to video tab
  await ev(`(() => {
    const tabBtns = Array.from(document.querySelectorAll('.source-tab-btn'));
    const videoTab = tabBtns.find(b => b.textContent && b.textContent.includes('Video'));
    if (videoTab) videoTab.click();
  })()`);

  await new Promise(r => setTimeout(r, 1000));

  const diag = await ev(`(() => {
    const v = document.querySelector('video');
    if (!v) return 'No video element';
    return JSON.stringify({
      src: v.src,
      currentSrc: v.currentSrc,
      readyState: v.readyState,
      networkState: v.networkState,
      error: v.error ? { code: v.error.code, message: v.error.message } : null,
      canPlayTypeMp4: v.canPlayType('video/mp4'),
      canPlayTypeWebm: v.canPlayType('video/webm')
    });
  })()`);

  console.log('Video Diag:', diag);
  ws.close();
  child.kill();
}
run();
