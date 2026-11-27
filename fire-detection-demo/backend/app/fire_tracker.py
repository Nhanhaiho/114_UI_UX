import time
import asyncio
import logging
from typing import Dict, List, Optional, Any
from app.config import settings
from app.database import (
    get_user_preferences,
    register_event_and_dispatch,
    update_dispatch_status,
)
from app.smtp_service import send_fire_alert_email

logger = logging.getLogger("fire_studio_api.tracker")


def calculate_iou(box_a: List[float], box_b: List[float]) -> float:
    """Tính toán IoU giữa 2 bounding box chuẩn hóa [x1, y1, x2, y2]"""
    ax1, ay1, ax2, ay2 = box_a
    bx1, by1, bx2, by2 = box_b

    inter_x1 = max(ax1, bx1)
    inter_y1 = max(ay1, by1)
    inter_x2 = min(ax2, bx2)
    inter_y2 = min(ay2, by2)

    inter_w = max(0.0, inter_x2 - inter_x1)
    inter_h = max(0.0, inter_y2 - inter_y1)
    inter_area = inter_w * inter_h

    area_a = max(0.0, ax2 - ax1) * max(0.0, ay2 - ay1)
    area_b = max(0.0, bx2 - bx1) * max(0.0, by2 - by1)

    union_area = area_a + area_b - inter_area
    if union_area <= 0:
        return 0.0

    return inter_area / union_area


def is_same_spatial_region(box_a: List[float], box_b: List[float], iou_threshold: float = 0.20) -> bool:
    """
    Kiểm tra 2 box có cùng thuộc một vùng không gian không.
    Kết hợp IoU >= threshold và khoảng cách tâm (center distance) để bao quát trường hợp lửa bùng to/thu nhỏ.
    """
    iou = calculate_iou(box_a, box_b)
    if iou >= iou_threshold:
        return True

    center_ax = (box_a[0] + box_a[2]) / 2.0
    center_ay = (box_a[1] + box_a[3]) / 2.0
    center_bx = (box_b[0] + box_b[2]) / 2.0
    center_by = (box_b[1] + box_b[3]) / 2.0

    dist_sq = (center_ax - center_bx) ** 2 + (center_ay - center_by) ** 2
    if dist_sq < 0.12 * 0.12:
        has_overlap = (
            max(box_a[0], box_b[0]) < min(box_a[2], box_b[2])
            and max(box_a[1], box_b[1]) < min(box_a[3], box_b[3])
        )
        if has_overlap:
            return True

    return False


def format_time_str(timestamp_ms: float, is_video: bool = True) -> str:
    """Định dạng thời gian: MM:SS cho video hoặc HH:MM:SS cho thời gian thực"""
    if is_video:
        total_sec = max(0, int(timestamp_ms // 1000))
        mins = total_sec // 60
        secs = total_sec % 60
        return f"{mins:02d}:{secs:02d}"
    else:
        t = time.localtime(timestamp_ms / 1000.0 if timestamp_ms > 1e11 else time.time())
        return time.strftime("%H:%M:%S", t)


class BackendFireCandidate:
    def __init__(self, cand_id: str, box: List[float], confidence: float, first_seen_ms: float):
        self.id = cand_id
        self.box = box
        self.max_confidence = confidence
        self.first_seen_ms = first_seen_ms
        self.last_seen_ms = first_seen_ms
        self.is_confirmed = False
        self.confirmed_at_ms: Optional[float] = None
        self.email_dispatched = False


class BackendFireTracker:
    """
    Module xác nhận sự kiện lửa trên backend FastAPI.
    Sử dụng cùng bộ quy tắc với frontend (fireAlertTracker.ts) để bảo đảm sự đồng nhất:
    - Bắt đầu ứng viên khi confidence >= 0.30
    - Duy trì khi confidence > 0.20
    - Xác nhận khi duy trì liên tục >= 500ms (dựa trên timestamp frame)
    - Xử lý riêng từng vùng lửa và từng phiên (session_id)
    """

    def __init__(
        self,
        trigger_confidence: float = 0.30,
        continue_confidence: float = 0.20,
        confirm_duration_ms: float = 500.0,
        iou_threshold: float = 0.20,
        max_gap_ms: float = 400.0,
    ):
        self.trigger_confidence = trigger_confidence
        self.continue_confidence = continue_confidence
        self.confirm_duration_ms = confirm_duration_ms
        self.iou_threshold = iou_threshold
        self.max_gap_ms = max_gap_ms

        # Map lưu trữ: session_id -> { cand_id -> BackendFireCandidate }
        self.sessions: Dict[str, Dict[str, BackendFireCandidate]] = {}
        self.session_models: Dict[str, str] = {}
        self._cand_counter = 0

    def reset_session(self, session_id: str) -> None:
        """Xóa các ứng viên đang theo dõi dở dang khi tua video, đổi nguồn hoặc dừng nhận diện"""
        self.session_models.pop(session_id, None)
        if session_id in self.sessions:
            cand_dict = self.sessions[session_id]
            unconfirmed_ids = [cid for cid, c in cand_dict.items() if not c.is_confirmed]
            for cid in unconfirmed_ids:
                del cand_dict[cid]

            del self.sessions[session_id]
            logger.info(f"Đã reset trạng thái theo dõi cho phiên: {session_id}")

    def reset_all_sessions(self) -> None:
        """Xóa toàn bộ phiên theo dõi dở dang (khi đổi checkpoint model)"""
        self.sessions.clear()
        self.session_models.clear()
        logger.info("Đã reset toàn bộ phiên theo dõi do đổi mô hình.")

    async def process_frame(
        self,
        session_id: str,
        detections: List[Dict[str, Any]],
        timestamp_ms: float,
        source_type: str,
        model_name: str,
        user_id: Optional[str] = None,
        user_email: Optional[str] = None,
        is_mock: bool = False,
        user_email_confirmed: bool = True,
        user_is_mock: bool = False,
    ) -> List[Dict[str, Any]]:
        """
        Xử lý từng frame suy luận từ backend và tự động kích hoạt gửi email khi sự kiện được xác nhận.
        Trả về danh sách các sự kiện vừa được xác nhận trong frame này.
        """
        # Quy tắc: Mock mode và ảnh tĩnh chỉ hiển thị trên web, không gửi email!
        if is_mock or source_type not in ("video", "camera"):
            return []

        # Nếu đổi checkpoint trong cùng session_id -> reset ứng viên của model cũ ngay
        prev_model = self.session_models.get(session_id)
        if prev_model is not None and prev_model != model_name:
            self.reset_session(session_id)
        self.session_models[session_id] = model_name

        if session_id not in self.sessions:
            self.sessions[session_id] = {}

        cand_map = self.sessions[session_id]

        # Lọc các detection là Lửa (fire)
        fire_detections = [
            d for d in detections if d.get("class_name", "").lower() == "fire"
        ]

        matched_detection_indices = set()
        newly_confirmed_events: List[Dict[str, Any]] = []

        # 1. Khớp và cập nhật các ứng viên đang theo dõi (kiểm tra khoảng ngắt TRƯỚC khi ghép box)
        for cand_id, candidate in list(cand_map.items()):
            gap = timestamp_ms - candidate.last_seen_ms
            if gap < 0 or gap > self.max_gap_ms:
                del cand_map[cand_id]
                continue

            best_match_idx = -1
            highest_iou = -1.0

            for i, det in enumerate(fire_detections):
                if i in matched_detection_indices:
                    continue
                conf = det.get("confidence", 0.0)
                if conf <= self.continue_confidence:
                    continue

                det_box = det.get("box", [])
                if len(det_box) == 4 and is_same_spatial_region(candidate.box, det_box, self.iou_threshold):
                    iou = calculate_iou(candidate.box, det_box)
                    if iou > highest_iou:
                        highest_iou = iou
                        best_match_idx = i

            if best_match_idx != -1:
                matched_detection_indices.add(best_match_idx)
                matched_det = fire_detections[best_match_idx]

                candidate.last_seen_ms = timestamp_ms
                candidate.box = matched_det.get("box", candidate.box)
                candidate.max_confidence = max(candidate.max_confidence, matched_det.get("confidence", 0.0))

                if not candidate.is_confirmed:
                    duration = timestamp_ms - candidate.first_seen_ms
                    if duration >= self.confirm_duration_ms:
                        # XÁC NHẬN SỰ KIỆN LỬA!
                        candidate.is_confirmed = True
                        candidate.confirmed_at_ms = timestamp_ms
                        event_id = f"{session_id}_{cand_id}"

                        playback_str = (
                            format_time_str(timestamp_ms, is_video=True)
                            if source_type == "video"
                            else None
                        )
                        confirmed_time_str = format_time_str(timestamp_ms, is_video=(source_type == "video"))

                        event_info = {
                            "event_id": event_id,
                            "session_id": session_id,
                            "cand_id": cand_id,
                            "source_type": source_type,
                            "model_name": model_name,
                            "confirmed_time_ms": timestamp_ms,
                            "confirmed_time_str": confirmed_time_str,
                            "playback_time_str": playback_str,
                            "max_confidence": candidate.max_confidence,
                            "box": candidate.box,
                        }
                        newly_confirmed_events.append(event_info)

                        # Kích hoạt quy trình gửi email bất đồng bộ nếu tài khoản đã đăng nhập
                        if user_id and user_email:
                            asyncio.create_task(
                                self._handle_email_dispatch(
                                    user_id=user_id,
                                    user_email=user_email,
                                    event_info=event_info,
                                    user_email_confirmed=user_email_confirmed,
                                    user_is_mock=user_is_mock,
                                )
                            )
            else:
                gap = timestamp_ms - candidate.last_seen_ms
                if gap > self.max_gap_ms:
                    del cand_map[cand_id]

        # 2. Tạo ứng viên mới từ các box chưa được ghép có confidence >= trigger_confidence (>= 0.30)
        for i, det in enumerate(fire_detections):
            if i in matched_detection_indices:
                continue
            conf = det.get("confidence", 0.0)
            if conf >= self.trigger_confidence:
                det_box = det.get("box", [])
                if len(det_box) != 4:
                    continue

                already_tracked = False
                for cand in cand_map.values():
                    if is_same_spatial_region(cand.box, det_box, self.iou_threshold):
                        already_tracked = True
                        break

                if not already_tracked:
                    self._cand_counter += 1
                    new_id = f"cand-{int(time.time() * 1000)}-{self._cand_counter}"
                    cand_map[new_id] = BackendFireCandidate(
                        cand_id=new_id,
                        box=det_box,
                        confidence=conf,
                        first_seen_ms=timestamp_ms,
                    )

        return newly_confirmed_events

    async def _handle_email_dispatch(
        self,
        user_id: str,
        user_email: str,
        event_info: Dict[str, Any],
        user_email_confirmed: bool = True,
        user_is_mock: bool = False,
    ) -> None:
        """Kiểm tra tùy chọn người dùng và gửi email qua dịch vụ SMTP thống nhất"""
        try:
            # 1. Kiểm tra tùy chọn người dùng
            prefs = await get_user_preferences(user_id)
            if not prefs.get("email_alerts_enabled"):
                logger.info(f"Người dùng {user_id} ({user_email}) chưa bật nhận cảnh báo qua email. Bỏ qua gửi.")
                return

            event_id = event_info["event_id"]
            # 2. Đăng ký sự kiện và kiểm tra chống gửi trùng lặp (Idempotency)
            is_new, _ = await register_event_and_dispatch(
                event_id=event_id,
                user_id=user_id,
                session_id=event_info["session_id"],
                source_type=event_info["source_type"],
                model_name=event_info["model_name"],
                confirmed_time_ms=event_info["confirmed_time_ms"],
                playback_time_str=event_info.get("playback_time_str"),
                max_confidence=event_info["max_confidence"],
                box=event_info["box"],
                recipient_email=user_email,
            )

            if not is_new:
                logger.info(f"Sự kiện {event_id} đã được gửi hoặc đang chờ gửi. Bỏ qua gửi trùng.")
                return

            # Ngăn gửi email thật tới @example.com của Mock Auth hoặc email chưa xác minh
            if not settings.SMTP_MOCK and (user_is_mock or not user_email_confirmed):
                err_msg = (
                    "Phiên đăng nhập Mock Auth (@example.com) hoặc email chưa xác minh không thể gửi cảnh báo thật."
                )
                await update_dispatch_status(event_id, "failed", err_msg, mode="error")
                logger.warning(f"Từ chối gửi cảnh báo thật cho sự kiện {event_id}: {err_msg}")
                return

            source_display = "Video tải lên" if event_info["source_type"] == "video" else "Webcam trực tiếp"

            # 3. Gửi email qua dịch vụ SMTP thống nhất
            res = await send_fire_alert_email(
                to_email=user_email,
                source_name=source_display,
                model_name=event_info["model_name"],
                confirmed_time_str=event_info["confirmed_time_str"],
                playback_time_str=event_info.get("playback_time_str"),
                max_confidence=event_info["max_confidence"],
            )

            # Hỗ trợ tương thích cả EmailSendResult lẫn tuple (success, err) nếu test mock hàm này
            if isinstance(res, tuple):
                success, err = res
                mode = "real"
                err_msg = err
            else:
                success = res.success
                mode = res.mode
                err_msg = res.message or res.error

            # 4. Cập nhật trạng thái 'sent' (kèm mode 'real' hoặc 'mock') hoặc 'failed'
            if success:
                await update_dispatch_status(event_id, "sent", mode=mode)
                logger.info(f"Hoàn tất xử lý gửi cảnh báo lửa ({mode}) tới {user_email} cho sự kiện {event_id}")
            else:
                await update_dispatch_status(event_id, "failed", err_msg, mode="error")
                logger.error(f"Gửi cảnh báo lửa thất bại tới {user_email} cho sự kiện {event_id}: {err_msg}")
        except Exception as e:
            logger.error(f"Lỗi không xác định trong _handle_email_dispatch: {e}", exc_info=True)


# Instance toàn cục của BackendFireTracker
backend_fire_tracker = BackendFireTracker()
