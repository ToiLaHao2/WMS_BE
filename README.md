# Warehouse Management System Simulation - WMSS (Backend / ERP_WMS Layer)

Dự án này là mảnh ghép cốt lõi (Tầng WMS/ERP) trong hệ thống mô phỏng tự động hóa nhà kho đa ngôn ngữ (Polyglot Microservices). Hệ thống tổng thể bao gồm 3 tác nhân chính phối hợp với nhau:

- **ERP / WMS (Node.js):** Đóng vai trò là "Bộ não chiến lược" - Quản lý logic hàng hóa và ra lệnh.
- **MES (Python):** Đóng vai trò "Người điều phối" - Lập lịch và phân bổ tác vụ.
- **AGV Control Service (Golang):** Đóng vai trò "Hệ cơ bắp" - Điều khiển và tính toán tọa độ di chuyển thực tế cho robot AGV.

---

## Vai trò của lớp WMS (Node.js)

Lớp WMS chịu trách nhiệm toàn bộ về mặt **Logic Dữ Liệu** của nhà kho. WMS sẽ quyết định "Có bao nhiêu hàng?", "Hàng cất ở đâu?", và ra lệnh "Nhập/Xuất hàng này đi" xuống cho tầng MES và AGV.

## Các Module Cốt Lõi

### 1. Module `master-data` (Dữ liệu gốc)

Quản lý các thông tin tĩnh để tạo nền tảng vẽ bản đồ và nhận diện hàng hóa:

* **Products (Sản phẩm):** Quản lý danh mục hàng hóa cơ bản (ID, Tên, Mã SKU).
* **Locations (Sơ đồ kho):** Quản lý danh sách các Kệ (Rack/Bin) và trạng thái không gian của kệ (Trống / Đầy).

### 2. Module `inventory` (Quản lý Tồn kho)

Trái tim của hệ thống kiểm soát tài sản:

* **Inventory Status:** Lưu trữ logic liên kết (Mapping) giữa Sản phẩm và Vị trí (Sản phẩm A đang nằm ở Kệ B với số lượng X).
* **Transaction Logic:** Đảm bảo tính nhất quán của dữ liệu (Data Consistency) thông qua các hàm thêm/bớt tồn kho an toàn, tránh lỗi âm số lượng.

### 3. Module `inbound` (Quản lý Nhập hàng)

Xử lý luồng Automation Push:

* Nhận yêu cầu nhập kho từ người dùng.
* Tự động thuật toán tìm kiếm vị trí Kệ đang trống trong `master-data`.
* Tạo task và gọi **gRPC** xuống tầng MES/AGV để điều xe robot gắp hàng vào vị trí đã chỉ định.

### 4. Module `outbound` (Quản lý Xuất hàng)

Xử lý luồng Automation Pull:

* Nhận yêu cầu xuất mặt hàng cụ thể.
* Tự động truy xuất `inventory` để tìm ra mặt hàng đó đang nằm ở Kệ nào.
* Khóa (Lock) số lượng hàng và gọi **gRPC** xuống tầng MES/AGV để điều xe vào đúng kệ lấy hàng ra cửa.

### 5. Module `events / socket` (Real-time Communication)

Phô diễn kỹ năng giao tiếp thời gian thực:

* Lắng nghe tín hiệu từ tầng AGV (Golang) báo cáo tác vụ hoàn thành.
* Cập nhật Database và ngay lập tức **Broadcast qua Socket.io** để Frontend cập nhật trạng thái UI (màu sắc kệ, số lượng tồn kho) mà không cần reload trang.

---

## Công nghệ sử dụng

* **Framework:** Node.js, Express, TypeScript.
* **Architecture:** Modular Monolith (sẵn sàng tách Microservices).
* **Inter-service Communication:** gRPC (Giao tiếp backend-to-backend), Socket.io (Giao tiếp backend-to-frontend).
* **Dependency Injection:** Awilix / TSOA.
* **Message Queue:** Kafk
