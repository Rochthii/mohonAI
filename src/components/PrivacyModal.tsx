import React from 'react';

interface PrivacyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PrivacyModal: React.FC<PrivacyModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const lastUpdated = '28/05/2025';

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={panelStyle} onClick={(e) => e.stopPropagation()}>
        
        {/* Header */}
        <div style={headerStyle}>
          <div>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0, background: 'var(--accent-gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Điều Khoản Dịch Vụ &amp; Chính Sách Bảo Mật
            </h2>
            <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
              Mỏ Hỗn AI · Cập nhật lần cuối: {lastUpdated}
            </p>
          </div>
          <button onClick={onClose} style={closeBtnStyle}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div style={bodyStyle}>

          <Section title="1. Giới Thiệu Dịch Vụ">
            <p>Mỏ Hỗn AI ("<strong>Dịch vụ</strong>", "<strong>chúng tôi</strong>") là nền tảng trò chuyện trí tuệ nhân tạo giải trí dành cho người dùng trưởng thành (18+), cung cấp trải nghiệm tương tác với các nhân vật AI châm biếm có phong cách theo ngữ cảnh ("Persona"). Bằng việc truy cập hoặc sử dụng Dịch vụ, bạn đồng ý tuân thủ và bị ràng buộc bởi các Điều khoản này.</p>
          </Section>

          <Section title="2. Điều Kiện Sử Dụng">
            <ul>
              <li>Người dùng phải từ đủ <strong>18 tuổi trở lên</strong>.</li>
              <li>Nghiêm cấm sử dụng Dịch vụ vào mục đích xúc phạm, đe dọa, quấy rối cá nhân hoặc tổ chức cụ thể ngoài đời thực.</li>
              <li>Nghiêm cấm cố ý khai thác lỗ hổng, tấn công hạ tầng, hoặc giả mạo dữ liệu giao dịch.</li>
              <li>Mỏ Hỗn AI không chịu trách nhiệm pháp lý cho các nội dung do AI sinh ra nếu người dùng sử dụng sai mục đích.</li>
              <li>Nội dung do AI tạo ra mang tính giải trí và <strong>không cấu thành lời khuyên pháp lý, y tế, tài chính, tâm lý</strong>.</li>
            </ul>
          </Section>

          <Section title="3. Dữ Liệu Chúng Tôi Thu Thập">
            <p>Để vận hành Dịch vụ, chúng tôi thu thập và xử lý các loại dữ liệu tối thiểu sau:</p>
            <ul>
              <li><strong>Mã định danh thiết bị (Device ID)</strong>: Tạo tự động, lưu trữ cục bộ trên thiết bị. Không chứa thông tin định danh cá nhân.</li>
              <li><strong>Địa chỉ Email &amp; Mật khẩu</strong> (khi người dùng tự nguyện liên kết tài khoản): Email được lưu dưới dạng văn bản thuần, mật khẩu được mã hóa một chiều bằng thuật toán <strong>SHA-256</strong> trước khi lưu vào cơ sở dữ liệu. Chúng tôi <em>không thể</em> phục hồi mật khẩu gốc của bạn.</li>
              <li><strong>Lịch sử cuộc trò chuyện (Chat History)</strong>: Chỉ được lưu lên đám mây sau khi bạn tự nguyện liên kết tài khoản email. Nếu không liên kết, lịch sử chỉ tồn tại trên thiết bị của bạn (LocalStorage).</li>
              <li><strong>Nội dung văn bản trong ảnh chụp màn hình (OCR)</strong>: Được trích xuất tạm thời trong bộ nhớ của trình duyệt trên thiết bị bạn bằng thư viện <strong>Tesseract.js</strong> (hoàn toàn client-side) và <strong>không bao giờ</strong> được lưu trữ trên máy chủ của chúng tôi.</li>
              <li><strong>Thông tin giao dịch nạp Coin</strong>: Mã giao dịch, số tiền, trạng thái thanh toán — được lưu để phục vụ mục đích xác minh và duyệt thủ công bởi Quản trị viên.</li>
            </ul>
          </Section>

          <Section title="4. Cách Chúng Tôi Sử Dụng Dữ Liệu">
            <ul>
              <li>Vận hành và duy trì tính ổn định của Dịch vụ.</li>
              <li>Đồng bộ số dư Coin và lịch sử trò chuyện giữa các thiết bị của bạn.</li>
              <li>Xử lý, xác minh và duyệt các lệnh nạp Coin do bạn yêu cầu.</li>
              <li>Ghi nhận nhật ký kiểm toán (<em>Audit Log</em>) bất biến cho các hành động có tác động tài chính nhằm mục đích kiểm soát gian lận và giải quyết tranh chấp.</li>
              <li><strong>Chúng tôi không bán, không cho thuê, không tiết lộ dữ liệu cá nhân của bạn cho bên thứ ba</strong> vì mục đích thương mại.</li>
            </ul>
          </Section>

          <Section title="5. Bảo Mật Dữ Liệu">
            <ul>
              <li>Dữ liệu được lưu trữ trên hạ tầng đám mây bảo mật cấp doanh nghiệp, mã hóa khi truyền tải (TLS/HTTPS) và khi lưu trữ tĩnh (Encryption at Rest).</li>
              <li>Mật khẩu người dùng được băm một chiều (One-way Hash) bằng SHA-256 — không ai, kể cả đội ngũ vận hành, có thể đọc được mật khẩu gốc.</li>
              <li>Toàn bộ API nhạy cảm (duyệt giao dịch, điều chỉnh số dư) được bảo vệ bởi khóa bí mật duy nhất tại phía máy chủ (Server-Side RBAC). Việc ẩn nút trên giao diện <strong>không</strong> thay thế cho xác thực phía máy chủ.</li>
              <li>Hình ảnh đính kèm do bạn gửi lên được xử lý ngay lập tức trong bộ nhớ và <strong>không được lưu trữ vĩnh viễn</strong> trên bất kỳ máy chủ nào.</li>
            </ul>
          </Section>

          <Section title="6. Quyền Riêng Tư &amp; Quyền Của Bạn">
            <ul>
              <li><strong>Quyền truy cập &amp; sao chép</strong>: Bạn có quyền yêu cầu bản sao dữ liệu cá nhân chúng tôi đang lưu giữ.</li>
              <li><strong>Quyền xóa dữ liệu</strong>: Bạn có quyền yêu cầu xóa toàn bộ dữ liệu tài khoản tại bất kỳ thời điểm nào.</li>
              <li><strong>Quyền chỉnh sửa</strong>: Bạn có thể cập nhật thông tin email tài khoản thông qua giao diện Cài đặt.</li>
              <li>Mọi yêu cầu thực thi quyền riêng tư, gửi về địa chỉ: <strong>rochthi59@gmail.com</strong>. Chúng tôi cam kết phản hồi trong vòng <strong>7 ngày làm việc</strong>.</li>
            </ul>
          </Section>

          <Section title="7. Hệ Thống Coin &amp; Thanh Toán">
            <ul>
              <li>Coin là đơn vị tiện ích nội bộ dùng để mở khóa một số tính năng phân tích nâng cao trong Dịch vụ.</li>
              <li>Mọi giao dịch nạp Coin phải được xác nhận thủ công bởi Quản trị viên có thẩm quyền trước khi Coin được cộng vào ví.</li>
              <li>Coin <strong>không có giá trị tiền tệ</strong>, không thể quy đổi, rút, hoặc chuyển nhượng ra bên ngoài Dịch vụ.</li>
              <li>Trong trường hợp phát sinh tranh chấp giao dịch, bằng chứng được xác định dựa trên nhật ký kiểm toán (Audit Log) bất biến tại phía máy chủ.</li>
              <li>Chúng tôi có quyền hoàn tiền hoặc hoàn Coin trong các trường hợp lỗi hệ thống được xác minh, theo phán quyết của Quản trị viên.</li>
            </ul>
          </Section>

          <Section title="8. Miễn Trừ Trách Nhiệm">
            <p>Dịch vụ được cung cấp theo dạng "<em>nguyên trạng</em>" (as-is). Chúng tôi không bảo đảm về tính chính xác, đầy đủ hay phù hợp cho mục đích cụ thể của nội dung do AI tạo ra. Người dùng chịu toàn bộ trách nhiệm về việc sử dụng nội dung đó trong thực tế.</p>
          </Section>

          <Section title="9. Sửa Đổi Điều Khoản">
            <p>Chúng tôi có quyền cập nhật Điều khoản này bất kỳ lúc nào. Khi có thay đổi trọng yếu, thông báo sẽ được hiển thị rõ ràng trong Dịch vụ. Việc tiếp tục sử dụng Dịch vụ sau khi thay đổi có hiệu lực được coi là chấp nhận điều khoản mới.</p>
          </Section>

          <Section title="10. Liên Hệ">
            <p>Mọi thắc mắc về Điều khoản và Chính sách Bảo mật, vui lòng liên hệ:</p>
            <ul>
              <li>Email: <strong>rochthi59@gmail.com</strong></li>
              <li>Mỏ Hỗn AI — Nền tảng AI Giải Trí Đọc Vị Tình Cảm &amp; Bóc Trần Drama</li>
            </ul>
          </Section>

        </div>

        {/* Footer */}
        <div style={footerStyle}>
          <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textAlign: 'center', margin: 0 }}>
            Bằng việc sử dụng Mỏ Hỗn AI, bạn xác nhận đã đọc, hiểu và đồng ý với toàn bộ Điều khoản &amp; Chính sách Bảo mật này.
          </p>
          <button onClick={onClose} className="glow-btn" style={{ width: '100%', marginTop: '10px', padding: '9px', fontSize: '0.85rem' }}>
            Tôi đã đọc và đồng ý
          </button>
        </div>

      </div>
    </div>
  );
};

// ─── Sub-component for each section ───────────────────────────────────
const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div style={{ marginBottom: '18px' }}>
    <h3 style={{
      fontSize: '0.78rem',
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: '0.06em',
      color: 'var(--accent-color)',
      margin: '0 0 6px 0',
    }}>
      {title}
    </h3>
    <div style={{ fontSize: '0.82rem', color: 'var(--text-main)', lineHeight: 1.6 }}>
      {children}
    </div>
  </div>
);

// ─── Styles ────────────────────────────────────────────────────────────
const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  backgroundColor: 'rgba(0,0,0,0.8)',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  zIndex: 1100,
  padding: '16px',
};

const panelStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: '520px',
  maxHeight: '90vh',
  display: 'flex',
  flexDirection: 'column',
  background: 'rgba(13, 17, 32, 0.97)',
  backdropFilter: 'blur(24px)',
  WebkitBackdropFilter: 'blur(24px)',
  border: '1px solid var(--border-neon)',
  borderRadius: '18px',
  boxShadow: '0 24px 80px rgba(0,0,0,0.6), 0 0 40px rgba(168,85,247,0.08)',
  overflow: 'hidden',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  padding: '18px 20px 14px',
  borderBottom: '1px solid rgba(255,255,255,0.07)',
  flexShrink: 0,
};

const closeBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--text-muted)',
  cursor: 'pointer',
  padding: '2px',
  flexShrink: 0,
};

const bodyStyle: React.CSSProperties = {
  padding: '20px',
  overflowY: 'auto',
  flexGrow: 1,
};

const footerStyle: React.CSSProperties = {
  padding: '14px 20px',
  borderTop: '1px solid rgba(255,255,255,0.07)',
  flexShrink: 0,
  background: 'rgba(0,0,0,0.2)',
};
