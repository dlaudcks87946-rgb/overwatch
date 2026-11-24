const express = require("express");
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 3000;
const DATABASE_URL = process.env.DATABASE_URL || "";

const STRATEGY_DB_FILE = path.join(__dirname, "pro_strategies.json");
const PATCH_DB_FILE = path.join(__dirname, "patch_meta.json");
const PATCH_URL = "https://overwatch.blizzard.com/ko-kr/news/patch-notes/";

app.use(express.json({ limit: "3mb" }));
app.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  next();
});
app.use(express.static(path.join(__dirname, "public"), { etag: false, maxAge: 0 }));
app.use("/heroes", express.static(path.join(__dirname, "heroes_db"), { etag: false, maxAge: 0 }));

const pool = DATABASE_URL
  ? new Pool({
      connectionString: DATABASE_URL,
      ssl: DATABASE_URL.includes("localhost") || DATABASE_URL.includes("127.0.0.1")
        ? false
        : { rejectUnauthorized: false }
    })
  : null;

const HEROES = {
  // 탱커
  dmon: { name: "D.Mon", koName: "디몬", role: "tank", comp: "dive", compKo: "돌진", counters: ["winston", "doomfist"], counteredBy: ["mauga", "orisa"] },
  dva: { name: "D.Va", koName: "디바", role: "tank", comp: "dive", compKo: "돌진", counters: ["widowmaker", "ashe", "soldier76"], counteredBy: ["zarya", "sigma", "mei"] },
  domina: { name: "Domina", koName: "도미나", role: "tank", comp: "brawl", compKo: "난전", counters: ["tracer", "genji"], counteredBy: ["reinhardt", "ramattra"] },
  doomfist: { name: "Doomfist", koName: "둠피스트", role: "tank", comp: "dive", compKo: "돌진", counters: ["widowmaker", "zenyatta", "ana"], counteredBy: ["orisa", "cassidy", "sombra"] },
  hazard: { name: "Hazard", koName: "해저드", role: "tank", comp: "dive", compKo: "돌진", counters: ["reinhardt", "junkerqueen"], counteredBy: ["pharah", "echo"] },
  junkerqueen: { name: "Junker Queen", koName: "정크랫 퀸", role: "tank", comp: "brawl", compKo: "난전", counters: ["roadhog", "winston"], counteredBy: ["orisa", "ana", "kiriko"] },
  mauga: { name: "Mauga", koName: "마우가", role: "tank", comp: "brawl", compKo: "난전", counters: ["winston", "roadhog", "reinhardt"], counteredBy: ["sigma", "dva", "ana"] },
  orisa: { name: "Orisa", koName: "오리사", role: "tank", comp: "brawl", compKo: "난전", counters: ["doomfist", "junkerqueen", "reinhardt"], counteredBy: ["zarya", "symmetra"] },
  ramattra: { name: "Ramattra", koName: "라마트라", role: "tank", comp: "brawl", compKo: "난전", counters: ["reinhardt", "sigma"], counteredBy: ["orisa", "mauga"] },
  reinhardt: { name: "Reinhardt", koName: "라인하르트", role: "tank", comp: "brawl", compKo: "난전", counters: ["junkerqueen", "domina"], counteredBy: ["ramattra", "orisa", "bastion"] },
  roadhog: { name: "Roadhog", koName: "로드호그", role: "tank", comp: "brawl", compKo: "난전", counters: ["winston", "wreckingball"], counteredBy: ["orisa", "ana", "junkerqueen"] },
  sigma: { name: "Sigma", koName: "시그마", role: "tank", comp: "poke", compKo: "포킹", counters: ["mauga", "bastion", "soldier76"], counteredBy: ["winston", "reinhardt", "zarya"] },
  winston: { name: "Winston", koName: "윈스턴", role: "tank", comp: "dive", compKo: "돌진", counters: ["widowmaker", "zenyatta", "genji"], counteredBy: ["mauga", "roadhog", "reaper"] },
  wreckingball: { name: "Wrecking Ball", koName: "레킹볼", role: "tank", comp: "dive", compKo: "돌진", counters: ["widowmaker", "zenyatta"], counteredBy: ["roadhog", "sombra", "cassidy"] },
  zarya: { name: "Zarya", koName: "자리야", role: "tank", comp: "brawl", compKo: "난전", counters: ["dva", "orisa", "sigma"], counteredBy: ["reinhardt", "pharah"] },

  // 딜러
  anran: { name: "Anran", koName: "안란", role: "dps", comp: "dive", compKo: "돌진", counters: ["ashe", "widowmaker"], counteredBy: ["cassidy", "torbjorn"] },
  ashe: { name: "Ashe", koName: "애쉬", role: "dps", comp: "poke", compKo: "포킹", counters: ["pharah", "echo", "zenyatta"], counteredBy: ["winston", "dva", "tracer"] },
  bastion: { name: "Bastion", koName: "바스티온", role: "dps", comp: "brawl", compKo: "난전", counters: ["reinhardt", "winston"], counteredBy: ["sigma", "dva", "genji"] },
  cassidy: { name: "Cassidy", koName: "캐서디", role: "dps", comp: "brawl", compKo: "난전", counters: ["tracer", "genji", "wreckingball"], counteredBy: ["widowmaker", "ashe", "pharah"] },
  echo: { name: "Echo", koName: "에코", role: "dps", comp: "dive", compKo: "돌진", counters: ["orisa", "reinhardt", "roadhog"], counteredBy: ["cassidy", "ashe", "soldier76"] },
  emre: { name: "Emre", koName: "엠레", role: "dps", comp: "poke", compKo: "포킹", counters: ["bastion", "torbjorn"], counteredBy: ["tracer", "genji"] },
  freja: { name: "Freja", koName: "프레야", role: "dps", comp: "poke", compKo: "포킹", counters: ["roadhog", "reinhardt"], counteredBy: ["dva", "winston"] },
  genji: { name: "Genji", koName: "겐지", role: "dps", comp: "dive", compKo: "돌진", counters: ["widowmaker", "zenyatta", "bastion"], counteredBy: ["winston", "mei", "moira"] },
  hanzo: { name: "Hanzo", koName: "한조", role: "dps", comp: "poke", compKo: "포킹", counters: ["widowmaker", "bastion"], counteredBy: ["winston", "tracer", "dva"] },
  junkrat: { name: "Junkrat", koName: "정크랫", role: "dps", comp: "brawl", compKo: "난전", counters: ["reinhardt", "mei"], counteredBy: ["pharah", "echo", "ashe"] },
  mei: { name: "Mei", koName: "메이", role: "dps", comp: "brawl", compKo: "난전", counters: ["genji", "doomfist", "winston"], counteredBy: ["pharah", "echo", "junkrat"] },
  pharah: { name: "Pharah", koName: "파라", role: "dps", comp: "dive", compKo: "돌진", counters: ["junkrat", "reinhardt", "mei"], counteredBy: ["ashe", "cassidy", "soldier76"] },
  reaper: { name: "Reaper", koName: "리퍼", role: "dps", comp: "brawl", compKo: "난전", counters: ["winston", "roadhog", "dva"], counteredBy: ["pharah", "echo", "ashe"] },
  shion: { name: "Shion", koName: "시온", role: "dps", comp: "dive", compKo: "돌진", counters: ["zenyatta", "ana"], counteredBy: ["cassidy", "torbjorn"] },
  sierra: { name: "Sierra", koName: "시에라", role: "dps", comp: "poke", compKo: "포킹", counters: ["soldier76", "bastion"], counteredBy: ["tracer", "genji"] },
  sojourn: { name: "Sojourn", koName: "소전", role: "dps", comp: "poke", compKo: "포킹", counters: ["orisa", "reinhardt", "roadhog"], counteredBy: ["dva", "winston"] },
  soldier76: { name: "Soldier: 76", koName: "솔저: 76", role: "dps", comp: "poke", compKo: "포킹", counters: ["pharah", "echo", "mercy"], counteredBy: ["dva", "sigma", "widowmaker"] },
  symmetra: { name: "Symmetra", koName: "시메트라", role: "dps", comp: "brawl", compKo: "난전", counters: ["dva", "orisa", "genji"], counteredBy: ["pharah", "echo", "winston"] },
  torbjorn: { name: "Torbjörn", koName: "토르비욘", role: "dps", comp: "poke", compKo: "포킹", counters: ["tracer", "genji", "wreckingball"], counteredBy: ["pharah", "echo", "widowmaker"] },
  tracer: { name: "Tracer", koName: "트레이서", role: "dps", comp: "dive", compKo: "돌진", counters: ["zenyatta", "widowmaker", "ana"], counteredBy: ["torbjorn", "cassidy", "moira"] },
  vendetta: { name: "Vendetta", koName: "벤데타", role: "dps", comp: "brawl", compKo: "난전", counters: ["sigma", "ashe"], counteredBy: ["pharah", "echo"] },
  venture: { name: "Venture", koName: "벤처", role: "dps", comp: "brawl", compKo: "난전", counters: ["widowmaker", "zenyatta"], counteredBy: ["pharah", "echo", "dva"] },
  widowmaker: { name: "Widowmaker", koName: "위도우메이커", role: "dps", comp: "poke", compKo: "포킹", counters: ["ashe", "soldier76", "pharah"], counteredBy: ["winston", "dva", "tracer"] },

  // 힐러
  ana: { name: "Ana", koName: "아나", role: "support", comp: "poke", compKo: "포킹", counters: ["roadhog", "mauga"], counteredBy: ["tracer", "genji", "dva"] },
  baptiste: { name: "Baptiste", koName: "바티스트", role: "support", comp: "poke", compKo: "포킹", counters: ["tracer", "genji"], counteredBy: ["doomfist", "junkerqueen"] },
  brigitte: { name: "Brigitte", koName: "브리기테", role: "support", comp: "brawl", compKo: "난전", counters: ["tracer", "genji", "doomfist"], counteredBy: ["pharah", "echo", "ramattra"] },
  doctrine: { name: "Doctrine", koName: "독트린", role: "support", comp: "brawl", compKo: "난전", counters: ["genji", "tracer"], counteredBy: ["widowmaker", "ashe"] },
  illari: { name: "Illari", koName: "일리아리", role: "support", comp: "poke", compKo: "포킹", counters: ["soldier76", "tracer"], counteredBy: ["winston", "dva", "sombra"] },
  jetpackcat: { name: "Jetpack Cat", koName: "제트팩 캣", role: "support", comp: "dive", compKo: "돌진", counters: ["junkrat", "reinhardt"], counteredBy: ["cassidy", "soldier76", "ashe"] },
  juno: { name: "Juno", koName: "주노", role: "support", comp: "dive", compKo: "돌진", counters: ["reinhardt", "mei"], counteredBy: ["widowmaker", "ashe", "tracer"] },
  kiriko: { name: "Kiriko", koName: "키리코", role: "support", comp: "dive", compKo: "돌진", counters: ["ana", "junkerqueen"], counteredBy: ["winston", "sojourn"] },
  lifeweaver: { name: "Lifeweaver", koName: "라이프위버", role: "support", comp: "poke", compKo: "포킹", counters: ["sigma", "zarya"], counteredBy: ["tracer", "genji"] },
  lucio: { name: "Lúcio", koName: "루시우", role: "support", comp: "brawl", compKo: "난전", counters: ["zenyatta", "ana"], counteredBy: ["moira", "winston", "mei"] },
  mercy: { name: "Mercy", koName: "메르시", role: "support", comp: "poke", compKo: "포킹", counters: ["tracer", "genji"], counteredBy: ["widowmaker", "cassidy", "soldier76"] },
  mizuki: { name: "Mizuki", koName: "미즈키", role: "support", comp: "dive", compKo: "돌진", counters: ["ana", "zenyatta"], counteredBy: ["cassidy", "torbjorn"] },
  moira: { name: "Moira", koName: "모이라", role: "support", comp: "brawl", compKo: "난전", counters: ["genji", "tracer"], counteredBy: ["ana", "sigma", "dva"] },
  sombra: { name: "Sombra", koName: "솜브라", role: "support", comp: "dive", compKo: "돌진", counters: ["wreckingball", "doomfist", "zenyatta"], counteredBy: ["kiriko", "brigitte", "moira"] },
  wuyang: { name: "Wuyang", koName: "우양", role: "support", comp: "brawl", compKo: "난전", counters: ["genji", "tracer"], counteredBy: ["pharah", "echo"] },
  zenyatta: { name: "Zenyatta", koName: "젠야타", role: "support", comp: "poke", compKo: "포킹", counters: ["roadhog", "mauga", "orisa"], counteredBy: ["tracer", "genji", "winston"] }
};

function readJsonSafe(filePath, fallback) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, "utf-8"));
    }
  } catch (e) {}
  return fallback;
}

function writeJsonSafe(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

const DEFAULT_PATCH_META = {
  lastCheckedAt: null,
  latestPatchTitle: "확인된 패치 없음",
  patchHash: "",
  heroAdjustments: {},
  history: []
};

let strategiesDb = readJsonSafe(STRATEGY_DB_FILE, []);
let patchMetaDb = readJsonSafe(PATCH_DB_FILE, { ...DEFAULT_PATCH_META });
let storageMode = "json";

async function initDatabase() {
  if (!pool) {
    storageMode = "json";
    console.log("[저장소] DATABASE_URL 미설정 -> 로컬 JSON 파일 사용");
    return;
  }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ow2_strategies (
        id BIGINT PRIMARY KEY,
        payload JSONB NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS ow2_patch_meta (
        id INT PRIMARY KEY,
        payload JSONB NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    const stratRes = await pool.query("SELECT id, payload FROM ow2_strategies ORDER BY id ASC");
    if (stratRes.rows.length > 0) {
      strategiesDb = stratRes.rows.map((r) => r.payload);
    } else if (strategiesDb.length > 0) {
      for (const item of strategiesDb) {
        await pool.query(
          "INSERT INTO ow2_strategies (id, payload) VALUES ($1, $2::jsonb) ON CONFLICT (id) DO NOTHING",
          [item.id, JSON.stringify(item)]
        );
      }
    }

    const patchRes = await pool.query("SELECT payload FROM ow2_patch_meta WHERE id = 1");
    if (patchRes.rows.length > 0) {
      patchMetaDb = { ...DEFAULT_PATCH_META, ...patchRes.rows[0].payload };
    } else {
      await pool.query(
        "INSERT INTO ow2_patch_meta (id, payload) VALUES (1, $1::jsonb) ON CONFLICT (id) DO NOTHING",
        [JSON.stringify(patchMetaDb)]
      );
    }

    storageMode = "postgres";
    console.log(`[저장소] PostgreSQL 연결 완료 (대회 기록 ${strategiesDb.length}건 로드됨)`);
  } catch (err) {
    storageMode = "json";
    console.error("[저장소] PostgreSQL 초기화 실패, JSON 폴백 유지:", err.message);
  }
}

async function persistStrategyAdd(record) {
  writeJsonSafe(STRATEGY_DB_FILE, strategiesDb);
  if (pool && storageMode === "postgres") {
    await pool.query(
      "INSERT INTO ow2_strategies (id, payload) VALUES ($1, $2::jsonb) ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload",
      [record.id, JSON.stringify(record)]
    );
  }
}

async function persistStrategyBulkAdd(records) {
  writeJsonSafe(STRATEGY_DB_FILE, strategiesDb);
  if (pool && storageMode === "postgres") {
    for (const record of records) {
      await pool.query(
        "INSERT INTO ow2_strategies (id, payload) VALUES ($1, $2::jsonb) ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload",
        [record.id, JSON.stringify(record)]
      );
    }
  }
}

async function persistStrategyDelete(id) {
  writeJsonSafe(STRATEGY_DB_FILE, strategiesDb);
  if (pool && storageMode === "postgres") {
    await pool.query("DELETE FROM ow2_strategies WHERE id = $1", [id]);
  }
}

async function persistPatchMeta() {
  writeJsonSafe(PATCH_DB_FILE, patchMetaDb);
  if (pool && storageMode === "postgres") {
    await pool.query(
      "INSERT INTO ow2_patch_meta (id, payload, updated_at) VALUES (1, $1::jsonb, NOW()) ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()",
      [JSON.stringify(patchMetaDb)]
    );
  }
}

let currentState = {
  allies: [],
  enemies: [],
  myHero: null,
  mapType: "any",
  situation: "",
  updatedAt: new Date().toISOString()
};

const clients = new Set();

function normalizeHeroKey(val) {
  if (!val || typeof val !== "string") return null;
  const key = val.trim().toLowerCase().replace(/[:.\s-]/g, "");
  return HEROES[key] ? key : null;
}

const aliasToId = {};
for (const [id, info] of Object.entries(HEROES)) {
  aliasToId[id] = id;
  aliasToId[info.name.toLowerCase().replace(/[:.\s-]/g, "")] = id;
  aliasToId[info.koName.replace(/[:.\s-]/g, "")] = id;
}
aliasToId["디바"] = "dva";
aliasToId["솔저"] = "soldier76";
aliasToId["솔저76"] = "soldier76";
aliasToId["정크랫퀸"] = "junkerqueen";
aliasToId["정커퀸"] = "junkerqueen";
aliasToId["제트팩캣"] = "jetpackcat";

function extractHeroesFromLine(text) {
  const found = [];
  const lower = text.toLowerCase();
  const compact = text.replace(/[:.\s-]/g, "").toLowerCase();

  const sortedAliases = Object.keys(aliasToId).sort((a, b) => b.length - a.length);
  for (const alias of sortedAliases) {
    const id = aliasToId[alias];
    if (found.includes(id)) continue;
    if (compact.includes(alias) || lower.includes(alias)) {
      found.push(id);
      if (found.length >= 10) break;
    }
  }
  return found;
}

function detectMapType(line) {
  if (line.includes("호위")) return "escort";
  if (line.includes("쟁탈") || line.includes("거점")) return "control";
  if (line.includes("혼합")) return "hybrid";
  if (line.includes("밀기")) return "push";
  if (line.includes("플래시") || line.includes("섬광")) return "flashpoint";
  if (line.includes("격돌")) return "clash";
  return "any";
}

function detectComp(line, allies) {
  if (line.includes("돌진") || line.includes("다이브")) return "dive";
  if (line.includes("포킹") || line.includes("저격")) return "poke";
  if (line.includes("난전") || line.includes("브롤")) return "brawl";
  return getTeamCompStyle(allies);
}

function parseBulkTournamentText(rawText) {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const parsedRecords = [];
  for (const line of lines) {
    const heroes = extractHeroesFromLine(line);
    const hasVs = /\bvs\b|상대|대/i.test(line);
    let allies = [];
    let enemies = [];

    if (hasVs && heroes.length >= 2) {
      const splitIdx = Math.max(1, Math.min(heroes.length - 1, Math.floor(heroes.length / 2)));
      allies = heroes.slice(0, Math.min(5, splitIdx));
      enemies = heroes.slice(splitIdx, splitIdx + 5);
    } else if (heroes.length > 0) {
      allies = heroes.slice(0, 5);
    }

    const outcome = /패배|졌|비추천|실패|loss/i.test(line) ? "loss" : "win";
    const mapType = detectMapType(line);
    const comp = detectComp(line, allies);

    if (allies.length > 0 || enemies.length > 0 || line.length >= 4) {
      parsedRecords.push({
        id: Date.now() + parsedRecords.length,
        allies,
        enemies,
        comp,
        mapType,
        situation: "",
        outcome,
        note: line.slice(0, 140),
        createdAt: new Date().toISOString()
      });
    }
  }
  return parsedRecords;
}

function getTeamCompStyle(heroIds) {
  const counts = { dive: 0, brawl: 0, poke: 0 };
  for (const id of heroIds) {
    const h = HEROES[id];
    if (h && counts[h.comp] !== undefined) counts[h.comp] += 1;
  }
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return sorted[0][1] > 0 ? sorted[0][0] : "brawl";
}

function parsePatchNotesText(plainText, title = "수동/자동 패치 분석") {
  const lines = plainText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const heroEntries = Object.entries(HEROES);
  let activeHeroId = null;
  const stats = {};

  const buffWords = ["상향", "증가했습니다", "증가합니다", "단축되었습니다", "단축됩니다", "강화", "빨라졌습니다", "넓어졌습니다", "회복량 증가", "공격력 증가", "생명력 증가"];
  const nerfWords = ["하향", "감소했습니다", "감소합니다", "늘어났습니다", "약화", "느려졌습니다", "좁아졌습니다", "공격력 감소", "생명력 감소", "재사용 대기시간이 증가"];

  for (const line of lines) {
    const cleanLine = line.replace(/\s+/g, "");
    for (const [id, info] of heroEntries) {
      const koCompact = info.koName.replace(/\s+/g, "");
      if (cleanLine === koCompact || (line.length <= 20 && cleanLine.includes(koCompact))) {
        activeHeroId = id;
        if (!stats[id]) stats[id] = { buff: 0, nerf: 0, snippets: [] };
      }
    }

    if (activeHeroId) {
      let hit = false;
      for (const w of buffWords) {
        if (line.includes(w)) {
          stats[activeHeroId].buff += 1;
          hit = true;
        }
      }
      for (const w of nerfWords) {
        if (line.includes(w)) {
          stats[activeHeroId].nerf += 1;
          hit = true;
        }
      }
      if (hit && stats[activeHeroId].snippets.length < 2) {
        stats[activeHeroId].snippets.push(line.slice(0, 60));
      }
    }
  }

  const adjustments = {};
  for (const [id, st] of Object.entries(stats)) {
    const diff = st.buff - st.nerf;
    if (diff > 0) {
      adjustments[id] = {
        delta: Math.min(12, 4 + diff * 2),
        status: "상향",
        summary: st.snippets.join(" / ") || "패치 상향 반영"
      };
    } else if (diff < 0) {
      adjustments[id] = {
        delta: Math.max(-10, -4 + diff * 2),
        status: "하향",
        summary: st.snippets.join(" / ") || "패치 하향 반영"
      };
    } else if (st.buff > 0 || st.nerf > 0) {
      adjustments[id] = {
        delta: 2,
        status: "조정",
        summary: st.snippets.join(" / ") || "밸런스 조정"
      };
    }
  }

  return {
    title,
    analyzedAt: new Date().toISOString(),
    adjustments
  };
}

async function syncOfficialPatchNotes(force = false) {
  try {
    const resp = await fetch(PATCH_URL, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) OW2Advisor/1.0",
        "Accept-Language": "ko-KR,ko;q=0.9"
      }
    });
    if (!resp.ok) {
      return { ok: false, message: `패치노트 페이지 응답 오류 (HTTP ${resp.status})` };
    }

    const html = await resp.text();
    const titleMatch = html.match(/<h[1-3][^>]*>(.*?)<\/h[1-3]>/i);
    const rawTitle = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").trim() : "오버워치 2 최신 패치노트";
    const textOnly = html
      .replace(/<script[\s\S]*?<\/script>/gi, "\n")
      .replace(/<style[\s\S]*?<\/style>/gi, "\n")
      .replace(/<[^>]+>/g, "\n")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&");

    const simpleHash = `${rawTitle}:${textOnly.length}`;
    patchMetaDb.lastCheckedAt = new Date().toISOString();

    if (!force && patchMetaDb.patchHash === simpleHash) {
      await persistPatchMeta();
      return { ok: true, updated: false, message: "이미 최신 패치노트가 반영되어 있습니다." };
    }

    const parsed = parsePatchNotesText(textOnly, rawTitle);
    if (Object.keys(parsed.adjustments).length > 0) {
      patchMetaDb.latestPatchTitle = parsed.title;
      patchMetaDb.patchHash = simpleHash;
      patchMetaDb.heroAdjustments = parsed.adjustments;
      patchMetaDb.history.unshift({
        title: parsed.title,
        analyzedAt: parsed.analyzedAt,
        heroCount: Object.keys(parsed.adjustments).length
      });
      patchMetaDb.history = patchMetaDb.history.slice(0, 10);
      await persistPatchMeta();
      broadcastState();
      return { ok: true, updated: true, title: parsed.title, count: Object.keys(parsed.adjustments).length };
    }

    await persistPatchMeta();
    return { ok: true, updated: false, message: "패치노트 본문에서 영웅 변경 항목을 찾지 못했습니다." };
  } catch (err) {
    return { ok: false, message: `패치노트 수집 실패: ${err.message}` };
  }
}

function buildTournamentInsights() {
  const compStats = { dive: { total: 0, wins: 0 }, brawl: { total: 0, wins: 0 }, poke: { total: 0, wins: 0 } };
  const heroPickCounts = {};
  const situationPatterns = [];

  for (const row of strategiesDb) {
    const c = row.comp || "brawl";
    if (compStats[c]) {
      compStats[c].total += 1;
      if (row.outcome === "win") compStats[c].wins += 1;
    }

    for (const hId of row.allies || []) {
      if (!heroPickCounts[hId]) heroPickCounts[hId] = { picks: 0, wins: 0 };
      heroPickCounts[hId].picks += 1;
      if (row.outcome === "win") heroPickCounts[hId].wins += 1;
    }

    if (row.note || row.situation) {
      situationPatterns.push({
        id: row.id,
        comp: row.comp,
        mapType: row.mapType || "any",
        situation: row.situation || "",
        outcome: row.outcome || "win",
        note: row.note || "",
        allies: row.allies || [],
        enemies: row.enemies || []
      });
    }
  }

  const topProHeroes = Object.entries(heroPickCounts)
    .filter(([id]) => HEROES[id])
    .map(([id, st]) => ({
      id,
      name: HEROES[id].koName,
      role: HEROES[id].role,
      picks: st.picks,
      winRate: st.picks > 0 ? Math.round((st.wins / st.picks) * 100) : 0
    }))
    .sort((a, b) => b.picks - a.picks || b.winRate - a.winRate)
    .slice(0, 6);

  return {
    totalMatches: strategiesDb.length,
    compStats,
    topProHeroes,
    recentPatterns: situationPatterns.slice(-15).reverse()
  };
}

function getProSituationalBonus(candidateId, allies, enemies, mapType, situation) {
  let bonus = 0;
  let matchedReason = null;

  for (const entry of strategiesDb) {
    const eAllies = Array.isArray(entry.allies) ? entry.allies : [];
    const eEnemies = Array.isArray(entry.enemies) ? entry.enemies : [];
    if (!eAllies.includes(candidateId)) continue;

    const enemyOverlap = enemies.filter((id) => eEnemies.includes(id)).length;
    const allyOverlap = allies.filter((id) => eAllies.includes(id)).length;
    const mapMatch = mapType && mapType !== "any" && entry.mapType === mapType ? 1 : 0;
    const sitMatch =
      situation && entry.situation && entry.situation.includes(situation.trim()) ? 1 : 0;

    if (enemyOverlap > 0 || allyOverlap > 0 || mapMatch > 0 || sitMatch > 0) {
      const winMultiplier = entry.outcome === "win" ? 1.3 : 0.8;
      const raw = (8 + enemyOverlap * 5 + allyOverlap * 2 + mapMatch * 4 + sitMatch * 5) * winMultiplier;
      bonus += Math.round(raw);
      if (!matchedReason) {
        matchedReason = entry.note
          ? `대회 분석(${entry.note})`
          : `대회 ${entry.outcome === "win" ? "승리" : "활용"} 조합`;
      }
    }
  }

  return { bonus: Math.min(25, bonus), matchedReason };
}

function scoreCandidate(candidateId, allies, enemies, targetRole, mapType, situation) {
  const cand = HEROES[candidateId];
  if (!cand) return null;

  let score = 50;
  const reasons = [];

  if (targetRole && cand.role === targetRole) {
    score += 12;
  }

  const counterHits = [];
  const vulnerabilityHits = [];
  for (const enemyId of enemies) {
    const enemy = HEROES[enemyId];
    if (!enemy) continue;
    if (cand.counters.includes(enemyId)) {
      score += 16;
      counterHits.push(enemy.koName);
    }
    if (enemy.counters.includes(candidateId) || cand.counteredBy.includes(enemyId)) {
      score -= 14;
      vulnerabilityHits.push(enemy.koName);
    }
  }

  if (counterHits.length > 0) reasons.push(`${counterHits.join(", ")} 상성 우위`);
  if (vulnerabilityHits.length > 0) reasons.push(`${vulnerabilityHits.join(", ")} 주의`);

  const allyComp = getTeamCompStyle(allies);
  const compKoMap = { dive: "돌진", brawl: "난전", poke: "포킹" };
  if (cand.comp === allyComp) {
    score += 11;
    reasons.push(`${compKoMap[allyComp]} 조합 시너지`);
  }

  const roleCount = { tank: 0, dps: 0, support: 0 };
  for (const aId of allies) {
    if (HEROES[aId]) roleCount[HEROES[aId].role] += 1;
  }
  if (cand.role === "tank" && roleCount.tank === 0) {
    score += 14;
    reasons.push("탱커 보완");
  }
  if (cand.role === "support" && roleCount.support < 2) {
    score += 10;
    reasons.push("힐러 라인 안정");
  }

  const patchAdj = patchMetaDb.heroAdjustments[candidateId];
  if (patchAdj && typeof patchAdj.delta === "number") {
    score += patchAdj.delta;
    if (patchAdj.delta > 0) {
      reasons.push(`최신 패치 ${patchAdj.status}(+${patchAdj.delta})`);
    } else if (patchAdj.delta < 0) {
      reasons.push(`최신 패치 ${patchAdj.status}(${patchAdj.delta})`);
    }
  }

  const pro = getProSituationalBonus(candidateId, allies, enemies, mapType, situation);
  if (pro.bonus > 0) {
    score += pro.bonus;
    reasons.push(pro.matchedReason);
  }

  if (reasons.length === 0) {
    reasons.push("무난한 범용 픽");
  }

  return {
    id: candidateId,
    name: cand.koName,
    role: cand.role,
    comp: cand.comp,
    compKo: cand.compKo,
    score: Math.max(10, Math.min(99, score)),
    reason: reasons.slice(0, 3).join(" · ")
  };
}

function buildRecommendations(state) {
  const allies = (state.allies || []).filter((id) => HEROES[id]);
  const enemies = (state.enemies || []).filter((id) => HEROES[id]);
  const myHeroId = state.myHero && HEROES[state.myHero] ? state.myHero : null;
  const myHeroInfo = myHeroId ? { id: myHeroId, ...HEROES[myHeroId], name: HEROES[myHeroId].koName } : null;
  const preferredRole = myHeroInfo ? myHeroInfo.role : null;

  const swapRecommendations = Object.keys(HEROES)
    .filter((id) => id !== myHeroId)
    .filter((id) => !preferredRole || HEROES[id].role === preferredRole)
    .map((id) => scoreCandidate(id, allies, enemies, preferredRole, state.mapType, state.situation))
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  const topByRole = { tank: [], dps: [], support: [] };
  for (const role of ["tank", "dps", "support"]) {
    topByRole[role] = Object.keys(HEROES)
      .filter((id) => HEROES[id].role === role && id !== myHeroId)
      .map((id) => scoreCandidate(id, allies, enemies, role, state.mapType, state.situation))
      .filter(Boolean)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
  }

  return {
    myHero: myHeroInfo,
    swapRecommendations,
    topByRole
  };
}

function getFullPayload() {
  return {
    allies: currentState.allies,
    enemies: currentState.enemies,
    myHero: currentState.myHero,
    mapType: currentState.mapType,
    situation: currentState.situation,
    updatedAt: currentState.updatedAt,
    storageMode,
    heroes: HEROES,
    patchMeta: patchMetaDb,
    tournamentInsights: buildTournamentInsights(),
    recommendations: buildRecommendations(currentState)
  };
}

function broadcastState() {
  const payload = `data: ${JSON.stringify(getFullPayload())}\n\n`;
  for (const res of clients) {
    res.write(payload);
  }
}

app.get("/api/state", (req, res) => {
  res.json(getFullPayload());
});

app.get("/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  res.write(`data: ${JSON.stringify(getFullPayload())}\n\n`);
  clients.add(res);

  req.on("close", () => {
    clients.delete(res);
  });
});

app.post("/api/update", (req, res) => {
  const rawAllies = Array.isArray(req.body.allies) ? req.body.allies : [];
  const rawEnemies = Array.isArray(req.body.enemies) ? req.body.enemies : [];

  currentState.allies = [...new Set(rawAllies.map(normalizeHeroKey).filter(Boolean))].slice(0, 5);
  currentState.enemies = [...new Set(rawEnemies.map(normalizeHeroKey).filter(Boolean))].slice(0, 5);

  if (req.body.myHero !== undefined) {
    currentState.myHero = normalizeHeroKey(req.body.myHero);
  } else if (!currentState.myHero && currentState.allies.length > 0) {
    currentState.myHero = currentState.allies[0];
  } else if (currentState.myHero && currentState.allies.length > 0 && !currentState.allies.includes(currentState.myHero)) {
    currentState.myHero = currentState.allies[0];
  }

  if (typeof req.body.mapType === "string") currentState.mapType = req.body.mapType;
  if (typeof req.body.situation === "string") currentState.situation = req.body.situation;

  currentState.updatedAt = new Date().toISOString();
  broadcastState();
  res.json({ ok: true });
});

app.post("/api/my-hero", (req, res) => {
  currentState.myHero = normalizeHeroKey(req.body.myHero);
  currentState.updatedAt = new Date().toISOString();
  broadcastState();
  res.json({ ok: true, myHero: currentState.myHero });
});

app.post("/api/context", (req, res) => {
  if (typeof req.body.mapType === "string") currentState.mapType = req.body.mapType;
  if (typeof req.body.situation === "string") currentState.situation = req.body.situation;
  currentState.updatedAt = new Date().toISOString();
  broadcastState();
  res.json({ ok: true });
});

app.post("/api/patch/sync", async (req, res) => {
  const result = await syncOfficialPatchNotes(true);
  res.json(result);
});

app.post("/api/patch/manual", async (req, res) => {
  const text = typeof req.body.text === "string" ? req.body.text : "";
  const title = typeof req.body.title === "string" && req.body.title.trim() ? req.body.title.trim() : "수동 입력 패치노트";
  if (!text.trim()) {
    return res.status(400).json({ ok: false, message: "패치노트 본문을 입력해 주세요." });
  }
  const parsed = parsePatchNotesText(text, title);
  patchMetaDb.latestPatchTitle = parsed.title;
  patchMetaDb.lastCheckedAt = parsed.analyzedAt;
  patchMetaDb.heroAdjustments = parsed.adjustments;
  patchMetaDb.history.unshift({
    title: parsed.title,
    analyzedAt: parsed.analyzedAt,
    heroCount: Object.keys(parsed.adjustments).length
  });
  patchMetaDb.history = patchMetaDb.history.slice(0, 10);
  await persistPatchMeta();
  broadcastState();
  res.json({ ok: true, count: Object.keys(parsed.adjustments).length });
});

app.post("/api/strategies", async (req, res) => {
  const allies = (Array.isArray(req.body.allies) ? req.body.allies : [])
    .map(normalizeHeroKey)
    .filter(Boolean)
    .slice(0, 5);
  const enemies = (Array.isArray(req.body.enemies) ? req.body.enemies : [])
    .map(normalizeHeroKey)
    .filter(Boolean)
    .slice(0, 5);
  const comp = ["dive", "brawl", "poke"].includes(req.body.comp) ? req.body.comp : getTeamCompStyle(allies);
  const mapType = typeof req.body.mapType === "string" ? req.body.mapType : "any";
  const situation = typeof req.body.situation === "string" ? req.body.situation.trim().slice(0, 60) : "";
  const outcome = req.body.outcome === "loss" ? "loss" : "win";
  const note = typeof req.body.note === "string" ? req.body.note.trim().slice(0, 140) : "";

  if (allies.length === 0 && enemies.length === 0 && !note) {
    return res.status(400).json({ ok: false, message: "조합 또는 전략 메모를 입력해 주세요." });
  }

  const record = {
    id: Date.now(),
    allies,
    enemies,
    comp,
    mapType,
    situation,
    outcome,
    note,
    createdAt: new Date().toISOString()
  };

  strategiesDb.push(record);
  await persistStrategyAdd(record);
  broadcastState();
  res.json({ ok: true, record, total: strategiesDb.length });
});

app.post("/api/strategies/bulk", async (req, res) => {
  const rawText = typeof req.body.text === "string" ? req.body.text : "";
  if (!rawText.trim()) {
    return res.status(400).json({ ok: false, message: "일괄 등록할 대회 로그 텍스트를 붙여넣어 주세요." });
  }

  const added = parseBulkTournamentText(rawText);
  if (added.length === 0) {
    return res.status(400).json({ ok: false, message: "저장할 유효한 줄을 찾지 못했습니다." });
  }

  strategiesDb.push(...added);
  await persistStrategyBulkAdd(added);
  broadcastState();
  res.json({ ok: true, addedCount: added.length, total: strategiesDb.length });
});

app.delete("/api/strategies/:id", async (req, res) => {
  const id = Number(req.params.id);
  strategiesDb = strategiesDb.filter((item) => item.id !== id);
  await persistStrategyDelete(id);
  broadcastState();
  res.json({ ok: true });
});

app.post("/api/reset", (req, res) => {
  currentState = {
    allies: [],
    enemies: [],
    myHero: null,
    mapType: "any",
    situation: "",
    updatedAt: new Date().toISOString()
  };
  broadcastState();
  res.json({ ok: true });
});

initDatabase().then(async () => {
  app.listen(PORT, async () => {
    console.log(`OW2 통합 메타·대회·실시간 추천 서버 실행 중 (PORT=${PORT}, 저장소=${storageMode})`);
    const initSync = await syncOfficialPatchNotes(false);
    console.log("[패치노트 초기 동기화]", initSync.message || initSync.title || "완료");
    setInterval(() => {
      syncOfficialPatchNotes(false);
    }, 6 * 60 * 60 * 1000);
  });
});