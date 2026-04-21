const express = require('express');
const { body, validationResult, query } = require('express-validator');
const Order = require('../models/Order');
const Payment = require('../models/Payment');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

const router = express.Router();

// 创建订单（农户发布）
router.post('/create', [
  authenticateToken,
  authorizeRoles('farmer'),
  body('farmLocation.coordinates')
    .isArray({ min: 2, max: 2 })
    .withMessage('坐标格式不正确'),
  body('farmAddress')
    .trim()
    .isLength({ min: 5, max: 200 })
    .withMessage('农田地址长度应在5-200个字符之间'),
  body('serviceType')
    .isIn(['crop_spraying', 'mapping', 'monitoring', 'planting', 'harvesting'])
    .withMessage('服务类型不正确'),
  body('area')
    .isFloat({ min: 0.1 })
    .withMessage('农田面积不能小于0.1亩'),
  body('price')
    .isFloat({ min: 0 })
    .withMessage('服务价格不能为负数'),
  body('scheduledAt')
    .isISO8601()
    .withMessage('预约时间格式不正确')
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

    const {
      farmLocation,
      farmAddress,
      serviceType,
      serviceDescription,
      area,
      price,
      scheduledAt,
      farmerNotes
    } = req.body;

    // 检查预约时间是否在未来
    if (new Date(scheduledAt) <= new Date()) {
      return res.status(400).json({
        success: false,
        message: '预约时间必须是将来的时间'
      });
    }

    const order = new Order({
      farmerId: req.userId,
      farmLocation: {
        type: 'Point',
        coordinates: farmLocation.coordinates
      },
      farmAddress,
      serviceType,
      serviceDescription,
      area,
      price,
      scheduledAt,
      farmerNotes
    });

    await order.save();

    res.status(201).json({
      success: true,
      message: '订单创建成功',
      data: { order }
    });
  } catch (error) {
    console.error('创建订单错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器错误',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

// 获取附近的订单（飞手查看）
router.get('/nearby', [
  authenticateToken,
  authorizeRoles('pilot'),
  query('lat')
    .isFloat({ min: -90, max: 90 })
    .withMessage('纬度范围应在-90到90之间'),
  query('lng')
    .isFloat({ min: -180, max: 180 })
    .withMessage('经度范围应在-180到180之间'),
  query('radius')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('搜索半径应在1-100公里之间')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: '输入验证失败',
        errors: errors.array()
      });
    }

    const { lat, lng, radius = 50 } = req.query;
    const coordinates = [parseFloat(lng), parseFloat(lat)];
    const maxDistance = parseInt(radius) * 1000; // 转换为米

    // 使用MongoDB地理位置查询
    const orders = await Order.aggregate([
      {
        $geoNear: {
          near: { type: "Point", coordinates },
          distanceField: "distance",
          maxDistance,
          query: { status: 'pending' },
          spherical: true
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: 'farmerId',
          foreignField: '_id',
          as: 'farmer',
          pipeline: [
            { $project: { username: 1, phone: 1, avatar: 1, rating: 1, completedOrders: 1 } }
          ]
        }
      },
      {
        $unwind: '$farmer'
      },
      {
        $addFields: {
          distance: { $round: ['$distance', 1] } // 保留1位小数
        }
      },
      {
        $sort: { distance: 1 }
      }
    ]);

    res.json({
      success: true,
      data: { orders }
    });
  } catch (error) {
    console.error('获取附近订单错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器错误'
    });
  }
});

// 获取我的订单
router.get('/my-orders', authenticateToken, async (req, res) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    let query = {};

    // 根据用户类型设置查询条件
    if (req.userType === 'farmer') {
      query.farmerId = req.userId;
    } else if (req.userType === 'pilot') {
      query.pilotId = req.userId;
    }

    // 按状态筛选
    if (status) {
      query.status = status;
    }

    const orders = await Order.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('farmerId', 'username phone avatar rating')
      .populate('pilotId', 'username phone avatar rating');

    const total = await Order.countDocuments(query);

    res.json({
      success: true,
      data: {
        orders,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(total / parseInt(limit)),
          total
        }
      }
    });
  } catch (error) {
    console.error('获取我的订单错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器错误'
    });
  }
});

// 接单
router.post('/:orderId/accept', [
  authenticateToken,
  authorizeRoles('pilot')
], async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: '订单不存在'
      });
    }

    if (order.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: '订单已被接取或已完成'
      });
    }

    // 检查是否已经接了这个订单
    if (order.pilotId && order.pilotId.toString() === req.userId) {
      return res.status(400).json({
        success: false,
        message: '您已经接取了这个订单'
      });
    }

    order.pilotId = req.userId;
    order.status = 'accepted';
    order.acceptedAt = new Date();

    await order.save();

    res.json({
      success: true,
      message: '接单成功',
      data: { order }
    });
  } catch (error) {
    console.error('接单错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器错误'
    });
  }
});

// 更新订单状态
router.put('/:orderId/status', [
  authenticateToken,
  body('status')
    .isIn(['in_progress', 'completed', 'cancelled'])
    .withMessage('状态值不正确')
], async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status, notes, cancelReason } = req.body;

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: '订单不存在'
      });
    }

    // 检查权限
    if (req.userType === 'pilot' && order.pilotId.toString() !== req.userId) {
      return res.status(403).json({
        success: false,
        message: '无权修改此订单'
      });
    }

    if (req.userType === 'farmer' && order.farmerId.toString() !== req.userId) {
      return res.status(403).json({
        success: false,
        message: '无权修改此订单'
      });
    }

    // 更新状态
    let additionalData = {};
    if (notes) {
      if (req.userType === 'pilot') {
        additionalData.pilotNotes = notes;
      } else {
        additionalData.farmerNotes = notes;
      }
    }

    if (cancelReason) {
      additionalData.cancelReason = cancelReason;
    }

    await order.updateStatus(status, additionalData);

    res.json({
      success: true,
      message: '订单状态更新成功',
      data: { order }
    });
  } catch (error) {
    console.error('更新订单状态错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器错误'
    });
  }
});

// 评价订单
router.post('/:orderId/review', [
  authenticateToken,
  body('score')
    .isInt({ min: 1, max: 5 })
    .withMessage('评分必须在1-5之间'),
  body('comment')
    .optional()
    .trim()
    .isLength({ max: 300 })
    .withMessage('评价内容不能超过300个字符')
], async (req, res) => {
  try {
    const { orderId } = req.params;
    const { score, comment } = req.body;

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: '订单不存在'
      });
    }

    if (order.status !== 'completed') {
      return res.status(400).json({
        success: false,
        message: '只能评价已完成的订单'
      });
    }

    if (order.rating && order.rating.score) {
      return res.status(400).json({
        success: false,
        message: '该订单已评价过'
      });
    }

    // 检查评价权限
    if (req.userType === 'farmer' && order.farmerId.toString() !== req.userId) {
      return res.status(403).json({
        success: false,
        message: '无权评价此订单'
      });
    }

    if (req.userType === 'pilot' && order.pilotId.toString() !== req.userId) {
      return res.status(403).json({
        success: false,
        message: '无权评价此订单'
      });
    }

    order.rating = {
      score,
      comment,
      ratedAt: new Date()
    };

    await order.save();

    // 更新用户评分
    const User = require('../models/User');
    const targetUserId = req.userType === 'farmer' ? order.pilotId : order.farmerId;
    const targetUser = await User.findById(targetUserId);

    if (targetUser) {
      // 重新计算平均评分
      const userOrders = await Order.find({
        $or: [
          { farmerId: targetUserId, status: 'completed', 'rating.score': { $exists: true } },
          { pilotId: targetUserId, status: 'completed', 'rating.score': { $exists: true } }
        ]
      });

      if (userOrders.length > 0) {
        const totalScore = userOrders.reduce((sum, order) => sum + order.rating.score, 0);
        targetUser.rating = totalScore / userOrders.length;
        await targetUser.save();
      }
    }

    res.json({
      success: true,
      message: '评价成功',
      data: { order }
    });
  } catch (error) {
    console.error('评价订单错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器错误'
    });
  }
});

module.exports = router;