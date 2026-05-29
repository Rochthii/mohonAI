import { useState, useEffect, useRef } from 'react';
import { 
  PERSONAS, 
  generateRoast, 
  analyzeScreenshot, 
  syncUserProfileDB, 
  fetchChatHistoryDB, 
  saveChatMessageDB, 
  deleteChatHistoryDB,
  type ChatPersona 
} from './services/gemini';
import { SettingsModal } from './components/SettingsModal';
import { PaymentModal } from './components/PaymentModal';
import { CanvasQuote } from './components/CanvasQuote';
import { PrivacyModal } from './components/PrivacyModal';
import Tesseract from 'tesseract.js';

interface LocalChatMessage {
  messageId: string;
  personaId: string;
  sender: 'user' | 'ai';
  messageType: 'text' | 'screenshot' | 'thaomai' | 'repho' | 'roast';
  text: string;
  imageUrl?: string;
  createdAt: string;
  provider?: 'groq' | 'openrouter' | 'gemini' | 'offline';
}

const LOADING_MESSAGES: Record<string, string[]> = {
  savage: ["Đang mài dao...", "Đang sạc mỏ...", "Đang soạn văn chửi...", "Đang khởi động công lực xéo sắc..."],
  tarot: ["Đang xin tín hiệu vũ trụ...", "Đang trộn bài Tarot...", "Đang kết nối với tổ tiên...", "Đang đo đạc năng lượng sao Thủy..."],
  boss: ["Đang review synergy...", "Đang tính toán KPI...", "Đang soạn mail hi em...", "Đang căn chỉnh attitude ASAP..."],
  ex: ["Đang suy nghĩ lý do đổ lỗi...", "Đang tìm kịch bản gaslight...", "Đang chuẩn bị đóng vai nạn nhân...", "Đang soạn đạo lý nửa mùa..."],
  gf: ["Đang chu mỏ flirty...", "Đang chuẩn bị teasing...", "Đang dọn phòng chờ anh...", "Đang sạc năng lượng bạn gái ngọt ngào..."]
};

function App() {
  // --- STATE ---
  const [activePersona, setActivePersona] = useState<ChatPersona>(PERSONAS.savage);
  const [chatHistory, setChatHistory] = useState<LocalChatMessage[]>(() => {
    try {
      const initialPersonaId = 'savage';
      const historyRaw = localStorage.getItem(`tb_history_${initialPersonaId}`);
      if (historyRaw) {
        return JSON.parse(historyRaw);
      } else {
        const welcomeMsg: LocalChatMessage = {
          messageId: `msg_${new Date().getTime()}_init`,
          personaId: initialPersonaId,
          sender: 'ai',
          messageType: 'text',
          text: "💅 Ơ kìa, đứa nào làm mày uất ức hả bạn thân simp trúa của tao? Mau mau dán cái tin nhắn hãm loét hoặc câu chuyện đó vào đây đi, để tao sạc mỏ sấy khô sự vô tri của tụi nó giùm mày cái coi!",
          createdAt: new Date().toISOString()
        };
        localStorage.setItem(`tb_history_${initialPersonaId}`, JSON.stringify([welcomeMsg]));
        return [welcomeMsg];
      }
    } catch (err) {
      console.error(err);
      return [];
    }
  });
  const [userInput, setUserInput] = useState('');
  
  // Wallet & User states
  const [userId] = useState<string>(() => {
    try {
      const storedProfile = localStorage.getItem('tb_user_profile');
      if (storedProfile) {
        const profile = JSON.parse(storedProfile);
        if (profile.userId) return profile.userId;
      }
      
      const randomId = Math.random().toString(36).substring(2, 10).toUpperCase();
      const newId = `MOHON-USR-${randomId}`;
      const initialProfile = {
        userId: newId,
        coinsBalance: 10,
        createdAt: new Date().toISOString()
      };
      localStorage.setItem('tb_user_profile', JSON.stringify(initialProfile));
      return newId;
    } catch (e) {
      console.error(e);
      const randomId = Math.random().toString(36).substring(2, 10).toUpperCase();
      return `MOHON-USR-${randomId}`;
    }
  });

  const [coinsBalance, setCoinsBalance] = useState<number>(() => {
    try {
      const storedProfile = localStorage.getItem('tb_user_profile');
      if (storedProfile) {
        const profile = JSON.parse(storedProfile);
        return profile.coinsBalance ?? 10;
      }
    } catch (e) {
      console.error(e);
    }
    return 10;
  });

  const [userEmail, setUserEmail] = useState<string>(() => {
    try {
      const storedProfile = localStorage.getItem('tb_user_profile');
      if (storedProfile) {
        const profile = JSON.parse(storedProfile);
        return profile.email ?? '';
      }
    } catch (e) {
      console.error(e);
    }
    return '';
  });

  // Synchronize profile on boot with Supabase Database Cloud
  useEffect(() => {
    async function syncOnBoot() {
      try {
        console.log(`[Mỏ Hỗn AI] Boot sync for user ${userId}...`);
        const res = await syncUserProfileDB(userId, userEmail || undefined);
        if (res.status === 'synced' || res.status === 'registered') {
          handleUpdateCoins(res.coinsBalance);
          if (res.email && res.email !== userEmail) {
            handleUpdateEmail(res.email);
          }
        }
      } catch (err) {
        console.error("[Mỏ Hỗn AI] Boot sync failed:", err);
      }
    }
    syncOnBoot();
  }, [userId]);

  const [isSandboxMode, setIsSandboxMode] = useState<boolean>(() => {
    try {
      const sandboxRaw = localStorage.getItem('cfg_sandbox_mode');
      return sandboxRaw === 'true';
    } catch {
      return false;
    }
  });

  // Attached Screenshot
  const [attachedScreenshot, setAttachedScreenshot] = useState<string | null>(null);



  // Modals Visibility
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [isCanvasOpen, setIsCanvasOpen] = useState(false);
  const [isPrivacyOpen, setIsPrivacyOpen] = useState(false);

  // Generating States
  const [isGenerating, setIsGenerating] = useState(false);
  const [loadingText, setLoadingText] = useState('');

  // Selected Quote Card Data
  const [quoteData, setQuoteData] = useState<{ userText: string; aiResponse: string } | null>(null);

  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Helper welcome message generator
  const getWelcomeMessage = (personaId: string): string => {
    switch (personaId) {
      case 'savage':
        return "💅 Ơ kìa, đứa nào làm mày uất ức hả bạn thân simp trúa của tao? Mau mau dán cái tin nhắn hãm loét hoặc câu chuyện đó vào đây đi, để tao sạc mỏ sấy khô sự vô tri của tụi nó giùm mày cái coi!";
      case 'tarot':
        return "🔮 Kính thưa các quý vị độc giả, chào mừng đến với tụ bài số 3 cờ đỏ ngập tràn. Vũ trụ đang mách bảo rằng bạn đang gặp một kiếp nạn cực lớn. Đưa câu chuyện hoặc tin nhắn của đối phương vào đây để tổ tiên phán xét năng lượng độc hại này nhé.";
      case 'boss':
        return "💼 Hi em! Chị rất tôn trọng sự nỗ lực làm việc của em. Tuy nhiên, nếu em đang uất ức vì bị đồng nghiệp gạt giò hoặc sếp giao task ngoài giờ, hãy dán ngay văn bản đó vào đây để chị review synergy và align lại attitude ASAP nhé em. Thân ái!";
      case 'ex':
        return "💔 Anh/Em biết anh/em nói dị là lỗi hoàn toàn ở anh/em quá nhạy cảm rồi... Nhưng mà câu chuyện tình cảm lạnh này của em rốt cuộc là sao? Hãy dán nó vào đây để chúng ta cùng gaslight, đổ lỗi ngược và chúc nhau hạnh phúc nhé...";
      case 'gf':
        return "💕 Ơ kìa anh yêu/em yêu ơi! Lâu ngày không gặp mà sao hôm nay mặt mày overthinking ủ rũ thế kia? Có phải lại bị đứa nào làm tổn thương trái tim bé bỏng nữa rồi đúng không? Đưa tin nhắn hãm đó đây để em dỗ dành, trêu đùa vài câu cho tỉnh ngộ nha! Nhớ là em chỉ là AI chat thôi, rảnh rang vẫn phải ra đường chạm cỏ và hẹn hò người thật đó nhé!";
      default:
        return "💅 Ơ kìa bạn yêu, dán tin nhắn vào đây để tao sấy nhẹ sự vô tri của tụi nó giùm mày cái coi!";
    }
  };

  // Load chat history from Supabase DB (with LocalStorage fallback)
  const loadPersonaHistory = async (personaId: string) => {
    try {
      setIsGenerating(true);
      setLoadingText("Đang tải lịch sử trò chuyện...");
      
      const dbMessages = await fetchChatHistoryDB(userId, personaId);
      if (dbMessages && dbMessages.length > 0) {
        const mapped: LocalChatMessage[] = dbMessages.map((m: any) => ({
          messageId: m.messageId,
          personaId: m.personaId,
          sender: m.sender,
          messageType: m.messageType || 'text',
          text: m.text,
          imageUrl: m.imageUrl || undefined,
          createdAt: m.createdAt,
          provider: m.provider || undefined
        }));
        setChatHistory(mapped);
        localStorage.setItem(`tb_history_${personaId}`, JSON.stringify(mapped));
      } else {
        const historyRaw = localStorage.getItem(`tb_history_${personaId}`);
        if (historyRaw) {
          setChatHistory(JSON.parse(historyRaw));
        } else {
          const welcomeMsg: LocalChatMessage = {
            messageId: `msg_${new Date().getTime()}_init`,
            personaId,
            sender: 'ai',
            messageType: 'text',
            text: getWelcomeMessage(personaId),
            createdAt: new Date().toISOString()
          };
          setChatHistory([welcomeMsg]);
          localStorage.setItem(`tb_history_${personaId}`, JSON.stringify([welcomeMsg]));
        }
      }
    } catch (e) {
      console.error("Error loading chat history:", e);
    } finally {
      setIsGenerating(false);
    }
  };

  useEffect(() => {
    loadPersonaHistory(activePersona.id);
  }, [activePersona.id]);

  // --- INITIALIZATION (Synchronous State Initializer used instead of Mount Effects) ---

  // Update localStorage when coins changes
  const handleUpdateCoins = (newBalance: number) => {
    setCoinsBalance(newBalance);
    try {
      const storedProfile = localStorage.getItem('tb_user_profile');
      if (storedProfile) {
        const profile = JSON.parse(storedProfile);
        profile.coinsBalance = newBalance;
        localStorage.setItem('tb_user_profile', JSON.stringify(profile));
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Sync email to local profile
  const handleUpdateEmail = (email: string) => {
    setUserEmail(email);
    try {
      const storedProfile = localStorage.getItem('tb_user_profile');
      if (storedProfile) {
        const profile = JSON.parse(storedProfile);
        profile.email = email;
        localStorage.setItem('tb_user_profile', JSON.stringify(profile));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateSandbox = (enabled: boolean) => {
    setIsSandboxMode(enabled);
    localStorage.setItem('cfg_sandbox_mode', enabled ? 'true' : 'false');
  };

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, isGenerating]);

  // Loading animation controller
  useEffect(() => {
    if (!isGenerating) return;
    const messages = LOADING_MESSAGES[activePersona.id];
    let index = 0;

    const interval = setInterval(() => {
      index = (index + 1) % messages.length;
      setLoadingText(messages[index]);
    }, 1200);

    return () => clearInterval(interval);
  }, [isGenerating, activePersona]);

  // Handlers reordered to the top to comply with linear declaration rule

  const handleSelectPersona = (pId: string) => {
    const p = PERSONAS[pId] || PERSONAS.savage;
    setActivePersona(p);
  };

  const handleNewChat = async () => {
    const isConfirmed = window.confirm(`Ủa bạn thân ơi, có chắc chắn muốn xóa sạch sành sanh lịch sử chat cũ với ${activePersona.name} để tạo cuộc trò chuyện mới không? Không khôi phục lại được đâu nha!`);
    if (!isConfirmed) return;

    try {
      setIsGenerating(true);
      setLoadingText("Đang dọn dẹp phòng chat...");

      // 1. Gọi API để xóa lịch sử trên Cloud database Supabase
      if (userId) {
        await deleteChatHistoryDB(userId, activePersona.id);
      }

      // 2. Tạo tin nhắn chào mừng mặc định
      const welcomeMsg: LocalChatMessage = {
        messageId: `msg_${new Date().getTime()}_init`,
        personaId: activePersona.id,
        sender: 'ai',
        messageType: 'text',
        text: getWelcomeMessage(activePersona.id),
        createdAt: new Date().toISOString()
      };

      // 3. Cập nhật LocalStorage và State
      localStorage.setItem(`tb_history_${activePersona.id}`, JSON.stringify([welcomeMsg]));
      setChatHistory([welcomeMsg]);
      setUserInput('');
      setAttachedScreenshot(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (e) {
      console.error("[Client] Failed to reset chat history:", e);
    } finally {
      setIsGenerating(false);
    }
  };

  // --- ACTIONS ---
  
  // Image selection
  const handleImageClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      setAttachedScreenshot(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = () => {
    setAttachedScreenshot(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Core Submit Action
  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const type = attachedScreenshot ? 'screenshot' : 'roast';
    const textToSend = userInput;
    const screenshotToSend = attachedScreenshot;

    // Check Coin for Screenshot Analyzer
    if (screenshotToSend && coinsBalance < 10) {
      alert("Bạn cần tối thiểu 10 Coin để sử dụng Screenshot Chat Analyzer. Vui lòng nạp thêm!");
      setIsPaymentOpen(true);
      return;
    }

    // Prepare User message
    const userMsg: LocalChatMessage = {
      messageId: `msg_${new Date().getTime()}_usr`,
      personaId: activePersona.id,
      sender: 'user',
      messageType: screenshotToSend ? 'screenshot' : type,
      text: screenshotToSend ? 'Đọc vị ảnh chụp màn hình này giúp tao!' : textToSend,
      imageUrl: screenshotToSend || undefined,
      createdAt: new Date().toISOString()
    };

    const updatedHistory = [...chatHistory, userMsg];
    setChatHistory(updatedHistory);
    setUserInput('');
    setAttachedScreenshot(null);
    if (fileInputRef.current) fileInputRef.current.value = '';

    // Synchronize user message to cloud database asynchronously
    saveChatMessageDB({
      userId,
      personaId: activePersona.id,
      sender: 'user',
      text: userMsg.text,
      messageType: userMsg.messageType,
      imageUrl: userMsg.imageUrl
    }).catch(err => console.warn("[Client DB] Failed to save user chat to cloud:", err));

    const welcomeMessages = LOADING_MESSAGES[activePersona.id];
    setLoadingText(welcomeMessages[0]);
    setIsGenerating(true);

    try {
      let aiResult: { text: string; provider: 'groq' | 'openrouter' | 'gemini' | 'offline' } = { text: "", provider: "offline" };
      if (screenshotToSend) {
        // Charge 10 coins
        handleUpdateCoins(coinsBalance - 10);
        
        setLoadingText("Đang chạy OCR đọc chữ trong ảnh...");
        
        try {
          const ocrResult = await Tesseract.recognize(
            screenshotToSend,
            'vie+eng',
            { 
              logger: m => {
                if (m.status === 'recognizing') {
                  setLoadingText(`Đang quét chữ: ${Math.round(m.progress * 100)}%...`);
                }
              }
            }
          );
          
          const extractedText = ocrResult.data.text;
          console.log("[Mỏ Hỗn AI] OCR Extracted Text: ", extractedText);
          
          if (!extractedText.trim()) {
            throw new Error("Không tìm thấy chữ trong cuộc trò chuyện chụp màn hình.");
          }
          
          aiResult = await analyzeScreenshot(activePersona.id, extractedText, userId);
        } catch (ocrErr) {
          console.error("OCR Error:", ocrErr);
          // If OCR fails, fallback to passing a message to the AI or using local static
          aiResult = await analyzeScreenshot(activePersona.id, "Lỗi trích xuất chữ. Hãy roast tinh nghịch sự vô tri của ảnh chụp này!", userId);
        }
      } else {
        aiResult = await generateRoast(activePersona.id, textToSend, 'roast', userId);
      }

      // Prepare AI reply message
      const aiReply: LocalChatMessage = {
        messageId: `msg_${new Date().getTime()}_ai`,
        personaId: activePersona.id,
        sender: 'ai',
        messageType: screenshotToSend ? 'screenshot' : type,
        text: aiResult.text,
        provider: aiResult.provider,
        createdAt: new Date().toISOString()
      };

      const finalHistory = [...updatedHistory, aiReply];
      setChatHistory(finalHistory);
      
      // Save chat history to localStorage
      localStorage.setItem(`tb_history_${activePersona.id}`, JSON.stringify(finalHistory));

      // Synchronize AI response to cloud database asynchronously
      saveChatMessageDB({
        userId,
        personaId: activePersona.id,
        sender: 'ai',
        text: aiReply.text,
        messageType: aiReply.messageType,
        provider: aiReply.provider
      }).catch(err => console.warn("[Client DB] Failed to save AI chat to cloud:", err));

    } catch (err) {
      console.error(err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleOpenQuoteCard = (msgText: string, userText?: string) => {
    // Look up the matching user text before this AI message to provide context in the quote card
    const defaultUserText = userText || "Drama cuộc đời tao...";
    setQuoteData({
      userText: defaultUserText,
      aiResponse: msgText
    });
    setIsCanvasOpen(true);
  };

  // Color mappings for Persona Themes
  const getThemeColor = () => {
    switch (activePersona.id) {
      case 'savage': return '#d946ef';
      case 'tarot': return '#06b6d4';
      case 'boss': return '#3b82f6';
      case 'ex': return '#ef4444';
      case 'gf': return '#fb7185';
      default: return '#d946ef';
    }
  };

  return (
    <div className={`theme-${activePersona.id}`} style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      
      {/* HEADER BAR */}
      <header className="glass-panel" style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div className="monogram-avatar animate-pulse-glow" style={{ width: '38px', height: '38px', fontSize: '1rem', background: 'var(--accent-gradient)' }}>
            MH
          </div>
          <div>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, background: 'var(--accent-gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Mỏ Hỗn AI
            </h1>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Đọc vị Tình cảm & Bóc trần Drama</span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* New Chat Button */}
          <button 
            onClick={handleNewChat} 
            className="secondary-btn" 
            style={{ 
              padding: '8px 10px', 
              border: '1px solid var(--border-neon)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: 'rgba(255, 255, 255, 0.03)',
              cursor: 'pointer'
            }}
            title="Xóa lịch sử và tạo cuộc trò chuyện mới"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent-color)' }}>
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            <span className="hide-on-mobile" style={{ fontWeight: 600 }}>Mới</span>
          </button>

          {/* Coins Wallet Pill */}
          <div 
            onClick={() => setIsPaymentOpen(true)} 
            className="coin-badge" 
            style={{ 
              cursor: 'pointer', 
              transition: 'box-shadow 0.2s', 
              boxShadow: '0 0 10px rgba(245, 158, 11, 0.1)',
              padding: '6px 10px'
            }}
          >
            Coin: {coinsBalance} <span className="hide-on-mobile" style={{ fontWeight: 500, fontSize: '0.75rem', marginLeft: '4px', textDecoration: 'underline' }}>Nạp</span>
          </div>

          {/* Settings Button */}
          <button 
            onClick={() => setIsSettingsOpen(true)} 
            className="secondary-btn" 
            style={{ 
              padding: '8px 10px', 
              border: '1px solid var(--border-neon)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: 'rgba(255, 255, 255, 0.03)',
              cursor: 'pointer'
            }}
            title="Mở cài đặt & cổng quản lý ví"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent-color)' }}>
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
            <span className="hide-on-mobile" style={{ fontWeight: 600 }}>Cài đặt</span>
          </button>
        </div>
      </header>

      {/* PERSONA SELECTOR */}
      <section style={selectorSectionStyle}>
        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px', paddingLeft: '4px' }}>
          Đứa bạn thân đồng hành:
        </div>
        <div className="no-scrollbar" style={selectorGridStyle}>
          {Object.values(PERSONAS).map((p) => {
            const isActive = activePersona.id === p.id;
            return (
              <div 
                key={p.id}
                onClick={() => handleSelectPersona(p.id)}
                className={`persona-chip ${isActive ? 'active' : ''}`}
              >
                <div className={`monogram-avatar ${isActive ? '' : 'inactive'}`}>
                  {p.avatar}
                </div>
                <div style={{ 
                  fontSize: '0.8rem', 
                  fontWeight: 700, 
                  color: isActive ? 'var(--text-highlight)' : 'var(--text-muted)',
                  whiteSpace: 'nowrap'
                }}>
                  {p.name}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* CHAT PANEL */}
      <main className="glass-panel" style={chatPanelStyle}>
        <div className="chat-bubble-container" style={chatMessagesContainerStyle}>
          {chatHistory.map((msg, index) => {
            const isUser = msg.sender === 'user';
            
            // Find preceding user message text for quote card context
            let precedingUserText = "Drama cuộc đời...";
            if (!isUser && index > 0) {
              const prev = chatHistory[index - 1];
              if (prev.sender === 'user') {
                precedingUserText = prev.text;
              }
            }

            return (
              <div key={msg.messageId} style={{ ...messageRowStyle, justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
                {!isUser && (
                  <div style={aiAvatarStyle}>
                    {activePersona.avatar}
                  </div>
                )}
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxWidth: '70%' }}>
                  {!isUser && (
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--accent-color)' }}>
                      {activePersona.name}
                    </div>
                  )}

                  <div className="message-bubble" style={{
                    ...messageBubbleStyle,
                    background: isUser ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.03)',
                    border: isUser ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid var(--border-neon)',
                    borderRadius: isUser ? '16px 16px 4px 16px' : '4px 16px 16px 16px',
                  }}>
                    {msg.imageUrl && (
                      <div style={chatImageContainerStyle}>
                        <img src={msg.imageUrl} alt="Attached Drama Screenshot" style={chatImageStyle} />
                      </div>
                    )}
                    <p style={{ fontSize: '0.9rem', color: isUser ? '#fff' : 'var(--text-main)', whiteSpace: 'pre-wrap' }}>
                      {msg.text}
                    </p>
                  </div>

                  {/* Actions for AI responses */}
                  {!isUser && msg.messageId !== `msg_${chatHistory[0]?.createdAt}_init` && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingLeft: '4px', marginTop: '2px', width: '100%' }}>
                      <button 
                        onClick={() => handleOpenQuoteCard(msg.text, precedingUserText)}
                        style={miniActionStyle}
                        title="Tạo ảnh Quote Card mượt mà chia sẻ lên Threads"
                      >
                        Tạo Quote Card
                      </button>

                      {msg.provider && (
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '4px', opacity: 0.85 }}>
                          {msg.provider === 'groq' && <span style={{ color: '#ec4899' }}>Groq Redundancy</span>}
                          {msg.provider === 'openrouter' && <span style={{ color: '#c084fc' }}>OpenRouter</span>}
                          {msg.provider === 'gemini' && <span style={{ color: '#22d3ee' }}>Gemini Pool</span>}
                          {msg.provider === 'offline' && <span style={{ color: '#9ca3af' }}>Offline Database</span>}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* AI Loader */}
          {isGenerating && (
            <div style={{ ...messageRowStyle, justifyContent: 'flex-start' }}>
              <div style={aiAvatarStyle}>
                {activePersona.avatar}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--accent-color)' }}>
                  {activePersona.name}
                </div>
                <div style={{ ...messageBubbleStyle, background: 'rgba(255,255,255,0.02)', border: '1px dashed var(--border-neon)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div className="spinner" style={spinnerStyle}></div>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                      {loadingText}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* INPUT WORKSPACE */}
        <div style={inputContainerStyle}>
          {/* Attached image preview bar */}
          {attachedScreenshot && (
            <div style={attachedPreviewBarStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <img src={attachedScreenshot} alt="drama preview" style={miniPreviewImageStyle} />
                <div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-highlight)' }}>Ảnh chụp màn hình đính kèm</div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Phí phân tích: 10 Coin (Deep Roast)</div>
                </div>
              </div>
              <button onClick={handleRemoveImage} style={removeAttachedImageBtnStyle}>
                ✕ Hủy bỏ
              </button>
            </div>
          )}

          {/* Textarea Input Form */}
          <form onSubmit={handleSendMessage} className="input-form" style={inputFormStyle}>
            {/* Image attachment clip */}
            <button 
              type="button" 
              onClick={handleImageClick}
              style={{
                ...attachBtnStyle,
                color: attachedScreenshot ? 'var(--accent-color)' : 'var(--text-muted)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '4px'
              }}
              title="Đính kèm ảnh chụp màn hình tin nhắn để phân tích"
              disabled={isGenerating}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
              </svg>
            </button>
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileChange} 
              accept="image/*" 
              style={{ display: 'none' }} 
            />

            <input
              type="text"
              placeholder={
                attachedScreenshot 
                  ? "Ảnh đã đính kèm! Bấm Đọc vị Screenshot..." 
                  : `Kể drama, dán tin nhắn để rep hộ, hoặc bảo dịch thảo mai với ${activePersona.name}...`
              }
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              style={textInputStyle}
              disabled={isGenerating}
            />

            <button 
              type="submit" 
              className="glow-btn" 
              style={{ padding: '8px 16px', fontSize: '0.85rem', whiteSpace: 'nowrap' }}
              disabled={isGenerating || (!userInput.trim() && !attachedScreenshot)}
            >
              {attachedScreenshot ? 'Đọc vị Screenshot (10 Coin)' : 'Gửi đi'}
            </button>
          </form>
        </div>
      </main>

      {/* FOOTER GENERAL RULES */}
      <footer style={footerStyle}>
        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
          Nội dung AI chỉ mang tính giải trí. Hình ảnh OCR được xử lý hoàn toàn trên thiết bị của bạn và không lưu trữ trên máy chủ.
        </div>
        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '6px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <span>© {new Date().getFullYear()} Mỏ Hỗn AI</span>
          <span style={{ opacity: 0.3 }}>·</span>
          <button
            onClick={() => setIsPrivacyOpen(true)}
            style={{ background: 'none', border: 'none', color: 'var(--accent-color)', fontSize: '0.7rem', cursor: 'pointer', padding: 0, textDecoration: 'underline', textUnderlineOffset: '2px' }}
          >
            Điều Khoản &amp; Bảo Mật
          </button>
        </div>
      </footer>

      {/* --- ALL MODALS --- */}
      <SettingsModal 
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        coinsBalance={coinsBalance}
        userEmail={userEmail}
        isSandboxMode={isSandboxMode}
        userId={userId}
        onUpdateCoins={handleUpdateCoins}
        onUpdateEmail={handleUpdateEmail}
        onUpdateSandbox={handleUpdateSandbox}
      />

      <PaymentModal 
        isOpen={isPaymentOpen}
        onClose={() => setIsPaymentOpen(false)}
        coinsBalance={coinsBalance}
        isSandboxMode={isSandboxMode}
        userId={userId}
        onAddCoins={(coins) => handleUpdateCoins(coinsBalance + coins)}
      />

      {quoteData && (
        <CanvasQuote 
          isOpen={isCanvasOpen}
          onClose={() => {
            setIsCanvasOpen(false);
            setQuoteData(null);
          }}
          userText={quoteData.userText}
          aiResponse={quoteData.aiResponse}
          personaName={activePersona.name}
          personaAvatar={activePersona.avatar}
          themeColor={getThemeColor()}
        />
      )}

      <PrivacyModal
        isOpen={isPrivacyOpen}
        onClose={() => setIsPrivacyOpen(false)}
      />

    </div>
  );
}

/* APP INLINE STYLES FOR ABSOLUTE FLEXIBILITY */
const headerStyle: React.CSSProperties = {
  width: '100%',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '16px 20px',
  marginBottom: '20px',
  marginTop: '8px',
};

const selectorSectionStyle: React.CSSProperties = {
  width: '100%',
  display: 'flex',
  flexDirection: 'column',
  marginBottom: '16px',
};

const selectorGridStyle: React.CSSProperties = {
  display: 'flex',
  gap: '10px',
  width: '100%',
  overflowX: 'auto',
  padding: '8px 4px',
};

const chatPanelStyle: React.CSSProperties = {
  width: '100%',
  flexGrow: 1,
  display: 'flex',
  flexDirection: 'column',
  height: '520px',
  maxHeight: '70vh',
  overflow: 'hidden',
  marginBottom: '20px',
};

const chatMessagesContainerStyle: React.CSSProperties = {
  flexGrow: 1,
  padding: '20px',
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
  gap: '16px',
};

const messageRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: '12px',
  width: '100%',
};

const aiAvatarStyle: React.CSSProperties = {
  width: '36px',
  height: '36px',
  borderRadius: '50%',
  background: 'var(--accent-gradient)',
  border: '1.5px solid var(--border-neon)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '0.72rem',
  fontWeight: 800,
  color: '#ffffff',
  boxShadow: 'var(--accent-glow)',
  flexShrink: 0,
};

const messageBubbleStyle: React.CSSProperties = {
  padding: '12px 16px',
  maxWidth: '100%',
  lineHeight: '1.45',
  wordBreak: 'break-word',
};

const chatImageContainerStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: '240px',
  marginBottom: '8px',
  borderRadius: '8px',
  overflow: 'hidden',
  border: '1px solid rgba(255,255,255,0.1)',
};

const chatImageStyle: React.CSSProperties = {
  width: '100%',
  maxHeight: '200px',
  objectFit: 'cover',
};

const miniActionStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  fontSize: '0.75rem',
  color: 'var(--text-muted)',
  cursor: 'pointer',
  transition: 'color 0.2s',
  display: 'inline-flex',
  alignItems: 'center',
};

const spinnerStyle: React.CSSProperties = {
  width: '14px',
  height: '14px',
  border: '2px solid rgba(255, 255, 255, 0.2)',
  borderTopColor: 'var(--accent-color)',
  borderRadius: '50%',
  animation: 'spin-slow 1s linear infinite',
};

const inputContainerStyle: React.CSSProperties = {
  borderTop: '1px solid rgba(255, 255, 255, 0.08)',
  padding: '16px 20px',
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
  background: 'rgba(0, 0, 0, 0.15)',
};


const attachedPreviewBarStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '8px 12px',
  background: 'rgba(168, 85, 247, 0.06)',
  borderRadius: '8px',
  border: '1px solid rgba(168, 85, 247, 0.2)',
};

const miniPreviewImageStyle: React.CSSProperties = {
  width: '32px',
  height: '32px',
  borderRadius: '4px',
  objectFit: 'cover',
  border: '1.5px solid var(--accent-color)',
};

const removeAttachedImageBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#ef4444',
  fontSize: '0.8rem',
  fontWeight: 700,
  cursor: 'pointer',
};

const inputFormStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  width: '100%',
};

const attachBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  fontSize: '1.5rem',
  cursor: 'pointer',
  outline: 'none',
  transition: 'color 0.2s',
};

const textInputStyle: React.CSSProperties = {
  flexGrow: 1,
  background: 'rgba(0, 0, 0, 0.3)',
  border: '1px solid rgba(255, 255, 255, 0.1)',
  borderRadius: '10px',
  padding: '10px 14px',
  color: '#fff',
  fontSize: '0.9rem',
  outline: 'none',
  fontFamily: 'var(--font-sans)',
  transition: 'border-color 0.2s',
};

const footerStyle: React.CSSProperties = {
  width: '100%',
  textAlign: 'center',
  marginTop: '8px',
  paddingBottom: '24px',
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
};

export default App;
