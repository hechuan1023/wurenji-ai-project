// 网站主逻辑
class DroneNavigationApp {
    constructor() {
        this.apiBaseUrl = 'http://localhost:3000/api'; // 后端API地址
        this.token = localStorage.getItem('drone_token') || null;
        this.user = JSON.parse(localStorage.getItem('drone_user') || 'null');

        this.orders = []; // 从后端获取
        this.map = null;
        this.currentOrder = null;
        this.isMapLoaded = false;

        this.init();
    }

    // API调用方法
    async apiCall(endpoint, options = {}) {
        const url = `${this.apiBaseUrl}${endpoint}`;
        const config = {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        };

        // 添加认证token
        if (this.token) {
            config.headers['Authorization'] = `Bearer ${this.token}`;
        }

        try {
            const response = await fetch(url, config);
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'API请求失败');
            }

            return data;
        } catch (error) {
            console.error('API调用失败:', error);
            this.showError(error.message || '网络请求失败');
            throw error;
        }
    }

    // 用户登录
    async login(phone, password) {
        try {
            this.showLoading('正在登录...');

            const response = await this.apiCall('/auth/login', {
                method: 'POST',
                body: JSON.stringify({ phone, password })
            });

            if (response.success) {
                this.token = response.data.token;
                this.user = response.data.user;

                // 保存到本地存储
                localStorage.setItem('drone_token', this.token);
                localStorage.setItem('drone_user', JSON.stringify(this.user));

                this.hideLoading();
                this.hideLoginModal();

                // 重新初始化应用
                await this.loadOrders();
                this.initWebSocket();
                this.renderOrderList();

                this.showSuccess('登录成功！');
            }
        } catch (error) {
            this.hideLoading();
            this.showError('登录失败，请检查手机号和密码');
        }
    }

    // 用户注册
    async register(userData) {
        try {
            this.showLoading('正在注册...');

            const response = await this.apiCall('/auth/register', {
                method: 'POST',
                body: JSON.stringify(userData)
            });

            if (response.success) {
                this.hideLoading();
                this.showSuccess('注册成功！请登录');
                this.hideRegisterModal();
                this.showLoginModal();
            }
        } catch (error) {
            this.hideLoading();
            this.showError('注册失败，请检查输入信息');
        }
    }

    // 加载订单数据
    async loadOrders() {
        try {
            // 根据用户类型获取不同的订单
            let endpoint = '/orders/my-orders';
            if (this.user.userType === 'pilot') {
                // 飞手获取附近订单
                if (navigator.geolocation) {
                    navigator.geolocation.getCurrentPosition(async (position) => {
                        const { latitude, longitude } = position.coords;
                        endpoint = `/orders/nearby?lat=${latitude}&lng=${longitude}&radius=50`;

                        const response = await this.apiCall(endpoint);
                        if (response.success) {
                            this.orders = response.data.orders.map(order => ({
                                id: order._id,
                                farmerName: order.farmer?.username || '未知农户',
                                farmAddress: order.farmAddress,
                                farmLat: order.farmLocation.coordinates[1],
                                farmLng: order.farmLocation.coordinates[0],
                                phone: order.farmer?.phone || '',
                                status: order.status,
                                statusText: this.getStatusText(order.status),
                                orderTime: this.formatDate(order.scheduledAt),
                                distance: order.distance ? order.distance.toFixed(1) : '未知',
                                serviceType: order.serviceType,
                                area: order.area,
                                price: order.price
                            }));
                            this.renderOrderList();
                        }
                    });
                }
            } else {
                // 农户获取自己的订单
                const response = await this.apiCall(endpoint);
                if (response.success) {
                    this.orders = response.data.orders.map(order => ({
                        id: order._id,
                        farmerName: order.farmer?.username || '未知农户',
                        farmAddress: order.farmAddress,
                        farmLat: order.farmLocation.coordinates[1],
                        farmLng: order.farmLocation.coordinates[0],
                        phone: order.farmer?.phone || '',
                        status: order.status,
                        statusText: this.getStatusText(order.status),
                        orderTime: this.formatDate(order.scheduledAt),
                        distance: order.distance ? order.distance.toFixed(1) : '未知',
                        serviceType: order.serviceType,
                        area: order.area,
                        price: order.price,
                        pilotName: order.pilot?.username || '未分配'
                    }));
                    this.renderOrderList();
                }
            }
        } catch (error) {
            console.error('加载订单失败:', error);
            this.showError('加载订单失败，请稍后重试');
        }
    }

    // 获取状态文本
    getStatusText(status) {
        const statusMap = {
            'pending': '待接单',
            'accepted': '已接单',
            'in_progress': '进行中',
            'completed': '已完成',
            'cancelled': '已取消',
            'paid': '已支付'
        };
        return statusMap[status] || status;
    }

    // 格式化日期
    formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    // 显示成功消息
    showSuccess(message) {
        const existingSuccess = document.querySelector('.success-message');
        if (existingSuccess) {
            existingSuccess.remove();
        }

        const successDiv = document.createElement('div');
        successDiv.className = 'success-message';
        successDiv.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: #28a745;
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            z-index: 9999;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            font-size: 14px;
            max-width: 80%;
            text-align: center;
        `;
        successDiv.textContent = message;
        document.body.appendChild(successDiv);

        // 3秒后自动消失
        setTimeout(() => {
            if (successDiv.parentNode) {
                successDiv.remove();
            }
        }, 3000);
    }

    // 初始化WebSocket连接
    initWebSocket() {
        if (this.socket) {
            this.socket.disconnect();
        }

        this.socket = io('http://localhost:3000');

        this.socket.on('connect', () => {
            console.log('WebSocket连接成功');
            // 发送认证信息
            this.socket.emit('authenticate', this.token);
        });

        this.socket.on('disconnect', () => {
            console.log('WebSocket连接断开');
        });

        this.socket.on('location_update', (data) => {
            console.log('收到位置更新:', data);
            // 处理实时位置更新
            this.handleLocationUpdate(data);
        });

        this.socket.on('order_update', (data) => {
            console.log('收到订单更新:', data);
            // 重新加载订单
            this.loadOrders();
        });
    }

    // 处理位置更新
    handleLocationUpdate(data) {
        // 在地图上更新其他用户的位置
        if (this.map && data.userId !== this.user.id) {
            // 更新或添加其他用户的位置标记
            console.log('更新用户位置:', data.userId, data.location);
        }
    }

    // 发送位置更新
    sendLocationUpdate(location) {
        if (this.socket && this.socket.connected) {
            this.socket.emit('location_update', {
                lat: location.lat,
                lng: location.lng,
                accuracy: location.accuracy
            });
        }
    }

    // 显示登录模态框
    showLoginModal() {
        const modal = document.getElementById('loginModal');
        modal.style.display = 'block';
        document.body.style.overflow = 'hidden';
    }

    // 隐藏登录模态框
    hideLoginModal() {
        const modal = document.getElementById('loginModal');
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
    }

    // 显示注册模态框
    showRegisterModal() {
        this.hideLoginModal();
        const modal = document.getElementById('registerModal');
        modal.style.display = 'block';
        document.body.style.overflow = 'hidden';
    }

    // 隐藏注册模态框
    hideRegisterModal() {
        const modal = document.getElementById('registerModal');
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
    }

    // 用户退出登录
    logout() {
        // 清除本地存储
        localStorage.removeItem('drone_token');
        localStorage.removeItem('drone_user');

        // 断开WebSocket连接
        if (this.socket) {
            this.socket.disconnect();
        }

        // 重置应用状态
        this.token = null;
        this.user = null;
        this.orders = [];

        // 显示登录界面
        this.showLoginModal();
        this.renderOrderList();
    }
        this.socket = null;

        this.init();
    }

        this.init();
    }

    async init() {
        // 检查用户登录状态
        if (this.token && this.user) {
            await this.loadOrders();
            this.initWebSocket();
        } else {
            this.showLoginModal();
            return;
        }

        this.renderOrderList();
        this.bindEvents();
    }

    // 渲染订单列表
    renderOrderList() {
        const orderList = document.getElementById('orderList');
        orderList.innerHTML = '';

        this.orders.forEach(order => {
            const orderItem = document.createElement('div');
            orderItem.className = 'order-item';
            orderItem.onclick = () => this.openNavigationModal(order);

            orderItem.innerHTML = `
                <div class="order-header">
                    <span class="farmer-name">${order.farmerName}</span>
                    <span class="order-status status-${order.status}">${order.statusText}</span>
                </div>
                <div class="farm-address">${order.farmAddress}</div>
                <div class="distance">距离: ${order.distance}km</div>
                <div class="order-time">${order.orderTime}</div>
            `;

            orderList.appendChild(orderItem);
        });
    }

    // 绑定事件
    bindEvents() {
        // 导航模态框点击外部关闭
        const navigationModal = document.getElementById('navigationModal');
        navigationModal.addEventListener('click', (e) => {
            if (e.target === navigationModal) {
                this.closeNavigationModal();
            }
        });

        // 登录模态框点击外部关闭
        const loginModal = document.getElementById('loginModal');
        loginModal.addEventListener('click', (e) => {
            if (e.target === loginModal) {
                this.hideLoginModal();
            }
        });

        // 注册模态框点击外部关闭
        const registerModal = document.getElementById('registerModal');
        registerModal.addEventListener('click', (e) => {
            if (e.target === registerModal) {
                this.hideRegisterModal();
            }
        });

        // 登录表单提交
        const loginForm = document.getElementById('loginForm');
        if (loginForm) {
            loginForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const phone = document.getElementById('loginPhone').value;
                const password = document.getElementById('loginPassword').value;
                this.login(phone, password);
            });
        }

        // 注册表单提交
        const registerForm = document.getElementById('registerForm');
        if (registerForm) {
            registerForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const username = document.getElementById('registerUsername').value;
                const phone = document.getElementById('registerPhone').value;
                const password = document.getElementById('registerPassword').value;
                const userType = document.getElementById('userType').value;

                if (!username || !phone || !password || !userType) {
                    this.showError('请填写所有必填字段');
                    return;
                }

                const userData = {
                    username,
                    phone,
                    password,
                    userType
                };

                this.register(userData);
            });
        }

        // 添加用户信息显示
        this.updateUserInfo();
    }

    // 更新用户信息显示
    updateUserInfo() {
        if (this.user) {
            // 可以在这里添加用户信息展示逻辑
            console.log('当前用户:', this.user);
        }
    }

    // 打开导航模态框
    openNavigationModal(order) {
        this.currentOrder = order;
        const modal = document.getElementById('navigationModal');

        // 设置订单信息
        document.getElementById('farmerName').textContent = order.farmerName;
        document.getElementById('farmAddress').textContent = order.farmAddress;
        document.getElementById('distance').textContent = `距离: ${order.distance}km`;

        // 显示模态框
        modal.style.display = 'block';

        // 初始化地图
        this.initMap();

        // 阻止背景滚动
        document.body.style.overflow = 'hidden';
    }

    // 关闭导航模态框
    closeNavigationModal() {
        const modal = document.getElementById('navigationModal');
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
        this.currentOrder = null;
    }

    // 初始化地图
    initMap() {
        // 等待DOM完全加载
        setTimeout(() => {
            if (!this.map) {
                this.map = new AMap.Map('map', {
                    zoom: 10,
                    center: [this.currentOrder.farmLng, this.currentOrder.farmLat],
                    mapStyle: 'amap://styles/light'
                });

                this.updateMapMarkers();
                this.getCurrentLocationAndRoute();
            } else {
                // 更新地图中心点和标记
                this.map.setCenter([this.currentOrder.farmLng, this.currentOrder.farmLat]);
                this.updateMapMarkers();
                this.getCurrentLocationAndRoute();
            }
        }, 100);
    }

    // 更新地图标记
    updateMapMarkers() {
        if (!this.map) return;

        // 清除现有标记
        this.map.clearMap();

        // 添加农田标记
        const farmMarker = new AMap.Marker({
            position: [this.currentOrder.farmLng, this.currentOrder.farmLat],
            title: '农田位置',
            icon: 'https://webapi.amap.com/theme/v1.3/markers/n/mark_r.png'
        });
        this.map.add(farmMarker);
    }

    // 获取当前位置并规划路线
    getCurrentLocationAndRoute() {
        if (!navigator.geolocation) {
            this.showError('您的浏览器不支持地理定位功能');
            return;
        }

        this.showLoading('正在获取您的位置...');

        navigator.geolocation.getCurrentPosition(
            (position) => {
                this.hideLoading();
                const currentLat = position.coords.latitude;
                const currentLng = position.coords.longitude;

                // 添加当前位置标记
                const currentMarker = new AMap.Marker({
                    position: [currentLng, currentLat],
                    title: '我的位置',
                    icon: 'https://webapi.amap.com/theme/v1.3/markers/n/mark_b.png'
                });
                this.map.add(currentMarker);

                // 计算距离
                const distance = this.calculateDistance(currentLat, currentLng,
                    this.currentOrder.farmLat, this.currentOrder.farmLng);

                document.getElementById('distance').textContent = `距离: ${distance.toFixed(1)}km`;

                // 规划路线
                this.calculateRoute(currentLng, currentLat,
                    this.currentOrder.farmLng, this.currentOrder.farmLat);
            },
            (error) => {
                this.hideLoading();
                console.error('获取位置失败:', error);
                let errorMessage = '获取位置失败';

                switch(error.code) {
                    case error.PERMISSION_DENIED:
                        errorMessage = '位置访问被拒绝，请在浏览器设置中允许位置权限';
                        break;
                    case error.POSITION_UNAVAILABLE:
                        errorMessage = '位置信息不可用，请检查GPS或网络连接';
                        break;
                    case error.TIMEOUT:
                        errorMessage = '获取位置超时，请重试';
                        break;
                }

                this.showError(errorMessage);

                // 使用默认位置显示地图
                this.useDefaultLocation();
            },
            {
                enableHighAccuracy: true,
                timeout: 15000,
                maximumAge: 300000
            }
        );
    }

    // 计算两点间距离
    calculateDistance(lat1, lng1, lat2, lng2) {
        const R = 6371; // 地球半径（公里）
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                 Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                 Math.sin(dLng/2) * Math.sin(dLng/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    }

    // 规划路线
    calculateRoute(startLng, startLat, endLng, endLat) {
        const driving = new AMap.Driving({
            map: this.map,
            panel: ""
        });

        driving.search([startLng, startLat], [endLng, endLat], (status, result) => {
            if (status === 'complete') {
                console.log('路线规划成功');
            } else {
                console.error('路线规划失败:', result);
            }
        });
    }

    // 开始导航
    startNavigation() {
        if (!this.currentOrder) return;

        const url = `https://uri.amap.com/navigation?to=${this.currentOrder.farmLng},${this.currentOrder.farmLat},${encodeURIComponent(this.currentOrder.farmAddress)}&mode=car`;

        // 在新窗口打开高德地图导航
        window.open(url, '_blank');
    }

    // 联系农户
    callFarmer() {
        if (this.currentOrder && this.currentOrder.phone) {
            window.location.href = `tel:${this.currentOrder.phone}`;
        }
    }

    // 显示错误信息
    showError(message) {
        const existingError = document.querySelector('.error-message');
        if (existingError) {
            existingError.remove();
        }

        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: #dc3545;
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            z-index: 9999;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            font-size: 14px;
            max-width: 80%;
            text-align: center;
        `;
        errorDiv.textContent = message;
        document.body.appendChild(errorDiv);

        // 3秒后自动消失
        setTimeout(() => {
            if (errorDiv.parentNode) {
                errorDiv.remove();
            }
        }, 3000);
    }

    // 初始化WebSocket连接
    initWebSocket() {
        if (this.socket) {
            this.socket.disconnect();
        }

        this.socket = io('http://localhost:3000');

        this.socket.on('connect', () => {
            console.log('WebSocket连接成功');
            // 发送认证信息
            this.socket.emit('authenticate', this.token);
        });

        this.socket.on('disconnect', () => {
            console.log('WebSocket连接断开');
        });

        this.socket.on('location_update', (data) => {
            console.log('收到位置更新:', data);
            // 处理实时位置更新
            this.handleLocationUpdate(data);
        });

        this.socket.on('order_update', (data) => {
            console.log('收到订单更新:', data);
            // 重新加载订单
            this.loadOrders();
        });
    }

    // 处理位置更新
    handleLocationUpdate(data) {
        // 在地图上更新其他用户的位置
        if (this.map && data.userId !== this.user.id) {
            // 更新或添加其他用户的位置标记
            console.log('更新用户位置:', data.userId, data.location);
        }
    }

    // 发送位置更新
    sendLocationUpdate(location) {
        if (this.socket && this.socket.connected) {
            this.socket.emit('location_update', {
                lat: location.lat,
                lng: location.lng,
                accuracy: location.accuracy
            });
        }
    }

    // 显示登录模态框
    showLoginModal() {
        const modal = document.getElementById('loginModal');
        modal.style.display = 'block';
        document.body.style.overflow = 'hidden';
    }

    // 隐藏登录模态框
    hideLoginModal() {
        const modal = document.getElementById('loginModal');
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
    }

    // 显示注册模态框
    showRegisterModal() {
        this.hideLoginModal();
        const modal = document.getElementById('registerModal');
        modal.style.display = 'block';
        document.body.style.overflow = 'hidden';
    }

    // 隐藏注册模态框
    hideRegisterModal() {
        const modal = document.getElementById('registerModal');
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
    }

    // 用户退出登录
    logout() {
        // 清除本地存储
        localStorage.removeItem('drone_token');
        localStorage.removeItem('drone_user');

        // 断开WebSocket连接
        if (this.socket) {
            this.socket.disconnect();
        }

        // 重置应用状态
        this.token = null;
        this.user = null;
        this.orders = [];

        // 显示登录界面
        this.showLoginModal();
        this.renderOrderList();
    }

    // 显示加载状态
    showLoading(message) {
        const existingLoading = document.querySelector('.loading-message');
        if (existingLoading) {
            existingLoading.remove();
        }

        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'loading-message';
        loadingDiv.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: #007AFF;
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            z-index: 9999;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            font-size: 14px;
            max-width: 80%;
            text-align: center;
        `;
        loadingDiv.textContent = message;
        document.body.appendChild(loadingDiv);
    }

    // 隐藏加载状态
    hideLoading() {
        const loadingDiv = document.querySelector('.loading-message');
        if (loadingDiv) {
            loadingDiv.remove();
        }
    }

    // 使用默认位置（当定位失败时）
    useDefaultLocation() {
        const defaultLat = this.currentOrder.farmLat + 0.01;
        const defaultLng = this.currentOrder.farmLng + 0.01;

        // 添加默认位置标记
        const defaultMarker = new AMap.Marker({
            position: [defaultLng, defaultLat],
            title: '估计位置',
            icon: 'https://webapi.amap.com/theme/v1.3/markers/n/mark_b.png'
        });
        this.map.add(defaultMarker);

        // 计算距离
        const distance = this.calculateDistance(defaultLat, defaultLng,
            this.currentOrder.farmLat, this.currentOrder.farmLng);

        document.getElementById('distance').textContent = `距离: ${distance.toFixed(1)}km (估计距离)`;

        // 规划路线
        this.calculateRoute(defaultLng, defaultLat,
            this.currentOrder.farmLng, this.currentOrder.farmLat);

        this.showError('使用估计位置，实际距离可能不准确');
    }
}

// 全局函数
function closeNavigationModal() {
    if (window.droneApp) {
        window.droneApp.closeNavigationModal();
    }
}

function startNavigation() {
    if (window.droneApp) {
        window.droneApp.startNavigation();
    }
}

function callFarmer() {
    if (window.droneApp) {
        window.droneApp.callFarmer();
    }
}

function closeLoginModal() {
    if (window.droneApp) {
        window.droneApp.hideLoginModal();
    }
}

function showLoginModal() {
    if (window.droneApp) {
        window.droneApp.showLoginModal();
    }
}

function closeRegisterModal() {
    if (window.droneApp) {
        window.droneApp.hideRegisterModal();
    }
}

function showRegisterModal() {
    if (window.droneApp) {
        window.droneApp.showRegisterModal();
    }
}

// 页面加载完成后初始化应用
document.addEventListener('DOMContentLoaded', () => {
    window.droneApp = new DroneNavigationApp();
});

// 按ESC键关闭模态框
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeNavigationModal();
    }
});