import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const artifactDir = 'C:/Users/Hồ Ngọc Hải Nhân/.gemini/antigravity/brain/a7f5f957-8871-4e97-bb7c-d7bba57f037d';
const profile = path.join(os.tmpdir(), 'chrome-plain-model-' + Date.now());
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

    const { result: { targetId } } = await send('Target.createTarget', { url: 'http://localhost:5173/' });
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

    // Lấy thông tin Header model pill
    const headerModelName = await ev(`(() => {
      const btn = document.querySelector('.editorial-model-btn span');
      return btn ? btn.textContent.trim() : null;
    })()`);
    console.log('Header model pill name:', headerModelName);

    // Mở modal cài đặt trước để xem danh sách model và trạng thái Đang dùng
    await ev(`document.querySelector('.editorial-settings-btn')?.click()`);
    await new Promise(r => setTimeout(r, 1200));

    const modalListCount = await ev(`document.querySelectorAll('.settings-section button[type=\"button\"]').length`);
    console.log('Model items rendered in modal:', modalListCount);

    const snapModal = await S('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(artifactDir, 'screenshot_plain_model_modal.png'), Buffer.from(snapModal.result.data, 'base64'));
    console.log('Saved screenshot_plain_model_modal.png');

    // Đóng modal
    await ev(`document.querySelector('.modal-footer .primary-action-btn')?.click()`);
    await new Promise(r => setTimeout(r, 600));

    // Bấm phân tích ảnh mẫu
    await ev(`(() => {
      const btn = document.querySelector('.editorial-outline-btn');
      if (btn) btn.click();
    })()`);

    // Chờ phân tích hoàn tất
    for (let i = 0; i < 15; i++) {
      await new Promise(r => setTimeout(r, 500));
      const isAnalyzing = await ev(`!!document.querySelector('.editorial-analyzing-pill')`);
      if (!isAnalyzing) {
        console.log(`Inference finished after ${(i + 1) * 0.5}s`);
        break;
      }
    }
    await new Promise(r => setTimeout(r, 1000));

    // Lấy caption và kết quả phân tích
    const analysisInfo = await ev(`(() => {
      const cap = document.querySelector('.media-caption-text')?.textContent?.trim();
      const resultsTitle = document.querySelector('.results-summary-heading')?.textContent?.trim();
      const detList = Array.from(document.querySelectorAll('.detection-region-item')).map(item => item.textContent.replace(/\\s+/g, ' ').trim());
      return { cap, resultsTitle, detList };
    })()`);
    console.log('Analysis info:', analysisInfo);

    // Chụp màn hình phân tích với model mới
    const snapAnalyzed = await S('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(artifactDir, 'screenshot_plain_model_analyzed.png'), Buffer.from(snapAnalyzed.result.data, 'base64'));
    console.log('Saved screenshot_plain_model_analyzed.png');

  } catch (err) {
    console.error(err);
  } finally {
    try { child.kill(); } catch {}
  }
}

run();
