"""
benefit.py — Qoder 每日签到 / 用量查询（全自动，无需浏览器）

签到流程：
1. 查 campaign 状态 (GET /sash/api/v1/me/campaigns, 需 Cosy-ClientType:10 头)
2. 找 claimStatus=CLAIMABLE 且 actionType=CLAIM_BENEFIT 的活动
3. POST /sash/api/v1/me/campaigns/{campaignId}/claim 直接领取
4. 每小时检查一次，跨日自动签
"""
import os
import json
import socket
import threading
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path

import requests

import qoder_cosy

# CN 时区 UTC+8
CN_TZ = timezone(timedelta(hours=8))

# API 配置
API_BASE_CN = "https://openapi.qoder.com.cn"
API_BASE_INTL = "https://openapi.qoder.com"
CAMPAIGNS_PATH = "/sash/api/v1/me/campaigns"
USAGE_PATH = "/sash/api/v2/me/usage"

# 签到检查间隔 (秒)
CHECK_INTERVAL = 3600

# 每日签到开放时间 (UTC+8)
CLAIM_OPEN_HOUR = 10

# 奶茶免单卡活动 ID (从 app 日志获取)
COFFEE_CAMPAIGN_ID = "01a0e886-e3b4-7ab6-887c-431f37021ffa"


def _headers(token: str) -> dict:
    """对齐 magpie internal/qoder/cosy.go:175-178：机器指纹头全用自有凭证的
    machine_id 冒充（Cosy-MachineToken = MachineId = machine_id, MachineType=5），
    服务器不验真指纹，无需 Qoder IDE 的 runtime-info.exe。"""
    try:
        mid = qoder_cosy.load_identity().get("machine_id") or ""
    except Exception:  # noqa: BLE001 — 无凭证时也要能构造头（请求会因无 Authorization 被拒）
        mid = ""
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
        "Content-Type": "application/json",
        "User-Agent": "Qoder",
        "Cosy-ClientType": "10",
        "Cosy-Version": "0.4.3",
        "Cosy-MachineOS": "win32",
        "Cosy-MachineId": mid,
        "Cosy-MachineToken": mid,
        "Cosy-MachineType": "5",
        "Cosy-MachineHostname": socket.gethostname(),
    }


def _get_token() -> str | None:
    """自有凭证（credentials.json，device flow 落盘）的 dt- 设备令牌；无凭证返回 None。"""
    try:
        return qoder_cosy.load_identity().get("access_token")
    except Exception as e:  # noqa: BLE001 — 无凭证时降级为错误返回，不抛
        print(f"[benefit] 凭证不可用: {type(e).__name__}", flush=True)
        return None


def get_usage() -> dict:
    """查用量 (GET /sash/api/v2/me/usage)"""
    token = _get_token()
    if not token:
        return {"error": "no credential (run: python oauth.py)"}
    base = API_BASE_CN  # 本仓库只接 Qoder CN
    try:
        r = requests.get(f"{base}{USAGE_PATH}", headers=_headers(token), timeout=15)
        if r.status_code == 200:
            return r.json()
        return {"error": f"HTTP {r.status_code}", "body": r.text[:500]}
    except Exception as e:
        return {"error": str(e)}


def check_campaigns(is_cn: bool = True) -> dict:
    """查活动状态，返回 {showCampaign, claimable, campaigns, claimable_campaigns}"""
    token = _get_token()
    if not token:
        return {"error": "no credential (run: python oauth.py)", "claimable": False, "campaigns": []}
    base = API_BASE_CN if is_cn else API_BASE_INTL
    try:
        r = requests.get(f"{base}{CAMPAIGNS_PATH}", headers=_headers(token), timeout=15)
        if r.status_code != 200:
            return {"error": f"HTTP {r.status_code}", "claimable": False, "campaigns": []}
        data = r.json()
        # 领所有 CLAIMABLE 活动（100 Credits + 奶茶免单卡等）
        claimable_campaigns = [
            c for c in data.get("campaigns", [])
            if c.get("claimStatus") == "CLAIMABLE"
        ]
        return {
            "showCampaign": data.get("showCampaign", False),
            "claimable": bool(claimable_campaigns),
            "campaigns": data.get("campaigns", []),
            "claimable_campaigns": claimable_campaigns,
        }
    except Exception as e:
        return {"error": str(e), "claimable": False, "campaigns": []}


def claim_campaign(campaign_id: str, is_cn: bool = True) -> dict:
    """领取活动奖励 (POST /sash/api/v1/me/campaigns/{campaignId}/claim)"""
    token = _get_token()
    if not token:
        return {"error": "no credential (run: python oauth.py)", "status": "FAILED"}
    base = API_BASE_CN if is_cn else API_BASE_INTL
    url = f"{base}{CAMPAIGNS_PATH}/{campaign_id}/claim"
    try:
        r = requests.post(url, headers=_headers(token), timeout=15)
        if r.status_code == 200:
            data = r.json()
            amount = data.get("benefit", {}).get("amount", "?")
            print(f"[benefit] ✅ 签到成功: +{amount} Credits", flush=True)
            return data
        print(f"[benefit] ❌ 签到失败: HTTP {r.status_code} {r.text[:200]}", flush=True)
        return {"error": f"HTTP {r.status_code}", "body": r.text[:500], "status": "FAILED"}
    except Exception as e:
        print(f"[benefit] ❌ 签到异常: {e}", flush=True)
        return {"error": str(e), "status": "FAILED"}


def check_and_claim(is_cn: bool = True, auto_open: bool = True) -> dict:
    """检查并自动签到（全自动，无需浏览器）。auto_open 保留兼容性但不再打开浏览器。"""
    now_cn = datetime.now(CN_TZ)
    result = {
        "time": now_cn.isoformat(),
        "claimable": False,
        "claimed": False,
        "campaigns": [],
        "claim_results": [],
    }

    status = check_campaigns(is_cn=is_cn)
    if "error" in status:
        result["error"] = status["error"]
        return result

    result["claimable"] = status["claimable"]
    result["campaigns"] = [
        {
            "campaignId": c.get("campaignId", ""),
            "campaignKey": c.get("campaignKey", ""),
            "claimStatus": c.get("claimStatus", ""),
            "actionType": c.get("actionType", ""),
            "benefit": c.get("benefit", {}),
        }
        for c in status.get("campaigns", [])
    ]

    if status["claimable"]:
        for c in status["claimable_campaigns"]:
            cid = c["campaignId"]
            claim_result = claim_campaign(cid, is_cn=is_cn)
            result["claim_results"].append(claim_result)
            if claim_result.get("status") == "CLAIMED":
                result["claimed"] = True
    else:
        print(f"[benefit] 无可领取活动（今日已签或活动未开放）", flush=True)

    return result


def _daily_check_loop(is_cn: bool = True, auto_open: bool = True):
    """签到线程主循环：每小时检查，跨日且 10:00 后自动签"""
    last_claim_date = None
    while True:
        try:
            now_cn = datetime.now(CN_TZ)
            today = now_cn.date()

            if last_claim_date != today and now_cn.hour >= CLAIM_OPEN_HOUR:
                print(f"[benefit] 开始每日签到 ({now_cn.strftime('%Y-%m-%d %H:%M')} UTC+8)", flush=True)
                result = check_and_claim(is_cn=is_cn, auto_open=auto_open)
                if result.get("claimed"):
                    last_claim_date = today
                elif result.get("claimable") and not result.get("claimed"):
                    print(f"[benefit] 签到失败，将在下轮重试", flush=True)
                else:
                    last_claim_date = today
        except Exception as e:
            print(f"[benefit] 签到检查异常: {e}", flush=True)

        time.sleep(CHECK_INTERVAL)


def start_daily_checkin(is_cn: bool = True, auto_open: bool = True):
    """启动每日签到线程 + 奶茶抢领线程 (daemon)"""
    token = _get_token()
    if not token:
        print(f"[benefit] ⚠️ 无自有凭证，签到线程不启动 (先运行: python oauth.py)", flush=True)
        return None
    t = threading.Thread(target=_daily_check_loop, args=(is_cn, auto_open), daemon=True)
    t.start()
    print(f"[benefit] 每日签到线程已启动 (CN={is_cn}, 全自动 API 签到)", flush=True)

    # 奶茶免单卡抢领线程
    t2 = threading.Thread(target=_coffee_claim_loop, args=(is_cn,), daemon=True)
    t2.start()
    print(f"[benefit] 🧋 奶茶抢领线程已启动 (每天 10:00:00 UTC+8 精准抢领)", flush=True)
    return t


def claim_now(is_cn: bool = True) -> dict:
    """立即签到一次"""
    return check_and_claim(is_cn=is_cn, auto_open=False)


# ── 奶茶免单卡抢领 ──────────────────────────────────────────

# 抢领窗口：10:00:00 起快速重试
COFFEE_RETRY_INTERVAL = 0.1   # 100ms
COFFEE_RETRY_DURATION = 30    # 持续 30 秒

# 领取标记（活动每人限领一次）：落盘防重启后重复打 claim
_CLAIM_MARK_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".coffee_claimed")


def _coffee_claimed() -> bool:
    return os.path.exists(_CLAIM_MARK_FILE)


def _mark_coffee_claimed():
    try:
        with open(_CLAIM_MARK_FILE, "w", encoding="utf-8") as f:
            f.write(datetime.now(CN_TZ).isoformat())
    except OSError:
        pass


def claim_coffee_card(is_cn: bool = True) -> dict:
    """抢领奶茶免单卡，快速重试 30 秒；已领过（标记或服务端幂等回显）则不再发 claim"""
    if _coffee_claimed():
        print("[benefit] 奶茶免单卡已领取过（本地标记），跳过抢领", flush=True)
        return {"status": "ALREADY_CLAIMED"}
    token = _get_token()
    if not token:
        return {"error": "no credential (run: python oauth.py)", "status": "FAILED"}
    base = API_BASE_CN if is_cn else API_BASE_INTL
    headers = _headers(token)
    url = f"{base}{CAMPAIGNS_PATH}/{COFFEE_CAMPAIGN_ID}/claim"

    deadline = time.time() + COFFEE_RETRY_DURATION
    attempt = 0
    while time.time() < deadline:
        attempt += 1
        try:
            r = requests.post(url, headers=headers, timeout=5)
            if r.status_code == 200:
                data = r.json()
                if data.get("status") != "FAILED":
                    # 每人限领一次：CLAIMED 即终态（replayed=true 表示此前已领，同样落标记）
                    _mark_coffee_claimed()
                    tag = "幂等回显（此前已领）" if data.get("replayed") else f"第 {attempt} 次"
                    print(f"[benefit] 🧋 奶茶免单卡领取成功 ({tag})", flush=True)
                    return data
                # FAILED but 200 — 可能是 OUT_OF_STOCK，继续重试
                failure = data.get("failureCode", "")
                if attempt <= 3 or attempt % 10 == 0:
                    print(f"[benefit] 奶茶抢领第 {attempt} 次: {failure}", flush=True)
                if failure != "REDEMPTION_CODE_OUT_OF_STOCK":
                    # 其他错误不重试
                    return data
            elif r.status_code == 429:
                print(f"[benefit] 奶茶抢领被限流，等待 1s", flush=True)
                time.sleep(1)
            else:
                print(f"[benefit] 奶茶抢领 HTTP {r.status_code}: {r.text[:200]}", flush=True)
        except Exception as e:
            if attempt <= 3:
                print(f"[benefit] 奶茶抢领异常: {e}", flush=True)
        time.sleep(COFFEE_RETRY_INTERVAL)

    print(f"[benefit] 奶茶抢领结束，共尝试 {attempt} 次未成功", flush=True)
    return {"status": "FAILED", "failureCode": "RETRY_EXHAUSTED", "attempts": attempt}


def _coffee_claim_loop(is_cn: bool = True):
    """奶茶抢领线程：每天 10:00:00 (UTC+8) 精准触发；已领过（每人限一次）则直接退出"""
    if _coffee_claimed():
        print("[benefit] 🧋 奶茶免单卡已领取过（每人限领一次），抢领线程不启动", flush=True)
        return
    last_claim_date = None
    while True:
        try:
            now_cn = datetime.now(CN_TZ)
            today = now_cn.date()

            if last_claim_date != today and now_cn.hour >= CLAIM_OPEN_HOUR:
                if last_claim_date is None:
                    # 首次启动且已过 10:00：跳过今天，等明天
                    last_claim_date = today
                    print(f"[benefit] 奶茶抢领：已过 {CLAIM_OPEN_HOUR}:00，等待明天", flush=True)
                    continue

                # 计算到下一个 10:00:00 的等待时间
                target = datetime(now_cn.year, now_cn.month, now_cn.day,
                                  CLAIM_OPEN_HOUR, 0, 0, tzinfo=CN_TZ)
                if now_cn.hour >= CLAIM_OPEN_HOUR:
                    # 已过 10:00，今天直接抢
                    wait = 0
                else:
                    wait = (target - now_cn).total_seconds()

                if wait > 0:
                    print(f"[benefit] 奶茶抢领等待 {wait:.1f}s 到 10:00:00", flush=True)
                    time.sleep(min(wait, 3600))  # 最多等 1 小时再检查
                    continue

                print(f"[benefit] 🧋 开始抢领奶茶免单卡 ({now_cn.strftime('%Y-%m-%d %H:%M:%S')} UTC+8)", flush=True)
                result = claim_coffee_card(is_cn=is_cn)
                last_claim_date = today
                if result.get("status") != "FAILED":
                    print(f"[benefit] 🧋 奶茶免单卡已领取!", flush=True)
                else:
                    print(f"[benefit] 奶茶今日未抢到: {result.get('failureCode', '?')}", flush=True)
        except Exception as e:
            print(f"[benefit] 奶茶抢领异常: {e}", flush=True)

        time.sleep(60)  # 每分钟检查一次是否到 10:00


def claim_coffee_now(is_cn: bool = True) -> dict:
    """立即抢领奶茶免单卡一次（手动测试用）"""
    return claim_coffee_card(is_cn=is_cn)
