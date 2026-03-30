import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.service.js';
import createError from 'http-errors';
import validator from 'validator';

export class AuthController {
  // Register user
  static async register(req: Request, res: Response, next: NextFunction) {
    try {
      const { name, email, password, picture } = req.body;
      
      // Validation
      if (!name || !email || !password) {
        throw createError(400, 'Please provide all required fields');
      }
      
      if (!validator.isEmail(email)) {
        throw createError(400, 'Please provide a valid email');
      }
      
      if (password.length < 6) {
        throw createError(400, 'Password must be at least 6 characters');
      }
      
      // Register user
      const { user, tokens } = await AuthService.register({
        name,
        email,
        password,
        picture
      });
      
      // Set refresh token as HTTP-only cookie
      res.cookie('refreshToken', tokens.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      });
      
      res.status(201).json({
        success: true,
        message: 'Registration successful',
        data: {
          user,
          accessToken: tokens.accessToken
        }
      });
    } catch (error) {
      next(error);
    }
  }
  
  // Login user
  static async login(req: Request, res: Response, next: NextFunction) {
    try {
      const { email, password } = req.body;
      
      // Validation
      if (!email || !password) {
        throw createError(400, 'Please provide email and password');
      }
      
      if (!validator.isEmail(email)) {
        throw createError(400, 'Please provide a valid email');
      }
      
      // Login user
      const { user, tokens } = await AuthService.login(email, password);
      
      // Set refresh token as HTTP-only cookie
      res.cookie('refreshToken', tokens.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      });
      
      res.status(200).json({
        success: true,
        message: 'Login successful',
        data: {
          user,
          accessToken: tokens.accessToken
        }
      });
    } catch (error) {
      next(error);
    }
  }
  
  // Get current user profile
  static async getProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user?.userId;
      
      if (!userId) {
        throw createError(401, 'Not authenticated');
      }
      
      const user = await AuthService.getProfile(userId);
      
      res.status(200).json({
        success: true,
        data: { user }
      });
    } catch (error) {
      next(error);
    }
  }
  
  // Update profile
  static async updateProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user?.userId;
      const { name, status, picture } = req.body;
      
      if (!userId) {
        throw createError(401, 'Not authenticated');
      }
      
      const updateData: any = {};
      if (name) updateData.name = name;
      if (status) updateData.status = status;
      if (picture) updateData.picture = picture;
      
      if (Object.keys(updateData).length === 0) {
        throw createError(400, 'No data provided for update');
      }
      
      const user = await AuthService.updateProfile(userId, updateData);
      
      res.status(200).json({
        success: true,
        message: 'Profile updated successfully',
        data: { user }
      });
    } catch (error) {
      next(error);
    }
  }
  
  // Refresh token
  static async refreshToken(req: Request, res: Response, next: NextFunction) {
    try {
      const refreshToken = req.cookies.refreshToken;
      
      if (!refreshToken) {
        throw createError(401, 'Refresh token not found');
      }
      
      const payload = AuthService.verifyRefreshToken(refreshToken);
      const tokens = AuthService.generateTokens(payload.userId);
      
      // Set new refresh token
      res.cookie('refreshToken', tokens.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000
      });
      
      res.status(200).json({
        success: true,
        data: {
          accessToken: tokens.accessToken
        }
      });
    } catch (error) {
      next(error);
    }
  }
  
  // Logout
  static async logout(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user?.userId;
      
      if (userId) {
        // Update user status to offline
        // await User.findByIdAndUpdate(userId, { 
        //   isOnline: false,
        //   lastSeen: new Date() 
        // });
      }
      
      // Clear refresh token cookie
      res.clearCookie('refreshToken', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict'
      });
      
      res.status(200).json({
        success: true,
        message: 'Logged out successfully'
      });
    } catch (error) {
      next(error);
    }
  }
}