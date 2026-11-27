import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const artifactDir = 'C:/Users/Hồ Ngọc Hải Nhân/.gemini/antigravity/brain/a7f5f957-8871-4e97-bb7c-d7bba57f037d';
const profile = path.join(os.tmpdir(), 'chrome-alert-email-card-' + Date.now());
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
  try {
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

    const { result: { targetId } } = await send('Target.createTarget', { url: 'http://localhost:5173/?demo=fire' });
    const { result: { sessionId } } = await send('Target.attachToTarget', { targetId, flatten: true });
    const S = (m, p) => send(m, p, sessionId);
    const ev = async x => {
      const res = await S('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true });
      if (res.result?.result?.value !== undefined) return res.result.result.value;
      if (res.result?.value !== undefined) return res.result.value;
      return res;
    };

    await S('Emulation.setDeviceMetricsOverride', { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
    await new Promise(r => setTimeout(r, 2000));

    // Sign in via mock auth
    await ev(`(() => {
      const mockUser = { id: 'usr_guard', email: 'guard@firewatch.vn' };
      localStorage.setItem('fire_studio_mock_auth_user', JSON.stringify(mockUser));
      window.location.reload();
    })()`);
    await new Promise(r => setTimeout(r, 2000));

    // Switch to Video
    await ev(`(() => {
      const tabBtns = Array.from(document.querySelectorAll('.source-tab-btn'));
      const videoTab = tabBtns.find(b => b.textContent && b.textContent.includes('Video'));
      if (videoTab) videoTab.click();
    })()`);
    await new Promise(r => setTimeout(r, 800));

    // Play video to generate alert
    await ev(`(() => {
      const v = document.querySelector('video');
      if (v) { v.muted = true; v.play(); }
    })()`);
    await new Promise(r => setTimeout(r, 2500));

    // Cuộn xuống xem Cảnh báo trong phiên
    await ev(`(() => {
      const section = document.querySelector('.editorial-alerts-section');
      if (section) section.scrollIntoView({ behavior: 'instant', block: 'end' });
    })()`);
    await new Promise(r => setTimeout(r, 500));

    const snap = await S('Page.captureScreenshot', { format: 'png' });
    const fullPath = path.join(artifactDir, 'screenshot_session_alerts_card.png');
    fs.writeFileSync(fullPath, Buffer.from(snap.result.data, 'base64'));
    console.log('Saved screenshot_session_alerts_card.png');
  } catch (err) {
    console.error(err);
  } finally {
    try { child.kill(); } catch {}
  }
}
run();
