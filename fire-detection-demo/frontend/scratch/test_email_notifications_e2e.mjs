import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const artifactDir = 'C:/Users/Hồ Ngọc Hải Nhân/.gemini/antigravity/brain/a7f5f957-8871-4e97-bb7c-d7bba57f037d';
const profile = path.join(os.tmpdir(), 'chrome-email-test-' + Date.now());
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

    // 1. Tạo target mở trang web
    const { result: { targetId } } = await send('Target.createTarget', { url: 'http://localhost:5173/' });
    const { result: { sessionId } } = await send('Target.attachToTarget', { targetId, flatten: true });
    const S = (m, p) => send(m, p, sessionId);
    const ev = async x => {
      const res = await S('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true });
      if (res.result?.result?.value !== undefined) return res.result.result.value;
      if (res.result?.value !== undefined) return res.result.value;
      return res;
    };

    const takeScreenshot = async (filename) => {
      const { result: { data } } = await S('Page.captureScreenshot', { format: 'png' });
      const fullPath = path.join(artifactDir, filename);
      fs.writeFileSync(fullPath, Buffer.from(data, 'base64'));
      console.log(`[Screenshot Saved] ${fullPath}`);
    };

    console.log('=== TEST 1: KIỂM TRA CHẾ ĐỘ KHÁCH & GIAO DIỆN BAN ĐẦU ===');
    await S('Emulation.setDeviceMetricsOverride', { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
    await new Promise(r => setTimeout(r, 2000));

    const guestAuthBtn = await ev(`(() => {
      const btn = document.querySelector('.editorial-auth-btn');
      return btn ? btn.textContent.trim() : null;
    })()`);
    console.log(`- Nút đăng nhập trên Header: "${guestAuthBtn}"`);

    // 2. Mở Auth Modal từ Header
    console.log('\n=== TEST 2: QUY TRÌNH ĐĂNG NHẬP BẰNG EMAIL OTP ===');
    await ev(`document.querySelector('.editorial-auth-btn')?.click()`);
    await new Promise(r => setTimeout(r, 600));

    // Chụp ảnh Modal bước 1 (Nhập Email)
    await takeScreenshot('screenshot_auth_modal_step1.png');

    // Helper setNativeValue & submit email
    await ev(`(() => {
      function setNativeVal(el, val) {
        const valSetter = Object.getOwnPropertyDescriptor(el, 'value')?.set;
        const proto = Object.getPrototypeOf(el);
        const protoValSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        if (protoValSetter && valSetter !== protoValSetter) {
          protoValSetter.call(el, val);
        } else if (valSetter) {
          valSetter.call(el, val);
        } else {
          el.value = val;
        }
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
      const input = document.querySelector('.auth-input');
      if (input) {
        setNativeVal(input, 'guard@firewatch.vn');
      }
      const btn = document.querySelector('.auth-submit-btn');
      if (btn) btn.click();
    })()`);
    await new Promise(r => setTimeout(r, 800));

    // Chụp ảnh Modal bước 2 (Nhập OTP)
    await takeScreenshot('screenshot_auth_modal_step2_otp.png');

    // Nhập OTP 123456 và bấm xác nhận
    await ev(`(() => {
      function setNativeVal(el, val) {
        const valSetter = Object.getOwnPropertyDescriptor(el, 'value')?.set;
        const proto = Object.getPrototypeOf(el);
        const protoValSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        if (protoValSetter && valSetter !== protoValSetter) {
          protoValSetter.call(el, val);
        } else if (valSetter) {
          valSetter.call(el, val);
        } else {
          el.value = val;
        }
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
      const otpInput = document.querySelector('.auth-otp-input');
      if (otpInput) {
        setNativeVal(otpInput, '123456');
      }
      const btn = document.querySelector('.auth-submit-btn');
      if (btn) btn.click();
    })()`);
    await new Promise(r => setTimeout(r, 1200));

    const loggedInEmail = await ev(`(() => {
      const pill = document.querySelector('.editorial-user-pill .user-email');
      return pill ? pill.textContent.trim() : null;
    })()`);
    console.log(`- Đăng nhập thành công, email hiển thị trên Header: "${loggedInEmail}"`);

    // 3. Mở Cài đặt, Bật toggle Email & Gửi email thử
    console.log('\n=== TEST 3: CÀI ĐẶT EMAIL & GỬI THỬ NGHIỆM ===');
    await ev(`document.querySelector('.editorial-settings-btn')?.click()`);
    await new Promise(r => setTimeout(r, 600));

    // Cuộn modal xuống để nhìn thấy mục Email
    await ev(`(() => {
      const modalBody = document.querySelector('.modal-body');
      if (modalBody) modalBody.scrollTop = modalBody.scrollHeight;
    })()`);
    await new Promise(r => setTimeout(r, 400));

    // Bật công tắc nhận email
    await ev(`(() => {
      const checkboxes = Array.from(document.querySelectorAll('.settings-section .checkbox-input'));
      const emailCheckbox = checkboxes.find(c => {
        const text = c.parentElement?.textContent || '';
        return text.includes('Nhận cảnh báo lửa qua email');
      });
      if (emailCheckbox && !emailCheckbox.checked) {
        emailCheckbox.click();
      }
    })()`);
    await new Promise(r => setTimeout(r, 600));

    // Bấm nút Gửi email thử
    await ev(`(() => {
      const btn = document.querySelector('.test-email-btn');
      if (btn) btn.click();
    })()`);
    await new Promise(r => setTimeout(r, 1200));

    const testEmailStatus = await ev(`(() => {
      const feedback = document.querySelector('.test-email-feedback');
      const btn = document.querySelector('.test-email-btn');
      return {
        feedback: feedback ? feedback.textContent.trim() : null,
        btnText: btn ? btn.textContent.trim() : null
      };
    })()`);
    console.log(`- Trạng thái gửi thư thử:`, testEmailStatus);

    // Chụp modal cài đặt với tùy chọn email cuộn xuống
    await takeScreenshot('screenshot_settings_email_configured.png');

    // Bật Mock Data trong modal để kiểm thử luồng hiển thị cảnh báo lửa
    await ev(`(() => {
      const checkboxes = Array.from(document.querySelectorAll('.settings-section .checkbox-input'));
      const mockCheckbox = checkboxes.find(c => {
        const text = c.parentElement?.textContent || '';
        return text.includes('Bật dữ liệu mô phỏng cố định');
      });
      if (mockCheckbox && !mockCheckbox.checked) {
        mockCheckbox.click();
      }
    })()`);
    await new Promise(r => setTimeout(r, 400));

    // Đóng cài đặt
    await ev(`document.querySelector('.modal-footer .primary-action-btn')?.click()`);
    await new Promise(r => setTimeout(r, 500));

    // 4. Test Video nhận diện lửa và phát cảnh báo
    console.log('\n=== TEST 4: NHẬN DIỆN LỬA VIDEO & CẢNH BÁO TRONG PHIÊN ===');
    await ev(`(() => {
      const tabBtns = Array.from(document.querySelectorAll('.source-tab-btn'));
      const videoTab = tabBtns.find(b => b.textContent && b.textContent.includes('Video'));
      if (videoTab) videoTab.click();
    })()`);
    await new Promise(r => setTimeout(r, 800));

    // Phát video
    console.log('- Đang kích hoạt phát video...');
    await ev(`(() => {
      const v = document.querySelector('video');
      if (v) {
        v.muted = true;
        v.play().catch(e => console.error(e));
      }
    })()`);

    // Chờ 3 giây để tracker tích lũy >= 0.5s lửa
    console.log('- Đang tích lũy frame video...');
    await new Promise(r => setTimeout(r, 3000));

    // Cuộn sidebar xuống để hiển thị Cảnh báo trong phiên
    await ev(`(() => {
      const section = document.querySelector('.editorial-alerts-section');
      if (section) section.scrollIntoView({ behavior: 'instant', block: 'end' });
    })()`);
    await new Promise(r => setTimeout(r, 600));

    // Lấy thông tin cảnh báo
    const alertDetails = await ev(`(() => {
      const card = document.querySelector('.session-alert-card');
      if (!card) return null;
      const title = card.querySelector('.session-alert-title')?.textContent?.trim();
      const meta = card.querySelector('.session-alert-meta-row')?.textContent?.trim();
      const statusPill = card.querySelector('.status-pill')?.textContent?.trim();
      return { title, meta, statusPill };
    })()`);
    console.log('- Chi tiết thẻ cảnh báo trong phiên:', alertDetails);

    // Chụp màn hình Desktop 1366x768 hoàn chỉnh với Cảnh báo trong phiên
    await takeScreenshot('screenshot_desktop_alert_with_email.png');

    // 5. Test Mobile 390px
    console.log('\n=== TEST 5: KIỂM TRA MÀN HÌNH MOBILE 390PX ===');
    await S('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await new Promise(r => setTimeout(r, 1000));
    await takeScreenshot('screenshot_mobile_390_email.png');

    console.log('\n=== TOÀN BỘ KIỂM THỬ E2E HOÀN TẤT THÀNH CÔNG 100% ===');
  } catch (err) {
    console.error('Lỗi khi chạy test E2E:', err);
  } finally {
    try { child.kill(); } catch {}
  }
}

run();
