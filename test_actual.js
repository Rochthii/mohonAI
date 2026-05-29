// Script test thực tế hợp nhất 3 trong 1 - AI tự động nhận diện intent của Mỏ Hỗn AI
async function runTest() {
  console.log("=== BẮT ĐẦU KIỂM THỬ THỰC TẾ HỢP NHẤT 3 TRONG 1 ===");
  
  const cases = [
    {
      name: "Tự động nhận diện Roast Khịa (Kể lể drama)",
      payload: {
        personaId: "savage",
        type: "roast",
        text: "Crush bảo bận cày KPI nên rep chậm 8 tiếng"
      }
    },
    {
      name: "Tự động nhận diện Dịch Thảo Mai (Yêu cầu thảo mai)",
      payload: {
        personaId: "savage",
        type: "roast",
        text: "dịch thảo mai hộ tao câu này: Làm ăn như hạch, trả tiền đây nhanh"
      }
    },
    {
      name: "Tự động nhận diện Soạn Rep Hộ (Dán tin nhắn đối phương cần rep)",
      payload: {
        personaId: "savage",
        type: "roast",
        text: "Nó nhắn: 'Tối nay anh bận đi bar với bạn thân khác giới rồi', rep sao cho ngầu?"
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
  
  console.log("\n=== HOÀN THÀNH KIỂM THỬ HỢP NHẤT ===");
}

// Chờ server khởi động 2 giây rồi chạy test
setTimeout(runTest, 2000);
