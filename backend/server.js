const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
// Vercel不支持WebSocket，暂时注释掉
// const http = require('http');
// const socketIo = require('socket.io');

// 加载环境变量
dotenv.config();

// 创建Express应用
const app = express();
// Vercel不支持WebSocket，使用普通Express应用
// const server = http.createServer(app);
// const io = socketIo(server, {
//   cors: {
//     origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*',
//     methods: ['GET', 'POST', 'PUT', 'DELETE']
//   }
// });

// 中间件
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// 静态文件服务
app.use('/uploads', express.static('uploads'));

// 数据库连接
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/drone_navigation', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('MongoDB数据库连接成功'))
.catch(err => console.error('MongoDB连接失败:', err));

// Socket.IO 实时通信
const LocationTracker = require('./websocket/locationTracker');
const locationTracker = new LocationTracker();

io.on('connection', (socket) => {
  console.log('用户已连接:', socket.id);

  // 用户认证
  socket.on('authenticate', (token) => {
    // 验证JWT token并关联用户
    try {
      const decoded = require('jsonwebtoken').verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.userId;
      locationTracker.addClient(socket.userId, socket);
    } catch (error) {
      console.error('Socket认证失败:', error.message);
    }
  });

  // 位置更新
  socket.on('location_update', (location) => {
    if (socket.userId) {
      locationTracker.updateLocation(socket.userId, location);
    }
  });

  socket.on('disconnect', () => {
    console.log('用户已断开连接:', socket.id);
    if (socket.userId) {
      locationTracker.removeClient(socket.userId);
    }
  });
});

// 健康检查端点
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    database: 'connected'
  });
});

// 路由
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/orders', require('./orders'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/notifications', require('./routes/notifications'));

// 错误处理中间件
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: '服务器内部错误',
    error: process.env.NODE_ENV === 'development' ? err.message : {}
  });
});

// 404处理
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'API路由不存在'
  });
});

// Vercel Serverless函数导出
module.exports = server;

module.exports = app;