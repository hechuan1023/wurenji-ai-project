const WebSocket = require('ws');

class LocationTracker {
  constructor() {
    this.clients = new Map(); // userId -> WebSocket
    this.locations = new Map(); // userId -> {location, timestamp}
    this.orderSubscriptions = new Map(); // orderId -> Set(userId)
  }

  // 添加客户端连接
  addClient(userId, socket) {
    this.clients.set(userId, socket);
    console.log(`用户 ${userId} 已连接到位置追踪系统`);
  }

  // 移除客户端连接
  removeClient(userId) {
    this.clients.delete(userId);
    this.locations.delete(userId);
    console.log(`用户 ${userId} 已从位置追踪系统断开`);
  }

  // 更新用户位置
  updateLocation(userId, location) {
    const locationData = {
      ...location,
      timestamp: Date.now(),
      userId
    };

    this.locations.set(userId, locationData);

    // 广播位置更新给订阅了相关订单的用户
    this.broadcastLocationUpdate(userId, locationData);

    return locationData;
  }

  // 订阅订单位置更新
  subscribeToOrder(orderId, userId) {
    if (!this.orderSubscriptions.has(orderId)) {
      this.orderSubscriptions.set(orderId, new Set());
    }
    this.orderSubscriptions.get(orderId).add(userId);
  }

  // 取消订阅订单位置更新
  unsubscribeFromOrder(orderId, userId) {
    if (this.orderSubscriptions.has(orderId)) {
      this.orderSubscriptions.get(orderId).delete(userId);
      if (this.orderSubscriptions.get(orderId).size === 0) {
        this.orderSubscriptions.delete(orderId);
      }
    }
  }

  // 广播位置更新
  broadcastLocationUpdate(userId, locationData) {
    const message = JSON.stringify({
      type: 'location_update',
      userId,
      location: locationData,
      timestamp: locationData.timestamp
    });

    // 发送给所有连接的客户端（可以根据业务逻辑优化）
    this.clients.forEach((socket, clientId) => {
      if (socket.readyState === WebSocket.OPEN) {
        try {
          socket.send(message);
        } catch (error) {
          console.error(`发送位置更新到用户 ${clientId} 失败:`, error);
        }
      }
    });
  }

  // 获取用户当前位置
  getUserLocation(userId) {
    return this.locations.get(userId);
  }

  // 获取多个用户位置
  getUsersLocations(userIds) {
    const locations = {};
    userIds.forEach(userId => {
      const location = this.locations.get(userId);
      if (location) {
        locations[userId] = location;
      }
    });
    return locations;
  }

  // 清理过期位置数据（超过5分钟）
  cleanupExpiredLocations() {
    const now = Date.now();
    const expirationTime = 5 * 60 * 1000; // 5分钟

    for (const [userId, locationData] of this.locations.entries()) {
      if (now - locationData.timestamp > expirationTime) {
        this.locations.delete(userId);
      }
    }
  }

  // 获取活跃用户数量
  getActiveUsersCount() {
    return this.clients.size;
  }

  // 获取位置数据数量
  getLocationsCount() {
    return this.locations.size;
  }

  // 计算两点间距离（Haversine公式）
  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // 地球半径（公里）
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  // 角度转弧度
  toRad(degrees) {
    return degrees * Math.PI / 180;
  }

  // 获取附近的用户
  getNearbyUsers(centerLat, centerLon, radiusKm) {
    const nearbyUsers = [];

    this.locations.forEach((locationData, userId) => {
      if (locationData.lat && locationData.lon) {
        const distance = this.calculateDistance(
          centerLat, centerLon,
          locationData.lat, locationData.lon
        );

        if (distance <= radiusKm) {
          nearbyUsers.push({
            userId,
            location: locationData,
            distance: distance.toFixed(2)
          });
        }
      }
    });

    return nearbyUsers.sort((a, b) => a.distance - b.distance);
  }
}

module.exports = LocationTracker;