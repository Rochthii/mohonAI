/**
 * =====================================================================
 * MỎ HỖN AI - SECURE LIGHTWEIGHT CLIENT AI SERVICE
 * =====================================================================
 * Calls backend API proxy to keep API keys and prompt designs 100% secure.
 */

export interface ChatPersona {
  id: string;
  name: string;
  avatar: string;
  description: string;
  systemPrompt: string;
  fallbackResponses: string[];
}

export const PERSONAS: Record<string, ChatPersona> = {
  savage: {
    id: "savage",
    name: "Mỏ Hỗn Xéo Sắc",
    avatar: "SB",
    description: "Savage Bestie - Đứa bạn thân mỏ hỗn, sơ hở là chửi nhưng nói câu nào ngấm câu đấy.",
    systemPrompt: "",
    fallbackResponses: []
  },
  tarot: {
    id: "tarot",
    name: "Thầy Bói Tarot Nửa Mùa",
    avatar: "TR",
    description: "Trùm Chiêm Tinh - Giải mã mọi kiếp nạn bằng vũ trụ, sao Thủy nghịch hành và tụ bài số 3.",
    systemPrompt: "",
    fallbackResponses: []
  },
  boss: {
    id: "boss",
    name: "Sếp Hãm Giả Tạo",
    avatar: "BS",
    description: "Passive-Aggressive Boss - Đỉnh cao thảo mai công sở, sỉ nhục KPI tinh tế và ép tăng ca ASAP.",
    systemPrompt: "",
    fallbackResponses: []
  },
  ex: {
    id: "ex",
    name: "Người Yêu Cũ Bội Bạc",
    avatar: "EX",
    description: "Gaslighting Ex - Trùm thao túng tâm lý, đổ lỗi ngược, tỏ vẻ nhã nhặn đạo lý nửa mùa.",
    systemPrompt: "",
    fallbackResponses: []
  },
  gf: {
    id: "gf",
    name: "Bạn Gái Ảo Teasing",
    avatar: "GF",
    description: "Teasing GF - Hình mẫu bạn gái ảo tinh nghịch, flirty nhẹ safe PG-13, hay trêu đùa và bắt chạm cỏ.",
    systemPrompt: "",
    fallbackResponses: []
  }
};

// Automatic Endpoint configuration (Vercel relative proxy in production, local Express port 5000 in dev)
const BACKEND_BASE = import.meta.env.PROD ? "" : "http://localhost:5000";
const BACKEND_URL = `${BACKEND_BASE}/api/roast`;

export async function generateRoast(
  personaId: string,
  text: string,
  type: 'roast' | 'thaomai' | 'repho' = 'roast',
  userId?: string
): Promise<{ text: string; provider: 'groq' | 'openrouter' | 'gemini' | 'offline' }> {
  try {
    const response = await fetch(BACKEND_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ personaId, text, type, userId })
    });

    if (!response.ok) {
      throw new Error(`Server responded with ${response.status}`);
    }

    return await response.json();
  } catch (err) {
    console.error("[Client Service] API Proxy fetch failed:", err);
    return {
      text: "Ủa bạn yêu ơi, mạng mẽo của mày đang trong quá trình tích lũy tài sản hay sao mà load chậm thế? Đợi một tí rồi thử sấy lại nha!",
      provider: 'offline'
    };
  }
}

export async function analyzeScreenshot(
  personaId: string,
  extractedText: string,
  userId?: string
): Promise<{ text: string; provider: 'groq' | 'openrouter' | 'gemini' | 'offline' }> {
  try {
    const response = await fetch(BACKEND_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ personaId, text: extractedText, type: 'screenshot', userId })
    });

    if (!response.ok) {
      throw new Error(`Server responded with ${response.status}`);
    }

    return await response.json();
  } catch (err) {
    console.error("[Client Service] Vision API Proxy fetch failed:", err);
    return {
      text: "Quét tin nhắn hãm loét xong mà server bị xịt keo mất tiêu rồi. Mày copy thử dòng chữ dán thẳng vào ô chat sấy trực tiếp xem sao!",
      provider: 'offline'
    };
  }
}

// --- SUPABASE DATABASE SYNC HELPERS ---

export async function syncUserProfileDB(
  userId: string,
  email?: string
): Promise<{ status: string; coinsBalance: number; email: string }> {
  try {
    const response = await fetch(`${BACKEND_BASE}/api/users/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, email })
    });
    if (!response.ok) throw new Error("Sync failed");
    return await response.json();
  } catch (e) {
    console.warn("[Client DB Service] Profile sync fallback:", e);
    return { status: "local_storage_mode", coinsBalance: 10, email: email || "" };
  }
}

export async function fetchChatHistoryDB(
  userId: string,
  personaId: string
): Promise<any[]> {
  try {
    const response = await fetch(`${BACKEND_BASE}/api/chats/${userId}/${personaId}`);
    if (!response.ok) throw new Error("Fetch failed");
    const data = await response.json();
    return data.messages || [];
  } catch (e) {
    console.warn("[Client DB Service] Fetch chats fallback:", e);
    return [];
  }
}

export async function saveChatMessageDB(params: {
  userId: string;
  personaId: string;
  sender: 'user' | 'ai';
  text: string;
  messageType: string;
  imageUrl?: string;
  provider?: string;
}): Promise<boolean> {
  try {
    const response = await fetch(`${BACKEND_BASE}/api/chats/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params)
    });
    return response.ok;
  } catch (e) {
    console.warn("[Client DB Service] Save message fallback:", e);
    return false;
  }
}

export async function saveTransactionDB(params: {
  userId: string;
  transactionId: string;
  packageId: string;
  amount: number;
  coinsAdded: number;
}): Promise<boolean> {
  try {
    const response = await fetch(`${BACKEND_BASE}/api/transactions/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params)
    });
    return response.ok;
  } catch (e) {
    console.warn("[Client DB Service] Save transaction fallback:", e);
    return false;
  }
}

// --- ADMIN CONTROL API ACTIONS ---

export async function adminFetchPendingTransactions(adminSecret: string): Promise<any[]> {
  try {
    const response = await fetch(`${BACKEND_BASE}/api/admin/transactions/pending`, {
      method: "GET",
      headers: { "X-Admin-Secret": adminSecret }
    });
    if (!response.ok) throw new Error("Unauthorized or server error");
    const data = await response.json();
    return data.transactions || [];
  } catch (e) {
    console.error("[Client Admin API] Fetch pending failed:", e);
    throw e;
  }
}

export async function adminApproveTransaction(
  adminSecret: string,
  transactionId: string
): Promise<{ coinsAdded: number; newBalance: number }> {
  try {
    const response = await fetch(`${BACKEND_BASE}/api/admin/transactions/approve`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "X-Admin-Secret": adminSecret 
      },
      body: JSON.stringify({ transactionId })
    });
    if (!response.ok) {
      const errData = await response.json();
      throw new Error(errData.error || "Approval failed");
    }
    return await response.json();
  } catch (e) {
    console.error("[Client Admin API] Approve failed:", e);
    throw e;
  }
}

export async function adminUpdateUserCoins(
  adminSecret: string,
  targetUserId: string,
  coinsBalance: number
): Promise<{ oldBalance: number; newBalance: number }> {
  try {
    const response = await fetch(`${BACKEND_BASE}/api/admin/users/update-coins`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Admin-Secret": adminSecret
      },
      body: JSON.stringify({ targetUserId, coinsBalance })
    });
    if (!response.ok) throw new Error("Failed to update coins");
    return await response.json();
  } catch (e) {
    console.error("[Client Admin API] Update coins failed:", e);
    throw e;
  }
}
