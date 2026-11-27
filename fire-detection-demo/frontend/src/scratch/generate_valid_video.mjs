import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const profile = path.join(os.tmpdir(), 'chrome-gen-video-' + Date.now());
fs.mkdirSync(profile, { recursive: true });
const portFile = path.join(profile, 'DevToolsActivePort');

const child = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new',
  '--user-data-dir=' + profile,
  '--remote-debugging-port=0',
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
    return res.result?.result?.value !== undefined ? res.result.result.value : res.result?.value;
  };

  await new Promise(r => setTimeout(r, 2000));

  // Generate valid WebM video using browser canvas and MediaRecorder
  console.log('Generating valid WebM video with smoke and fire animation...');
  const base64Data = await ev(`(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 360;
    const ctx = canvas.getContext('2d');

    const img = new Image();
    img.src = '/samples/sample_fire_smoke.jpg';
    await new Promise(r => { img.onload = r; img.onerror = r; });

    const stream = canvas.captureStream(25);
    const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp8') ? 'video/webm;codecs=vp8' : 'video/webm';
    const rec = new MediaRecorder(stream, { mimeType: mime });
    const chunks = [];
    rec.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };

    const p = new Promise(resolve => {
      rec.onstop = async () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        const reader = new FileReader();
        reader.onloadend = () => {
          const res = reader.result;
          resolve(res.split(',')[1]);
        };
        reader.readAsDataURL(blob);
      };
    });

    rec.start();

    // Draw 75 frames (3 seconds at 25 fps) with real smoke/fire animation on top of mountain background
    for (let f = 0; f < 75; f++) {
      if (img.complete && img.naturalWidth) {
        ctx.drawImage(img, 0, 0, 640, 360);
      } else {
        ctx.fillStyle = '#2d3748';
        ctx.fillRect(0, 0, 640, 360);
      }

      // Animated smoke plume
      const smokeY = 140 - (f % 30) * 1.5;
      const smokeRadius = 18 + (f % 20);
      ctx.fillStyle = 'rgba(230, 235, 240, 0.45)';
      ctx.beginPath();
      ctx.arc(380, smokeY, smokeRadius, 0, Math.PI * 2);
      ctx.fill();

      // Animated fire flicker
      const fireH = 25 + (f % 5) * 4;
      ctx.fillStyle = 'rgba(249, 115, 22, 0.85)';
      ctx.beginPath();
      ctx.ellipse(380, 180, 12, fireH, 0, 0, Math.PI * 2);
      ctx.fill();

      await new Promise(r => setTimeout(r, 40));
    }

    rec.stop();
    return await p;
  })()`);

  if (base64Data) {
    const buf = Buffer.from(base64Data, 'base64');
    const outWebm = 'c:\\fire_smoke_web\\fire-detection-demo\\frontend\\public\\samples\\sample_fire.webm';
    const outMp4 = 'c:\\fire_smoke_web\\fire-detection-demo\\frontend\\public\\samples\\sample_fire.mp4';
    const outDistWebm = 'c:\\fire_smoke_web\\fire-detection-demo\\frontend\\dist\\samples\\sample_fire.webm';
    const outDistMp4 = 'c:\\fire_smoke_web\\fire-detection-demo\\frontend\\dist\\samples\\sample_fire.mp4';

    fs.writeFileSync(outWebm, buf);
    fs.writeFileSync(outMp4, buf); // WebM container is also accepted by Chrome
    fs.writeFileSync(outDistWebm, buf);
    fs.writeFileSync(outDistMp4, buf);
    console.log('Saved valid video to public and dist! Size:', buf.length);
  }

  ws.close();
  child.kill();
}
run();
