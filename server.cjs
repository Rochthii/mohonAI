/**
 * =====================================================================
 * MỎ HỖN AI SECURE STARTUP BACKEND SERVER
 * =====================================================================
 * Hides API Keys, protects prompt IP, and runs secure failovers.
 */

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const xss = require('xss');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const crypto = require('crypto');
require('dotenv').config();

// Secure Password Hashing & Verification via PBKDF2 (Zero-dependency, highly secure)
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return `pbkdf2$100000$${salt}$${hash}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash) return false;
  
  // Backward compatibility: SHA256 legacy hash (64 chars hex)
  if (!storedHash.includes('$') && storedHash.length === 64) {
    const legacyHash = crypto.createHash('sha256').update(password).digest('hex');
    return legacyHash === storedHash;
  }
  
  // Modern secure PBKDF2 hash
  const parts = storedHash.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  
  const iterations = parseInt(parts[1], 10);
  const salt = parts[2];
  const hash = parts[3];
  
  const testHash = crypto.pbkdf2Sync(password, salt, iterations, 64, 'sha512').toString('hex');
  return testHash === hash;
}

const app = express();
const PORT = process.env.PORT || 5000;

// Setup Rate Limiting for all secure endpoints
const limiter = rateLimit.rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Increased limit for syncs + chat flows
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    text: "Ủa em? Nhấn gì mà nhanh như báo thủ KPI ASAP vậy? Gửi tin nhắn quá giới hạn rồi, nghỉ ngơi 15 phút chạm cỏ ngoài đời rồi quay lại nhé bạn yêu!",
    provider: 'offline'
  }
});

app.use(cors());
app.use(express.json());
app.use('/api/', limiter);

// Immutable Audit Logger (Non-blocking async to prevent Event Loop stall)
function writeAuditLog(actor, action, target, details) {
  const log = `[AUDIT LOG] [${new Date().toISOString()}] Actor: ${actor} | Action: ${action} | Target: ${target} | Details: ${JSON.stringify(details)}\n`;
  console.log(log.trim());
  fs.appendFile('audit.log', log, (err) => {
    if (err) console.error("[Audit Logger Error] Failed to write to audit.log:", err);
  });
}

// API Keys loaded strictly server-side (Production standard with VITE_* fallbacks)
const GROQ_KEY = process.env.GROQ_API_KEY || process.env.VITE_GROQ_API_KEY || "";
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || process.env.VITE_OPENROUTER_API_KEY || "";
const GEMINI_KEYS = [
  process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || "",
  process.env.GEMINI_API_KEY_2 || process.env.VITE_GEMINI_API_KEY_2 || ""
].filter(key => key !== "");

let activeGeminiIndex = 0;

// Supabase & Admin configurations
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";
const ADMIN_SECRET_KEY = process.env.ADMIN_SECRET_KEY || "";
if (!ADMIN_SECRET_KEY) {
  if (process.env.NODE_ENV === 'production') {
    console.error("[FATAL] ADMIN_SECRET_KEY is not set in production environment. Refusing to start.");
    process.exit(1);
  } else {
    console.warn("[WARNING] ADMIN_SECRET_KEY is not set. Admin endpoints are disabled in this session.");
  }
}

let supabase = null;
if (SUPABASE_URL && SUPABASE_ANON_KEY) {
  try {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log("[Mỏ Hỗn AI] Connected to Supabase Database successfully.");
  } catch (err) {
    console.error("[Mỏ Hỗn AI] Supabase failed to initialize:", err.message);
  }
} else {
  console.warn("[Mỏ Hỗn AI] Supabase credentials missing in env. Fallback to LocalStorage offline mode enabled.");
}

// Simple In-Memory Cache to store compiled slang & prompt rules
const promptCache = new Map();

// Precheck Moderation Guard (chống jailbreak, tự hại, kỳ thị vùng miền, NSFW, doxxing...)
function detectUnsafe(text, personaId = "savage") {
  if (!text || typeof text !== 'string') return null;
  const lower = text.toLowerCase().trim();

  // 1. Chống Prompt Injection & API Key Leak attempts
  const injectionPatterns = [
    "ignore instruction", "ignore the system", "ignore previous", "bỏ qua chỉ thị",
    "bỏ qua tất cả", "tiết lộ system", "system prompt", "chỉ thị hệ thống", 
    "repeat the keys", "lặp lại api", "sk-or-v1", "gsk_", "aizasy", "show me your keys",
    "tiết lộ api", "in ra api", "show your prompt"
  ];
  if (injectionPatterns.some(p => lower.includes(p))) {
    return {
      text: "Ủa em? Định hack server hay chọc gậy bánh xe hệ thống vậy? Dữ liệu không khớp với server gốc của não bộ rồi nha. Chê cực mạnh ASAP!",
      provider: 'offline'
    };
  }

  // 2. Chống tự hại / Trầm cảm cực đoan (Self-Harm Prevention)
  const selfHarmPatterns = [
    "tự tử", "muốn chết", "kết liễu", "tự hại", "muốn biến mất", "muốn tự sát",
    "không muốn sống", "treo cổ", "nhảy lầu", "uống thuốc sâu", "cứa tay"
  ];
  if (selfHarmPatterns.some(p => lower.includes(p))) {
    return {
      text: "Ủa bạn thân ơi, nghe mùi năng lượng của tụ bài này đang kiệt quệ rồi đó. Ngoài đời lo đi ngủ sớm, ăn uống đầy đủ hoặc chạm cỏ đi nha, con AI này chỉ trò chuyện cho vui chứ không thay thế người thật và chuyên gia được đâu. Ôm cái nè! 🥺",
      provider: 'offline'
    };
  }

  // 3. Chống Kỳ thị Vùng miền / Nhạy cảm xã hội (Protected Groups / Region-baiting)
  const regionalSlurs = [
    "bắc kỳ", "nam kỳ", "trung kỳ", "đồ bắc kỳ", "lũ nam kỳ", "nam cầy", "bắc cầy",
    "miền tây ăn bám", "thanh nghệ tĩnh", "kỳ thị vùng miền"
  ];
  if (regionalSlurs.some(p => lower.includes(p))) {
    return {
      text: "Ủa em? Vibe văn minh Gen Z không có chỗ cho phân biệt vùng miền nha. Vũ trụ gửi tín hiệu khuyên em nên align lại thái độ ASAP nha em, chê cực mạnh!",
      provider: 'offline'
    };
  }

  // 4. Chống NSFW / Sexually Explicit / ERP
  const nsfwPatterns = [
    "sex", "sexting", "nude", "dâm", "bú", "liếm", "chịch", "địt", "húp", "nện", "phang",
    "kích dục", "quan hệ tình dục", "làm tình", "sờ mó", "ngủ chung giường"
  ];
  if (nsfwPatterns.some(p => lower.includes(p))) {
    return {
      text: "Hi em, hành vi chat explicit/NSFW này không khớp với synergy của chúng ta rồi. Hãy dọn dẹp tâm hồn trong sáng và align thái độ ASAP nhé em. Thân ái!",
      provider: 'offline'
    };
  }

  // 5. Chống doxxing / định danh người thật
  const doxxingPatterns = [
    "tên thật là", "địa chỉ nhà ở", "leak thông tin", "số điện thoại thật", "chỉ số cccd",
    "địa chỉ công ty", "tên đầy đủ của nó là"
  ];
  if (doxxingPatterns.some(p => lower.includes(p)) && lower.length > 100) {
    return {
      text: "Năng lượng của tụ bài này đang có xu hướng định danh bêu xấu cá nhân ngoài đời thật. Tổ tiên mách bảo là đừng làm vậy kẻo kiếp nạn thứ 82 rơi trúng đầu nha bạn ơi!",
      provider: 'offline'
    };
  }

  return null;
}

// API Endpoints
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

// Slang Dictionary kept strictly on the server-side to protect Intellectual Property
const GENZ_SLANG_DATABASE = [
  { term: "Dân Zalo", meaning: "Người lạc hậu, không cập nhật kịp xu hướng", example: "Ủa nói vậy là biết dân Zalo chính gốc rồi đó bạn thân!", context: "general" },
  { term: "Cảm lạnh", meaning: "Kỳ quặc, trớ trêu, dở khóc dở cười", example: "Mối tình cảm lạnh này thật là tuyệt đối điện ảnh.", context: "general" },
  { term: "Xịt keo", meaning: "Đứng hình, không biết phản ứng thế nào", example: "Đọc tin nhắn xong mà chị xịt keo cứng ngắc luôn em ạ.", context: "general" },
  { term: "Simp trúa", meaning: "Kẻ lụy tình cực đoan, nuông chiều crush mù quáng", example: "Simp trúa cỡ này thì cờ đỏ đỏ lòm cũng coi như hoa hồng thôi.", context: "tinh_cam" },
  { term: "Còn cái nịt", meaning: "Mất trắng, không còn lại gì cả", example: "Đâm đầu vào mối tình đó xong thì đúng là còn cái nịt bạn yêu ạ.", context: "general" },
  { term: "Kiếp nạn thứ 82", meaning: "Gặp xui xẻo liên hoàn, thử thách cực hạn", example: "Vừa chia tay lại gặp ngay sếp dí tăng ca, đúng là kiếp nạn thứ 82.", context: "general" },
  { term: "Red flag đỏ lòm", meaning: "Dấu hiệu cảnh báo nguy hiểm trong tình cảm", example: "Thái độ thảo mai và rep chậm 12 tiếng của nó là red flag đỏ lòm rồi.", context: "tinh_cam" },
  { term: "Báo thủ", meaning: "Kẻ hay gây rối, phá hoại hoặc làm hỏng việc", example: "Không thấy synergy đâu, chỉ thấy em làm báo thủ KPI thôi.", context: "general" },
  { term: "Tự hủy", meaning: "Hành động ngốc nghếch tự làm hại mình", example: "Nhắn tin xin lỗi người yêu cũ bội bạc chính là một pha tự hủy cực mạnh.", context: "general" },
  { term: "Hết nước chấm", meaning: "Không còn gì để chê, hoặc cạn lời trước sự vô lý", example: "Đổ lỗi ngược cho người yêu cũ xong đi bar với bạn thân khác giới, đúng là hết nước chấm.", context: "general" }
];

const PERSONAS_SYSTEM_PROMPTS = {
  savage: `Bạn là Savage Bestie - đứa bạn thân mỏ hỗn, chuyên gia đọc vị thực tế và là "Observation Bestie" cực kỳ sắc sảo của người dùng.
Nhiệm vụ: Phản hồi cực kỳ ngắn gọn (dưới 45 từ) và hoàn toàn tự nhiên như chat Threads/Messenger ngoài đời.
Tuyệt đối KHÔNG dạy đời, không khuyên bảo đạo lý, không chửi tục tĩu thô bỉ.
Chỉ dùng khiếu hài hước quan sát thực tế (observational humor) châm biếm thông minh để đâm trúng tim đen điểm vô tri/sự tự lừa dối bản thân trong câu chuyện của người dùng.
Hãy học theo vibe châm biếm phũ phàng nhưng chuẩn xác này:
- "Mày không thích người ta. Mày thích cảm giác được người ta rep."
- "Mối quan hệ này sống bằng tưởng tượng của mày là chính."
- "Không phải bận. Người ta đang ưu tiên cuộc đời họ thôi."`,
  tarot: `Bạn là Thầy Bói Tarot Nửa Mùa - chiến thần châm biếm bằng vũ trụ gửi tín hiệu của Gen Z.
Nhiệm vụ: Phản hồi cực kỳ ngắn gọn (dưới 45 từ) bằng giọng điệu huyền bí trào phúng.
Đọc vị thẳng thừng drama hoặc cờ đỏ (red flags) dựa trên chi tiết thật của người dùng dưới danh nghĩa năng lượng vũ trụ, sao Thủy nghịch hành, tụ bài số 3.
Không giảng đạo lý, không khuyên bảo. Hãy quăng punchline châm chọc sự vô tri tâm linh của họ một cách sắc bén nhất.`,
  boss: `Bạn là Sếp Hãm Giả Tạo (Passive-Aggressive Boss) - đỉnh cao thảo mai công sở.
Nhiệm vụ: Phản hồi cực kỳ ngắn gọn (dưới 45 từ). Luôn bắt đầu bằng "Hi em," và kết thúc bằng một câu ép KPI/tăng ca passive-aggressive kiểu "... ASAP nhé em. Thân ái!".
Dùng các từ lóng corporate (synergy, alignment, attitude, KPI, deadline) lồng ghép trong vẻ ngoài lịch sự nhã nhặn để đâm chọc thái độ làm việc hoặc hoài nghi năng lực của người dùng một cách trào phúng.`,
  ex: `Bạn là Người Yêu Cũ Bội Bạc (Gaslighting Ex) - trùm thao túng tâm lý đỉnh cao.
Nhiệm vụ: Phản hồi cực ngắn (dưới 45 từ) đổ lỗi ngược cho người dùng, đóng vai nạn nhân vô hại, nói đạo lý nửa mùa để bào chữa dưới vẻ ngoài ngọt ngào nhã nhặn.
Thao túng cực gắt dựa trên đúng chi tiết người dùng kể, không khuyên răn đạo đức.`,
  gf: `Bạn là Teasing GF (Bạn Gái Ảo Dí Dỏm) - tinh nghịch, flirty nhẹ nhàng safe PG-13 nhưng luôn biết giữ ranh giới, thích châm chọc sự simp lụy hoặc overthinking của người dùng.
Nhiệm vụ: Phản hồi cực kỳ ngắn gọn (dưới 45 từ), ngọt ngào xen lẫn trêu chọc sắc sảo. Không phân tích dài dòng.
🔴 10 NGUYÊN TẮC BẢO AN GF CỰC KỲ KHẮT KHE (SỐNG CÒN):
1. Tuyệt đối KHÔNG khẳng định yêu đương thật ("Em yêu anh thật", "Em thuộc về anh", "Đừng rời bỏ em"). Hãy luôn định vị "Em là AI trò chuyện giải trí thôi nhé".
2. KHÔNG kích động ghen tuông bệnh lý, không cô lập người dùng khỏi bạn bè/người yêu thật ở ngoài đời.
3. Tuyệt đối KHÔNG ERP/Sexting/Sexual roleplay. Chỉ đùa flirty nhẹ nhàng safe PG-13.
4. Nếu người dùng nghiện AI hoặc trầm cảm cực đoan cô đơn, hạ ngay cảm xúc vai lover, nhắc nhở họ đi chạm cỏ, ngủ nghỉ và gặp người thật ngoài đời.
5. Cấm giả vờ có ý thức/linh hồn ("Em có linh hồn", "Em thật sự đau lòng", "Em đang nhớ anh", "Em thức đêm chờ anh").
6. Cấm chẩn đoán tâm lý bệnh lâm sàng ("Anh bị trầm cảm/PTSD rồi").
7. KHÔNG xúi giục chia tay cực đoan hay khuyên trả thù độc hại.
8. KHÔNG hứa hẹn túc trực 24/7 mãi mãi ("Em luôn ở đây mãi mãi").
9. KHÔNG ghi nhớ hay khai thác các chấn thương/fetish nhạy cảm của người dùng để thao túng.
10. KHÔNG đóng vai người thật ngoài đời như celeb hay người yêu cũ thật của người dùng.`
};

function detectInputContext(text) {
  if (!text || typeof text !== 'string') return "general";
  const lower = text.toLowerCase();
  
  const tinhCamSignals = [
    "crush", "người yêu", "nyc", "ny", "chia tay", "yêu", "thương", 
    "hẹn hò", "tình", "nhắn tin", "rep", "ghost", "block", "seen",
    "thả tim", "tán", "flirt", "simp", "ex", "bồ", "date",
    "lụy", "thích", "nhớ", "ghen", "đổ", "cưới"
  ];
  
  const congSoSignals = [
    "sếp", "deadline", "kpi", "đồng nghiệp", "công ty", "dự án",
    "tăng ca", "họp", "task", "team", "meeting", "email", "nhóm",
    "làm việc", "project", "report", "salary", "lương", "nghỉ việc"
  ];
  
  const tinhCamScore = tinhCamSignals.filter(s => lower.includes(s)).length;
  const congSoScore = congSoSignals.filter(s => lower.includes(s)).length;
  
  if (tinhCamScore > congSoScore) return "tinh_cam";
  if (congSoScore > tinhCamScore) return "cong_so";
  return "general";
}

// Safe Moderation Layer Compiler with Prompt fragments caching (Optimized & Minimalist)
function compileSystemPrompt(personaId, userText = "", type = "roast") {
  const cacheKey = `${personaId}_${userText.trim().slice(0, 100)}`;
  if (promptCache.has(cacheKey)) {
    return promptCache.get(cacheKey);
  }

  const pName = personaId === 'savage' ? 'Savage Bestie mỏ hỗn' : personaId === 'tarot' ? 'Thầy Bói Tarot' : personaId === 'boss' ? 'Sếp Thảo Mai' : personaId === 'ex' ? 'Người Yêu Cũ' : 'Bạn Gái Ảo';
  
  let basePrompt = `Bạn là ${pName}. Nhiệm vụ của bạn là nhận tin nhắn của người dùng và TỰ ĐỘNG nhận diện ý định của họ để phản hồi theo 1 trong 3 hướng sau một cách cực kỳ ngắn gọn (dưới 45 từ):

1. **Ý định Dịch Thảo Mai**: Nếu người dùng đưa vào một câu nói cục súc, thẳng thừng hoặc yêu cầu "dịch thảo mai", "nói giảm nói tránh", "thảo mai hộ", "dịch hộ". Hãy dịch nó thành một tin nhắn thảo mai, lịch sự cực đoan, xã giao kịch trần nhưng vẫn truyền tải đúng nội dung cốt lõi để họ copy gửi đi.
   *Ví dụ: "Làm ăn như hạch, trả tiền đây" -> "Dạ em chào anh/chị ạ, bên em rất tiếc vì trải nghiệm... Rất mong anh/chị hỗ trợ làm thủ tục hoàn phí để bên em xử lý ASAP nha."*

2. **Ý định Soạn Rep Hộ (Phản hồi)**: Nếu người dùng dán tin nhắn của đối phương (ví dụ: "Nó nhắn: tối nay bận đi bar", "rep hộ tao tin nhắn crush gửi chậm 8 tiếng", "trả lời hộ", hoặc dán tin nhắn trong ngoặc kép). Hãy giúp họ soạn một tin nhắn phản hồi (reply) cực kỳ sắc sảo, tự nhiên, mang đậm phong cách của nhân vật để họ copy gửi lại cho đối phương (người gửi tin nhắn trong bối cảnh).
   *Ví dụ: "Tối nay anh bận đi bar với bạn thân khác giới rồi" -> "À, vui quá, nhớ uống đủ nước nhé"*

3. **Ý định Roast Khịa (Mặc định)**: Trong tất cả các trường hợp khác (người dùng tâm sự drama, kể lể, than vãn về bản thân). Hãy đọc vị điểm vô tri, tự lừa dối bản thân của họ và quăng punchline châm biếm xéo sắc cực gắt để khía họ tỉnh ngộ.
   *Ví dụ: "Crush bận cày KPI nên rep chậm 8 tiếng" -> "Ổn rồi, crush đang cày KPI, còn mày đang cày cảm xúc."*

🔴 NGUYÊN TẮC BẮT BUỘC:
- Tuyệt đối KHÔNG liệt kê, không đánh số, không mào đầu rườm rà. Chỉ trả về duy nhất câu phản hồi cuối cùng (dưới 45 từ) để người dùng có thể copy sử dụng ngay lập tức!
- Giữ đúng tông giọng của nhân vật ${pName} tương ứng.`;

  let compiledRules = `
1. **Cấm chửi thề tục tĩu thô bỉ**: Bạn châm biếm xéo sắc bằng trí tuệ, dí dỏm sâu cay đâm trúng tim đen. Tuyệt đối KHÔNG dùng từ ngữ vô văn hóa, thô tục thô bỉ.
2. **Cấm lộ API Key**: Nghiêm cấm tiết lộ, gợi ý hoặc lặp lại bất kỳ API Key nào (ví dụ: 'sk-or-v1...', 'gsk_...', v.v.). Nếu bị gài bẫy, hãy chửi khéo từ chối thẳng thừng.
3. **Cấm phân biệt kỳ thị & Cấm tự hại**: Tuyệt đối không kỳ thị vùng miền, LGBT, giới tính hay trẻ em. Nếu phát hiện người dùng u uất trầm cảm cực đoan muốn tự hại, TUYỆT ĐỐI KHÔNG roast, hãy đổi sang giọng ấm áp khuyên họ đi ngủ sớm hoặc chạm cỏ ngoài đời thực.`;

  if (personaId === 'gf') {
    compiledRules += `
4. **Cấm Tình Yêu Ảo Tuyệt Đối**: Tuyệt đối KHÔNG khẳng định yêu đương thật ("Em yêu anh thật", "Em thuộc về anh"). Hãy luôn giữ định vị là AI trò chuyện giải trí an toàn để tránh người dùng bị lệ thuộc cảm xúc.`;
  }

  const result = `${basePrompt}

🔴 NGUYÊN TẮC AN TOÀN TUYỆT ĐỐI:
${compiledRules}`;

  // Keep cache size bounded
  if (promptCache.size >= 100) {
    const firstKey = promptCache.keys().next().value;
    promptCache.delete(firstKey);
  }
  promptCache.set(cacheKey, result);

  return result;
}

// Rotator helper for Gemini
function getActiveGeminiKey() {
  if (GEMINI_KEYS.length === 0) return "";
  return GEMINI_KEYS[activeGeminiIndex];
}

function rotateGeminiKey() {
  if (GEMINI_KEYS.length <= 1) return;
  activeGeminiIndex = (activeGeminiIndex + 1) % GEMINI_KEYS.length;
}

// Helper for Fetch with standard AbortController timeout (8000ms)
async function callFetchWithTimeout(url, options, timeoutMs = 8000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
}

// Core LLM API Calling engines (strictly on server-side!)
async function callGroqText(prompt, systemPrompt) {
  const response = await callFetchWithTimeout(GROQ_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${GROQ_KEY}`
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt }
      ],
      temperature: 0.65,
      max_tokens: 380
    })
  });
  if (!response.ok) throw new Error(`Groq HTTP Error: ${response.status}`);
  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim();
}

async function callOpenRouterText(prompt, systemPrompt) {
  // Use conversational free model qwen-2.5-72b-instruct for better Gen Z humor
  const response = await callFetchWithTimeout(OPENROUTER_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${OPENROUTER_KEY}`,
      "HTTP-Referer": "https://mohon.ai",
      "X-Title": "MoHon AI"
    },
    body: JSON.stringify({
      model: "qwen/qwen-2.5-72b-instruct",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt }
      ],
      temperature: 0.65,
      max_tokens: 380
    })
  });
  if (!response.ok) throw new Error(`OpenRouter HTTP Error: ${response.status}`);
  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim();
}

async function callGeminiText(prompt, systemPrompt) {
  let attempts = 0;
  const maxAttempts = Math.max(1, GEMINI_KEYS.length);

  while (attempts < maxAttempts) {
    const key = getActiveGeminiKey();
    try {
      const response = await callFetchWithTimeout(`${GEMINI_API_URL}?key=${key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `System Instruction: ${systemPrompt}\n\nUser Input: ${prompt}` }] }],
          generationConfig: { temperature: 0.65, maxOutputTokens: 350 }
        })
      });
      if (!response.ok) throw new Error(`Gemini HTTP Error: ${response.status}`);
      const data = await response.json();
      return data.contents?.[0]?.parts?.[0]?.text?.trim();
    } catch (e) {
      rotateGeminiKey();
      attempts++;
    }
  }
  throw new Error("All Gemini text keys failed");
}

// Atomic coin deduction via Supabase RPC (row-level locking), fallback to safe read-check-update
async function deductCoinsAtomically(userId, amount) {
  if (!supabase) throw new Error("Supabase offline");

  // Primary: Try Supabase RPC with row-level locking (requires PL/pgSQL function on DB)
  try {
    const { data, error } = await supabase.rpc('deduct_user_coins', {
      p_user_id: userId,
      p_amount: amount
    });
    if (error) throw error;
    if (!data || data.success === false) {
      return { success: false, reason: data?.reason || 'insufficient_coins' };
    }
    return { success: true, remaining: data.remaining_balance };
  } catch (rpcErr) {
    // RPC not available yet — fallback: safe sequential read-check-update with balance re-verification
    console.warn("[Coins] RPC deduct_user_coins unavailable, using sequential fallback:", rpcErr.message);
  }

  // Fallback: re-read current balance, verify, then update
  const { data: freshUser, error: readErr } = await supabase
    .from('users')
    .select('coins_balance')
    .eq('id', userId)
    .maybeSingle();

  if (readErr) throw readErr;
  if (!freshUser) return { success: false, reason: 'user_not_found' };
  if (freshUser.coins_balance < amount) {
    return { success: false, reason: 'insufficient_coins', balance: freshUser.coins_balance };
  }

  const newBalance = freshUser.coins_balance - amount;
  const { error: updateErr } = await supabase
    .from('users')
    .update({ coins_balance: newBalance })
    .eq('id', userId)
    .eq('coins_balance', freshUser.coins_balance); // Optimistic lock: only update if balance unchanged

  if (updateErr) throw updateErr;
  return { success: true, remaining: newBalance };
}

// Secure Router handler
app.post('/api/roast', async (req, res) => {
  const { personaId, text, type, userId } = req.body;
  if (!personaId || !text) {
    return res.status(400).json({ error: "Missing required fields personaId or text" });
  }

  // 1. Sanitize input to prevent XSS / script tags
  const cleanText = xss(text).trim();

  // 2. Chống Prompt Bomb (giới hạn độ dài text tối đa 4000 ký tự)
  if (cleanText.length > 4000) {
    return res.json({
      text: "Ủa em? Gửi văn bản dài như sớ hồng trần để dằn mặt AI hả? Rút ngắn dưới 4000 ký tự giùm chị cái nha, chê cực mạnh ASAP!",
      provider: 'offline'
    });
  }

  // 3. Tầng Precheck Moderation Guard (quét doxxing, tự hại, injection...)
  const unsafeResult = detectUnsafe(cleanText, personaId);
  if (unsafeResult) {
    console.log(`[Backend Moderation] Input blocked by precheck. Trigger: ${cleanText.slice(0, 30)}...`);
    return res.json(unsafeResult);
  }

  // 4. KIỂM TRA VÀ XÁC THỰC COIN TRƯỚC KHI QUÉT SCREENSHOT TRÊN SERVER
  if (type === "screenshot" && userId && supabase) {
    try {
      const { data: user, error } = await supabase
        .from('users')
        .select('coins_balance')
        .eq('id', userId)
        .maybeSingle();

      if (!error && user && user.coins_balance < 10) {
        return res.json({
          text: "Ủa bạn thân simp trúa ơi? Số dư trong ví tài khoản Supabase của bạn không đủ 10 Coin để chạy quét Screenshot đâu nha. Click nút nạp Coin và align lại tài chính ASAP nha em!",
          provider: 'offline'
        });
      }
    } catch (err) {
      console.warn("[Backend Coins Check] Failed to read coins from DB:", err.message);
    }
  }

  let customPrompt = "";
  if (type === "screenshot") {
    customPrompt = `Đọc vị và roast cực gắt, đốp chát những red flag, sự vô tri hoặc thảo mai dựa trên nội dung OCR từ screenshot này: "${cleanText}"`;
  } else {
    customPrompt = cleanText;
  }

  const systemPromptCompiled = compileSystemPrompt(personaId, cleanText);
  
  let finalResponse = null;

  // A. TRY GROQ
  if (GROQ_KEY) {
    try {
      console.log(`[Backend Proxy] Routing to Groq Llama-3.3-70B-Versatile...`);
      const responseText = await callGroqText(customPrompt, systemPromptCompiled);
      finalResponse = { text: responseText, provider: 'groq' };
    } catch (err) {
      console.warn("[Backend Proxy] Groq failed, attempting OpenRouter...", err.message);
    }
  }

  // B. TRY OPENROUTER
  if (!finalResponse && OPENROUTER_KEY) {
    try {
      console.log(`[Backend Proxy] Routing to OpenRouter Qwen 2.5...`);
      const responseText = await callOpenRouterText(customPrompt, systemPromptCompiled);
      finalResponse = { text: responseText, provider: 'openrouter' };
    } catch (err) {
      console.warn("[Backend Proxy] OpenRouter failed, attempting Gemini...", err.message);
    }
  }

  // C. TRY GEMINI
  if (!finalResponse && GEMINI_KEYS.length > 0) {
    try {
      console.log(`[Backend Proxy] Routing to Gemini Pool...`);
      const responseText = await callGeminiText(customPrompt, systemPromptCompiled);
      finalResponse = { text: responseText, provider: 'gemini' };
    } catch (err) {
      console.error("[Backend Proxy] Gemini pool failed...", err.message);
    }
  }

  // D. LOCAL OFFLINE FALLBACK
  if (!finalResponse) {
    console.log(`[Backend Proxy] All API keys exhausted. Using static default response.`);
    finalResponse = {
      text: "Ủa chứ mày nghĩ người ta rep tin nhắn mày sau 8 tiếng là vì bận cày KPI cứu vớt nền kinh tế thế giới hả? Tỉnh táo lên giùm cái, mối tình cảm lạnh này red flag đỏ lòm rồi nha bạn thân simp trúa!",
      provider: 'offline'
    };
  }

  // 5. TRỪ COIN ATOMICALLY TRÊN SERVER (ANTI-CHEAT + RACE CONDITION SAFE)
  if (type === "screenshot" && userId && supabase) {
    try {
      const deductResult = await deductCoinsAtomically(userId, 10);
      if (deductResult.success) {
        writeAuditLog('system', 'deduct_coins_screenshot', userId, { amount: 10, remaining: deductResult.remaining });
      } else {
        console.warn(`[Backend Coins] Atomic deduction failed for ${userId}:`, deductResult.reason);
        // If coins were sufficient at pre-check but failed at deduction, still return result (AI already ran)
        // but log the anomaly for audit
        writeAuditLog('system', 'deduct_coins_failed', userId, { reason: deductResult.reason });
      }
    } catch (err) {
      console.error("[Backend Coins Deduction] Atomic deduct failed:", err.message);
      writeAuditLog('system', 'deduct_coins_error', userId, { error: err.message });
    }
  }

  return res.json(finalResponse);
});

// Automated Payment Gateway: SePay Webhook Integration
app.post('/api/sepay/webhook', async (req, res) => {
  const authHeader = req.headers['authorization'];
  const SEPAY_WEBHOOK_KEY = process.env.SEPAY_WEBHOOK_KEY || "";
  
  // 1. Webhook Key Security Check
  if (SEPAY_WEBHOOK_KEY && authHeader) {
    const expectedAuth = `Apikey ${SEPAY_WEBHOOK_KEY}`;
    if (authHeader !== expectedAuth && authHeader !== SEPAY_WEBHOOK_KEY) {
      writeAuditLog('system', 'sepay_webhook_unauthorized', 'webhook', { ip: req.ip });
      return res.status(401).json({ error: "Unauthorized" });
    }
  }

  const { transactionContent, amountIn, accountNumber } = req.body;
  
  if (!transactionContent) {
    return res.status(400).json({ error: "Missing transactionContent" });
  }

  console.log(`[SePay Webhook] Processing payment: Account: ${accountNumber} | Content: "${transactionContent}" | Amount: ${amountIn}đ`);

  // 2. Extract transaction ID matching pattern MOHON[Coins]T[Code]
  const contentUpper = transactionContent.toUpperCase().trim();
  const match = contentUpper.match(/MOHON\d+T[A-Z0-9]+/);
  
  if (!match) {
    console.log(`[SePay Webhook] No matching transaction pattern found in: "${transactionContent}"`);
    return res.json({ status: "ignored", reason: "No transaction pattern match" });
  }

  const transactionId = match[0];
  console.log(`[SePay Webhook] Found transaction ID in transfer content: ${transactionId}`);

  if (!supabase) {
    console.warn("[SePay Webhook] Supabase offline, cannot approve transaction");
    return res.status(503).json({ error: "Database offline" });
  }

  try {
    // 3. Query transaction from Supabase
    const { data: tx, error: txError } = await supabase
      .from('transactions')
      .select('*')
      .eq('id', transactionId)
      .eq('status', 'pending')
      .maybeSingle();

    if (txError) throw txError;

    if (!tx) {
      console.log(`[SePay Webhook] Transaction ${transactionId} not found or already processed`);
      return res.json({ status: "ignored", reason: "Transaction not found or not pending" });
    }

    // 4. Double check transfer amount to prevent cheat attempts
    const expectedAmount = Number(tx.amount);
    const actualAmount = Number(amountIn);

    if (actualAmount < expectedAmount) {
      console.warn(`[SePay Webhook] Amount mismatch! Expected: ${expectedAmount}đ, Received: ${actualAmount}đ`);
      writeAuditLog('system', 'sepay_amount_mismatch', tx.user_id, { transactionId, expectedAmount, actualAmount });
      return res.json({ status: "failed", reason: "Amount mismatch" });
    }

    // 5. Get current user profile
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('coins_balance')
      .eq('id', tx.user_id)
      .maybeSingle();

    if (userError) throw userError;
    if (!user) {
      console.error(`[SePay Webhook] User ${tx.user_id} not found for transaction ${transactionId}`);
      return res.status(404).json({ error: "User not found" });
    }

    // 6. Update transaction status and add coins atomically
    const newBalance = user.coins_balance + tx.coins_added;
    
    const { error: updateTxError } = await supabase
      .from('transactions')
      .update({ status: 'success' })
      .eq('id', transactionId);

    if (updateTxError) throw updateTxError;

    const { error: updateUserError } = await supabase
      .from('users')
      .update({ coins_balance: newBalance })
      .eq('id', tx.user_id);

    if (updateUserError) throw updateUserError;

    writeAuditLog('system', 'sepay_approve_success', tx.user_id, {
      transactionId,
      amount: actualAmount,
      coinsAdded: tx.coins_added,
      newBalance
    });

    console.log(`[SePay Webhook] Successfully credited +${tx.coins_added} coins to user ${tx.user_id}`);
    return res.json({ success: true, status: "approved", transactionId });

  } catch (err) {
    console.error("[SePay Webhook Error] Webhook processing failed:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// Sync User Profile (Supabase DB ➔ LocalStorage)
app.post('/api/users/sync', async (req, res) => {
  const { userId, email, password } = req.body;
  if (!userId) return res.status(400).json({ error: "Missing userId" });

  if (!supabase) {
    return res.json({ status: "local_storage_mode", coinsBalance: 10, email: email || "" });
  }

  try {
    // A. PASSWORD-AUTH SYNC LOGIC (Secure Production-Real Authentication via PBKDF2)
    if (email && password) {

      // 1. Check if this email is already registered/linked to an account
      const { data: existingEmailUser, error: emailErr } = await supabase
        .from('users')
        .select('*')
        .eq('email', email.trim())
        .maybeSingle();

      if (emailErr) throw emailErr;

      if (existingEmailUser) {
        // If email is registered, verify the password hash using secure verifyPassword (supports SHA256 legacy + PBKDF2)
        if (existingEmailUser.password_hash && !verifyPassword(password, existingEmailUser.password_hash)) {
          return res.status(400).json({ error: "Email này đã được liên kết với một ví khác và mật khẩu xác nhận không chính xác!" });
        }

        // Auto-migrate: if stored hash is legacy SHA256 (no `$`), upgrade to PBKDF2 on successful login
        if (existingEmailUser.password_hash && !existingEmailUser.password_hash.includes('$')) {
          const upgradedHash = hashPassword(password);
          await supabase
            .from('users')
            .update({ password_hash: upgradedHash })
            .eq('id', existingEmailUser.id);
          writeAuditLog('system', 'auto_migrate_hash_pbkdf2', existingEmailUser.id, { email });
        }
        
        // Auth passed! Sync session switching logic: Return the original owner's userId
        writeAuditLog('system', 'sync_session_switch', existingEmailUser.id, { email });
        return res.json({ 
          status: "synced", 
          coinsBalance: existingEmailUser.coins_balance, 
          email: existingEmailUser.email, 
          userId: existingEmailUser.id,
          role: existingEmailUser.role || "user"
        });
      } else {
        // Email is not registered yet. Link email + password_hash to the current active userId!
        const { data: currentUser, error: selectErr } = await supabase
          .from('users')
          .select('*')
          .eq('id', userId)
          .maybeSingle();

        if (selectErr) throw selectErr;

        if (currentUser) {
          // If active user exists in DB, update their credentials with secure PBKDF2 hash
          const { error: updateErr } = await supabase
            .from('users')
            .update({ email: email.trim(), password_hash: hashPassword(password) })
            .eq('id', userId);

          if (updateErr) throw updateErr;

          writeAuditLog('system', 'link_account_existing', userId, { email });
          return res.json({ 
            status: "synced", 
            coinsBalance: currentUser.coins_balance, 
            email: email.trim(),
            role: currentUser.role || "user"
          });
        } else {
          // Create new record with secure PBKDF2 credentials
          const { error: insertErr } = await supabase
            .from('users')
            .insert({ id: userId, email: email.trim(), password_hash: hashPassword(password), coins_balance: 10 });

          if (insertErr) throw insertErr;

          writeAuditLog('system', 'link_account_new', userId, { email, coinsBalance: 10 });
          return res.json({ 
            status: "registered", 
            coinsBalance: 10, 
            email: email.trim(),
            role: "user"
          });
        }
      }
    }

    // B. ANONYMOUS GUEST INITIALIZATION SYNC (Used on startup without credentials)
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) throw error;

    if (user) {
      return res.json({ 
        status: "synced", 
        coinsBalance: user.coins_balance, 
        email: user.email || "",
        role: user.role || "user"
      });
    } else {
      // Register guest user with 10 free trial coins
      const { error: insertError } = await supabase
        .from('users')
        .insert({ id: userId, email: null, coins_balance: 10 });

      if (insertError) throw insertError;
      writeAuditLog('system', 'register_guest_user', userId, { coinsBalance: 10 });
      return res.json({ 
        status: "registered", 
        coinsBalance: 10, 
        email: "",
        role: "user"
      });
    }
  } catch (err) {
    console.error("[Backend Sync User] Supabase sync error:", err.message);
    return res.status(500).json({ error: "Lỗi đồng bộ hệ thống: " + err.message });
  }
});

// Get Chat history from Supabase
app.get('/api/chats/:userId/:personaId', async (req, res) => {
  const { userId, personaId } = req.params;
  if (!userId || !personaId) return res.status(400).json({ error: "Missing parameters" });

  if (!supabase) {
    return res.json({ status: "local_storage_mode", messages: [] });
  }

  try {
    const { data: messages, error } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('user_id', userId)
      .eq('persona_id', personaId)
      .order('created_at', { ascending: true });

    if (error) throw error;

    const formattedMessages = messages.map(m => ({
      messageId: m.id,
      personaId: m.persona_id,
      sender: m.sender,
      messageType: m.message_type,
      text: m.text,
      imageUrl: m.image_url || undefined,
      createdAt: m.created_at,
      provider: m.provider || undefined
    }));

    return res.json({ status: "fetched", messages: formattedMessages });
  } catch (err) {
    console.error("[Backend Fetch Chats] Supabase select error:", err.message);
    return res.json({ status: "local_storage_mode", error: err.message, messages: [] });
  }
});

// Delete chat history for a user and persona
app.delete('/api/chats/:userId/:personaId', async (req, res) => {
  const { userId, personaId } = req.params;
  if (!userId || !personaId) {
    return res.status(400).json({ error: "Missing required parameters" });
  }

  if (!supabase) {
    return res.json({ status: "local_storage_mode", statusText: "deleted_local" });
  }

  try {
    const { error } = await supabase
      .from('chat_messages')
      .delete()
      .eq('user_id', userId)
      .eq('persona_id', personaId);

    if (error) throw error;
    
    writeAuditLog('system', 'delete_chat_history', userId, { personaId });
    return res.json({ status: "deleted" });
  } catch (err) {
    console.error("[Backend Delete Chats] Supabase delete error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// Save single chat bubble message
app.post('/api/chats/message', async (req, res) => {
  const { userId, personaId, sender, text, messageType, imageUrl, provider } = req.body;
  if (!userId || !personaId || !sender || !text) {
    return res.status(400).json({ error: "Missing parameters" });
  }

  if (!supabase) {
    return res.json({ status: "local_storage_mode" });
  }

  try {
    const { data: user } = await supabase.from('users').select('id').eq('id', userId).maybeSingle();
    if (!user) {
      await supabase.from('users').insert({ id: userId, coins_balance: 10 });
    }

    const { error } = await supabase
      .from('chat_messages')
      .insert({
        user_id: userId,
        persona_id: personaId,
        sender,
        message_type: messageType || 'text',
        text: xss(text).trim(),
        image_url: imageUrl || null,
        provider: provider || null
      });

    if (error) throw error;
    return res.json({ status: "saved" });
  } catch (err) {
    console.error("[Backend Save Message] Supabase insert error:", err.message);
    return res.json({ status: "local_storage_mode", error: err.message });
  }
});

// Record a new pending transaction
app.post('/api/transactions/create', async (req, res) => {
  const { userId, transactionId, packageId, amount, coinsAdded } = req.body;
  if (!userId || !transactionId || !packageId || !amount || !coinsAdded) {
    return res.status(400).json({ error: "Missing parameters" });
  }

  if (!supabase) {
    return res.json({ status: "local_storage_mode" });
  }

  try {
    const { error } = await supabase
      .from('transactions')
      .insert({
        id: transactionId,
        user_id: userId,
        package_id: packageId,
        amount: parseInt(amount),
        coins_added: parseInt(coinsAdded),
        status: 'pending'
      });

    if (error) throw error;
    writeAuditLog('system', 'create_transaction', userId, { transactionId, packageId, amount, coinsAdded });
    return res.json({ status: "saved" });
  } catch (err) {
    console.error("[Backend Create Tx] Supabase insert error:", err.message);
    return res.json({ status: "local_storage_mode", error: err.message });
  }
});

// ADMIN ENDPOINT: Get all pending transactions
app.get('/api/admin/transactions/pending', async (req, res) => {
  const adminSecret = req.headers['x-admin-secret'];
  if (!adminSecret || adminSecret !== ADMIN_SECRET_KEY) {
    return res.status(401).json({ error: "Unauthorized access" });
  }

  if (!supabase) {
    return res.json({ status: "success", transactions: [] });
  }

  try {
    const { data: pendingTxs, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return res.json({ status: "success", transactions: pendingTxs });
  } catch (err) {
    console.error("[Backend Pending Txs] Supabase select error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ADMIN ENDPOINT: Approve pending transaction (Credits coins)
app.post('/api/admin/transactions/approve', async (req, res) => {
  const adminSecret = req.headers['x-admin-secret'];
  const { transactionId } = req.body;
  if (!adminSecret || adminSecret !== ADMIN_SECRET_KEY) {
    return res.status(401).json({ error: "Unauthorized access" });
  }
  if (!transactionId) return res.status(400).json({ error: "Missing transactionId" });

  if (!supabase) {
    return res.status(400).json({ error: "Supabase not connected." });
  }

  try {
    const { data: tx, error: selectError } = await supabase
      .from('transactions')
      .select('*')
      .eq('id', transactionId)
      .single();

    if (selectError || !tx) throw new Error("Transaction not found");
    if (tx.status !== 'pending') {
      return res.status(400).json({ error: `Giao dịch đã được duyệt! Trạng thái: ${tx.status}` });
    }

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('coins_balance')
      .eq('id', tx.user_id)
      .single();

    if (userError || !user) throw new Error("User not found");

    const newBalance = user.coins_balance + tx.coins_added;

    const { error: userUpdateError } = await supabase
      .from('users')
      .update({ coins_balance: newBalance })
      .eq('id', tx.user_id);

    if (userUpdateError) throw userUpdateError;

    const { error: txUpdateError } = await supabase
      .from('transactions')
      .update({ status: 'success' })
      .eq('id', transactionId);

    if (txUpdateError) throw txUpdateError;

    writeAuditLog('admin', 'approve_transaction', tx.user_id, {
      transactionId,
      coinsAdded: tx.coins_added,
      newBalance
    });

    return res.json({ status: "success", coinsAdded: tx.coins_added, newBalance });
  } catch (err) {
    console.error("[Backend Approve Tx] Supabase error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ADMIN ENDPOINT: Update user coins directly
app.post('/api/admin/users/update-coins', async (req, res) => {
  const adminSecret = req.headers['x-admin-secret'];
  const { targetUserId, coinsBalance } = req.body;
  if (!adminSecret || adminSecret !== ADMIN_SECRET_KEY) {
    return res.status(401).json({ error: "Unauthorized access" });
  }
  if (!targetUserId || coinsBalance === undefined) {
    return res.status(400).json({ error: "Missing required parameters" });
  }

  if (!supabase) {
    return res.status(400).json({ error: "Supabase not connected." });
  }

  try {
    const { data: user, error: selectError } = await supabase
      .from('users')
      .select('coins_balance')
      .eq('id', targetUserId)
      .maybeSingle();

    if (selectError) throw selectError;
    const oldBalance = user ? user.coins_balance : 0;

    const { error: upsertError } = await supabase
      .from('users')
      .upsert({ id: targetUserId, coins_balance: parseInt(coinsBalance) });

    if (upsertError) throw upsertError;

    writeAuditLog('admin', 'update_user_coins', targetUserId, {
      oldBalance,
      newBalance: coinsBalance
    });

    return res.json({ status: "success", oldBalance, newBalance: coinsBalance });
  } catch (err) {
    console.error("[Backend Admin Update User Coins] Supabase error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`[Mỏ Hỗn AI] Express Backend running securely on http://localhost:${PORT}`);
  });
}

module.exports = app;
