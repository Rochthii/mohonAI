import React, { useState, useEffect } from 'react';
import { 
  syncUserProfileDB, 
  adminFetchPendingTransactions, 
  adminApproveTransaction, 
  adminUpdateUserCoins 
} from '../services/gemini';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  coinsBalance: number;
  userEmail: string;
  isSandboxMode: boolean;
  userId: string;
  onUpdateCoins: (newBalance: number) => void;
  onUpdateEmail: (email: string) => void;
  onUpdateSandbox: (enabled: boolean) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  coinsBalance,
  userEmail,
  isSandboxMode,
  userId,
  onUpdateCoins,
  onUpdateEmail,
  onUpdateSandbox,
}) => {
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);

  // Admin Portal States
  const [adminSecretInput, setAdminSecretInput] = useState(() => {
    return localStorage.getItem('cfg_admin_secret') || '';
  });
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [pendingTxs, setPendingTxs] = useState<any[]>([]);
  const [targetUserId, setTargetUserId] = useState('');
  const [targetCoins, setTargetCoins] = useState('');
  const [adminSuccess, setAdminSuccess] = useState('');
  const [adminError, setAdminError] = useState('');
  const [isLoadingAdminData, setIsLoadingAdminData] = useState(false);
  const [adminModeUnlocked, setAdminModeUnlocked] = useState(() => {
    return localStorage.getItem('cfg_admin_secret') ? true : false;
  });
  const [clickCount, setClickCount] = useState(0);

  const handleAvatarClick = () => {
    const newCount = clickCount + 1;
    setClickCount(newCount);
    if (newCount >= 5) {
      setAdminModeUnlocked(true);
      setAdminSuccess('Chế độ cấu hình Quản trị viên đã được mở khóa.');
    }
  };

  useEffect(() => {
    if (isOpen && adminSecretInput) {
      verifyAdminAccess();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Handles Email Sync with Cloud Database
  const handleEmailSyncSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (!emailInput || !emailInput.includes('@')) {
      setErrorMessage('Vui lòng nhập địa chỉ Email hợp lệ.');
      return;
    }

    if (!passwordInput || passwordInput.length < 6) {
      setErrorMessage('Mật khẩu liên kết phải có tối thiểu 6 ký tự.');
      return;
    }

    setIsSyncing(true);

    try {
      const res = await syncUserProfileDB(userId, emailInput.trim(), passwordInput);
      if (res.status === 'synced' || res.status === 'registered') {
        
        // If checking an existing email and server returned a different original userId,
        // we switch the local device session to that userId and reload the app!
        if (res.userId && res.userId !== userId) {
          const profile = {
            userId: res.userId,
            coinsBalance: res.coinsBalance,
            email: res.email,
            createdAt: new Date().toISOString()
          };
          localStorage.setItem('tb_user_profile', JSON.stringify(profile));
          
          setSuccessMessage(`Tìm thấy tài khoản cũ! Đang đồng bộ hóa toàn bộ lịch sử và số dư...`);
          setTimeout(() => {
            window.location.reload();
          }, 1500);
          return;
        }

        onUpdateEmail(res.email);
        onUpdateCoins(res.coinsBalance);
        setSuccessMessage(`Đồng bộ thành công! Số dư ${res.coinsBalance} Coins đã được liên kết bảo toàn đám mây.`);
      } else {
        setErrorMessage('Không thể đồng bộ hồ sơ. Vui lòng kiểm tra lại kết nối backend.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Đã xảy ra lỗi đồng bộ dữ liệu ví lên đám mây.');
      console.error(err);
    } finally {
      setIsSyncing(false);
    }
  };

  // Verify Admin Access Key
  const verifyAdminAccess = async () => {
    if (!adminSecretInput.trim()) return;
    setIsLoadingAdminData(true);
    setAdminError('');
    setAdminSuccess('');

    try {
      const txs = await adminFetchPendingTransactions(adminSecretInput.trim());
      setPendingTxs(txs);
      setIsAdminAuthenticated(true);
      localStorage.setItem('cfg_admin_secret', adminSecretInput.trim());
      setAdminSuccess('Đã xác thực quyền Quản trị tối cao thành công.');
    } catch (err: any) {
      setIsAdminAuthenticated(false);
      setAdminError('Mã Secret Quản trị không chính xác hoặc Backend bị từ chối.');
    } finally {
      setIsLoadingAdminData(false);
    }
  };

  const handleAdminLogout = () => {
    setIsAdminAuthenticated(false);
    setAdminSecretInput('');
    localStorage.removeItem('cfg_admin_secret');
    setPendingTxs([]);
    setAdminSuccess('Đã thoát phiên quản trị.');
  };

  // Approve a pending transaction
  const handleApproveTx = async (txId: string) => {
    setAdminError('');
    setAdminSuccess('');
    try {
      const res = await adminApproveTransaction(adminSecretInput.trim(), txId);
      setAdminSuccess(`Đã duyệt giao dịch ${txId}! Cộng ${res.coinsAdded} Coins thành công.`);
      // Refresh list
      const txs = await adminFetchPendingTransactions(adminSecretInput.trim());
      setPendingTxs(txs);
      
      // If this transaction was for the current user, update their local balance!
      const approvedTx = pendingTxs.find(t => t.id === txId);
      if (approvedTx && approvedTx.user_id === userId) {
        onUpdateCoins(res.newBalance);
      }
    } catch (err: any) {
      setAdminError(err.message || 'Lỗi phê duyệt giao dịch.');
    }
  };

  // Adjust balance directly
  const handleUpdateCoinsDirectly = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminError('');
    setAdminSuccess('');

    if (!targetUserId || !targetCoins) {
      setAdminError('Vui lòng điền User ID và số Coins.');
      return;
    }

    try {
      await adminUpdateUserCoins(
        adminSecretInput.trim(),
        targetUserId.trim(),
        parseInt(targetCoins)
      );
      setAdminSuccess(`Cập nhật thành công số dư cho ${targetUserId.trim()} thành ${targetCoins} Coins.`);
      
      // If updating current user, refresh state
      if (targetUserId.trim() === userId) {
        onUpdateCoins(parseInt(targetCoins));
      }
      setTargetUserId('');
      setTargetCoins('');
    } catch (err: any) {
      setAdminError('Lỗi cập nhật số dư người dùng.');
    }
  };

  return (
    <div className="modal-overlay" style={overlayStyle}>
      <div className="glass-panel modal-content" style={modalContentStyle}>
        <div style={headerStyle}>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0 }}>Cài đặt & Quản trị</h2>
          <button onClick={onClose} style={closeBtnStyle}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        {/* User Balance Section */}
        <div style={sectionStyle}>
          <h3 style={subHeaderStyle}>Ví Coin của bạn</h3>
          <div style={coinContainerStyle}>
            <div 
              onClick={handleAvatarClick} 
              className="monogram-avatar animate-pulse-glow" 
              style={{ width: '44px', height: '44px', fontSize: '1.1rem', background: 'var(--accent-gradient)', cursor: 'pointer' }}
              title="Nhấp 5 lần liên tiếp để kích hoạt cổng bí mật"
            >
              C
            </div>
            <div>
              <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#fbbf24' }}>
                {coinsBalance} <span style={{ fontSize: '0.9rem', fontWeight: 500, color: 'var(--text-main)' }}>Coins</span>
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                {userEmail ? `Ví liên kết: ${userEmail}` : 'Ví cục bộ (Chưa liên kết tài khoản)'}
              </div>
            </div>
          </div>
        </div>

        {/* Account Sync Section */}
        <div style={sectionStyle}>
          <h3 style={subHeaderStyle}>Sao lưu đám mây bảo mật</h3>
          
          {userEmail ? (
            <div style={loggedInBoxStyle}>
              <div style={{ fontSize: '0.85rem' }}>
                Đã liên kết với Email: <strong style={{ color: 'var(--accent-color)' }}>{userEmail}</strong>
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                Số dư Coin và lịch sử chat đã được đồng bộ tự động lên đám mây bảo mật.
              </div>
            </div>
          ) : (
            <form onSubmit={handleEmailSyncSubmit} style={formStyle}>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0 0 4px 0', lineHeight: 1.45 }}>
                Nhập email và thiết lập mật khẩu để liên kết ví. Khi thay đổi thiết bị, bạn chỉ cần nhập đúng email và mật khẩu này để lấy lại số dư và lịch sử chat của mình.
              </p>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
                <input 
                  type="email" 
                  placeholder="Nhập địa chỉ email..." 
                  value={emailInput} 
                  onChange={(e) => setEmailInput(e.target.value)} 
                  style={inputStyle}
                  required
                />
                
                <div style={inputFormRowStyle}>
                  <input 
                    type="password" 
                    placeholder="Mật khẩu liên kết (tối thiểu 6 ký tự)..." 
                    value={passwordInput} 
                    onChange={(e) => setPasswordInput(e.target.value)} 
                    style={inputStyle}
                    required
                  />
                  <button type="submit" className="glow-btn" style={{ padding: '8px 16px', fontSize: '0.8rem', minWidth: '95px' }} disabled={isSyncing}>
                    {isSyncing ? 'Đang lưu...' : 'Liên kết'}
                  </button>
                </div>
              </div>

              {errorMessage && <div style={errorStyle}>{errorMessage}</div>}
              {successMessage && <div style={successStyle}>{successMessage}</div>}
            </form>
          )}
        </div>

        {/* Developer Sandbox & Admin Panels (Only shown to authentic Admin who unlocked via Easter Egg) */}
        {adminModeUnlocked && (
          <>
            {/* Developer Sandbox Switch */}
            <div style={sectionStyle}>
              <h3 style={subHeaderStyle}>Thử nghiệm Sandbox</h3>
              <div style={sandboxContainerStyle}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>Chế độ Sandbox thanh toán</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Giả lập phê duyệt giao dịch nạp coin tức thì không cần qua Admin phê duyệt.
                  </div>
                </div>
                <label className="switch" style={switchStyle}>
                  <input 
                    type="checkbox" 
                    checked={isSandboxMode} 
                    onChange={(e) => onUpdateSandbox(e.target.checked)} 
                    style={checkboxStyle}
                  />
                  <span className="slider round" style={{
                    ...sliderStyle,
                    backgroundColor: isSandboxMode ? 'var(--accent-color)' : '#374151'
                  }}></span>
                </label>
              </div>
            </div>

            {/* ADMIN PORTAL PANEL */}
            <div style={{ ...sectionStyle, borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '16px' }}>
              <h3 style={{ ...subHeaderStyle, color: 'var(--accent-color)' }}>Cổng Quản Trị Tối Cao</h3>
              
              {!isAdminAuthenticated ? (
                <div style={formStyle}>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0 0 4px 0' }}>
                    Nhập mã X-Admin-Secret để kích hoạt bảng điều khiển phê duyệt nạp coin & sửa đổi số dư.
                  </p>
                  <div style={inputFormRowStyle}>
                    <input 
                      type="password" 
                      placeholder="Nhập mã Secret Admin..." 
                      value={adminSecretInput} 
                      onChange={(e) => setAdminSecretInput(e.target.value)} 
                      style={inputStyle}
                    />
                    <button 
                      type="button" 
                      onClick={verifyAdminAccess} 
                      className="secondary-btn" 
                      style={{ padding: '8px 16px', fontSize: '0.8rem', borderColor: 'var(--border-neon)' }}
                      disabled={isLoadingAdminData}
                    >
                      {isLoadingAdminData ? 'Xác thực...' : 'Xác thực'}
                    </button>
                  </div>
                  {adminError && <div style={errorStyle}>{adminError}</div>}
                </div>
              ) : (
                <div style={adminPanelBoxStyle}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#10b981' }}>Đã kết nối Console Admin</span>
                    <button onClick={handleAdminLogout} style={adminLogoutLinkStyle}>Thoát quản trị</button>
                  </div>

                  {adminSuccess && <div style={{ ...successStyle, marginBottom: '10px' }}>{adminSuccess}</div>}
                  {adminError && <div style={{ ...errorStyle, marginBottom: '10px' }}>{adminError}</div>}

                  {/* Pending Transactions List */}
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '6px', color: 'var(--text-main)' }}>
                      Lệnh nạp chờ duyệt ({pendingTxs.length})
                    </div>
                    {pendingTxs.length === 0 ? (
                      <div style={emptyTxsStyle}>Không có lệnh nạp nào đang chờ xử lý.</div>
                    ) : (
                      <div style={txListScrollStyle}>
                        {pendingTxs.map(tx => (
                          <div key={tx.id} style={txRowStyle}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-highlight)' }}>
                                ID: {tx.id.substring(0, 12)}...
                              </span>
                              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                User: {tx.user_id.substring(0, 14)}
                              </span>
                              <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#fbbf24' }}>
                                Số tiền: {tx.amount.toLocaleString()}đ (+{tx.coins_added} Coins)
                              </span>
                            </div>
                            <button 
                              onClick={() => handleApproveTx(tx.id)} 
                              className="glow-btn" 
                              style={{ padding: '4px 8px', fontSize: '0.7rem', background: '#059669', boxShadow: 'none' }}
                            >
                              Duyệt
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Adjust Balance Direct Form */}
                  <div>
                    <div style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '6px', color: 'var(--text-main)' }}>
                      Điều chỉnh số dư trực tiếp
                    </div>
                    <form onSubmit={handleUpdateCoinsDirectly} style={formStyle}>
                      <input 
                        type="text" 
                        placeholder="Mã User ID (ví dụ: MOHON-USR-XYZ)..." 
                        value={targetUserId} 
                        onChange={(e) => setTargetUserId(e.target.value)} 
                        style={adminInputStyle}
                        required
                      />
                      <div style={inputFormRowStyle}>
                        <input 
                          type="number" 
                          placeholder="Số Coins thiết lập..." 
                          value={targetCoins} 
                          onChange={(e) => setTargetCoins(e.target.value)} 
                          style={adminInputStyle}
                          required
                        />
                        <button 
                          type="submit" 
                          className="glow-btn" 
                          style={{ padding: '8px 16px', fontSize: '0.8rem', background: 'var(--accent-gradient)' }}
                        >
                          Cập nhật
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

/* STYLES FOR THE MODAL */
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
  maxWidth: '440px',
  padding: '20px',
  display: 'flex',
  flexDirection: 'column',
  gap: '16px',
  maxHeight: '92vh',
  overflowY: 'auto',
  border: '1px solid var(--border-neon)',
  color: 'var(--text-main)',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
  paddingBottom: '10px',
};

const closeBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--text-muted)',
  cursor: 'pointer',
  padding: 0,
};

const sectionStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
};

const subHeaderStyle: React.CSSProperties = {
  fontSize: '0.75rem',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: 'var(--text-muted)',
  marginBottom: '2px',
};

const coinContainerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  padding: '12px',
  background: 'rgba(255, 255, 255, 0.03)',
  borderRadius: '10px',
  border: '1px solid rgba(255, 255, 255, 0.05)',
};

const loggedInBoxStyle: React.CSSProperties = {
  padding: '12px',
  background: 'rgba(168, 85, 247, 0.05)',
  borderRadius: '10px',
  border: '1px solid rgba(168, 85, 247, 0.15)',
};

const formStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
};

const inputFormRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '8px',
  width: '100%',
};

const inputStyle: React.CSSProperties = {
  flexGrow: 1,
  background: 'rgba(0, 0, 0, 0.25)',
  border: '1px solid rgba(255, 255, 255, 0.1)',
  borderRadius: '8px',
  padding: '8px 12px',
  color: '#fff',
  fontSize: '0.85rem',
  fontFamily: 'var(--font-sans)',
  outline: 'none',
};

const adminInputStyle: React.CSSProperties = {
  background: 'rgba(0, 0, 0, 0.4)',
  border: '1px solid rgba(255, 255, 255, 0.15)',
  borderRadius: '6px',
  padding: '8px 10px',
  color: '#fff',
  fontSize: '0.8rem',
  fontFamily: 'var(--font-sans)',
  outline: 'none',
  width: '100%',
};

const errorStyle: React.CSSProperties = {
  fontSize: '0.75rem',
  color: '#ef4444',
  background: 'rgba(239, 68, 68, 0.08)',
  padding: '8px 10px',
  borderRadius: '6px',
  border: '1px solid rgba(239, 68, 68, 0.2)',
};

const successStyle: React.CSSProperties = {
  fontSize: '0.75rem',
  color: '#10b981',
  background: 'rgba(16, 185, 129, 0.08)',
  padding: '8px 10px',
  borderRadius: '6px',
  border: '1px solid rgba(16, 185, 129, 0.2)',
};

const sandboxContainerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '10px 12px',
  background: 'rgba(255, 255, 255, 0.03)',
  borderRadius: '10px',
  border: '1px solid rgba(255, 255, 255, 0.05)',
};

const switchStyle: React.CSSProperties = {
  position: 'relative',
  display: 'inline-block',
  width: '40px',
  height: '20px',
  cursor: 'pointer',
};

const checkboxStyle: React.CSSProperties = {
  opacity: 0,
  width: 0,
  height: 0,
};

const sliderStyle: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  borderRadius: '20px',
  transition: '0.3s',
};

const adminPanelBoxStyle: React.CSSProperties = {
  padding: '12px',
  background: 'rgba(0, 0, 0, 0.2)',
  border: '1.5px solid rgba(168, 85, 247, 0.2)',
  borderRadius: '10px',
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
};

const adminLogoutLinkStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#ef4444',
  fontSize: '0.75rem',
  cursor: 'pointer',
  textDecoration: 'underline',
  padding: 0,
};

const emptyTxsStyle: React.CSSProperties = {
  fontSize: '0.75rem',
  color: 'var(--text-muted)',
  fontStyle: 'italic',
  padding: '8px 0',
  textAlign: 'center',
};

const txListScrollStyle: React.CSSProperties = {
  maxHeight: '130px',
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  background: 'rgba(0, 0, 0, 0.25)',
  padding: '8px',
  borderRadius: '6px',
};

const txRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  background: 'rgba(255, 255, 255, 0.02)',
  border: '1px solid rgba(255, 255, 255, 0.05)',
  padding: '6px 8px',
  borderRadius: '4px',
};
