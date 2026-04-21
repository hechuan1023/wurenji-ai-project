const express = require('express');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// 用户注册
router.post('/register', [
  body('username')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('用户名长度应在2-50个字符之间'),
  body('phone')
    .matches(/^1[3-9]\d{9}$/)
    .withMessage('手机号格式不正确'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('密码至少6个字符'),
  body('userType')
    .isIn(['pilot', 'farmer'])
    .withMessage('用户类型必须是pilot或farmer'),
  body('location.coordinates')
    .optional()
    .isArray({ min: 2, max: 2 })
    .withMessage('坐标格式不正确')
], async (req, res) => {
  try {
    // 验证输入
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: '输入验证失败',
        errors: errors.array()
      });
    }

    const { username, phone, password, userType, location, email } = req.body;

    // 检查手机号是否已存在
    const existingUser = await User.findOne({ phone });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: '该手机号已被注册'
      });
    }

    // 检查邮箱是否已存在（如果提供）
    if (email) {
      const existingEmail = await User.findOne({ email });
      if (existingEmail) {
        return res.status(400).json({
          success: false,
          message: '该邮箱已被注册'
        });
      }
    }

    // 创建用户
    const user = new User({
      username,
      phone,
      password,
      userType,
      email,
      location: location ? {
        type: 'Point',
        coordinates: location.coordinates
      } : undefined
    });

    await user.save();

    // 生成JWT令牌
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    // 更新最后登录时间
    await user.updateLastLogin();

    res.status(201).json({
      success: true,
      message: '注册成功',
      data: {
        token,
        user: {
          id: user._id,
          username: user.username,
          phone: user.phone,
          email: user.email,
          userType: user.userType,
          avatar: user.avatar,
          rating: user.rating,
          completedOrders: user.completedOrders
        }
      }
    });
  } catch (error) {
    console.error('注册错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器错误',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

// 用户登录
router.post('/login', [
  body('phone')
    .matches(/^1[3-9]\d{9}$/)
    .withMessage('手机号格式不正确'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('密码至少6个字符')
], async (req, res) => {
  try {
    // 验证输入
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: '输入验证失败',
        errors: errors.array()
      });
    }

    const { phone, password } = req.body;

    // 查找用户
    const user = await User.findOne({ phone }).select('+password');
    if (!user) {
      return res.status(401).json({
        success: false,
        message: '手机号或密码错误'
      });
    }

    // 检查用户是否激活
    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: '账户已被禁用，请联系管理员'
      });
    }

    // 验证密码
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: '手机号或密码错误'
      });
    }

    // 生成JWT令牌
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    // 更新最后登录时间
    await user.updateLastLogin();

    res.json({
      success: true,
      message: '登录成功',
      data: {
        token,
        user: {
          id: user._id,
          username: user.username,
          phone: user.phone,
          email: user.email,
          userType: user.userType,
          avatar: user.avatar,
          rating: user.rating,
          completedOrders: user.completedOrders,
          totalEarnings: user.totalEarnings,
          lastLoginAt: user.lastLoginAt
        }
      }
    });
  } catch (error) {
    console.error('登录错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器错误',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

// 获取当前用户信息
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('-password');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }

    res.json({
      success: true,
      data: {
        user: {
          id: user._id,
          username: user.username,
          phone: user.phone,
          email: user.email,
          userType: user.userType,
          avatar: user.avatar,
          location: user.location,
          rating: user.rating,
          completedOrders: user.completedOrders,
          totalEarnings: user.totalEarnings,
          isVerified: user.isVerified,
          lastLoginAt: user.lastLoginAt
        }
      }
    });
  } catch (error) {
    console.error('获取用户信息错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器错误'
    });
  }
});

// 刷新令牌
router.post('/refresh-token', async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: '令牌不能为空'
      });
    }

    // 验证并解码令牌
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { ignoreExpiration: true });

    // 查找用户
    const user = await User.findById(decoded.userId).select('-password');
    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        message: '用户不存在或已被禁用'
      });
    }

    // 生成新令牌
    const newToken = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.json({
      success: true,
      message: '令牌刷新成功',
      data: {
        token: newToken,
        user: {
          id: user._id,
          username: user.username,
          phone: user.phone,
          userType: user.userType
        }
      }
    });
  } catch (error) {
    console.error('刷新令牌错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器错误'
    });
  }
});

// 退出登录
router.post('/logout', authenticateToken, async (req, res) => {
  try {
    // 在客户端删除token即可，服务端不需要特殊处理
    // 如果需要实现token黑名单，可以在这里添加逻辑

    res.json({
      success: true,
      message: '退出登录成功'
    });
  } catch (error) {
    console.error('退出登录错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器错误'
    });
  }
});

module.exports = router;