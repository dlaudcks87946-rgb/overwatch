import os
import json
import time
import ctypes
import threading
import cv2
import mss
import numpy as np
import urllib.request

try:
    from rapidocr_onnxruntime import RapidOCR
    _ocr_engine = RapidOCR()
except Exception:
    _ocr_engine = None

try:
    ctypes.windll.shcore.SetProcessDpiAwareness(2)
except Exception:
    try:
        ctypes.windll.user32.SetProcessDPIAware()
    except Exception:
        pass

VK_TAB = 0x09
VK_MENU = 0x12

SERVER_BASE_URL = "https://overwatch-production-f2de2a9c.up.railway.app"
SERVER_URL = f"{SERVER_BASE_URL}/api/update"
STATE_URL = f"{SERVER_BASE_URL}/api/state"

HEROES_DIR = "heroes_db"
DEBUG_DIR = "debug_crops"
SLOTS_FILE = "slots.json"
MATCH_THRESHOLD = 0.52
SCORE_MARGIN = 0.005
LOOP_INTERVAL = 0.02

DEFAULT_SLOTS = [
    # 아군 1~5번 슬롯 (오버워치 2 빠른 대전/경쟁전 상단 5줄 영웅 초상화)
    {"x": 1072, "y": 377, "w": 126, "h": 126},
    {"x": 1072, "y": 508, "w": 126, "h": 126},
    {"x": 1072, "y": 639, "w": 126, "h": 126},
    {"x": 1072, "y": 771, "w": 126, "h": 126},
    {"x": 1072, "y": 902, "w": 126, "h": 126},
    # 적군 1~5번 슬롯 (오버워치 2 빠른 대전/경쟁전 하단 5줄 영웅 초상화)
    {"x": 1072, "y": 1187, "w": 126, "h": 126},
    {"x": 1072, "y": 1318, "w": 126, "h": 126},
    {"x": 1072, "y": 1449, "w": 126, "h": 126},
    {"x": 1072, "y": 1581, "w": 126, "h": 126},
    {"x": 1072, "y": 1712, "w": 126, "h": 126},
]

clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(4, 4))
user32 = ctypes.windll.user32
_cached_nickname = ""


def _start_nickname_sync_thread():
    def _sync_loop():
        global _cached_nickname
        while True:
            try:
                with urllib.request.urlopen(STATE_URL, timeout=3.0) as resp:
                    if resp.status == 200:
                        data = json.loads(resp.read().decode("utf-8"))
                        nick = data.get("nickname")
                        _cached_nickname = nick.strip() if isinstance(nick, str) else ""
            except Exception:
                pass
            time.sleep(5.0)

    threading.Thread(target=_sync_loop, daemon=True).start()


def pick_4k_monitor(sct):
    for idx in range(1, len(sct.monitors)):
        m = sct.monitors[idx]
        print(f"감지된 모니터 [{idx}]: {m.get('width')}x{m.get('height')} (left={m.get('left')}, top={m.get('top')})")

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


def preprocess_portrait(gray_img, dx=0, dy=0, pad_ratio=0.14):
    h, w = gray_img.shape[:2]
    if h < 16 or w < 16:
        return None
    cy1 = max(0, int(h * pad_ratio) + dy)
    cy2 = min(h, int(h * (1.0 - pad_ratio)) + dy)
    cx1 = max(0, int(w * pad_ratio) + dx)
    cx2 = min(w, int(w * (1.0 - pad_ratio)) + dx)
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


def score_against_templates(target, templates):
    best_hero = None
    best_score = -1.0
    second_score = -1.0

    for hero_id, tpl in templates.items():
        score = float(cv2.matchTemplate(target, tpl, cv2.TM_CCOEFF_NORMED)[0][0])
        if score > best_score:
            second_score = best_score
            best_score = score
            best_hero = hero_id
        elif score > second_score:
            second_score = score

    return best_hero, best_score, second_score


def match_single_slot(slot_search_gray, templates, slot_w, slot_h, threshold=MATCH_THRESHOLD, margin=SCORE_MARGIN):
    if slot_search_gray is None or slot_search_gray.size == 0 or not templates:
        return None, None, 0.0

    sh, sw = slot_search_gray.shape[:2]
    step = 6
    max_dy = max(0, sh - slot_h)
    max_dx = max(0, sw - slot_w)

    overall_best_hero = None
    overall_best_score = -1.0
    overall_second_score = -1.0

    for y0 in range(0, max_dy + 1, step):
        for x0 in range(0, max_dx + 1, step):
            sub_crop = slot_search_gray[y0:y0 + slot_h, x0:x0 + slot_w]
            target = preprocess_portrait(sub_crop, dx=0, dy=0, pad_ratio=0.14)
            if target is None:
                continue
            bh, bs, ss = score_against_templates(target, templates)
            if bs > overall_best_score:
                overall_best_score = bs
                overall_best_hero = bh
                overall_second_score = ss

    top_cand = overall_best_hero
    top_sc = round(overall_best_score, 3)
    if overall_best_score >= threshold and (overall_best_score - overall_second_score) >= margin:
        return overall_best_hero, top_cand, top_sc
    return None, top_cand, top_sc


def read_ocr_text(crop_gray):
    if _ocr_engine is None or crop_gray is None or crop_gray.size == 0:
        return ""
    try:
        enlarged = cv2.resize(crop_gray, None, fx=2.0, fy=2.0, interpolation=cv2.INTER_CUBIC)
        result, _ = _ocr_engine(enlarged)
        if not result:
            return ""
        texts = [item[1] for item in result if isinstance(item, (list, tuple)) and len(item) >= 2]
        return " ".join(texts).strip()
    except Exception:
        return ""


def detect_my_hero_by_nickname(gray, slots, active_allies_by_slot, nickname):
    if not nickname or _ocr_engine is None:
        return None
    target_nick = nickname.lower().replace(" ", "")
    if not target_nick:
        return None

    fh, fw = gray.shape[:2]
    for idx in range(min(5, len(slots))):
        hero_id = active_allies_by_slot[idx]
        if not hero_id:
            continue
        s = slots[idx]
        nx1 = min(fw - 1, s["x"] + s["w"] + 8)
        ny1 = max(0, s["y"] - 8)
        nx2 = min(fw, nx1 + 550)
        ny2 = min(fh, s["y"] + s["h"] + 8)
        if nx2 <= nx1 or ny2 <= ny1:
            continue
        name_crop = gray[ny1:ny2, nx1:nx2]
        ocr_str = read_ocr_text(name_crop).lower().replace(" ", "")
        if target_nick in ocr_str:
            return hero_id
    return None


def load_slots(path=SLOTS_FILE):
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
            if isinstance(data, list) and len(data) == 10:
                return data
    with open(path, "w", encoding="utf-8") as f:
        json.dump(DEFAULT_SLOTS, f, indent=2)
    return DEFAULT_SLOTS


def post_update(allies, enemies, my_hero=None):
    payload = {"allies": allies, "enemies": enemies}
    if my_hero:
        payload["myHero"] = my_hero
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        SERVER_URL,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=5.0) as resp:
            return resp.status == 200
    except Exception as e:
        print(f"[경고] 서버 전송 실패: {e}")
        return False


def run_loop(interval=LOOP_INTERVAL):
    os.makedirs(DEBUG_DIR, exist_ok=True)
    _start_nickname_sync_thread()
    templates = load_templates()
    slots = load_slots()
    print(f"영웅 템플릿 {len(templates)}개 로드 완료. (임계값 {MATCH_THRESHOLD})")

    remembered_slots = [None] * 10
    last_sent_payload = None
    was_tab_down = False

    with mss.MSS() as sct:
        monitor_idx, monitor = pick_4k_monitor(sct)
        print(f"감시 대상 모니터 인덱스: [{monitor_idx}] ({monitor.get('width')}x{monitor.get('height')})")
        while True:
            try:
                tab_state = user32.GetAsyncKeyState(VK_TAB)
                alt_down = bool(user32.GetAsyncKeyState(VK_MENU) & 0x8000)
                tab_pressed_now = (bool(tab_state & 0x8000) or bool(tab_state & 0x0001)) and not alt_down

                if tab_pressed_now and not was_tab_down:
                    t0 = time.time()
                    time.sleep(0.14)

                    nickname = _cached_nickname
                    raw = np.array(sct.grab(monitor))
                    cv2.imwrite(os.path.join(DEBUG_DIR, "last_tab_full.png"), cv2.cvtColor(raw, cv2.COLOR_BGRA2BGR))
                    gray = cv2.cvtColor(raw, cv2.COLOR_BGRA2GRAY)
                    fh, fw = gray.shape[:2]

                    scan_heroes = [None] * 10
                    scan_scores = [-1.0] * 10
                    top_cands = [None] * 10

                    for idx, s in enumerate(slots):
                        pad_x, pad_y = 35, 20
                        x1 = max(0, s["x"] - pad_x)
                        y1 = max(0, s["y"] - pad_y)
                        x2 = min(fw, s["x"] + s["w"] + pad_x)
                        y2 = min(fh, s["y"] + s["h"] + pad_y)

                        search_crop = gray[y1:y2, x1:x2]
                        exact_crop = gray[s["y"]:s["y"] + s["h"], s["x"]:s["x"] + s["w"]]
                        if exact_crop.size > 0:
                            cv2.imwrite(os.path.join(DEBUG_DIR, f"slot_{idx}.png"), exact_crop)

                        hero, top_cand, top_sc = match_single_slot(search_crop, templates, s["w"], s["h"])
                        scan_heroes[idx] = hero
                        scan_scores[idx] = top_sc
                        top_cands[idx] = top_cand

                    # 팀별 동일 영웅 중복 배정 제거 로직
                    def resolve_team(start_idx, end_idx):
                        team_indices = list(range(start_idx, end_idx))
                        # 점수 높은 순으로 슬롯 정렬하여 우선 배정
                        sorted_by_score = sorted(team_indices, key=lambda i: scan_scores[i] if scan_heroes[i] else -1.0, reverse=True)
                        resolved = [None] * 10
                        used_heroes = set()

                        for i in sorted_by_score:
                            h = scan_heroes[i]
                            if h:
                                if h not in used_heroes:
                                    resolved[i] = h
                                    used_heroes.add(h)
                                    remembered_slots[i] = h
                                else:
                                    # 같은 팀 내 이미 더 높은 점수로 배정된 영웅이면 중복 방지
                                    resolved[i] = None

                        # 미인식 슬롯에 이전 기억(fallback) 적용 (중복 방지 유지)
                        for i in team_indices:
                            if resolved[i] is None:
                                fb = remembered_slots[i]
                                if fb and fb not in used_heroes:
                                    resolved[i] = fb
                                    used_heroes.add(fb)

                        return resolved

                    resolved_allies = resolve_team(0, 5)
                    resolved_enemies = resolve_team(5, 10)

                    scan_slots = [None] * 10
                    for i in range(5):
                        scan_slots[i] = resolved_allies[i]
                    for i in range(5, 10):
                        scan_slots[i] = resolved_enemies[i]

                    scores_debug = []
                    for idx in range(10):
                        scores_debug.append(f"#{idx}:{scan_slots[idx]}(1위:{top_cands[idx]}:{scan_scores[idx]})")

                    elapsed = round(time.time() - t0, 2)
                    print(f"[Tab 1회 스캔 ({elapsed}s)] {', '.join(scores_debug)}")

                    allies = [h for h in scan_slots[:5] if h]
                    enemies = [h for h in scan_slots[5:10] if h]
                    detected_my_hero = detect_my_hero_by_nickname(gray, slots, scan_slots, nickname)
                    if detected_my_hero:
                        print(f"[닉네임 매칭] '{nickname}' -> 내 영웅: {detected_my_hero}")

                    current_payload = (tuple(allies), tuple(enemies), detected_my_hero)

                    if not (allies or enemies or detected_my_hero):
                        print("[인식 실패] 10개 슬롯 모두 영웅 미인식 (1위 점수와 slot_0~9.png 크롭 확인 필요)")
                    elif current_payload != last_sent_payload:
                        if post_update(allies, enemies, detected_my_hero):
                            last_sent_payload = current_payload
                            print(f"[갱신] 아군: {allies} | 적군: {enemies} | 내 영웅: {detected_my_hero or '기존 유지'}")
                    else:
                        print(f"[동일 조합] 이전과 같음 -> 아군: {allies} | 적군: {enemies}")

                was_tab_down = bool(tab_state & 0x8000)

            except Exception as err:
                print(f"[오류] {err}")

            time.sleep(interval)


if __name__ == "__main__":
    run_loop(interval=LOOP_INTERVAL)