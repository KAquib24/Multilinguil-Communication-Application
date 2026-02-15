import mongoose, { Document, Schema } from 'mongoose';
import bcrypt from 'bcrypt';
import validator from 'validator';

export interface IUser extends Document {
  name: string;
  email: string;
  password: string;
  picture: string;
  status: string;
  isOnline: boolean;
  lastSeen: Date;
  contacts: mongoose.Types.ObjectId[];
  sentFriendRequests: mongoose.Types.ObjectId[];
  receivedFriendRequests: mongoose.Types.ObjectId[];
  blockedUsers: mongoose.Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

const userSchema = new Schema<IUser>(
  {
    name: {
      type: String,
      required: [true, 'Please provide your name'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters'],
      maxlength: [50, 'Name cannot exceed 50 characters']
    },
    email: {
      type: String,
      required: [true, 'Please provide your email'],
      unique: true,
      lowercase: true,
      validate: [validator.isEmail, 'Please provide a valid email']
    },
    password: {
      type: String,
      required: [true, 'Please provide a password'],
      minlength: [6, 'Password must be at least 6 characters'],
      select: false
    },
    picture: {
      type: String,
      default: process.env.DEFAULT_PROFILE_PIC || 'https://via.placeholder.com/150'
    },
    status: {
      type: String,
      default: process.env.DEFAULT_STATUS || 'Available',
      maxlength: [100, 'Status cannot exceed 100 characters']
    },
    isOnline: {
      type: Boolean,
      default: false
    },
    lastSeen: {
      type: Date,
      default: Date.now
    },
    contacts: [{
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: []
    }],
    sentFriendRequests: [{
      type: Schema.Types.ObjectId,
      ref: 'FriendRequest',
      default: []
    }],
    receivedFriendRequests: [{
      type: Schema.Types.ObjectId,
      ref: 'FriendRequest',
      default: []
    }],
    blockedUsers: [{
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: []
    }]
  },
  {
    timestamps: true,
    toJSON: { 
      virtuals: true,
      transform: function(doc, ret) {
        delete ret.password;
        return ret;
      }
    },
    toObject: { 
      virtuals: true,
      transform: function(doc, ret) {
        delete ret.password;
        return ret;
      }
    }
  }
);

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error: any) {
    next(error);
  }
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword: string): Promise<boolean> {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Virtual for online status
userSchema.virtual('onlineStatus').get(function () {
  // If online, return immediately
  if (this.isOnline) return 'online';

  // SAFETY CHECK (CRITICAL)
  if (!this.lastSeen || !(this.lastSeen instanceof Date)) {
    return 'offline';
  }

  const now = new Date();
  const diff = now.getTime() - this.lastSeen.getTime();

  if (diff < 0) return 'offline';

  const minutes = Math.floor(diff / 60000);

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} hours ago`;
  return `${Math.floor(minutes / 1440)} days ago`;
});


const User = mongoose.model<IUser>('User', userSchema);
export default User;