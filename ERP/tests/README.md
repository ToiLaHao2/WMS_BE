# Testing Directory Structure

Phần này dùng để chứa các kịch bản kiểm thử toàn diện cho hệ thống:

1. **`unit/`**: Chứa Unit Test (vd: Jest, Mocha). Dùng để test các logic tính toán nhỏ ở Service không phụ thuộc Database.
2. **`k6/`**: Chứa kịch bản Load test/Stress test bằng công cụ `k6` (viết bằng ES6). Đùng để bắn ngàn Request vào server đo hiệu năng.
3. **`playwright/`**: Chứa kịch bản E2E Test (Playwright). Tự động bật trình duyệt, click, thao tác y hệt user thật để kiểm tra luồng trải nghiệm (Flow).

## Hướng dẫn Run (Sẽ bổ sung sau khi config)
- Chạy K6: `k6 run tests/k6/load-test.js`
- Chạy Playwright: `npx playwright test`
