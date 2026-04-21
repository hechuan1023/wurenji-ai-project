const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  farmerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, '农户ID不能为空']
  },
  pilotId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  farmLocation: {
    type: {
      type: String,
      enum: ['Point'],
      required: [true, '农田位置不能为空']
    },
    coordinates: {
      type: [Number],
      required: [true, '经纬度坐标不能为空']
    }
  },
  farmAddress: {
    type: String,
    required: [true, '农田地址不能为空'],
    trim: true
  },
  serviceType: {
    type: String,
    enum: ['crop_spraying', 'mapping', 'monitoring', 'planting', 'harvesting'],
    required: [true, '服务类型不能为空']
  },
  serviceDescription: {
    type: String,
    trim: true,
    maxlength: [500, '服务描述不能超过500个字符']
  },
  area: {
    type: Number,
    required: [true, '农田面积不能为空'],
    min: [0.1, '农田面积不能小于0.1亩']
  },
  price: {
    type: Number,
    required: [true, '服务价格不能为空'],
    min: [0, '服务价格不能为负数']
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'in_progress', 'completed', 'cancelled', 'paid'],
    default: 'pending'
  },
  scheduledAt: {
    type: Date,
    required: [true, '预约时间不能为空']
  },
  completedAt: {
    type: Date
  },
  acceptedAt: {
    type: Date
  },
  startedAt: {
    type: Date
  },
  cancelledAt: {
    type: Date
  },
  cancelReason: {
    type: String,
    trim: true,
    maxlength: [200, '取消原因不能超过200个字符']
  },
  farmerNotes: {
    type: String,
    trim: true,
    maxlength: [300, '农户备注不能超过300个字符']
  },
  pilotNotes: {
    type: String,
    trim: true,
    maxlength: [300, '飞手备注不能超过300个字符']
  },
  images: [{
    url: String,
    type: {
      type: String,
      enum: ['before', 'during', 'after'],
      default: 'before'
    },
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  rating: {
    score: {
      type: Number,
      min: 1,
      max: 5
    },
    comment: {
      type: String,
      trim: true,
      maxlength: [300, '评价内容不能超过300个字符']
    },
    ratedAt: {
      type: Date
    }
  },
  paymentInfo: {
    paymentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Payment'
    },
    amount: Number,
    status: {
      type: String,
      enum: ['pending', 'paid', 'refunded'],
      default: 'pending'
    }
  }
}, {
  timestamps: true
});

// 索引
orderSchema.index({ farmerId: 1 });
orderSchema.index({ pilotId: 1 });
orderSchema.index({ status: 1 });
orderSchema.index({ scheduledAt: 1 });
orderSchema.index({ farmLocation: '2dsphere' });
orderSchema.index({ createdAt: -1 });

// 虚拟字段：距离计算
orderSchema.virtual('distance').get(function() {
  return this._distance;
});

orderSchema.virtual('distance', function(distance) {
  this._distance = distance;
});

// 查询中间件
orderSchema.pre(/^find/, function(next) {
  this.populate('farmerId', 'username phone avatar rating');
  this.populate('pilotId', 'username phone avatar rating');
  next();
});

// 订单状态变更方法
orderSchema.methods.updateStatus = async function(newStatus, additionalData = {}) {
  this.status = newStatus;

  switch (newStatus) {
    case 'accepted':
      this.acceptedAt = new Date();
      break;
    case 'in_progress':
      this.startedAt = new Date();
      break;
    case 'completed':
      this.completedAt = new Date();
      break;
    case 'cancelled':
      this.cancelledAt = new Date();
      if (additionalData.cancelReason) {
        this.cancelReason = additionalData.cancelReason;
      }
      break;
  }

  // 更新其他字段
  Object.assign(this, additionalData);

  await this.save();
  return this;
};

// 计算订单持续时间
orderSchema.methods.getDuration = function() {
  if (this.startedAt && this.completedAt) {
    return Math.round((this.completedAt - this.startedAt) / (1000 * 60)); // 分钟
  }
  return null;
};

const Order = mongoose.model('Order', orderSchema);

module.exports = Order;