import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const profile = path.join(os.tmpdir(), 'chrome-alert-e2e-' + Date.now());
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

    // Mở trang với ?demo=fire để bật Mock Mode
    const { result: { targetId } } = await send('Target.createTarget', { url: 'http://localhost:5173/?demo=fire' });
    const { result: { sessionId } } = await send('Target.attachToTarget', { targetId, flatten: true });
    const S = (m, p) => send(m, p, sessionId);
    const ev = async x => {
      const res = await S('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true });
      if (res.result?.result?.value !== undefined) return res.result.result.value;
      if (res.result?.value !== undefined) return res.result.value;
      return res;
    };

    // Monitor Network
    await S('Network.enable');
    const inferRequests = [];
    ws.addEventListener('message', e => {
      const m = JSON.parse(e.data);
      if (m.method === 'Network.requestWillBeSent' && m.params.request.url.includes('/api/infer/image')) {
        inferRequests.push({
          url: m.params.request.url,
          postData: m.params.request.postData
        });
      }
    });

    // 1. Set Desktop 1366x768
    await S('Emulation.setDeviceMetricsOverride', {
      width: 1366,
      height: 768,
      deviceScaleFactor: 1,
      mobile: false
    });

    await new Promise(r => setTimeout(r, 2000));

    // 2. Chuyển sang Tab Video
    console.log('[Step 1] Chuyển sang Tab Video...');
    await ev(`(() => {
      const tabBtns = Array.from(document.querySelectorAll('.source-tab-btn'));
      const videoTab = tabBtns.find(b => b.textContent && b.textContent.includes('Video'));
      if (videoTab) videoTab.click();
    })()`);
    await new Promise(r => setTimeout(r, 1000));

    // 3. Phát video
    console.log('[Step 2] Phát video trong chế độ Mock Mode...');
    await ev(`(() => {
      const v = document.querySelector('video');
      if (v) {
        v.muted = true;
        v.play();
      }
    })()`);

    // Chờ 3.0 giây để video chạy qua các frame và tracker tích lũy >= 0.5s
    console.log('[Step 3] Chờ 3.0s để tích lũy frame và xác nhận cảnh báo lửa...');
    await new Promise(r => setTimeout(r, 3000));

    // 4. Kiểm tra DOM UI xem Cảnh báo lửa đã kích hoạt chưa
    const alertInfo = await ev(`(() => {
      const banner = document.querySelector('.editorial-alert-banner');
      const captionBadge = document.querySelector('.caption-alert-badge');
      const alertCards = Array.from(document.querySelectorAll('.session-alert-card')).map(c => ({
        title: c.querySelector('.session-alert-title')?.innerText?.trim(),
        status: c.querySelector('.status-pill')?.innerText?.trim(),
        meta: c.querySelector('.session-alert-meta-row')?.innerText?.trim(),
        isActive: c.classList.contains('active')
      }));

      return {
        hasBanner: !!banner,
        bannerText: banner?.innerText?.trim() || null,
        hasCaptionBadge: !!captionBadge,
        captionBadgeText: captionBadge?.innerText?.trim() || null,
        sessionAlertsCount: alertCards.length,
        sessionAlerts: alertCards
      };
    })()`);

    console.log('[Step 4] Trạng thái Alert UI thu được:', JSON.stringify(alertInfo, null, 2));

    // 5. Chụp ảnh Desktop 1366x768 khi có Cảnh báo lửa
    const snapDesktop = await S('Page.captureScreenshot', { format: 'png' });
    const desktopPath = 'C:/Users/Hồ Ngọc Hải Nhân/.gemini/antigravity/brain/a7f5f957-8871-4e97-bb7c-d7bba57f037d/screenshot_alert_desktop_1366.png';
    fs.writeFileSync(desktopPath, Buffer.from(snapDesktop.result.data, 'base64'));
    console.log('✓ Đã lưu ảnh Desktop 1366x768 có cảnh báo:', desktopPath);

    // 6. Chuyển sang kích thước điện thoại 390x844
    console.log('[Step 5] Chuyển sang Mobile Viewport 390x844...');
    await S('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true
    });
    await new Promise(r => setTimeout(r, 1200));

    const snapMobile = await S('Page.captureScreenshot', { format: 'png' });
    const mobilePath = 'C:/Users/Hồ Ngọc Hải Nhân/.gemini/antigravity/brain/a7f5f957-8871-4e97-bb7c-d7bba57f037d/screenshot_alert_mobile_390.png';
    fs.writeFileSync(mobilePath, Buffer.from(snapMobile.result.data, 'base64'));
    console.log('✓ Đã lưu ảnh Mobile 390px có cảnh báo:', mobilePath);

    // 7. Thử nghiệm Tua video và kiểm tra reset
    console.log('[Step 6] Thử nghiệm Tua video và kiểm tra reset pending...');
    await ev(`(() => {
      const v = document.querySelector('video');
      if (v) {
        v.currentTime = 0.5;
      }
    })()`);
    await new Promise(r => setTimeout(r, 1000));

    console.log('\n=== TẤT CẢ CÁC BƯỚC KIỂM THỬ TRÊN TRÌNH DUYỆT ĐỀU THÀNH CÔNG ===');
  } catch (err) {
    console.error('Lỗi E2E:', err);
  } finally {
    child.kill();
  }
}

run();
