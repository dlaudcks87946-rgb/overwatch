import os
import json
import time
import ctypes
import cv2
import mss
import numpy as np

try:
    ctypes.windll.shcore.SetProcessDpiAwareness(2)
except Exception:
    try:
        ctypes.windll.user32.SetProcessDPIAware()
    except Exception:
        pass

SLOTS_FILE = "slots.json"
HEROES_DIR = "heroes_db"
DEBUG_DIR = "debug_crops"
SLOT_W = 136
SLOT_H = 136
COUNTDOWN_SEC = 3

clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(4, 4))


def pick_4k_monitor(sct):
    if len(sct.monitors) > 2:
        m2 = sct.monitors[2]
        if m2.get("width") == 3840 and m2.get("height") == 2160:
            return 2, m2
    for idx in range(1, len(sct.monitors)):
        m = sct.monitors[idx]
        if m.get("width") == 3840 and m.get("height") == 2160:
            return idx, m
    fallback_idx = 2 if len(sct.monitors) > 2 else 1
    return fallback_idx, sct.monitors[fallback_idx]


def preprocess_portrait(gray_img, pad_ratio=0.14):
    h, w = gray_img.shape[:2]
    if h < 16 or w < 16:
        return None
    cy1 = max(0, int(h * pad_ratio))
    cy2 = min(h, int(h * (1.0 - pad_ratio)))
    cx1 = max(0, int(w * pad_ratio))
    cx2 = min(w, int(w * (1.0 - pad_ratio)))
    if cy2 <= cy1 or cx2 <= cx1:
        return None
    core = gray_img[cy1:cy2, cx1:cx2]
    if core.size == 0 or core.std() < 12.0:
        return None
    norm = clahe.apply(core)
    return cv2.resize(norm, (64, 64), interpolation=cv2.INTER_AREA)


def load_templates(folder=HEROES_DIR):
    os.makedirs(folder, exist_ok=True)
    templates = {}
    for fname in os.listdir(folder):
        lower_name = fname.lower()
        if lower_name.startswith(("cal_", "slot_")):
            continue
        if lower_name.endswith((".png", ".jpg", ".jpeg", ".webp")):
            hero_id = os.path.splitext(fname)[0].lower()
            img = cv2.imread(os.path.join(folder, fname), cv2.IMREAD_GRAYSCALE)
            if img is not None:
                proc = preprocess_portrait(img, pad_ratio=0.14)
                if proc is not None:
                    templates[hero_id] = proc
    return templates


def inspect_slot_crop(crop_gray, templates):
    target = preprocess_portrait(crop_gray, pad_ratio=0.14)
    if target is None or not templates:
        return None, 0.0
    best_hero = None
    best_score = -1.0
    for hero_id, tpl in templates.items():
        score = float(cv2.matchTemplate(target, tpl, cv2.TM_CCOEFF_NORMED)[0][0])
        if score > best_score:
            best_score = score
            best_hero = hero_id
    return best_hero, round(best_score, 3)


def main():
    os.makedirs(DEBUG_DIR, exist_ok=True)
    templates = load_templates()
    print(f"템플릿 {len(templates)}개 로드 완료.")

    with mss.MSS() as sct:
        mon_idx, mon = pick_4k_monitor(sct)
        print(f"[모니터 {mon_idx}] {COUNTDOWN_SEC}초 후 4K 화면을 캡처합니다. 게임에서 Tab 점수판을 띄워 두세요!")
        for sec in range(COUNTDOWN_SEC, 0, -1):
            print(f"캡처까지 {sec}초...")
            time.sleep(1.0)

        raw = np.array(sct.grab(mon))
        bgr = cv2.cvtColor(raw, cv2.COLOR_BGRA2BGR)
        gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
        print("[캡처 완료] 클릭한 좌표의 초상화 크롭과 템플릿 점수를 즉시 판정합니다.")

    scale = 0.5
    preview = cv2.resize(bgr, (0, 0), fx=scale, fy=scale, interpolation=cv2.INTER_AREA)

    # 기본 예상 초상화 가이드 박스 표시 (파란색/빨간색 점선 느낌의 안내 사각형)
    if os.path.exists(SLOTS_FILE):
        try:
            with open(SLOTS_FILE, "r", encoding="utf-8") as f:
                prev_slots = json.load(f)
            for idx, s in enumerate(prev_slots):
                gx1 = int(s["x"] * scale)
                gy1 = int(s["y"] * scale)
                gx2 = int((s["x"] + s["w"]) * scale)
                gy2 = int((s["y"] + s["h"]) * scale)
                color = (255, 200, 0) if idx < 5 else (0, 140, 255)
                cv2.rectangle(preview, (gx1, gy1), (gx2, gy2), color, 1)
        except Exception:
            pass

    clicked_slots = []
    labels = [
        "아군 1", "아군 2", "아군 3", "아군 4", "아군 5",
        "적군 1", "적군 2", "적군 3", "적군 4", "적군 5",
    ]

    def on_mouse(event, x, y, flags, param):
        if event == cv2.EVENT_LBUTTONDOWN and len(clicked_slots) < 10:
            real_cx = int(x / scale)
            real_cy = int(y / scale)
            slot = {
                "x": max(0, real_cx - SLOT_W // 2),
                "y": max(0, real_cy - SLOT_H // 2),
                "w": SLOT_W,
                "h": SLOT_H,
            }
            idx = len(clicked_slots)
            clicked_slots.append(slot)

            crop_bgr = bgr[slot["y"]:slot["y"] + slot["h"], slot["x"]:slot["x"] + slot["w"]]
            crop_gray = gray[slot["y"]:slot["y"] + slot["h"], slot["x"]:slot["x"] + slot["w"]]
            if crop_bgr.size > 0:
                cv2.imwrite(os.path.join(DEBUG_DIR, f"cal_{idx}.png"), crop_bgr)

            cand, score = inspect_slot_crop(crop_gray, templates)
            print(f"[{idx}:{labels[idx]}] {slot} -> 감지 1위: {cand} (점수: {score})")

            px1 = int(slot["x"] * scale)
            py1 = int(slot["y"] * scale)
            px2 = int((slot["x"] + slot["w"]) * scale)
            py2 = int((slot["y"] + slot["h"]) * scale)
            cv2.rectangle(preview, (px1, py1), (px2, py2), (0, 255, 0), 2)
            cv2.putText(preview, f"{idx}:{cand or '?'}", (px1, max(12, py1 - 4)), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 255, 0), 1)
            cv2.imshow("Click 10 Portraits & Inspect", preview)

            if len(clicked_slots) == 10:
                with open(SLOTS_FILE, "w", encoding="utf-8") as f:
                    json.dump(clicked_slots, f, indent=2)
                print(f"\n[완료] {SLOTS_FILE} 저장됨! 아무 키나 눌러 창을 닫으세요.")

    cv2.imshow("Click 10 Portraits & Inspect", preview)
    cv2.setMouseCallback("Click 10 Portraits & Inspect", on_mouse)
    print("아군 1~5번, 적군 1~5번 초상화(얼굴 사진) 중앙을 차례로 클릭하세요. (노란색/주황색 가이드 박스 참고 / ESC 종료)")
    while True:
        key = cv2.waitKey(50) & 0xFF
        if key == 27 or (len(clicked_slots) == 10 and key != 255):
            break
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()