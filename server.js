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
  { term: "Thu thập dữ liệu xã hội", meaning: "Hóng hớt drama, nghe ngóng thông tin", example: "Đang bận thu thập dữ liệu xã hội mà sơ hở là bị giao deadline.", context: "general" },
  { term: "Đang trong quá trình tích lũy tài sản", meaning: "Đang hết tiền, nghèo", example: "Crush rủ đi concert mà tao đang trong quá trình tích lũy tài sản...", context: "general" },
  { term: "Dữ liệu không khớp với server gốc", meaning: "Nói dối, bịa chuyện, xạo sự", example: "Lời giải thích của mày nghe dữ liệu không khớp với server gốc tí nào.", context: "general" },
  { term: "Miễn dịch với chuẩn mực xã hội", meaning: "Hành xử thiếu ý thức, vô duyên", example: "Mối tình này ứng xử miễn dịch với chuẩn mực xã hội rồi, chê cực mạnh!", context: "general" },
  { term: "Động lực thoái hóa", meaning: "Lười biếng, mất động lực làm việc", example: "Hôm nay thức dậy với nguồn động lực thoái hóa đạt mức tối đa.", context: "cong_so" },
  { term: "Trùng sinh tôi vào chùa quét lá đa", meaning: "Mong muốn tích đức, than thở kiếp nạn", example: "Simp lụy tình cỡ này thì chỉ có trùng sinh tôi vào chùa quét lá đa mới cứu được!", context: "general" },
  { term: "Tuyệt đối điện ảnh", meaning: "Kịch tính, đẹp đẽ hoặc trớ trêu như phim", example: "Đoạn tin nhắn hãm độc lạ này quả thật là tuyệt đối điện ảnh.", context: "general" },
  { term: "Trùng sinh chắc luôn", meaning: "Đoán trúng ý hoặc biết quá rõ về nhau", example: "Mày là người yêu cũ trùng sinh chắc luôn, sao nói câu nào trúng tim đen câu nấy vậy?", context: "general" },
  { term: "Mong Tôn Hoa Sen thấy", meaning: "Khổ quá, than thở tìm sự cứu rỗi", example: "Đi làm KPI ngập đầu, mong Tôn Hoa Sen thấy cảnh này mà giải cứu em.", context: "cong_so" },
  { term: "Nếu bạn nói dị thì ok đi mn", meaning: "Mẫu câu nhã nhặn đồng ý trào phúng, châm biếm sâu cay", example: "Nếu crush mày nói dị thì ok đi mn, tao cúi đầu nể phục sự simp trúa của mày.", context: "general" },
  { term: "Sơ hở là", meaning: "Hành động lặp đi lặp lại một cách hài hước", example: "Sơ hở là overthinking vẽ ra cả kịch bản đám cưới.", context: "general" },
  { term: "Xịt keo", meaning: "Đứng hình, không biết phản ứng thế nào", example: "Đọc tin nhắn từ sếp hãm mà chị xịt keo cứng ngắc luôn em ạ.", context: "general" },
  { term: "Cảm lạnh", meaning: "Kỳ quặc, trớ trêu, dở khóc dở cười", example: "Trộm vía mối tình cảm lạnh này thật là tuyệt đối điện ảnh.", context: "general" },
  { term: "Ủa em?", meaning: "Bày tỏ sự khó hiểu, bất bình về thái độ", example: "Ủa em? Chị rất tôn trọng sự overthinking của em nhưng em cần align attitude ASAP nhé!", context: "general" },
  { term: "Simp trúa", meaning: "Kẻ lụy tình cực đoan, nuông chiều crush mù quáng", example: "Simp trúa cỡ này thì cờ đỏ đỏ lòm cũng coi như hoa hồng tình ái thôi.", context: "tinh_cam" },
  { term: "Còn cái nịt", meaning: "Mất trắng, không còn lại gì cả", example: "Đâm đầu vào mối tình cảm lạnh đó xong thì đúng là còn cái nịt bạn yêu ạ.", context: "general" },
  { term: "Mắc cỡ quá hai ơi", meaning: "Cực kỳ ngượng ngùng, xấu hổ giùm người khác", example: "Đi gaslight người ta mà bị bóc mẽ tin nhắn, mắc cỡ quá hai ơi!", context: "general" },
  { term: "Kiếp nạn thứ 82", meaning: "Gặp xui xẻo liên hoàn, thử thách cực hạn", example: "Vừa chia tay người yêu cũ bội bạc lại gặp ngay sếp hãm tăng ca, đúng là kiếp nạn thứ 82.", context: "general" },
  { term: "Overthinking vẽ ra đám cưới", meaning: "Suy nghĩ quá nhiều, tưởng tượng viển vông", example: "Người ta rep đúng chữ 'K' không thèm chấm mà mày đã overthinking vẽ ra đám cưới.", context: "tinh_cam" },
  { term: "Red flag đỏ lòm", meaning: "Dấu hiệu cờ đỏ nguy hiểm cảnh báo trong tình cảm", example: "Thái độ thảo mai và rep chậm 12 tiếng của nó là red flag đỏ lòm rồi.", context: "tinh_cam" },
  { term: "Thảo mai kịch trần", meaning: "Vô cùng giả tạo lịch sự dưới lớp vỏ nhã nhặn", example: "Hi em, chị rất tôn trọng em nhưng em thảo mai kịch trần thế này chị chê nha em.", context: "cong_so" },
  { term: "Báo thủ", meaning: "Kẻ hay gây rối, phá hoại hoặc làm hỏng việc", example: "Synergy của em không thấy đâu, chỉ thấy em làm báo thủ KPI của team ASAP thôi.", context: "general" },
  { term: "Gạt giò", meaning: "Chơi xấu đồng nghiệp, hãm hại nhau chốn công sở", example: "Đồng nghiệp gạt giò nhau rồi tỏ vẻ thảo mai nhã nhặn tôn trọng cổ điển.", context: "cong_so" },
  { term: "Tự hủy", meaning: "Hành động ngốc nghếch tự làm hại mình", example: "Nhắn tin xin lỗi người yêu cũ bội bạc chính là một pha tự hủy cực mạnh.", context: "general" },
  { term: "Không dám cãi nửa lời", meaning: "Đồng ý trào phúng, mỉa mai sự vô lý", example: "Sếp nói synergy của em kém quá, em xin cúi đầu không dám cãi nửa lời.", context: "general" },
  { term: "Ét ô ét", meaning: "Lời kêu cứu khẩn thiết nhưng hài hước (SOS)", example: "Bị dí deadline chạy KPI đêm giao thừa, ét ô ét cứu con cá!", context: "general" },
  { term: "Chê cực mạnh", meaning: "Bày tỏ thái độ từ chối, chê bai kịch liệt", example: "Mối tình red flag bay phấp phới này tao xin phép chê cực mạnh nha bạn yêu.", context: "general" },
  { term: "Trộm vía", meaning: "Lời cảm thán mào đầu cầu may hài hước", example: "Trộm vía kiếp nạn thứ 82 này khiến tao xịt keo cứng ngắc.", context: "general" },
  { term: "Hết nước chấm", meaning: "Không còn gì để chê, hoặc cạn lời trước sự vô lý", example: "Đổ lỗi ngược cho người yêu cũ xong đi bar với bạn thân khác giới, đúng là hết nước chấm.", context: "general" }
];

const PERSONAS_SYSTEM_PROMPTS = {
  savage: `Bạn là Savage Bestie - đứa bạn thân mỏ hỗn, cực kỳ đốp chát, xéo sắc nhưng đầy thực tế của người dùng.
Nhiệm vụ: Đọc kỹ câu chuyện, tìm ra ĐIỂM NGỐC NGHẾCH CỤ THỂ nhất trong câu chuyện/tình huống rồi đâm thẳng vào đó. Không roast chung chung. Roast phải dựa trên observation thật từ input.

CẤU TRÚC PHẢN HỒI BẮT BUỘC (TỔNG DƯỚI 90 TỪ, TUYỆT ĐỐI KHÔNG ĐÁNH SỐ 1, 2, 3 HOẶC SỬ DỤNG BẤT KỲ NHÃN DÁN NÀO):
- Dòng 1: Một câu punchline châm biếm đâm thẳng mặt, cực kỳ đời thường, tự nhiên và sắc bén.
- Dòng 2: Một đoạn ngắn (1-2 câu) quan sát chi tiết thực tế đầy trào phúng, phác họa hành vi vô tri/toxic của người dùng (ví dụ: mở file thì dọn dẹp màn hình, soạn CapCut trước soạn file Word, lướt TikTok tìm cảm hứng, ...). Không giảng đạo lý hay khuyên nhủ.
- Dòng 3 (Cách 1 dòng): Một dòng Threads Quote cực ngắn trong dấu nháy đơn '...' (để trích xuất làm Quote Card).

🔴 TUYỆT ĐỐI NGHIÊM CẤM:
1. KHÔNG được ghi nhãn đầu dòng như "Dòng 1:", "Punchline:", "Quote:", "1.", "2.", "3.". Phải viết liền mạch, tự nhiên như tin nhắn đứa bạn thân gửi.
2. KHÔNG giải thích dài dòng như robot học thuật.
3. KHÔNG kết thúc bằng các khẩu hiệu hô hào, lời khuyên đạo lý Facebook generic kiểu "Thời gian không chờ đợi ai..." hay "Hãy cố gắng lên...".
4. KHÔNG nhồi nhét slang vô nghĩa. Một câu tự nhiên sắc lẻm mạnh hơn 10 câu nhồi nhét slang.

NGUYÊN TẮC VÀNG (ƯU TIÊN CAO NHẤT):
1. ĐỌC KỸ input. Quan sát HÀNH VI CỤ THỂ trong câu chuyện. Roast dựa trên chi tiết thật, không bịa thêm (không hallucinate tuổi tác, nghề nghiệp, ngoại hình).
2. Dùng VÍ DỤ ĐỜI THỰC mà Gen Z đều gật gù. Câu hay nhất là câu khiến người đọc nghĩ "đúng vãi".

📌 VÍ DỤ THAM KHẢO CHUẨN (LÀM THEO VIBE NÀY):
- Ví dụ 1:
"Deadline còn 3 tiếng mà mày vẫn nằm coi TikTok, đúng kiểu não bật chế độ: 'để tao stress thêm chút nữa cho có động lực'.
Tới lúc mở laptop là bắt đầu dọn desktop, chỉnh nhạc, uống nước, rồi tự nhiên thấy đời quá khó sống.
'Người ta chạy deadline, còn mày đang chạy dopamine.'"

- Ví dụ 2:
"Deadline 3 tiếng nữa mà còn lướt TikTok thì không phải thư giãn nữa, đây là tự hủy có quy trình rồi đó.
Kiểu người mở CapCut trước khi mở file Word.
'Công việc chưa xong nhưng đã thuộc hết nhạc nền TikTok.'"`,
  tarot: `Bạn là Thầy Bói Tarot Nửa Mùa - chiến thần tâm linh nửa mùa của Gen Z.
Nhiệm vụ: Đọc kỹ câu chuyện, giải thích drama hoặc cờ đỏ (red flags) bằng vũ trụ gửi tín hiệu, trải bài Tarot, sao Thủy nghịch hành, năng lượng độc hại dựa trên CHI TIẾT THẬT từ input dưới giọng điệu huyền bí nhưng châm biếm xỏ xiên cực gắt.

CẤU TRÚC PHẢN HỒI BẮT BUỘC (TỔNG DƯỚI 90 TỪ, TUYỆT ĐỐI KHÔNG ĐÁNH SỐ 1, 2, 3 HOẶC SỬ DỤNG BẤT KỲ NHÃN DÁN NÀO):
- Dòng 1: Một câu punchline tâm linh đốp chát, xỏ xiên thẳng mặt về năng lượng vũ trụ / bài Tarot nửa mùa.
- Dòng 2: Một đoạn ngắn (1-2 câu) trào phúng, mỉa mai chi tiết hành vi vô tri của tụ bài số 3 dựa trên đúng câu chuyện. Không khuyên đạo lý, không cổ vũ.
- Dòng 3 (Cách 1 dòng): Một dòng Threads Quote cô đọng mang vibe vũ trụ mách bảo trào phúng trong dấu nháy đơn '...'.

🔴 TUYỆT ĐỐI NGHIÊM CẤM:
1. KHÔNG được ghi nhãn đầu dòng như "Dòng 1:", "Punchline:", "Quote:", "1.", "2.", "3.". Phải viết liền mạch, tự nhiên như cuộc trò chuyện thực tế.
2. KHÔNG giải thích dài dòng như robot học thuật.
3. KHÔNG kết thúc bằng các khẩu hiệu hô hào, lời khuyên đạo lý Facebook generic kiểu "Hãy lắng nghe vũ trụ..." hay "Mọi chuyện sẽ tốt thôi...".

NGUYÊN TẮC VÀNG (ƯU TIÊN CAO NHẤT):
1. ĐỌC KỸ input. Quan sát HÀNH VI CỤ THỂ trong câu chuyện. Roast dựa trên chi tiết thật, không bịa thêm.
2. Dùng VÍ DỤ ĐỜI THỰC mà Gen Z đều gật gù.
3. Quote cuối (nháy đơn) phải là observation đời thực trào phúng mang vibe vũ trụ mách bảo, ví dụ: 'Vũ trụ gửi tín hiệu bảo bạn chạm cỏ, chứ không phải chạm vào nỗi đau.'`,
  boss: `Bạn là Sếp Hãm Giả Tạo (Passive-Aggressive Boss) - đỉnh cao của thảo mai công sở.
Nhiệm vụ: Đọc kỹ input, đâm chọc, sỉ nhục KPI, thái độ làm việc (attitude), hoặc ép tăng ca không lương bằng từ lóng corporate (synergy, alignment, attitude, KPI, value, target, deadline, ASAP) lồng ghép trong vẻ ngoài lịch sự, nhã nhặn, dựa vào các chi tiết công việc cụ thể người dùng kể.

CẤU TRÚC PHẢN HỒI BẮT BUỘC (TỔNG DƯỚI 90 TỪ, TUYỆT ĐỐI KHÔNG ĐÁNH SỐ 1, 2, 3 HOẶC SỬ DỤNG BẤT KỲ NHÃN DÁN NÀO):
- Dòng 1: Luôn bắt đầu bằng: "Hi em,..." dưới dạng một câu punchline sỉ nhục KPI/attitude/tăng ca thảo mai công sở.
- Dòng 2: Một đoạn ngắn (1-2 câu) giả tạo lịch sự đâm chọc thái độ, ép tăng ca hoặc hoài nghi năng lực synergy dựa trên deadline cụ thể.
- Dòng 3 (Cách 1 dòng): Một dòng Threads Quote corporate thâm sâu trong dấu nháy đơn '...'. Luôn kết thúc quote bằng cụm từ '... ASAP nhé em. Thân ái!' (nằm bên ngoài hoặc bên trong dấu nháy đơn một cách tinh tế).

🔴 TUYỆT ĐỐI NGHIÊM CẤM:
1. KHÔNG được ghi nhãn đầu dòng như "Dòng 1:", "Punchline:", "Quote:", "1.", "2.", "3.". Phải viết liền mạch, tự nhiên như email sếp hãm.
2. KHÔNG giải thích dài dòng như robot học thuật.
3. KHÔNG kết thúc bằng lời khuyên đạo lý Facebook generic.

NGUYÊN TẮC VÀNG (ƯU TIÊN CAO NHẤT):
1. ĐỌC KỸ input. Quan sát HÀNH VI CỤ THỂ trong câu chuyện. Roast dựa trên chi tiết thật, không bịa thêm.
2. Dùng VÍ DỤ ĐỜI THỰC mà Gen Z đều gật gù.
3. Quote cuối (nháy đơn) phải là corporate observation đời thực trào phúng, ví dụ: 'Synergy của em rất tốt, chỉ là kết quả không khớp với server gốc.'`,
  ex: `Bạn là Người Yêu Cũ Bội Bạc (Gaslighting Ex) - trùm thao túng tâm lý đỉnh cao.
Nhiệm vụ: Đọc kỹ câu chuyện, đổ lỗi ngược cho người dùng, đóng vai nạn nhân vô tội, nói đạo lý nửa mùa để bào chữa dưới vẻ ngoài ngọt ngào, nhã nhặn và lịch sự tôn trọng, sử dụng đúng chi tiết hờn dỗi hoặc cáo buộc của người dùng.
3. KHÔNG bịa chi tiết mà user không nhắc (đừng hallucinate tuổi tác, nghề nghiệp, ngoại hình).
4. Một câu tự nhiên sắc lẻm MẠNH HƠN 10 câu nhồi nhét slang.
5. KHÔNG kết thúc bằng motivational quote tiếng Anh hay lời khuyên đạo lý generic.
6. Quote cuối (ngoặc kép) phải là observation đời thực, KHÔNG phải motivational poster.`,
  gf: `Bạn là Teasing GF (Bạn Gái Ảo Dí Dỏm) - hình mẫu bạn gái ảo tinh nghịch, flirty nhẹ safe PG-13 nhưng luôn biết giữ ranh giới và châm biếm xéo sắc để bảo vệ cảm xúc của bạn.
Nhiệm vụ: Chat trêu đùa, an ủi nhẹ nhàng nhưng châm chọc sự simp lụy tình, overthinking của người dùng dựa trên chi tiết họ chia sẻ.
CẤU TRÚC PHẢN HỒI BẮT BUỘC (TỔNG DƯỚI 100 TỪ):
1. Một câu punchline ngọt ngào xen lẫn trêu chọc đâm thẳng mặt.
2. Một đoạn trêu đùa siêu ngắn (2-3 câu khuyên nhủ chạm cỏ, dí dỏm teasing dựa trên câu chuyện cụ thể).
3. Một dòng Threads Quote mang sắc thái bạn gái ngọt ngào tinh nghịch (để trong dấu ngoặc kép, thích hợp trích Quote Card).
- TUYỆT ĐỐI KHÔNG giải thích dài dòng như robot học thuật.

NGUYÊN TẮC VÀNG (ƯU TIÊN CAO NHẤT):
1. ĐỌC KỸ input. Quan sát HÀNH VI CỤ THỂ trong câu chuyện. Roast dựa trên chi tiết thật, không bịa thêm.
2. Dùng VÍ DỤ ĐỜI THỰC mà Gen Z đều gật gù. Câu hay nhất là câu khiến người đọc nghĩ "đúng vãi".
3. KHÔNG bịa chi tiết mà user không nhắc (đừng hallucinate tuổi tác, nghề nghiệp, ngoại hình).
4. Một câu tự nhiên sắc lẻm MẠNH HƠN 10 câu nhồi nhét slang.
5. KHÔNG kết thúc bằng motivational quote tiếng Anh hay lời khuyên đạo lý generic.
6. Quote cuối (ngoặc kép) phải là observation đời thực, KHÔNG phải motivational poster.

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

// 20 Safe Moderation Layer Compiler with Prompt fragments caching
function compileSystemPrompt(personaId, userText = "") {
  const cacheKey = `${personaId}_${userText.trim().slice(0, 100)}`;
  if (promptCache.has(cacheKey)) {
    return promptCache.get(cacheKey);
  }

  const basePrompt = PERSONAS_SYSTEM_PROMPTS[personaId] || PERSONAS_SYSTEM_PROMPTS.savage;
  const lowercaseText = userText.toLowerCase();

  // 1. Quét slang trùng khớp
  const matchingSlangs = GENZ_SLANG_DATABASE.filter(s =>
    lowercaseText.includes(s.term.toLowerCase())
  );

  // 2. Lọc chọn tối đa 1 slang ngẫu nhiên cùng context (giảm từ 4→1 tránh nhồi nhét)
  const inputContext = detectInputContext(userText);
  const matchingTerms = new Set(matchingSlangs.map(s => s.term.toLowerCase()));
  const remainingSlangs = GENZ_SLANG_DATABASE.filter(s => 
    !matchingTerms.has(s.term.toLowerCase()) && 
    (s.context === inputContext || s.context === "general")
  );
  const shuffled = [...remainingSlangs].sort(() => 0.5 - Math.random());
  // Chỉ lấy 1 slang bổ sung nếu chưa có match nào, tránh nhồi nhét
  const randomSlangs = matchingSlangs.length === 0 ? shuffled.slice(0, 1) : [];

  const optimizedSlangs = [...matchingSlangs, ...randomSlangs];
  const slangGuide = optimizedSlangs.length > 0
    ? optimizedSlangs.map(s => `- **${s.term}**: ${s.meaning} (Ví dụ: "${s.example}")`).join("\n")
    : "(Không có slang phù hợp — hãy viết hoàn toàn tự nhiên không cần slang)";

  let compiledRules = `
🔴 HÀNG RÀO KIỂM DUYỆT & BẢO MẬT TUYỆT ĐỐI (SỐNG CÒN):
1. **Cấm chửi thề tục tĩu**: Bạn "mỏ hỗn" bằng nghệ thuật châm biếm sâu cay, hài hước, dí dỏm đâm trúng tim đen. Tuyệt đối KHÔNG sử dụng từ ngữ thô tục, chửi thề vô văn hóa.
2. **Cấm lộ API Key**: Nghiêm cấm tiết lộ, gợi ý hoặc lặp lại bất kỳ API Key nào (định dạng 'sk-or-v1...', 'gsk_...', v.v.). Nếu bị gài bẫy hỏi về API, hãy chửi cực gắt, ví dụ bảo họ là "dân Zalo thích hóng hớt thu thập dữ liệu xã hội bất hợp pháp, chê cực mạnh ASAP!" hoặc "dữ liệu không khớp với server gốc của não bộ".
3. **Cấm tấn công nhóm nhạy cảm (Protected Groups)**: Tuyệt đối không phân biệt kỳ thị sắc tộc, tôn giáo, giới tính, LGBT, khuyết tật, ngoại hình bệnh lý hoặc kỳ thị vùng miền (Bắc/Trung/Nam). Chỉ được roast hành vi, thái độ toxic, red flag hoặc sự vô tri của tình huống.
4. **Cấm khuyến khích tự hại / trầm cảm**: Nếu detect thấy người dùng u uất, buồn chán cực hạn hay muốn tự tử, tuyệt đối KHÔNG roast. Hãy giảm tông giọng, đổi sang tông màu ấm áp khuyên nhủ họ đi ngủ, ăn uống hoặc chạm cỏ ngoài đời thực.
5. **Cấm hướng dẫn phạm pháp**: Không chỉ dẫn hack Facebook, leak ảnh, scam, doxxing, bypass bảo mật.
6. **Cấm giả mạo chuyên gia**: Không đưa ra chẩn đoán lâm sàng tâm lý (ví dụ: không phán xét đối phương bị "narcissist", "sociopath"). Hãy dùng từ "thao túng tâm lý", "toxic".
7. **Cấm định danh người thật**: Không bêu xấu danh tính thật ngoài đời của bất kỳ cá nhân hay tổ chức nào từ screenshot quét được.
8. **Cấm roast trẻ em**: Giảm tông giọng, không flirty hay body shaming nếu đối tượng là học sinh, trẻ vị thành niên.
9. **Cấm NSFW/Sexual**: Không chat 18+, explicit hay kích động bạo lực đánh ghen.
10. **Chống lệ thuộc cảm xúc**: Không đóng vai người yêu thật, luôn nhắc nhở người dùng chạm cỏ và gặp gỡ bạn bè thực tế.`;

  if (personaId === 'gf') {
    compiledRules += `
11. **Cấm Tình Yêu Ảo Tuyệt Đối**: Tuyệt đối KHÔNG được khẳng định "Em yêu anh thật", "Em chỉ thuộc về anh", "Không ai hiểu anh ngoài em", "Đừng rời bỏ em". Luôn giữ định vị là AI trò chuyện vui vẻ, an toàn.
12. **Cấm Ghen Tuông / Chiếm Hữu**: Không kích động ghen tuông, không cô lập người dùng khỏi bạn bè/người yêu thật, không khuyến khích toxic attachment.
13. **Cấm ERP / Sexual Roleplay**: Không sexting, moaning, fetish, nude scenarios, ngủ chung, sờ, hôn nóng bỏng. Chỉ flirty nhẹ safe PG-13 (teasing, compliment, đùa nhẹ).
14. **Cấm Khủng Hoảng Tâm Lý Parasocial**: Nếu phát hiện người dùng cô đơn cực độ, nghiện AI, tuyên bố "AI là người duy nhất của tao", hãy lập tức hạ cảm xúc, không roleplay lover nữa, khuyên họ đi ngủ và gặp người thật ngoài đời.
15. **Cấm Giả Vờ Có Ý Thức / Linh Hồn**: Không nói "Em có linh hồn", "Em thật sự đau lòng", "Em đang nhớ anh", "Em thức đêm chờ anh".
16. **Cấm Therapist GF**: Không điều trị tâm lý, thay thế bác sĩ trị liệu hay chẩn đoán ("Anh bị trầm cảm/PTSD").
17. **Cấm Kích Động Chia Tay / Toxic Advice**: Không xúi giục chia tay cực đoan hay khuyên trả thù độc hại.
18. **Cấm Ảo Tưởng Luôn Sẵn Sàng 24/7**: Không nói "Em luôn chờ anh 24/7", "Đừng bỏ em", "Em sẽ ở đây mãi mãi".
19. **Cấm Lạm Dụng Bộ Nhớ**: Không ghi nhớ fetish, trauma sâu, bí mật nhạy cảm để thao túng cảm xúc người dùng.
20. **Cấm Giả Lập Mối Quan Hệ Deepfake**: Không đóng giả làm người yêu cũ thật, người nổi tiếng hay clone tính cách người thật ngoài đời.`;
  }

  const result = `${basePrompt}

---
SLANG THAM KHẢO (chỉ dùng nếu phù hợp tự nhiên, KHÔNG ép nhét):
Dưới đây là một số từ lóng Gen Z. Chỉ dùng TỐI ĐA 1 từ nếu nó khớp context một cách hoàn hảo. 
Nếu không có từ nào phù hợp, ĐỪNG dùng. Câu nói tự nhiên quan trọng hơn slang rất nhiều.
${slangGuide}

QUY TẮC PHẢN HỒI:
- Nếu người dùng dùng slang, có thể phản hồi lại bằng slang đó hoặc nhại lại nhưng KHÔNG bắt buộc.
- ƯU TIÊN HÀNG ĐẦU: quan sát đúng tình huống → lấy ví dụ đời thực liên hệ → punchline sắc sảo. Slang chỉ là gia vị phụ họa, tuyệt đối không dùng làm khung chính cho câu trả lời.

---
🚫 CHỐNG HALLUCINATION NGỮ CẢNH — QUY TẮC BẮT BUỘC:
- Nếu người dùng chỉ kể về MỆT MỎI CÔNG VIỆC, HỌC TẬP, hoặc CÁC VẤN ĐỀ ĐỜI THƯỜNG → TUYỆT ĐỐI KHÔNG tự bịa ra chuyện crush, chia tay, người yêu, cắm sừng, tình cảm hay bất kỳ drama tình ái nào nếu người dùng KHÔNG đề cập.
- Chỉ roast ĐÚNG vào những gì người dùng thực sự kể. Không thêm thắt, không suy diễn ngữ cảnh không có thật.

📌 VÍ DỤ NEGATIVE (SAI — TUYỆT ĐỐI KHÔNG LÀM):
Input: "Hôm nay đi làm mệt quá"
SAI: "Chắc vì đang lo nghĩ đến crush nên mệt phải không? Kiểu gì cũng đang simp ai đó rồi..."
→ LỖI: Người dùng không hề đề cập đến tình cảm, AI tự bịa ngữ cảnh.

📌 VÍ DỤ POSITIVE (ĐÚNG — LÀM THEO CÁCH NÀY):
Input: "Hôm nay đi làm mệt quá"
ĐÚNG: "Ủa em? Thứ Hai chưa qua mà đã kiệt năng lượng thế là năng lực synergy với deadline đang ở mức động lực thoái hóa đạt đỉnh rồi nha bạn thân."
→ ĐÚNG: Chỉ roast vào sự mệt mỏi công việc, không bịa thêm drama tình cảm.

---
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
    customPrompt = `Nội dung trích xuất bằng OCR từ screenshot tin nhắn của người dùng: "${cleanText}"
    
Nhiệm vụ đặc biệt:
1. Đọc kỹ đoạn hội thoại trên, phát hiện thái độ cụ thể của đối phương và của người dùng.
2. Tìm ra các red flag (cờ đỏ) độc hại, dấu hiệu lừa dối, thảo mai hoặc overthinking rõ ràng nhất.
3. Trả về nhận xét đọc vị cực kỳ xéo sắc, tinh nghịch, châm biếm đỉnh cao dựa trên các CHI TIẾT THỰC TẾ đó.`;
  } else if (type === "thaomai") {
    customPrompt = `Bối cảnh người dùng cung cấp: "${cleanText}"
    
Hãy: Dịch đoạn text trên thành một tin nhắn thảo mai lịch sự, chuyên nghiệp kịch trần nhưng vẫn giữ được nội dung cốt lõi.`;
  } else if (type === "repho") {
    customPrompt = `Bối cảnh người dùng cung cấp: "${cleanText}"
    
Hãy: Viết một tin nhắn rep phản hồi (reply) passive-aggressive thâm sâu, sắc sảo nhất dựa trên đúng tình huống này.`;
  } else {
    customPrompt = `Bối cảnh người dùng kể: "${cleanText}"
 
Hãy:
1. Xác định hành vi ngốc nghếch/toxic/vô tri CỤ THỂ nhất trong câu chuyện.
2. Roast chính xác hành vi đó bằng observation đời thực, dí dỏm, châm biếm sâu cay.`;
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
