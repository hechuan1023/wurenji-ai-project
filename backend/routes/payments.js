const express = require('express');
const { body, validationResult } = require('express-validator');
const Payment = require('../models/Payment');
const Order = require('../models/Order');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

const router = express.Router();

// 创建支付订单
router.post('/create', [
  authenticateToken,
  body('orderId')
    .isMongoId()
    .withMessage('订单ID格式不正确'),
  body('paymentMethod')
    .isIn(['alipay', 'wechat', 'bank_card', 'cash'])
    .withMessage('支付方式不正确')
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

    const { orderId, paymentMethod, description } = req.body;

    // 查找订单
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: '订单不存在'
      });
    }

    // 检查订单状态
    if (order.status !== 'completed') {
      return res.status(400).json({
        success: false,
        message: '只能为已完成的订单创建支付'
      });
    }

    // 检查是否已经存在支付记录
    const existingPayment = await Payment.findOne({
      orderId,
      status: { $in: ['pending', 'processing', 'success'] }
    });

    if (existingPayment) {
      return res.status(400).json({
        success: false,
        message: '该订单已有支付记录',
        data: { paymentId: existingPayment._id }
      });
    }

    // 创建支付记录
    const payment = new Payment({
      orderId,
      userId: req.userId,
      amount: order.price,
      paymentMethod,
      description: description || `无人机服务费用 - 订单${orderId}`,
      paymentGateway: paymentMethod === 'cash' ? 'manual' : paymentMethod
    });

    await payment.save();

    // 更新订单支付信息
    order.paymentInfo = {
      paymentId: payment._id,
      amount: payment.amount,
      status: payment.status
    };
    await order.save();

    res.status(201).json({
      success: true,
      message: '支付订单创建成功',
      data: {
        paymentId: payment._id,
        amount: payment.amount,
        paymentMethod: payment.paymentMethod,
        orderId: payment.orderId
      }
    });
  } catch (error) {
    console.error('创建支付订单错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器错误',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

// 模拟支付处理（实际项目中需要对接真实的支付网关）
router.post('/:paymentId/process', [
  authenticateToken,
  body('paymentData')
    .optional()
    .isObject()
    .withMessage('支付数据格式不正确')
], async (req, res) => {
  try {
    const { paymentId } = req.params;
    const { paymentData } = req.body;

    const payment = await Payment.findById(paymentId);
    if (!payment) {
      return res.status(404).json({
        success: false,
        message: '支付记录不存在'
      });
    }

    if (payment.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: '支付状态不正确'
      });
    }

    // 模拟支付处理逻辑
    // 在实际项目中，这里需要调用第三方支付API
    let paymentResult;

    switch (payment.paymentMethod) {
      case 'alipay':
        paymentResult = await simulateAlipayPayment(payment, paymentData);
        break;
      case 'wechat':
        paymentResult = await simulateWechatPayment(payment, paymentData);
        break;
      case 'bank_card':
        paymentResult = await simulateBankCardPayment(payment, paymentData);
        break;
      case 'cash':
        paymentResult = await processCashPayment(payment);
        break;
      default:
        throw new Error('不支持的支付方式');
    }

    if (paymentResult.success) {
      // 更新支付状态
      payment.transactionId = paymentResult.transactionId;
      payment.gatewayResponse = paymentResult.gatewayResponse;
      await payment.updateStatus('success');

      // 更新订单状态
      await Order.findByIdAndUpdate(payment.orderId, {
        'paymentInfo.status': 'paid',
        status: 'paid'
      });

      res.json({
        success: true,
        message: '支付成功',
        data: {
          paymentId: payment._id,
          transactionId: payment.transactionId,
          amount: payment.amount
        }
      });
    } else {
      await payment.updateStatus('failed', {
        gatewayResponse: paymentResult.error
      });

      res.status(400).json({
        success: false,
        message: '支付失败',
        error: paymentResult.error
      });
    }
  } catch (error) {
    console.error('处理支付错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器错误'
    });
  }
});

// 支付回调（第三方支付平台调用）
router.post('/callback/:paymentGateway', async (req, res) => {
  try {
    const { paymentGateway } = req.params;
    const callbackData = req.body;

    console.log(`收到${paymentGateway}支付回调:`, callbackData);

    // 验证回调签名（实际项目中需要实现）
    // const isValidSignature = verifySignature(callbackData);
    // if (!isValidSignature) {
    //   return res.status(400).send('Invalid signature');
    // }

    const { transactionId, status, amount } = callbackData;

    // 查找支付记录
    const payment = await Payment.findOne({ transactionId });
    if (!payment) {
      return res.status(404).send('Payment not found');
    }

    // 更新支付状态
    payment.gatewayResponse = callbackData;
    await payment.updateStatus(status === 'success' ? 'success' : 'failed');

    // 如果支付成功，更新订单状态
    if (status === 'success') {
      await Order.findByIdAndUpdate(payment.orderId, {
        'paymentInfo.status': 'paid',
        status: 'paid'
      });
    }

    // 返回成功响应给支付平台
    res.send('success');
  } catch (error) {
    console.error('支付回调处理错误:', error);
    res.status(500).send('Internal server error');
  }
});

// 获取支付记录
router.get('/:paymentId', authenticateToken, async (req, res) => {
  try {
    const { paymentId } = req.params;

    const payment = await Payment.findById(paymentId)
      .populate('orderId', 'farmAddress serviceType price')
      .populate('userId', 'username phone');

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: '支付记录不存在'
      });
    }

    // 检查权限
    if (payment.userId._id.toString() !== req.userId && req.userType !== 'admin') {
      return res.status(403).json({
        success: false,
        message: '无权查看此支付记录'
      });
    }

    res.json({
      success: true,
      data: { payment }
    });
  } catch (error) {
    console.error('获取支付记录错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器错误'
    });
  }
});

// 获取我的支付记录
router.get('/my-payments', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    let query = { userId: req.userId };
    if (status) {
      query.status = status;
    }

    const payments = await Payment.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('orderId', 'farmAddress serviceType price');

    const total = await Payment.countDocuments(query);

    res.json({
      success: true,
      data: {
        payments,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(total / parseInt(limit)),
          total
        }
      }
    });
  } catch (error) {
    console.error('获取支付记录错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器错误'
    });
  }
});

// 退款处理
router.post('/:paymentId/refund', [
  authenticateToken,
  authorizeRoles('admin'), // 只有管理员可以退款
  body('refundReason')
    .trim()
    .isLength({ min: 5, max: 300 })
    .withMessage('退款原因长度应在5-300个字符之间')
], async (req, res) => {
  try {
    const { paymentId } = req.params;
    const { refundReason } = req.body;

    const payment = await Payment.findById(paymentId);
    if (!payment) {
      return res.status(404).json({
        success: false,
        message: '支付记录不存在'
      });
    }

    if (payment.status !== 'success') {
      return res.status(400).json({
        success: false,
        message: '只能退款已成功的支付'
      });
    }

    // 模拟退款处理
    // 在实际项目中，需要调用第三方支付API进行退款
    await payment.updateStatus('refunded', { refundReason });

    // 更新订单状态
    await Order.findByIdAndUpdate(payment.orderId, {
      'paymentInfo.status': 'refunded'
    });

    res.json({
      success: true,
      message: '退款处理成功',
      data: { payment }
    });
  } catch (error) {
    console.error('退款处理错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器错误'
    });
  }
});

// 模拟支付宝支付
async function simulateAlipayPayment(payment, paymentData) {
  // 模拟支付处理时间
  await new Promise(resolve => setTimeout(resolve, 2000));

  // 模拟90%成功率
  const success = Math.random() > 0.1;

  if (success) {
    return {
      success: true,
      transactionId: `ALI${Date.now()}${Math.floor(Math.random() * 1000)}`,
      gatewayResponse: {
        code: '10000',
        msg: 'Success',
        buyer_pay_amount: payment.amount.toString()
      }
    };
  } else {
    return {
      success: false,
      error: {
        code: '40004',
        msg: 'Business Failed',
        sub_code: 'ACQ.TRADE_HAS_SUCCESS',
        sub_msg: '交易已被支付'
      }
    };
  }
}

// 模拟微信支付
async function simulateWechatPayment(payment, paymentData) {
  await new Promise(resolve => setTimeout(resolve, 1500));

  const success = Math.random() > 0.05;

  if (success) {
    return {
      success: true,
      transactionId: `WX${Date.now()}${Math.floor(Math.random() * 1000)}`,
      gatewayResponse: {
        return_code: 'SUCCESS',
        result_code: 'SUCCESS',
        transaction_id: `WX${Date.now()}${Math.floor(Math.random() * 1000)}`
      }
    };
  } else {
    return {
      success: false,
      error: {
        return_code: 'FAIL',
        return_msg: '支付失败'
      }
    };
  }
}

// 模拟银行卡支付
async function simulateBankCardPayment(payment, paymentData) {
  await new Promise(resolve => setTimeout(resolve, 3000));

  const success = Math.random() > 0.15;

  if (success) {
    return {
      success: true,
      transactionId: `CARD${Date.now()}${Math.floor(Math.random() * 1000)}`,
      gatewayResponse: {
        status: 'approved',
        transaction_id: `CARD${Date.now()}${Math.floor(Math.random() * 1000)}`
      }
    };
  } else {
    return {
      success: false,
      error: {
        status: 'declined',
        error: 'Insufficient funds'
      }
    };
  }
}

// 处理现金支付
async function processCashPayment(payment) {
  // 现金支付直接成功
  return {
    success: true,
    transactionId: `CASH${Date.now()}${Math.floor(Math.random() * 1000)}`,
    gatewayResponse: {
      method: 'cash',
      status: 'completed'
    }
  };
}

module.exports = router;