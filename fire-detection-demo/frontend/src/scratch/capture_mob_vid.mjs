import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const ARTIFACT_DIR = 'C:\\Users\\Hồ Ngọc Hải Nhân\\.gemini\\antigravity\\brain\\a7f5f957-8871-4e97-bb7c-d7bba57f037d';
const profile = path.join(os.tmpdir(), 'chrome-mob-vid-' + Date.now());
fs.mkdirSync(profile, { recursive: true });
const portFile = path.join(profile, 'DevToolsActivePort');

const child = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new',
  '--user-data-dir=' + profile,
  '--remote-debugging-port=0',
  '--no-sandbox',
  '--autoplay-policy=no-user-gesture-required',
  'http://localhost:5173'
]);

async function run() {
  await new Promise(r => setTimeout(r, 1200));
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
    return res.result?.result?.value !== undefined ? res.result.result.value : res.result?.value;
  };

  await S('Page.enable');
  await S('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });

  await new Promise(r => setTimeout(r, 1500));
  await ev(`(() => {
    const tabBtns = Array.from(document.querySelectorAll('.source-tab-btn'));
    const videoTab = tabBtns.find(b => b.textContent && b.textContent.includes('Video'));
    if (videoTab) videoTab.click();
  })()`);

  await new Promise(r => setTimeout(r, 1000));
  const shot = await S('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'screenshot_390_video_mobile.png'), Buffer.from(shot.data, 'base64'));
  console.log('Saved screenshot_390_video_mobile.png');

  ws.close();
  child.kill();
}
run();
