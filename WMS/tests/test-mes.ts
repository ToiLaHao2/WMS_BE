import { MesGrpcClient } from '../libs/core/contracts/mes-grpc.client';

async function runTest() {
    console.log("📡 Đang kết nối tới MES Python...");
    const client = new MesGrpcClient();

    try {
        const result = await client.calculatePath(
            "WH001",
            { x: 0, y: 0 },
            { x: 4, y: 2 }
        );

        if (result.success) {
            console.log("✅ Python đã trả về đường đi:", result.waypoints);
        } else {
            console.log("⚠️ Python báo không tìm thấy đường:", result.message);
        }
    } catch (err) {
        console.error("💥 Lỗi kết nối gRPC:", err);
    }
}

runTest();
