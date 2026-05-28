import React, { useState } from 'react';
import { saveTransactionDB } from '../services/gemini';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  coinsBalance: number;
  isSandboxMode: boolean;
  userId: string;
  onAddCoins: (coins: number) => void;
}


interface CoinPackage {
  id: 'coin_10' | 'coin_50' | 'coin_150';
  name: string;
  coins: number;
  price: number; // in VND
  popular: boolean;
  discount: string;
}

const COIN_PACKAGES: CoinPackage[] = [
  {
    id: 'coin_10',
    name: 'Gói Khởi Đầu',
    coins: 10,
    price: 5000,
    popular: false,
    discount: 'Gói thử nghiệm',
  },
  {
    id: 'coin_50',
    name: 'Gói Phổ Biến',
    coins: 50,
    price: 20000,
    popular: true,
    discount: 'Tiết kiệm 20%',
  },
  {
    id: 'coin_150',
    name: 'Gói Trùm Drama',
    coins: 150,
    price: 49000,
    popular: false,
    discount: 'Tiết kiệm 35%',
  },
];

// Real Merchant Configurations (BIDV and MoMo)
const MERCHANT_NAME = import.meta.env.VITE_MERCHANT_NAME || 'CHAM ROCH THI';
const BIDV_ACCOUNT = import.meta.env.VITE_MERCHANT_BIDV_ACCOUNT || '7020433295';
const MOMO_ACCOUNT = import.meta.env.VITE_MERCHANT_MOMO_ACCOUNT || '0329812996';

// Helper function outside component to generate transaction code (purity compliance)
function generateRandomTransactionCode(coins: number): string {
  const randomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `MOHON${coins}T${randomCode}`;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({
  isOpen,
  onClose,
  coinsBalance,
  isSandboxMode,
  userId,
  onAddCoins,
}) => {
  const [selectedPackage, setSelectedPackage] = useState<CoinPackage | null>(null);
  const [transactionCode, setTransactionCode] = useState('');
  const [paymentStatus, setPaymentStatus] = useState<'packages' | 'qr' | 'success' | 'pending'>('packages');
  const [isVerifying, setIsVerifying] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'bidv' | 'momo'>('bidv');

  if (!isOpen) return null;

  const handleSelectPackage = (pkg: CoinPackage) => {
    setSelectedPackage(pkg);
    const code = generateRandomTransactionCode(pkg.coins);
    setTransactionCode(code);
    setPaymentStatus('qr');
  };

  const handleConfirmTransfer = async () => {
    if (!selectedPackage) return;
    setIsVerifying(true);

    // Save transaction to local db simulating transaction logs
    const storedTxRaw = localStorage.getItem('tb_transactions');
    const transactions = storedTxRaw ? JSON.parse(storedTxRaw) : [];
    
    const newTx = {
      transactionId: transactionCode,
      packageId: selectedPackage.id,
      amount: selectedPackage.price,
      coinsAdded: selectedPackage.coins,
      status: isSandboxMode ? 'success' : 'pending',
      transactionCode: transactionCode,
      createdAt: new Date().toISOString(),
    };
    transactions.push(newTx);
    localStorage.setItem('tb_transactions', JSON.stringify(transactions));

    // Real synchronization to Supabase Database Cloud
    try {
      await saveTransactionDB({
        userId,
        transactionId: transactionCode,
        packageId: selectedPackage.id,
        amount: selectedPackage.price,
        coinsAdded: selectedPackage.coins
      });
    } catch (e) {
      console.warn("[PaymentModal] Cloud transaction logging failed:", e);
    }

    setTimeout(() => {
      setIsVerifying(false);
      if (isSandboxMode) {
        // Automatically approve coins in Sandbox Mode
        onAddCoins(selectedPackage.coins);
        setPaymentStatus('success');
        setTimeout(() => {
          handleClose();
        }, 2000);
      } else {
        // Go to pending state instructing real developer check
        setPaymentStatus('pending');
      }
    }, 1500);
  };


  const handleClose = () => {
    setSelectedPackage(null);
    setPaymentStatus('packages');
    onClose();
  };

  return (
    <div className="modal-overlay" style={overlayStyle}>
      <div className="glass-panel modal-content" style={modalContentStyle}>
        
        {/* HEADER */}
        <div style={headerStyle}>
          <h2 style={{ fontSize: '1.4rem', margin: 0 }}>Nạp Thêm Coins</h2>
          <button onClick={handleClose} style={closeBtnStyle}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        {/* STEP 1: PACKAGES VIEW */}
        {paymentStatus === 'packages' && (
          <div style={containerStyle}>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center' }}>
              Hãy nạp coin để mở khóa tính năng **Phân tích Screenshot** của Mỏ Hỗn AI (Mức phí: **10 Coin / lượt**).
            </p>

            <div style={packageListStyle}>
              {COIN_PACKAGES.map((pkg) => (
                <div 
                  key={pkg.id} 
                  onClick={() => handleSelectPackage(pkg)}
                  style={{
                    ...packageCardStyle,
                    borderColor: pkg.popular ? 'var(--accent-color)' : 'rgba(255, 255, 255, 0.08)',
                    background: pkg.popular ? 'rgba(168, 85, 247, 0.08)' : 'rgba(255, 255, 255, 0.02)',
                  }}
                >
                  {pkg.popular && <span style={popularBadgeStyle}>MUA NHIỀU NHẤT</span>}
                  
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <h4 style={{ fontSize: '1.1rem', fontWeight: 700 }}>{pkg.coins} Coins</h4>
                      <span style={{ fontSize: '0.75rem', color: '#fbbf24' }}>{pkg.discount}</span>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-highlight)' }}>
                        {pkg.price.toLocaleString('vi-VN')}đ
                      </div>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>BIDV / MoMo</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div style={currentCoinsBoxStyle}>
              Số dư hiện tại: <strong style={{ color: '#fbbf24' }}>{coinsBalance} Coin</strong>
            </div>
          </div>
        )}

        {/* STEP 2: VIETQR DISPLAY */}
        {paymentStatus === 'qr' && selectedPackage && (
          <div style={containerStyle}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-highlight)' }}>
                Nạp {selectedPackage.coins} Coins - {selectedPackage.price.toLocaleString('vi-VN')}đ
              </div>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                Quét mã QR bằng ứng dụng ngân hàng hoặc MoMo để chuyển khoản trực tiếp.
              </p>
            </div>

            {/* TAB SELECT PAYMENT METHOD */}
            <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
              <button 
                onClick={() => setPaymentMethod('bidv')}
                className={paymentMethod === 'bidv' ? 'glow-btn' : 'secondary-btn'}
                style={{ flex: 1, padding: '8px 12px', fontSize: '0.82rem', height: '38px', minHeight: '38px' }}
              >
                BIDV (VietQR)
              </button>
              <button 
                onClick={() => setPaymentMethod('momo')}
                className={paymentMethod === 'momo' ? 'glow-btn' : 'secondary-btn'}
                style={{ flex: 1, padding: '8px 12px', fontSize: '0.82rem', height: '38px', minHeight: '38px' }}
              >
                Ví MoMo QR
              </button>
            </div>

            <div style={qrBoxStyle}>
              <img 
                src={paymentMethod === 'bidv' 
                  ? `https://img.vietqr.io/image/BIDV-${BIDV_ACCOUNT}-qr_only.png?amount=${selectedPackage.price}&addInfo=${transactionCode}&accountName=${encodeURIComponent(MERCHANT_NAME)}`
                  : `https://img.vietqr.io/image/MOMO-${MOMO_ACCOUNT}-qr_only.png?amount=${selectedPackage.price}&addInfo=${transactionCode}&accountName=${encodeURIComponent(MERCHANT_NAME)}`
                }
                alt="Payment QR"
                style={qrImageStyle}
              />
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '8px', textAlign: 'center' }}>
                Mã QR Chuyển khoản {paymentMethod === 'bidv' ? 'Ngân hàng BIDV' : 'Ví MoMo'} chuẩn xác
              </div>
            </div>

            <div style={paymentDetailsStyle}>
              <div style={detailRowStyle}>
                <span>Phương thức:</span>
                <strong>{paymentMethod === 'bidv' ? 'BIDV (Đầu tư & Phát triển VN)' : 'Ví Điện Tử MoMo'}</strong>
              </div>
              <div style={detailRowStyle}>
                <span>Chủ tài khoản:</span>
                <strong style={{ textTransform: 'uppercase' }}>{MERCHANT_NAME}</strong>
              </div>
              <div style={detailRowStyle}>
                <span>Số tài khoản / SĐT:</span>
                <strong style={{ color: 'var(--text-highlight)', fontSize: '0.95rem' }}>
                  {paymentMethod === 'bidv' ? BIDV_ACCOUNT : MOMO_ACCOUNT}
                </strong>
              </div>
              <div style={detailRowStyle}>
                <span>Số tiền:</span>
                <strong style={{ color: '#fbbf24' }}>{selectedPackage.price.toLocaleString('vi-VN')}đ</strong>
              </div>
              <div style={detailRowStyle}>
                <span>Nội dung CK bắt buộc:</span>
                <strong style={{ color: 'var(--accent-color)', fontSize: '1rem', letterSpacing: '1px' }}>
                  {transactionCode}
                </strong>
              </div>
            </div>

            {isSandboxMode && (
              <div style={sandboxAlertStyle}>
                <strong>Sandbox Mode đang bật:</strong> Hệ thống sẽ duyệt tự động và cộng coin tức thì khi nhấn nút xác nhận bên dưới.
              </div>
            )}

            <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
              <button onClick={() => setPaymentStatus('packages')} className="secondary-btn" style={{ flex: 1 }}>
                Quay lại
              </button>
              <button 
                onClick={handleConfirmTransfer} 
                className="glow-btn" 
                style={{ flex: 1.5 }}
                disabled={isVerifying}
              >
                {isVerifying ? 'Đang kiểm tra...' : 'Đã Chuyển Khoản'}
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: SANDBOX SUCCESS */}
        {paymentStatus === 'success' && selectedPackage && (
          <div style={{ ...containerStyle, alignItems: 'center', justifyContent: 'center', padding: '32px 0' }}>
            <div className="monogram-avatar" style={{ width: '60px', height: '60px', fontSize: '1.8rem', background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', boxShadow: '0 0 20px rgba(16, 185, 129, 0.4)' }}>
              ✓
            </div>
            <h3 style={{ color: '#10b981', fontSize: '1.4rem', marginTop: '16px' }}>Nạp Coin Thành Công!</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: '8px' }}>
              Hệ thống Sandbox đã tự động xác thực. Ví của bạn đã được cộng thêm <strong>+{selectedPackage.coins} Coins</strong>!
            </p>
          </div>
        )}

        {/* STEP 4: PRODUCTION PENDING STATE */}
        {paymentStatus === 'pending' && selectedPackage && (
          <div style={containerStyle}>
            <div style={{ textAlign: 'center', padding: '16px 0', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div className="monogram-avatar animate-pulse-glow" style={{ width: '60px', height: '60px', fontSize: '1.5rem', background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', boxShadow: '0 0 20px rgba(245, 158, 11, 0.3)', marginBottom: '12px' }}>
                ...
              </div>
              <h3 style={{ color: '#fbbf24', fontSize: '1.25rem', marginTop: '12px' }}>Giao Dịch Chờ Duyệt</h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-main)', marginTop: '8px', lineHeight: 1.5 }}>
                Yêu cầu nạp coin của bạn đã được ghi nhận với mã giao dịch: <strong style={{ color: 'var(--accent-color)' }}>{transactionCode}</strong>.
              </p>
            </div>

            <div style={pendingNoticeBoxStyle}>
              <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '8px' }}>
                Hướng dẫn duyệt coin nhanh:
              </div>
              <ul style={{ paddingLeft: '16px', fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <li>Hệ thống ngân hàng của Admin đang tiến hành đối soát giao dịch chuyển khoản thật.</li>
                <li>Coin sẽ được cộng tự động vào ví của bạn trong vòng 2-5 phút sau khi giao dịch chuyển tiền thành công.</li>
                <li>Nếu cần duyệt ngay lập tức, vui lòng gửi mã chuyển khoản <strong style={{ color: 'var(--text-highlight)' }}>{transactionCode}</strong> kèm bill cho Admin qua Zalo/Threads để kích hoạt ví tức thì!</li>
              </ul>
            </div>

            <button onClick={handleClose} className="glow-btn" style={{ width: '100%' }}>
              Hoàn tất
            </button>
          </div>
        )}

      </div>
    </div>
  );
};

/* STYLES DEFINITION */
const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.75)',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  zIndex: 999,
  padding: '16px',
};

const modalContentStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: '460px',
  padding: '24px',
  display: 'flex',
  flexDirection: 'column',
  gap: '16px',
  maxHeight: '90vh',
  overflowY: 'auto',
  border: '1px solid var(--border-neon)',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
  paddingBottom: '12px',
};

const closeBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--text-muted)',
  cursor: 'pointer',
};

const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '16px',
};

const packageListStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
};

const packageCardStyle: React.CSSProperties = {
  border: '1px solid',
  borderRadius: '12px',
  padding: '16px',
  cursor: 'pointer',
  position: 'relative',
  transition: 'transform 0.2s ease, border-color 0.2s ease',
};

const popularBadgeStyle: React.CSSProperties = {
  position: 'absolute',
  top: '-10px',
  right: '16px',
  background: 'var(--accent-color)',
  color: '#fff',
  fontSize: '0.65rem',
  fontWeight: 800,
  padding: '2px 8px',
  borderRadius: '99px',
  boxShadow: 'var(--accent-glow)',
};

const currentCoinsBoxStyle: React.CSSProperties = {
  textAlign: 'center',
  fontSize: '0.9rem',
  padding: '10px',
  background: 'rgba(255, 255, 255, 0.03)',
  borderRadius: '8px',
  border: '1px solid rgba(255, 255, 255, 0.05)',
};

const qrBoxStyle: React.CSSProperties = {
  background: '#fff',
  padding: '16px',
  borderRadius: '16px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
};

const qrImageStyle: React.CSSProperties = {
  width: '200px',
  height: '200px',
  objectFit: 'contain',
};

const paymentDetailsStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  padding: '16px',
  background: 'rgba(255, 255, 255, 0.03)',
  borderRadius: '12px',
  border: '1px solid rgba(255, 255, 255, 0.05)',
};

const detailRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  fontSize: '0.85rem',
};

const sandboxAlertStyle: React.CSSProperties = {
  fontSize: '0.8rem',
  color: '#fbbf24',
  background: 'rgba(245, 158, 11, 0.08)',
  padding: '10px 12px',
  borderRadius: '8px',
  border: '1px solid rgba(245, 158, 11, 0.2)',
};

const pendingNoticeBoxStyle: React.CSSProperties = {
  padding: '16px',
  background: 'rgba(255, 255, 255, 0.03)',
  borderRadius: '12px',
  border: '1px solid rgba(255, 255, 255, 0.05)',
};
