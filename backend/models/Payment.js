const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: [true, '订单ID不能为空']
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, '用户ID不能为空']
  },
  amount: {
    type: Number,
    required: [true, '支付金额不能为空'],
    min: [0, '支付金额不能为负数']
  },
  currency: {
    type: String,
    default: 'CNY',
    enum: ['CNY', 'USD']
  },
  paymentMethod: {
    type: String,
    enum: ['alipay', 'wechat', 'bank_card', 'cash'],
    required: [true, '支付方式不能为空']
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'success', 'failed', 'refunded'],
    default: 'pending'
  },
  transactionId: {
    type: String,
    unique: true
  },
  paymentGateway: {
    type: String,
    enum: ['alipay', 'wechat_pay', 'stripe', 'manual']
  },
  gatewayResponse: {
    type: mongoose.Schema.Types.Mixed
  },
  description: {
    type: String,
    trim: true,
    maxlength: [200, '支付描述不能超过200个字符']
  },
  paidAt: {
    type: Date
  },
  refundedAt: {
    type: Date
  },
  refundReason: {
    type: String,
    trim: true,
    maxlength: [300, '退款原因不能超过300个字符']
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true
});

// 索引
paymentSchema.index({ orderId: 1 });
paymentSchema.index({ userId: 1 });
paymentSchema.index({ status: 1 });
paymentSchema.index({ createdAt: -1 });
paymentSchema.index({ transactionId: 1 });

// 查询中间件
paymentSchema.pre(/^find/, function(next) {
  this.populate('userId', 'username phone');
  this.populate('orderId', 'farmAddress serviceType');
  next();
});

// 支付状态变更方法
paymentSchema.methods.updateStatus = async function(newStatus, additionalData = {}) {
  this.status = newStatus;

  switch (newStatus) {
    case 'success':
      this.paidAt = new Date();
      break;
    case 'refunded':
      this.refundedAt = new Date();
      if (additionalData.refundReason) {
        this.refundReason = additionalData.refundReason;
      }
      break;
    case 'failed':
      // 可以添加失败原因等
      break;
  }

  // 更新其他字段
  Object.assign(this, additionalData);

  await this.save();
  return this;
};

// 创建支付记录
paymentSchema.statics.createPayment = async function(paymentData) {
  const payment = new this(paymentData);
  await payment.save();
  return payment;
};

// 处理支付回调
paymentSchema.statics.handlePaymentCallback = async function(transactionId, status, gatewayResponse) {
  const payment = await this.findOne({ transactionId });
  if (!payment) {
    throw new Error('支付记录不存在');
  }

  payment.gatewayResponse = gatewayResponse;
  payment.transactionId = transactionId;
  await payment.updateStatus(status);

  return payment;
};

const Payment = mongoose.model('Payment', paymentSchema);

module.exports = Payment;