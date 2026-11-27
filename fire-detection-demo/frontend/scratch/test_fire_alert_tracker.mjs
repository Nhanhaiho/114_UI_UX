import assert from 'node:assert';
import {
  FireAlertTracker,
  calculateIoU,
  isSameSpatialRegion,
  formatAlertTime,
} from '../src/utils/fireAlertTracker.ts';

console.log('=== BẮT ĐẦU KIỂM THỬ MODULE XÁC NHẬN CẢNH BÁO LỬA ===\n');

// -------------------------------------------------------------
// Test Helper: Tạo DetectionItem giả lập
// -------------------------------------------------------------
function makeFireDetection(box, confidence) {
  return {
    class_id: 0,
    class_name: 'fire',
    confidence,
    box,
  };
}

function makeSmokeDetection(box, confidence) {
  return {
    class_id: 1,
    class_name: 'smoke',
    confidence,
    box,
  };
}

// -------------------------------------------------------------
// Test 1: Tình huống 1 - Box lóe một frame tạo 0 cảnh báo
// -------------------------------------------------------------
console.log('--- TEST 1: Box lóe 1 frame (< 0.5s) tạo 0 cảnh báo ---');
{
  const tracker = new FireAlertTracker({
    triggerConfidence: 0.30,
    continueConfidence: 0.20,
    confirmDurationMs: 500,
    maxGapMs: 400,
  });

  const box1 = [0.2, 0.2, 0.4, 0.4];

  // Frame 1 tại t=0ms: Lửa xuất hiện với confidence cao (0.85 >= 0.30)
  const res1 = tracker.processFrame([makeFireDetection(box1, 0.85)], 0);
  assert.strictEqual(res1.newAlerts.length, 0, 'Frame đầu tiên chưa đủ 0.5s, không phát cảnh báo');
  assert.strictEqual(res1.activeAlerts.length, 0, 'Chưa có cảnh báo kích hoạt');

  // Frame 2 tại t=200ms: Không có detection nào (hoặc chỉ có khói)
  const res2 = tracker.processFrame([makeSmokeDetection([0.1, 0.1, 0.3, 0.3], 0.7)], 200);
  assert.strictEqual(res2.newAlerts.length, 0);
  assert.strictEqual(res2.activeAlerts.length, 0);

  // Frame 3 tại t=500ms: Không có lửa (vượt quá maxGapMs = 400ms kể từ t=0ms)
  const res3 = tracker.processFrame([], 500);
  assert.strictEqual(res3.newAlerts.length, 0, 'Không phát cảnh báo');
  assert.strictEqual(res3.allAlerts.length, 0, 'Danh sách cảnh báo phiên phải là 0');

  // Frame 4 tại t=800ms: Kiểm tra lại toàn bộ lịch sử
  const history = tracker.getAlertHistory();
  assert.strictEqual(history.length, 0, 'Tổng số cảnh báo phải là 0 vì vùng lửa lóe đã bị hủy');
  console.log('✓ TEST 1 PASS: Box lóe 1 frame đã bị hủy đúng, 0 cảnh báo được phát sinh.');
}

// -------------------------------------------------------------
// Test 2: Tình huống 2 - Cùng một vùng duy trì đủ điều kiện tạo 1 cảnh báo
// -------------------------------------------------------------
console.log('\n--- TEST 2: Cùng một vùng duy trì đủ >= 0.5s tạo đúng 1 cảnh báo ---');
{
  const tracker = new FireAlertTracker({
    triggerConfidence: 0.30,
    continueConfidence: 0.20,
    confirmDurationMs: 500,
    maxGapMs: 400,
  });

  const box = [0.3, 0.3, 0.5, 0.5];

  // Frame 1 tại t=0ms: Bắt đầu theo dõi với confidence >= 0.30 (0.35)
  const res1 = tracker.processFrame([makeFireDetection(box, 0.35)], 0, { isVideo: true });
  assert.strictEqual(res1.newAlerts.length, 0, 't=0ms: Chưa đủ thời gian');

  // Frame 2 tại t=150ms: Cùng vùng, confidence 0.28 (> 0.20)
  const res2 = tracker.processFrame([makeFireDetection([0.31, 0.30, 0.51, 0.50], 0.28)], 150, { isVideo: true });
  assert.strictEqual(res2.newAlerts.length, 0, 't=150ms: duration=150ms < 500ms');

  // Frame 3 tại t=350ms: Cùng vùng, confidence 0.22 (> 0.20)
  const res3 = tracker.processFrame([makeFireDetection([0.30, 0.31, 0.50, 0.51], 0.22)], 350, { isVideo: true });
  assert.strictEqual(res3.newAlerts.length, 0, 't=350ms: duration=350ms < 500ms');

  // Frame 4 tại t=550ms: Cùng vùng, confidence 0.25 (> 0.20). Duration = 550ms >= 500ms!
  const res4 = tracker.processFrame([makeFireDetection(box, 0.25)], 550, { isVideo: true });
  assert.strictEqual(res4.newAlerts.length, 1, 't=550ms: Đủ 0.5s -> Phải phát đúng 1 cảnh báo mới!');
  assert.strictEqual(res4.activeAlerts.length, 1, 'Trạng thái cảnh báo đang hoạt động');
  assert.strictEqual(res4.allAlerts.length, 1, 'Lịch sử phiên có 1 cảnh báo');
  assert.strictEqual(res4.newAlerts[0].formattedTime, '00:00', 'Định dạng thời gian 550ms -> 00:00');

  // Frame 5 tại t=750ms: Lửa vẫn tiếp diễn trong vùng đó
  const res5 = tracker.processFrame([makeFireDetection(box, 0.32)], 750, { isVideo: true });
  assert.strictEqual(res5.newAlerts.length, 0, 'Cảnh báo đã xác nhận không được phát trùng lặp');
  assert.strictEqual(res5.activeAlerts.length, 1, 'Cảnh báo vẫn ở trạng thái tiếp diễn (active)');
  assert.strictEqual(res5.allAlerts.length, 1, 'Lịch sử phiên vẫn chỉ có đúng 1 cảnh báo');

  // Frame 6 tại t=1300ms: Lửa tắt (khoảng trống 1300 - 750 = 550ms > maxGapMs)
  const res6 = tracker.processFrame([], 1300, { isVideo: true });
  assert.strictEqual(res6.activeAlerts.length, 0, 'Lửa đã tắt -> activeAlerts rỗng');
  assert.strictEqual(res6.allAlerts.length, 1, 'Cảnh báo vẫn được lưu trong lịch sử phiên');
  assert.strictEqual(res6.allAlerts[0].isActive, false, 'Cảnh báo đã chuyển sang trạng thái kết thúc');

  console.log('✓ TEST 2 PASS: Vùng lửa duy trì đủ >= 0.5s đã tạo đúng 1 cảnh báo và quản lý trạng thái active chuẩn xác.');
}

// -------------------------------------------------------------
// Test 3: Tình huống 3 - Hai vùng khác nhau lần lượt lóe lên thì không được cộng dồn thời gian
// -------------------------------------------------------------
console.log('\n--- TEST 3: Hai vùng khác nhau lần lượt lóe lên KHÔNG được cộng dồn thời gian ---');
{
  const tracker = new FireAlertTracker({
    triggerConfidence: 0.30,
    continueConfidence: 0.20,
    confirmDurationMs: 500,
    maxGapMs: 400,
  });

  // Vùng A: Góc trên-trái [0.05, 0.05, 0.20, 0.20]
  const boxA = [0.05, 0.05, 0.20, 0.20];
  // Vùng B: Góc dưới-phải [0.75, 0.75, 0.95, 0.95]
  const boxB = [0.75, 0.75, 0.95, 0.95];

  // Kiểm tra tính độc lập không gian: IoU = 0, không trùng vùng
  assert.strictEqual(calculateIoU(boxA, boxB), 0, 'Hai vùng A và B hoàn toàn tách biệt');
  assert.strictEqual(isSameSpatialRegion(boxA, boxB), false, 'Hai vùng A và B không cùng không gian');

  // t=0ms: Vùng A xuất hiện (300ms duy trì rồi tắt)
  tracker.processFrame([makeFireDetection(boxA, 0.45)], 0);
  tracker.processFrame([makeFireDetection(boxA, 0.35)], 150);
  const resA = tracker.processFrame([makeFireDetection(boxA, 0.25)], 300);
  assert.strictEqual(resA.newAlerts.length, 0, 'Vùng A mới duy trì 300ms < 500ms, chưa có cảnh báo');

  // t=400ms: Vùng A biến mất, Vùng B xuất hiện
  // Nếu có lỗi cộng dồn dở, tổng thời gian sẽ là 300ms + 100ms = 400ms
  const resB1 = tracker.processFrame([makeFireDetection(boxB, 0.50)], 400);
  assert.strictEqual(resB1.newAlerts.length, 0, 'Vùng B mới bắt đầu, không được thừa hưởng thời gian từ vùng A');

  // t=650ms: Vùng B tiếp tục xuất hiện (duration của B mới là 650 - 400 = 250ms).
  // Nếu bị cộng dồn thời gian vùng A (300ms + 250ms = 550ms >= 500ms), nó sẽ phát cảnh báo sai!
  const resB2 = tracker.processFrame([makeFireDetection(boxB, 0.40)], 650);
  assert.strictEqual(resB2.newAlerts.length, 0, 'Vùng B mới chỉ duy trì 250ms, TUYỆT ĐỐI KHÔNG được cộng dồn thời gian của vùng A');

  // t=750ms: Vùng A đã mất quá maxGapMs (750 - 300 = 450ms > 400ms) -> Vùng A bị hủy hoàn toàn.
  // Vùng B biến mất tại t=750ms.
  tracker.processFrame([], 750);

  // t=1200ms: Vùng B cũng đã mất quá maxGapMs (1200 - 650 = 550ms > 400ms) -> Vùng B bị hủy hoàn toàn.
  const resFinal = tracker.processFrame([], 1200);

  assert.strictEqual(resFinal.allAlerts.length, 0, 'Cả hai vùng đều biến mất trước khi đủ 0.5s -> Tổng cảnh báo bằng 0');
  console.log('✓ TEST 3 PASS: Hai vùng khác nhau được theo dõi độc lập, không cộng dồn thời gian, không phát sinh cảnh báo giả.');
}

// -------------------------------------------------------------
// Test 4: Reset khi tua video hoặc tắt nhận diện
// -------------------------------------------------------------
console.log('\n--- TEST 4: Reset các ứng viên dở dang khi tua video / tắt nhận diện ---');
{
  const tracker = new FireAlertTracker();
  const box = [0.1, 0.1, 0.3, 0.3];

  tracker.processFrame([makeFireDetection(box, 0.40)], 100);
  tracker.processFrame([makeFireDetection(box, 0.35)], 300); // 200ms duy trì

  // Người dùng tua video hoặc tắt nhận diện -> gọi resetPending()
  tracker.resetPending();

  // Khung hình sau khi tua tại thời điểm mới: nếu xuất hiện lửa, phải bắt đầu lại từ đầu
  const resAfterSeek = tracker.processFrame([makeFireDetection(box, 0.35)], 4000);
  assert.strictEqual(resAfterSeek.newAlerts.length, 0, 'Sau khi resetPending, candidate mới được tạo lại từ đầu');
  assert.strictEqual(tracker.getAlertHistory().length, 0);
  console.log('✓ TEST 4 PASS: resetPending xóa sạch trạng thái theo dõi đang dở.');
}

// -------------------------------------------------------------
// Test 5: Khoảng ngắt vượt quá maxGapMs (0ms và 1200ms với maxGapMs=400ms) -> 0 cảnh báo
// -------------------------------------------------------------
console.log('\n--- TEST 5: Khoảng ngắt > maxGapMs (0ms -> 1200ms) KHÔNG được cộng dồn/xác nhận ---');
{
  const tracker = new FireAlertTracker({
    triggerConfidence: 0.30,
    continueConfidence: 0.20,
    confirmDurationMs: 500,
    maxGapMs: 400,
  });
  const box = [0.25, 0.25, 0.45, 0.45];

  const r1 = tracker.processFrame([makeFireDetection(box, 0.60)], 0, { modelKey: 'model_a.pt' });
  assert.strictEqual(r1.newAlerts.length, 0);

  // Nhảy cóc tới t=1200ms (> maxGapMs=400ms): ứng viên cũ ở 0ms phải hết hạn, không ghép với 1200ms
  const r2 = tracker.processFrame([makeFireDetection(box, 0.60)], 1200, { modelKey: 'model_a.pt' });
  assert.strictEqual(r2.newAlerts.length, 0, 'Khoảng ngắt 1200ms > 400ms không được xác nhận cảnh báo');
  assert.strictEqual(r2.allAlerts.length, 0, 'Phải bắt đầu ứng viên mới tại 1200ms, tổng cảnh báo = 0');

  // Nếu từ 1200ms tiếp tục duy trì đủ 500ms (tới 1750ms) mới xác nhận đúng 1 cảnh báo
  const r3 = tracker.processFrame([makeFireDetection(box, 0.60)], 1750, { modelKey: 'model_a.pt' });
  // 1750 - 1200 = 550ms > 400ms nếu nhảy 1 bước, thử bước 1450ms -> 1750ms để mô phỏng frame liên tục:
  const trackerCont = new FireAlertTracker({ maxGapMs: 400, confirmDurationMs: 500 });
  trackerCont.processFrame([makeFireDetection(box, 0.60)], 0);
  trackerCont.processFrame([makeFireDetection(box, 0.60)], 1200);
  trackerCont.processFrame([makeFireDetection(box, 0.60)], 1450);
  const rCont = trackerCont.processFrame([makeFireDetection(box, 0.60)], 1750);
  assert.strictEqual(rCont.newAlerts.length, 1, 'Duy trì liên tục từ mốc 1200ms tới 1750ms tạo 1 cảnh báo mới');
  assert.strictEqual(rCont.newAlerts[0].firstSeenMs, 1200, 'firstSeenMs phải bắt đầu lại từ 1200ms');
  assert.strictEqual(r3.newAlerts.length, 0, 'Nhảy 1750 - 1200 = 550ms > 400ms cũng không cộng dồn');
  console.log('✓ TEST 5 PASS: Khoảng ngắt > maxGapMs hủy ứng viên cũ trước khi ghép box.');
}

// -------------------------------------------------------------
// Test 6: Đổi checkpoint model giữa chừng KHÔNG gộp frame hai model thành cùng cảnh báo
// -------------------------------------------------------------
console.log('\n--- TEST 6: Đổi checkpoint KHÔNG gộp sự kiện của hai model ---');
{
  const tracker = new FireAlertTracker({
    triggerConfidence: 0.30,
    continueConfidence: 0.20,
    confirmDurationMs: 500,
    maxGapMs: 400,
  });
  const box = [0.2, 0.2, 0.4, 0.4];

  tracker.processFrame([makeFireDetection(box, 0.70)], 0, { modelKey: 'weights/plain_mixedneg_s42_last.pt' });
  tracker.processFrame([makeFireDetection(box, 0.70)], 300, { modelKey: 'weights/plain_mixedneg_s42_last.pt' });

  // Đổi sang model khác tại t=600ms (kể cả chưa gọi resetPending tường minh, modelKey đổi cũng tự reset)
  const rSwitch = tracker.processFrame([makeFireDetection(box, 0.70)], 600, { modelKey: 'weights/yolo26n_p2_src.pt' });
  assert.strictEqual(rSwitch.newAlerts.length, 0, 'Frame từ model mới không được cộng dồn thời gian với model cũ');
  assert.strictEqual(rSwitch.allAlerts.length, 0);
  console.log('✓ TEST 6 PASS: Đổi checkpoint không gộp sự kiện của hai model.');
}

console.log('\n=== TẤT CẢ 6 BỘ KIỂM THỬ ĐỀU VƯỢT QUA 100% ===');
