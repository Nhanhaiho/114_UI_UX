/**
 * Tiện ích tạo hình ảnh mẫu (ảnh có lửa và ảnh không có lửa) phục vụ kiểm thử nhanh
 */
export async function createSampleImageBlob(hasFire: boolean): Promise<Blob> {
  const sampleUrl = hasFire ? '/samples/sample_fire_smoke.jpg' : '/samples/sample_neutral.jpg';
  try {
    const res = await fetch(sampleUrl);
    if (res.ok) {
      return await res.blob();
    }
  } catch {
    // Fallback vẽ canvas bên dưới
  }

  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 360;
    const ctx = canvas.getContext('2d')!;

    // Nền phòng tối / nhà xưởng
    const bgGrad = ctx.createLinearGradient(0, 0, 0, 360);
    bgGrad.addColorStop(0, '#111827');
    bgGrad.addColorStop(1, '#1f2937');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, 640, 360);

    // Vẽ sàn gạch
    ctx.strokeStyle = '#374151';
    ctx.lineWidth = 1;
    for (let i = 0; i < 640; i += 40) {
      ctx.beginPath();
      ctx.moveTo(i, 260);
      ctx.lineTo(i - 40, 360);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(0, 260);
    ctx.lineTo(640, 260);
    ctx.stroke();

    // Tiêu đề cảnh
    ctx.fillStyle = '#9ca3af';
    ctx.font = '14px sans-serif';
    ctx.fillText(hasFire ? 'Khu vực kiểm thử A - Có đám cháy' : 'Khu vực kiểm thử B - Bình thường', 20, 30);

    if (hasFire) {
      // Vẽ ngọn lửa mẫu ở trung tâm
      const fireX = 320;
      const fireY = 240;

      // Ánh sáng tỏa ra
      const glow = ctx.createRadialGradient(fireX, fireY, 10, fireX, fireY, 90);
      glow.addColorStop(0, 'rgba(249, 115, 22, 0.7)');
      glow.addColorStop(0.5, 'rgba(239, 68, 68, 0.3)');
      glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(fireX, fireY, 90, 0, Math.PI * 2);
      ctx.fill();

      // Thân ngọn lửa
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.moveTo(fireX - 40, fireY + 30);
      ctx.quadraticCurveTo(fireX - 45, fireY - 30, fireX - 10, fireY - 60);
      ctx.quadraticCurveTo(fireX, fireY - 80, fireX + 5, fireY - 50);
      ctx.quadraticCurveTo(fireX + 35, fireY - 30, fireX + 40, fireY + 30);
      ctx.closePath();
      ctx.fill();

      // Tâm lửa màu vàng sáng
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.moveTo(fireX - 20, fireY + 25);
      ctx.quadraticCurveTo(fireX - 25, fireY - 15, fireX, fireY - 45);
      ctx.quadraticCurveTo(fireX + 20, fireY - 15, fireX + 20, fireY + 25);
      ctx.closePath();
      ctx.fill();

      // Khói nhẹ phía trên
      ctx.fillStyle = 'rgba(156, 163, 175, 0.25)';
      ctx.beginPath();
      ctx.arc(fireX - 10, fireY - 100, 25, 0, Math.PI * 2);
      ctx.arc(fireX + 15, fireY - 120, 35, 0, Math.PI * 2);
      ctx.fill();
    }

    canvas.toBlob((blob) => {
      resolve(blob || new Blob());
    }, 'image/jpeg', 0.9);
  });
}

/**
 * Tiện ích tải hoặc tạo video mẫu ngắn phục vụ kiểm thử nhanh tab Video
 */
export async function createSampleVideoBlob(): Promise<Blob> {
  try {
    const res = await fetch('/samples/sample_fire.mp4');
    if (res.ok) {
      const blob = await res.blob();
      if (blob.size > 1000) return blob;
    }
  } catch {
    // Fallback tạo video bằng MediaRecorder
  }

  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 360;
    const ctx = canvas.getContext('2d')!;

    // MediaRecorder trên stream canvas
    let recorder: MediaRecorder;
    try {
      const stream = canvas.captureStream(20);
      const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : 'video/webm';
      recorder = new MediaRecorder(stream, { mimeType: mime });
    } catch {
      resolve(new Blob([], { type: 'video/mp4' }));
      return;
    }

    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    recorder.onstop = () => {
      resolve(new Blob(chunks, { type: 'video/webm' }));
    };

    recorder.start();

    let frame = 0;
    const totalFrames = 50; // 2.5 giây

    const interval = setInterval(() => {
      const bgGrad = ctx.createLinearGradient(0, 0, 0, 360);
      bgGrad.addColorStop(0, '#0f172a');
      bgGrad.addColorStop(1, '#1e293b');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, 640, 360);

      const flicker = Math.sin(frame * 0.4) * 8;
      const fireX = 320;
      const fireY = 230 + flicker;

      // Glow
      const glow = ctx.createRadialGradient(fireX, fireY, 15, fireX, fireY, 90);
      glow.addColorStop(0, 'rgba(239, 68, 68, 0.6)');
      glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(fireX, fireY, 90, 0, Math.PI * 2);
      ctx.fill();

      // Thân lửa
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(fireX, fireY, 35, 0, Math.PI * 2);
      ctx.fill();

      // Tâm lửa
      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.arc(fireX, fireY, 18, 0, Math.PI * 2);
      ctx.fill();

      // Khói
      ctx.fillStyle = 'rgba(148, 163, 184, 0.35)';
      ctx.beginPath();
      ctx.arc(fireX - 15 + Math.sin(frame * 0.3) * 10, fireY - 90 - (frame % 20), 25, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#cbd5e1';
      ctx.font = '14px sans-serif';
      ctx.fillText(`Video mẫu đám cháy AI - Frame ${frame + 1}/${totalFrames}`, 20, 30);

      frame++;
      if (frame >= totalFrames) {
        clearInterval(interval);
        try {
          recorder.stop();
        } catch {
          resolve(new Blob(chunks, { type: 'video/webm' }));
        }
      }
    }, 50);
  });
}

