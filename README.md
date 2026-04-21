# 无人机飞手导航平台

一个完整的无人机飞手导航平台，包含前端网站和后端API，连接无人机飞手和农户，提供智能导航服务。

## 🚀 项目特色

- ✅ **现代化设计**：渐变背景，毛玻璃效果，响应式布局
- 🗺️ **高德地图集成**：实时定位，路线规划，导航功能
- 📱 **移动端友好**：完美适配手机、平板、电脑
- ⚡ **纯前端实现**：无需后端，部署简单
- 🎨 **美观UI**：使用Font Awesome图标，流畅动画

## 🛠️ 技术栈

### 前端
- **核心技术**：HTML5 + CSS3 + JavaScript (ES6+)
- **地图服务**：高德地图Web API
- **实时通信**：Socket.IO
- **图标库**：Font Awesome 6
- **设计**：响应式设计，毛玻璃效果

### 后端
- **运行时**：Node.js
- **框架**：Express.js
- **数据库**：MongoDB
- **认证**：JWT (JSON Web Tokens)
- **实时功能**：Socket.IO

## 📋 快速开始

### 1. 配置高德地图API Key

**文件**：`index.html` 第59行

```html
<script src="https://webapi.amap.com/maps?v=1.4.15&key=你的高德地图API密钥"></script>
```

**获取KEY步骤**：
1. 访问[高德开放平台](https://lbs.amap.com/)
2. 注册开发者账号
3. 创建应用，选择"Web端(JS API)"
4. 获取KEY并替换

### 2. 本地运行

#### **前端开发**
```bash
# 方法1：直接打开
双击 index.html 文件

# 方法2：使用本地服务器
npm install
npm run dev
# 或
python -m http.server 8000
```

#### **后端开发**
```bash
# 进入后端目录
cd backend

# 安装依赖
npm install

# 配置环境变量
cp .env.example .env  # 然后编辑.env文件

# 启动开发服务器
npm run dev

# 或使用nodemon
npx nodemon server.js
```

#### **完整开发环境**
1. 启动MongoDB数据库
2. 启动后端API服务器
3. 启动前端开发服务器
4. 访问前端页面进行开发和测试

### 3. 部署到服务器

将整个文件夹上传到你的网站服务器即可：
- Nginx、Apache等静态服务器
- GitHub Pages
- Netlify、Vercel等静态网站托管服务

## 🗺️ 功能说明

### 核心功能

1. **订单展示**：显示农户订单列表
2. **地图导航**：显示飞手和农田位置
3. **路线规划**：自动计算最优路径
4. **距离计算**：实时计算两点间距离
5. **一键导航**：跳转到高德地图导航
6. **联系功能**：直接拨打农户电话
7. **智能错误处理**：自动处理定位失败和网络问题
8. **加载状态提示**：实时反馈操作状态

### 用户体验

- **点击订单**：打开导航模态框
- **地图显示**：自动定位和标记
- **响应式设计**：适配各种设备
- **流畅动画**：提升用户体验

## 📁 项目结构

```
dome-02-website/
├── index.html          # 主页面
├── style.css          # 样式文件
├── script.js          # JavaScript逻辑
├── package.json       # 前端项目配置
├── README.md          # 说明文档
└── backend/           # 后端代码
    ├── server.js      # 主服务器文件
    ├── models/        # 数据模型
    ├── routes/        # API路由
    ├── middleware/    # 中间件
    ├── websocket/     # 实时通信
    ├── package.json   # 后端项目配置
    └── README.md      # 后端说明文档
```

## 🎨 自定义配置

### 修改订单数据
在 `script.js` 中修改模拟数据：

```javascript
this.orders = [
    {
        id: 1,
        farmerName: '农户姓名',
        farmAddress: '农田地址',
        farmLat: 纬度,
        farmLng: 经度,
        phone: '联系电话',
        status: 'pending', // pending, accepted, completed
        distance: 距离(km)
    }
];
```

### 自定义样式
在 `style.css` 中修改颜色、字体、布局等：

```css
/* 主题色 */
--primary-color: #007AFF;
--secondary-color: #6c757d;

/* 背景渐变 */
background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
```

## 🔧 浏览器兼容性

- ✅ Chrome 60+
- ✅ Firefox 55+
- ✅ Safari 12+
- ✅ Edge 79+
- ✅ 移动端浏览器

## ⚠️ 注意事项

1. **HTTPS要求**：定位功能需要HTTPS环境
2. **用户授权**：首次使用需要授权位置权限
3. **地图KEY**：确保KEY有Web端使用权限
4. **跨域问题**：本地文件协议可能限制部分功能

## 📞 联系方式

如有问题，请参考高德地图API文档或联系开发者。

## 📄 许可证

MIT License