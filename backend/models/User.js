const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: [true, '用户名不能为空'],
    trim: true,
    maxlength: [50, '用户名不能超过50个字符']
  },
  phone: {
    type: String,
    required: [true, '手机号不能为空'],
    unique: true,
    match: [/^1[3-9]\d{9}$/, '手机号格式不正确']
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, '邮箱格式不正确']
  },
  password: {
    type: String,
    required: [true, '密码不能为空'],
    minlength: [6, '密码至少6个字符'],
    select: false
  },
  userType: {
    type: String,
    enum: ['pilot', 'farmer', 'admin'],
    required: [true, '用户类型不能为空']
  },
  avatar: {
    type: String,
    default: ''
  },
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number],
      default: [0, 0]
    }
  },
  rating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5
  },
  completedOrders: {
    type: Number,
    default: 0
  },
  totalEarnings: {
    type: Number,
    default: 0
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastLoginAt: {
    type: Date
  },
  deviceToken: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

// 索引
userSchema.index({ phone: 1 });
userSchema.index({ location: '2dsphere' });
userSchema.index({ userType: 1 });

// 密码加密中间件
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();

  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// 密码验证方法
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// 更新最后登录时间
userSchema.methods.updateLastLogin = async function() {
  this.lastLoginAt = new Date();
  await this.save();
};

// 计算用户统计信息
userSchema.methods.updateStats = async function() {
  const Order = require('./Order');

  if (this.userType === 'pilot') {
    const stats = await Order.aggregate([
      { $match: { pilotId: this._id, status: 'completed' } },
      {
        $group: {
          _id: null,
          completedOrders: { $sum: 1 },
          totalEarnings: { $sum: '$price' }
        }
      }
    ]);

    if (stats.length > 0) {
      this.completedOrders = stats[0].completedOrders;
      this.totalEarnings = stats[0].totalEarnings;
      await this.save();
    }
  }
};

const User = mongoose.model('User', userSchema);

module.exports = User;