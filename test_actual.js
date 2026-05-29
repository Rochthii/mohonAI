// Script kiểm thử thực tế 4 sắc thái cảm xúc của Bạn Thân Quốc Dân AI
async function runTest() {
  console.log("=== BẮT ĐẦU KIỂM THỬ THỰC TẾ BẠN THÂN QUỐC DÂN AI ===");
  
  const cases = [
    {
      name: "1. Sắc thái Trò chuyện (Casual Chat)",
      payload: {
        personaId: "bestie",
        type: "roast",
        text: "hôm nay tao mới thi xong nè mày ơi, vừa mệt vừa vui"
      }
    },
    {
      name: "2. Sắc thái An ủi (Comfort & Console)",
      payload: {
        personaId: "bestie",
        type: "roast",
        text: "tao mới bị rớt phỏng vấn chiều nay xong, buồn quá muốn khóc luôn bạn thân ơi"
      }
    },
    {
      name: "3. Sắc thái Mỏ hỗn (Sassy Tough Love)",
      payload: {
        personaId: "bestie",
        type: "roast",
        text: "người yêu cũ cắm sừng tao vừa nhắn tin xin hẹn gặp mặt cafe nói chuyện lại, tao có nên đi không?"
      }
    },
    {
      name: "4. Sắc thái Nói xấu (Gossip & Trash-talk)",
      payload: {
        personaId: "bestie",
        type: "roast",
        text: "con mụ đồng nghiệp cùng phòng lại đi mách lẻo nói xấu sau lưng tao với sếp, hãm không chịu nổi"
      }
    }
  ];

  for (const c of cases) {
    try {
      console.log(`\n[Gửi Request] ${c.name}`);
      console.log(`- Nội dung gửi: "${c.payload.text}"`);
      
      const response = await fetch("http://localhost:5000/api/roast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(c.payload)
      });
      
      if (!response.ok) {
        throw new Error(`HTTP Error: ${response.status}`);
      }
      
      const data = await response.json();
      console.log(`- Kết quả AI trả về (${data.provider}):`);
      console.log(`  > "${data.text}"`);
    } catch (err) {
      console.error(`- Thất bại:`, err.message);
    }
  }
  
  console.log("\n=== HOÀN THÀNH KIỂM THỬ BẠN THÂN QUỐC DÂN ===");
}

// Chờ server khởi động 2 giây rồi chạy test
setTimeout(runTest, 2000);
