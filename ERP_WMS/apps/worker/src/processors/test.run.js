// Job này giả vờ làm việc mất 2 giây
module.exports = async (job) => {
    console.log(`👷 [Xử lý] Đang thực hiện Job ID: ${job.id}`);
    console.log(`📦 Dữ liệu nhận được:`, job.data);

    // Giả lập độ trễ (như đang gửi email thật)
    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log(`✅ [Hoàn tất] Job ${job.id} đã xong!`);
    return { result: "Thành công mỹ mãn" };
};