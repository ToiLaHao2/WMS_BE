# Warehouse Management System Simulation - WMSS (Backend / ERP_WMS Layer)

Dự án này là mảnh ghép cốt lõi (Tầng WMS/ERP) trong hệ thống mô phỏng tự động hóa nhà kho đa ngôn ngữ (Polyglot Microservices). Hệ thống tổng thể kiến trúc bao gồm 3 tầng:

- **ERP / WMS (Node.js):** Lớp Business (Quản lý nghiệp vụ) — Trả lời câu hỏi *"Cần làm gì?"*.
- **MES (Python):** Lớp Decision (Quyết định & Điều phối) — Trả lời câu hỏi *"Làm như thế nào?"*.
- **AGV Control (Golang):** Lớp Execution (Thực thi Realtime) — Trả lời câu hỏi *"Thực thi ra sao?"*.

---

## 🎯 Vai trò của lớp WMS (Node.js)

WMS là **"Source of truth" cho business**. Nó quản lý kho, sản phẩm, hàng tồn kho, luồng nhập/xuất và trạng thái nghiệp vụ và WMS cũng là cổng giao tiếp duy nhất đối với Frontend (FE).

---

## 🚀 Các Module Cốt Lõi

### 1. Module `master-data` (Quản lý Nhà Kho & Sản Phẩm)

Quản lý các thông tin tĩnh và cấu trúc vật lý của kho:

* **Warehouse Management:** Tạo kho, generate layout (sơ đồ kho), quản lý danh sách slot.
* **Product Management:** Quản lý thông tin sản phẩm (ID, tên, metadata, kích thước, trọng lượng).

### 2. Module `inventory` (Quản lý Tồn kho)

Theo dõi trạng thái thời gian thực của hàng hóa:

* **Inventory Tracking:** Lưu trữ thông tin item đang ở đâu, slot nào đang bị chiếm dụng (occupied).
* **Business Validation:** Kiểm tra các rule nghiệp vụ (VD: Hàng quá lớn so với chuẩn? Kho đã đầy chưa?) trước khi xử lý lệnh.

### 3. Module `inbound` (Quản lý Nhập hàng)

Xử lý luồng nhập hàng (Import Order):

* Nhận yêu cầu nhập hàng từ người dùng (Frontend).
* Validate các quy tắc nghiệp vụ.
* Đẩy **Task (Yêu cầu nhập hàng)** qua **Kafka** xuống tầng MES (MES sẽ lo tìm vị trí slot tối ưu, tính đường đi và tạo execution plan).

### 4. Module `outbound` (Quản lý Xuất hàng)

Xử lý luồng xuất hàng (Export Order):

* Nhận yêu cầu xuất một mặt hàng.
* Truy xuất `inventory` để biết mặt hàng đang ở đâu.
* Đẩy **Task (Yêu cầu xuất hàng)** qua **Kafka** xuống tầng MES để điều động xử lý việc lấy hàng.

### 5. Module `events / socket` (Real-time Communication)

Cổng giao tiếp thời gian thực (Realtime) duy nhất với Frontend:

* **WMS là cổng duy nhất cho FE:** Frontend chỉ kết nối WebSocket tới WMS.
* **Broadcast vị trí AGV:** Lắng nghe event từ **Redis Pub/Sub** (do tầng Golang publish vị trí AGV lên) và broadcast ngược lại cho Frontend thông qua **Socket.io Redis Adapter**.
* Cập nhật trạng thái inventory/task realtime xuống FE khi nhận được báo cáo hoàn thành.

---

## 🛠 Công nghệ & Giao tiếp (Communication Strategy)

* **Framework:** Node.js, Express, TypeScript.
* **Architecture:** Modular Monolith (sẵn sàng tách Microservices).
* **HTTP REST:** Giao tiếp với FE cho các tác vụ business.
* **WebSocket (Socket.io):** Giao tiếp realtime với FE (Cập nhật vị trí AGV, trạng thái kho).
* **Kafka:** Giao tiếp bất đồng bộ (Async) với MES để giao Task và nhận Report hoàn thành.
* **gRPC:** Giao tiếp đồng bộ (Sync) với MES khi cần kết quả xử lý ngay lập tức (VD: preview/query).
* **Redis:** Lưu trữ Shared Data (Grid, AGV positions) và dùng làm Pub/Sub cho hệ thống Socket.
