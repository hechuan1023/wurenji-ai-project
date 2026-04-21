# 无人机导航平台后端API

这是一个完整的无人机导航平台后端系统，提供用户管理、订单管理、实时位置追踪、支付处理等功能。

## 🚀 技术栈

- **运行时**: Node.js
- **框架**: Express.js
- **数据库**: MongoDB
- **实时通信**: Socket.IO
- **认证**: JWT (JSON Web Tokens)
- **验证**: express-validator

## 📋 快速开始

### 1. 环境要求

- Node.js 16+
- MongoDB 4.4+
- npm 或 yarn

### 2. 安装依赖

```bash
cd backend
npm install
```

### 3. 环境配置

复制 `.env.example` 文件（如果没有，使用 `.env` 文件）并配置以下环境变量：

```env
# 服务器配置
PORT=3000
NODE_ENV=development

# 数据库配置
MONGODB_URI=mongodb://localhost:27017/drone_navigation

# JWT配置
JWT_SECRET=your_jwt_secret_key_here_change_in_production
JWT_EXPIRES_IN=7d

# 高德地图API
AMAP_API_KEY=你的高德地图API密钥

# CORS配置
ALLOWED_ORIGINS=http://localhost:8000,http://localhost:3000

# 文件上传配置
MAX_FILE_SIZE=5242880
UPLOAD_PATH=uploads
```

### 4. 启动服务器

```bash
# 开发模式（使用nodemon）
npm run dev

# 生产模式
npm start
```

服务器将在 `http://localhost:3000` 启动。

## 🏗️ 项目结构

```
backend/
├── models/           # Mongoose数据模型
│   ├── User.js      # 用户模型
│   ├── Order.js     # 订单模型
│   └── Payment.js   # 支付模型
├── routes/          # API路由
│   ├── auth.js      # 认证相关路由
│   ├── users.js     # 用户管理路由
│   ├── orders.js    # 订单管理路由
│   └── payments.js  # 支付处理路由
├── middleware/      # 中间件
│   └── auth.js      # 认证和授权中间件
├── websocket/       # 实时通信
│   └── locationTracker.js  # 位置追踪服务
├── server.js        # 主服务器文件
├── package.json     # 项目配置
└── .env            # 环境变量配置
```

## 🔧 API文档

### 认证相关

#### 用户注册
```http
POST /api/auth/register
Content-Type: application/json

{
  "username": "张飞手",
  "phone": "13800138000",
  "password": "password123",
  "userType": "pilot",
  "location": {
    "coordinates": [116.4074, 39.9042]
  }
}
```

#### 用户登录
```http
POST /api/auth/login
Content-Type: application/json

{
  "phone": "13800138000",
  "password": "password123"
}
```

#### 获取用户信息
```http
GET /api/auth/me
Authorization: Bearer <your-jwt-token>
```

### 订单管理

#### 创建订单（农户）
```http
POST /api/orders/create
Authorization: Bearer <your-jwt-token>
Content-Type: application/json

{
  "farmLocation": {
    "coordinates": [116.4074, 39.9042]
  },
  "farmAddress": "北京市朝阳区农业示范园A区",
  "serviceType": "crop_spraying",
  "area": 50,
  "price": 500,
  "scheduledAt": "2026-04-22T08:00:00Z"
}
```

#### 获取附近订单（飞手）
```http
GET /api/orders/nearby?lat=39.9042&lng=116.4074&radius=50
Authorization: Bearer <your-jwt-token>
```

#### 接单
```http
POST /api/orders/:orderId/accept
Authorization: Bearer <your-jwt-token>
```

#### 更新订单状态
```http
PUT /api/orders/:orderId/status
Authorization: Bearer <your-jwt-token>
Content-Type: application/json

{
  "status": "in_progress",
  "notes": "开始作业"
}
```

### 支付处理

#### 创建支付订单
```http
POST /api/payments/create
Authorization: Bearer <your-jwt-token>
Content-Type: application/json

{
  "orderId": "订单ID",
  "paymentMethod": "alipay"
}
```

#### 处理支付
```http
POST /api/payments/:paymentId/process
Authorization: Bearer <your-jwt-token>
Content-Type: application/json

{
  "paymentData": {}
}
```

## 🔌 WebSocket实时通信

### 连接WebSocket
```javascript
const socket = io('http://localhost:3000');

// 认证
socket.emit('authenticate', jwtToken);

// 发送位置更新
socket.emit('location_update', {
  lat: 39.9042,
  lng: 116.4074,
  accuracy: 10
});

// 接收位置更新
socket.on('location_update', (data) => {
  console.log('收到位置更新:', data);
});
```

## 🗄️ 数据库模型

### 用户模型 (User)
- `username`: 用户名
- `phone`: 手机号（唯一）
- `email`: 邮箱（可选）
- `password`: 密码（加密存储）
- `userType`: 用户类型 (pilot/farmer/admin)
- `location`: 地理位置
- `rating`: 评分
- `completedOrders`: 完成订单数

### 订单模型 (Order)
- `farmerId`: 农户ID
- `pilotId`: 飞手ID
- `farmLocation`: 农田位置
- `serviceType`: 服务类型
- `status`: 订单状态
- `price`: 服务价格
- `rating`: 评价信息

### 支付模型 (Payment)
- `orderId`: 订单ID
- `userId`: 用户ID
- `amount`: 支付金额
- `paymentMethod`: 支付方式
- `status`: 支付状态
- `transactionId`: 交易ID

## 🔐 安全特性

- JWT认证
- 密码加密存储（bcrypt）
- 输入验证和清理
- CORS配置
- 角色权限控制
- API速率限制（可扩展）

## 🚀 部署

### 使用Docker

```dockerfile
# Dockerfile
FROM node:16-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
```

### 环境变量配置

生产环境请确保配置：
- 强密码的JWT_SECRET
- 安全的MONGODB_URI
- 适当的CORS配置
- HTTPS证书

## 📊 监控和日志

- 控制台日志输出
- 错误处理中间件
- 请求日志（可扩展）
- 性能监控（可扩展）

## 🧪 测试

```bash
# 运行测试（需要配置测试环境）
npm test
```

## 📝 开发指南

### 添加新路由

1. 在 `routes/` 目录创建新文件
2. 在 `server.js` 中引入并注册路由
3. 添加相应的数据模型（如果需要）
4. 更新API文档

### 添加新模型

1. 在 `models/` 目录创建新文件
2. 定义Mongoose Schema
3. 添加必要的索引和方法
4. 在其他地方引用模型

## 🐛 故障排除

### 常见问题

1. **MongoDB连接失败**
   - 检查MongoDB服务是否运行
   - 验证连接字符串是否正确
   - 检查防火墙设置

2. **JWT认证失败**
   - 检查JWT_SECRET是否正确
   - 验证token是否过期
   - 检查请求头格式

3. **CORS错误**
   - 检查ALLOWED_ORIGINS配置
   - 验证前端域名是否在允许列表中

## 📄 许可证

MIT License