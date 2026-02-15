import jwt from 'jsonwebtoken';
import User, { IUser } from '../models/User';
import createError from 'http-errors';

interface TokenPayload {
  userId: string;
}

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export class AuthService {
  // Generate JWT tokens
  static generateTokens(userId: string): AuthTokens {
    const accessToken = jwt.sign(
      { userId },
      process.env.JWT_SECRET!,
      { 
        expiresIn: process.env.ACCESS_TOKEN_EXPIRY || '15m',
        algorithm: 'HS256'
      } as jwt.SignOptions
    );
    
    const refreshToken = jwt.sign(
      { userId },
      process.env.JWT_REFRESH_SECRET!,
      { 
        expiresIn: process.env.REFRESH_TOKEN_EXPIRY || '7d',
        algorithm: 'HS256'
      } as jwt.SignOptions
    );
    
    return { accessToken, refreshToken };
  }
  
  // Verify access token
  static verifyAccessToken(token: string): TokenPayload {
    try {
      return jwt.verify(token, process.env.JWT_SECRET!) as TokenPayload;
    } catch (error) {
      throw createError(401, 'Invalid or expired token');
    }
  }
  
  // Verify refresh token
  static verifyRefreshToken(token: string): TokenPayload {
    try {
      return jwt.verify(token, process.env.JWT_REFRESH_SECRET!) as TokenPayload;
    } catch (error) {
      throw createError(401, 'Invalid refresh token');
    }
  }
  
  // Register new user
  static async register(userData: {
    name: string;
    email: string;
    password: string;
    picture?: string;
  }): Promise<{ user: IUser; tokens: AuthTokens }> {
    try {
      // Check if user already exists
      const existingUser = await User.findOne({ email: userData.email });
      if (existingUser) {
        throw createError(409, 'Email already registered');
      }
      
      // Create new user
      const user = new User({
        name: userData.name,
        email: userData.email,
        password: userData.password,
        picture: userData.picture || process.env.DEFAULT_PROFILE_PIC,
        status: process.env.DEFAULT_STATUS || 'Available'
      });
      
      await user.save();
      
      // Generate tokens
      const tokens = this.generateTokens(user._id.toString());
      
      // Remove password from response
      const userWithoutPassword = user.toObject();
      const { password: _, ...userResponse } = userWithoutPassword as any;
      
      return { user: userResponse as IUser, tokens };
    } catch (error) {
      throw error;
    }
  }
  
  // Login user
  static async login(email: string, password: string): Promise<{ user: IUser; tokens: AuthTokens }> {
    try {
      // Find user with password
      const user = await User.findOne({ email }).select('+password');
      
      if (!user) {
        throw createError(401, 'Invalid credentials');
      }
      
      // Check password
      const isPasswordValid = await user.comparePassword(password);
      if (!isPasswordValid) {
        throw createError(401, 'Invalid credentials');
      }
      
      // Update last seen
      user.lastSeen = new Date();
      user.isOnline = true;
      await user.save();
      
      // Generate tokens
      const tokens = this.generateTokens(user._id.toString());
      
      // Remove password from response
      const userWithoutPassword = user.toObject();
      const { password: _, ...userResponse } = userWithoutPassword as any;
      
      return { user: userResponse as IUser, tokens };
    } catch (error) {
      throw error;
    }
  }
  
  // Get user profile
  static async getProfile(userId: string): Promise<IUser> {
    try {
      const user = await User.findById(userId).select('-password');
      if (!user) {
        throw createError(404, 'User not found');
      }
      return user;
    } catch (error) {
      throw error;
    }
  }
  
  // Update user profile
  static async updateProfile(userId: string, updateData: {
    name?: string;
    status?: string;
    picture?: string;
  }): Promise<IUser> {
    try {
      const user = await User.findByIdAndUpdate(
        userId,
        { $set: updateData },
        { new: true, runValidators: true }
      ).select('-password');
      
      if (!user) {
        throw createError(404, 'User not found');
      }
      
      return user;
    } catch (error) {
      throw error;
    }
  }
}