# ============================================================
# WMSS ERP Backend (Node.js Monorepo)
# ============================================================

FROM node:22-alpine

WORKDIR /app

# Copy package files (root + apps + libs)
COPY package.json package-lock.json* ./
COPY apps/api-gateway/package.json ./apps/api-gateway/
COPY apps/socket/package.json ./apps/socket/
COPY apps/worker/package.json ./apps/worker/

# Core libs
COPY libs/core/cache/package.json ./libs/core/cache/
COPY libs/core/config/package.json ./libs/core/config/
COPY libs/core/container/package.json ./libs/core/container/
COPY libs/core/database/package.json ./libs/core/database/
COPY libs/core/events/package.json ./libs/core/events/
COPY libs/core/exceptions/package.json ./libs/core/exceptions/
COPY libs/core/http/package.json ./libs/core/http/
COPY libs/core/logger/package.json ./libs/core/logger/
COPY libs/core/shared/package.json ./libs/core/shared/
COPY libs/core/storage/package.json ./libs/core/storage/
COPY libs/core/utils/package.json ./libs/core/utils/

# Modules
COPY libs/modules/inbound/package.json ./libs/modules/inbound/
COPY libs/modules/inventory/package.json ./libs/modules/inventory/
COPY libs/modules/master-data/package.json ./libs/modules/master-data/
COPY libs/modules/outbound/package.json ./libs/modules/outbound/

# Cài dependencies (tận dụng Docker cache nếu package.json không đổi)
RUN npm ci --omit=dev || npm install

# Copy toàn bộ source code
COPY . .

# Generate tsoa routes & spec
RUN npx tsoa spec && npx tsoa routes

# Expose: API Gateway (3000) + Socket (3001)
EXPOSE 3000 3001

# Chạy ở chế độ multiport
CMD ["npm", "run", "start:multiport"]
