import React, { useEffect, useRef, useState } from 'react';

interface CanvasQuoteProps {
  isOpen: boolean;
  onClose: () => void;
  userText: string;
  aiResponse: string;
  personaName: string;
  personaAvatar: string;
  themeColor: string;
}

const GRADIENTS = [
  { id: 'neon', name: 'Tím Hồng Neon', colors: ['#c084fc', '#db2777'] },
  { id: 'mystic', name: 'Xanh Huyền Bí', colors: ['#06b6d4', '#4f46e5'] },
  { id: 'emerald', name: 'Lục Bảo Matrix', colors: ['#10b981', '#064e3b'] },
  { id: 'crimson', name: 'Cờ Đỏ Rực Lửa', colors: ['#f43f5e', '#7f1d1d'] },
];

export const CanvasQuote: React.FC<CanvasQuoteProps> = ({
  isOpen,
  onClose,
  userText,
  aiResponse,
  personaName,
  personaAvatar,
  themeColor,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [selectedGradient, setSelectedGradient] = useState(GRADIENTS[0]);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [showWatermark, setShowWatermark] = useState(true);

  // Helper to wrap text in Canvas
  const wrapText = (
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    lineHeight: number
  ): number => {
    const words = text.split(' ');
    let line = '';
    let currentY = y;

    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + ' ';
      const metrics = ctx.measureText(testLine);
      const testWidth = metrics.width;
      if (testWidth > maxWidth && n > 0) {
        ctx.fillText(line, x, currentY);
        line = words[n] + ' ';
        currentY += lineHeight;
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line, x, currentY);
    return currentY + lineHeight;
  };

  const drawCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Dimensions
    const width = 800;
    const height = 600;
    canvas.width = width;
    canvas.height = height;

    // 1. Draw Background Gradient
    const grad = ctx.createLinearGradient(0, 0, width, height);
    grad.addColorStop(0, selectedGradient.colors[0]);
    grad.addColorStop(1, selectedGradient.colors[1]);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    // 2. Draw Sleek Glass Container Box
    const containerX = 80;
    const containerY = 80;
    const containerW = 640;
    const containerH = 440;
    const radius = 24;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(containerX + radius, containerY);
    ctx.arcTo(containerX + containerW, containerY, containerX + containerW, containerY + containerH, radius);
    ctx.arcTo(containerX + containerW, containerY + containerH, containerX, containerY + containerH, radius);
    ctx.arcTo(containerX, containerY + containerH, containerX, containerY, radius);
    ctx.arcTo(containerX, containerY, containerX + containerW, containerY, radius);
    ctx.closePath();

    // Box fill styling depending on Dark/Light mode
    if (isDarkMode) {
      ctx.fillStyle = 'rgba(11, 15, 25, 0.85)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    } else {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.05)';
    }
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();

    // 3. Draw Watermark logo if checked
    if (showWatermark) {
      ctx.font = 'bold 15px Plus Jakarta Sans';
      ctx.fillStyle = isDarkMode ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.3)';
      ctx.fillText('Mỏ Hỗn AI • mohon.ai', containerX + 32, containerY + containerH - 32);

      // Draw secondary text
      ctx.font = '500 13px Inter';
      ctx.fillStyle = isDarkMode ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)';
      ctx.fillText('AI Đọc Vị Tình Cảm & Bóc Trần Drama', containerX + containerW - 250, containerY + containerH - 32);
    }

    // 4. Draw User Original Message (Right Bubble)
    const bubbleMaxW = 400;
    const userBubbleX = containerX + containerW - 32 - bubbleMaxW;
    const userBubbleY = containerY + 48;

    // Estimate user text height
    ctx.font = '500 15px Inter';
    const userTextToMeasure = userText.length > 90 ? userText.substring(0, 87) + '...' : userText;
    
    // Draw User Text Bubble Background
    ctx.save();
    ctx.fillStyle = isDarkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)';
    // A simplified nice rectangle bubble for text
    ctx.beginPath();
    ctx.roundRect(userBubbleX - 12, userBubbleY - 12, bubbleMaxW + 24, 75, 12);
    ctx.fill();
    ctx.restore();

    // User Text Draw
    ctx.fillStyle = isDarkMode ? '#e2e8f0' : '#334155';
    ctx.font = 'italic 15px Inter';
    ctx.fillText('Bối cảnh của bạn:', userBubbleX, userBubbleY + 8);
    ctx.font = '500 15px Inter';
    ctx.fillStyle = isDarkMode ? '#fff' : '#0f172a';
    wrapText(ctx, `"${userTextToMeasure}"`, userBubbleX, userBubbleY + 30, bubbleMaxW, 20);

    // 5. Draw AI Response Bubble (Left Bubble, Persona Branded)
    const aiBubbleX = containerX + 104; // leave space for avatar
    const aiBubbleY = containerY + 160;
    const aiBubbleW = 480;

    // Render Avatar Circle
    const avatarX = containerX + 52;
    const avatarY = aiBubbleY + 28;
    ctx.save();
    ctx.beginPath();
    ctx.arc(avatarX, avatarY, 28, 0, Math.PI * 2);
    // Draw Persona Accent Ring
    ctx.strokeStyle = themeColor;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.fillStyle = isDarkMode ? '#1e293b' : '#f1f5f9';
    ctx.fill();
    ctx.restore();

    // Draw Monogram Avatar inside circle
    ctx.font = 'bold 15px Plus Jakarta Sans';
    ctx.fillStyle = isDarkMode ? '#ffffff' : '#0f172a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(personaAvatar, avatarX, avatarY + 1);

    // Draw Persona Name
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = 'bold 15px Plus Jakarta Sans';
    ctx.fillStyle = themeColor;
    ctx.fillText(personaName, aiBubbleX, aiBubbleY - 6);

    // Draw AI Text Bubble Background
    ctx.save();
    ctx.fillStyle = isDarkMode ? 'rgba(255, 255, 255, 0.04)' : '#f8fafc';
    ctx.strokeStyle = isDarkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)';
    ctx.beginPath();
    ctx.roundRect(aiBubbleX - 16, aiBubbleY + 6, aiBubbleW, 160, 16);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Draw AI Text
    ctx.font = '600 16px Plus Jakarta Sans';
    ctx.fillStyle = isDarkMode ? '#f8fafc' : '#0f172a';
    wrapText(ctx, aiResponse, aiBubbleX, aiBubbleY + 36, aiBubbleW - 32, 24);
  };

  // Re-draw canvas whenever styling variables change
  useEffect(() => {
    if (!isOpen) return;
    
    // Small delay to ensure the canvas ref is fully loaded and sized
    const timer = setTimeout(() => {
      drawCanvas();
    }, 100);

    return () => clearTimeout(timer);
  }, [isOpen, selectedGradient, isDarkMode, showWatermark, userText, aiResponse, drawCanvas]);

  if (!isOpen) return null;

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dataUrl = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `MoHonAI_Quote_${new Date().getTime()}.png`;
    link.href = dataUrl;
    link.click();
  };

  return (
    <div className="modal-overlay" style={overlayStyle}>
      <div className="glass-panel modal-content" style={modalContentStyle}>
        
        {/* HEADER */}
        <div style={headerStyle}>
          <h2 style={{ fontSize: '1.3rem', margin: 0 }}>Thiết Kế Quote Card</h2>
          <button onClick={onClose} style={closeBtnStyle}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        {/* MAIN BODY: CANVAS PREVIEW */}
        <div style={bodyStyle}>
          <div style={canvasContainerStyle}>
            <canvas 
              ref={canvasRef} 
              style={{
                width: '100%',
                aspectRatio: '4/3',
                borderRadius: '8px',
                boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
              }}
            />
          </div>

          {/* CONTROLS */}
          <div style={controlsPaneStyle}>
            <div style={controlGroupStyle}>
              <span style={controlLabelStyle}>Màu Nền Gradient</span>
              <div style={gradientPickerStyle}>
                {GRADIENTS.map((g) => (
                  <button 
                    key={g.id}
                    title={g.name}
                    onClick={() => setSelectedGradient(g)}
                    style={{
                      ...gradientBtnStyle,
                      border: selectedGradient.id === g.id ? '2px solid #fff' : '2px solid transparent',
                      background: `linear-gradient(135deg, ${g.colors[0]} 0%, ${g.colors[1]} 100%)`
                    }}
                  />
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              <label style={checkboxLabelStyle}>
                <input 
                  type="checkbox" 
                  checked={isDarkMode} 
                  onChange={(e) => setIsDarkMode(e.target.checked)} 
                  style={{ marginRight: '6px' }}
                />
                Chế độ tối (Dark mode)
              </label>

              <label style={checkboxLabelStyle}>
                <input 
                  type="checkbox" 
                  checked={showWatermark} 
                  onChange={(e) => setShowWatermark(e.target.checked)} 
                  style={{ marginRight: '6px' }}
                />
                Hiện Logo Watermark
              </label>
            </div>

            <button onClick={handleDownload} className="glow-btn" style={{ width: '100%', marginTop: '8px' }}>
              📥 Tải Ảnh PNG Về Máy
            </button>
          </div>
        </div>

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
  maxWidth: '560px',
  padding: '24px',
  display: 'flex',
  flexDirection: 'column',
  gap: '16px',
  maxHeight: '95vh',
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

const bodyStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '16px',
};

const canvasContainerStyle: React.CSSProperties = {
  width: '100%',
  background: '#070a13',
  padding: '8px',
  borderRadius: '12px',
  border: '1px solid rgba(255, 255, 255, 0.05)',
};

const controlsPaneStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '14px',
  padding: '16px',
  background: 'rgba(255, 255, 255, 0.02)',
  borderRadius: '12px',
  border: '1px solid rgba(255, 255, 255, 0.05)',
};

const controlGroupStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
};

const controlLabelStyle: React.CSSProperties = {
  fontSize: '0.85rem',
  fontWeight: 600,
  color: 'var(--text-main)',
};

const gradientPickerStyle: React.CSSProperties = {
  display: 'flex',
  gap: '8px',
};

const gradientBtnStyle: React.CSSProperties = {
  width: '28px',
  height: '28px',
  borderRadius: '50%',
  cursor: 'pointer',
  outline: 'none',
  boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
};

const checkboxLabelStyle: React.CSSProperties = {
  fontSize: '0.85rem',
  color: 'var(--text-main)',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
};
export default CanvasQuote;
