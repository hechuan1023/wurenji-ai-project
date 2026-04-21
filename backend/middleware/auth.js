const jwt = require('jsonwebtoken');
const User = require('../models/User');

// JWT认证中间件
const authenticateToken = async (req, res, next) => {
  try {
    // 从请求头获取token
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        success: false,
        message: '访问令牌缺失，请先登录'
      });
    }

    // 验证token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 查找用户
    const user = await User.findById(decoded.userId).select('-password');
    if (!user) {
      return res.status(401).json({
        success: false,
        message: '用户不存在或已被删除'
      });
    }

    // 检查用户是否激活
    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: '用户账户已被禁用'
      });
    }

    // 将用户信息附加到请求对象
    req.user = user;
    req.userId = user._id;
    req.userType = user.userType;

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: '无效的访问令牌'
      });
    }

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: '访问令牌已过期，请重新登录'
      });
    }

    console.error('认证中间件错误:', error);
    return res.status(500).json({
      success: false,
      message: '服务器认证错误'
    });
  }
};

// 角色权限检查中间件
const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: '请先登录'
      });
    }

    if (!roles.includes(req.user.userType)) {
      return res.status(403).json({
        success: false,
        message: '权限不足，无法执行此操作'
      });
    }

    next();
  };
};

// 验证资源所有权中间件
const checkOwnership = (modelName, idField = 'id') => {
  return async (req, res, next) => {
    try {
      const Model = require(`../models/${modelName}`);
      const resourceId = req.params[idField] || req.body[idField];

      const resource = await Model.findById(resourceId);
      if (!resource) {
        return res.status(404).json({
          success: false,
          message: '资源不存在'
        });
      }

      // 检查用户是否有权限访问此资源
      const userId = req.userId.toString();
      const resourceUserId = resource.userId ? resource.userId.toString() :
                           resource.farmerId ? resource.farmerId.toString() :
                           resource.pilotId ? resource.pilotId.toString() : null;

      if (resourceUserId && userId !== resourceUserId && req.userType !== 'admin') {
        return res.status(403).json({
          success: false,
          message: '无权访问此资源'
        });
      }

      req.resource = resource;
      next();
    } catch (error) {
      console.error('所有权验证错误:', error);
      return res.status(500).json({
        success: false,
        message: '服务器验证错误'
      });
    }
  };
};

// 可选认证中间件（不强制要求登录）
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.userId).select('-password');

      if (user && user.isActive) {
        req.user = user;
        req.userId = user._id;
        req.userType = user.userType;
      }
    }

    next();
  } catch (error) {
    // token无效时忽略，继续处理请求
    next();
  }
};

module.exports = {
  authenticateToken,
  authorizeRoles,
  checkOwnership,
  optionalAuth
};