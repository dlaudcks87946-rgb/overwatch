import time
import ctypes
import cv2
import mss
import numpy as np

# 4K 모니터 Windows DPI 스케일링 왜곡 방지
try:
    ctypes.windll.shcore.SetProcessDpiAwareness(2)
except Exception:
    try:
        ctypes.windll.user32.SetProcessDPIAware()
    except Exception:
        pass

DEFAULT_DPI = 900
DEFAULT_SENS = 10.43
DEFAULT_COUNTDOWN = 3
DEFAULT_DURATION = 6.0
YAW_DEG_PER_COUNT = 0.0066


def calc_edpi(dpi: float, sens: float) -> int:
    return int(round(dpi * sens))


def calc_cm_360(dpi: float, sens: float) -> float:
    denom = dpi * sens * YAW_DEG_PER_COUNT
    if denom <= 0:
        return 0.0
    return round((360.0 * 2.54) / denom, 1)


def pick_4k_monitor(sct):
    for idx in range(1, len(sct.monitors)):
        m = sct.monitors[idx]
        if m.get("width") == 3840 and m.get("height") == 2160:
            return idx, m
    return 1, sct.monitors[1]


def analyze_aim_session(
    dpi: float = DEFAULT_DPI,
    current_sens: float = DEFAULT_SENS,
    countdown_sec: int = DEFAULT_COUNTDOWN,
    duration_sec: float = DEFAULT_DURATION,
    roi_size: int = 280,
):
    """
    카운트다운 후 화면 중앙 ROI(조준점 주변)에서 프레임 변화량과
    좌우 방향 반전 빈도를 측정해 감도 조정 제안치를 계산합니다. (참고용)
    """
    motion_deltas = []
    reversals = 0
    prev_gray = None
    prev_sign = 0

    with mss.MSS() as sct:
        mon_idx, mon = pick_4k_monitor(sct)
        cx = mon["left"] + mon["width"] // 2
        cy = mon["top"] + mon["height"] // 2
        region = {
            "left": cx - roi_size // 2,
            "top": cy - roi_size // 2,
            "width": roi_size,
            "height": roi_size,
        }

        print(f"[모니터 {mon_idx}] 지금 Alt+Tab으로 게임 화면으로 전환하세요!")
        for sec in range(countdown_sec, 0, -1):
            print(f"시작까지 {sec}초...")
            time.sleep(1.0)

        print(f"측정 시작! {duration_sec:.1f}초 동안 표적을 향해 조준·사격해 보세요.")
        end_time = time.time() + duration_sec
        while time.time() < end_time:
            frame = np.array(sct.grab(region))
            gray = cv2.cvtColor(frame, cv2.COLOR_BGRA2GRAY)
            gray = cv2.GaussianBlur(gray, (5, 5), 0)

            if prev_gray is not None:
                diff = cv2.absdiff(gray, prev_gray)
                mean_diff = float(np.mean(diff))
                motion_deltas.append(mean_diff)

                left_mean = float(np.mean(diff[:, : roi_size // 2]))
                right_mean = float(np.mean(diff[:, roi_size // 2 :]))
                delta_lr = right_mean - left_mean
                sign = 1 if delta_lr > 0.6 else (-1 if delta_lr < -0.6 else 0)
                if sign != 0 and prev_sign != 0 and sign != prev_sign:
                    reversals += 1
                if sign != 0:
                    prev_sign = sign

            prev_gray = gray
            time.sleep(0.03)

    if not motion_deltas:
        return None

    avg_motion = sum(motion_deltas) / len(motion_deltas)
    reversal_rate = reversals / max(1.0, duration_sec)

    # 기준선을 완화해 과도한 하향 편향 감소 (참고용)
    if reversal_rate >= 6.5 and avg_motion >= 3.5:
        ratio = 0.96
        advice = f"좌우 반전 빈도({reversal_rate:.1f}/초)가 높은 편이라 감도 약 4% 하향을 추천합니다."
    elif reversal_rate >= 4.8:
        ratio = 0.98
        advice = f"약간의 과조준·흔들림이 보여 감도 약 2% 하향을 추천합니다."
    elif avg_motion < 1.8 and reversal_rate < 2.0:
        ratio = 1.03
        advice = "화면 중앙 움직임과 반전이 적어 감도 약 3% 상향을 추천합니다."
    else:
        ratio = 1.00
        advice = "현재 감도 반응이 무난한 편이라 현 감도 유지를 추천합니다."

    suggested_sens = round(current_sens * ratio, 2)
    return {
        "dpi": dpi,
        "current_sens": current_sens,
        "current_edpi": calc_edpi(dpi, current_sens),
        "current_cm360": calc_cm_360(dpi, current_sens),
        "suggested_sens": suggested_sens,
        "suggested_edpi": calc_edpi(dpi, suggested_sens),
        "suggested_cm360": calc_cm_360(dpi, suggested_sens),
        "down_5": round(current_sens * 0.95, 2),
        "down_10": round(current_sens * 0.90, 2),
        "up_5": round(current_sens * 1.05, 2),
        "avg_motion": round(avg_motion, 2),
        "reversal_rate": round(reversal_rate, 1),
        "advice": advice,
    }


if __name__ == "__main__":
    raw_sens = input(f"현재 감도 [Enter 시 {DEFAULT_SENS}]: ").strip()
    try:
        sens_val = float(raw_sens) if raw_sens else DEFAULT_SENS
    except ValueError:
        sens_val = DEFAULT_SENS

    res = analyze_aim_session(
        dpi=DEFAULT_DPI,
        current_sens=sens_val,
        countdown_sec=DEFAULT_COUNTDOWN,
        duration_sec=DEFAULT_DURATION,
    )
    if res:
        print("\n[에임 감도 참고 분석 결과]")
        print(f"- 현재: 감도 {res['current_sens']} (eDPI {res['current_edpi']}, 약 {res['current_cm360']} cm/360)")
        print(f"- 제안: 감도 {res['suggested_sens']} (eDPI {res['suggested_edpi']}, 약 {res['suggested_cm360']} cm/360)")
        print(f"- 비교 테스트 후보: -5% ({res['down_5']}) / -10% ({res['down_10']}) / +5% ({res['up_5']})")
        print(f"- 측정값: 평균 변화량 {res['avg_motion']}, 초당 방향 전환 {res['reversal_rate']}")
        print(f"- 안내: {res['advice']}")