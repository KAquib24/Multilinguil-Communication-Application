import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import createHttpError from 'http-errors';
import { rateLimit } from 'express-rate-limit';
import User from '../models/User.js'; // Changed from user.model.js to User.js

declare global {
  namespace Express {
    interface Request {
      user?: any;
      socketId?: string;
    }
  }
}

export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // Get token from header or cookie
    let token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token && req.cookies?.accessToken) {
      token = req.cookies.accessToken;
    }
    
    if (!token) {
      throw createHttpError(401, 'Authentication required');
    }
    
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as {
      userId: string;
      iat: number;
      exp: number;
    };
    
    // Find user
    const user = await User.findById(decoded.userId)
      .select('-password -refreshToken')
      .lean();
    
    if (!user) {
      throw createHttpError(401, 'User not found');
    }
    
    // Add any additional user status checks here if needed
    // For example, if you have isActive and isEmailVerified fields in your User model:
    // if (!user.isActive) {
    //   throw createHttpError(403, 'Account is deactivated');
    // }
    
    // Attach user to request
    req.user = user;
    
    // Get socket ID from header (if available)
    req.socketId = req.header('X-Socket-ID');
    
    next();
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      next(createHttpError(401, 'Token expired'));
    } else if (error.name === 'JsonWebTokenError') {
      next(createHttpError(401, 'Invalid token'));
    } else {
      next(error);
    }
  }
};

// Optional authentication (doesn't throw error)
export const optionalAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    let token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token && req.cookies?.accessToken) {
      token = req.cookies.accessToken;
    }
    
    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as {
        userId: string;
      };
      
      const user = await User.findById(decoded.userId)
        .select('-password -refreshToken')
        .lean();
      
      if (user) {
        // Add additional checks if needed
        // if (user.isActive && user.isEmailVerified) {
        req.user = user;
        req.socketId = req.header('X-Socket-ID');
        // }
      }
    }
    
    next();
  } catch (error) {
    // Silently fail for optional auth
    next();
  }
};

// Admin only middleware
export const requireAdmin = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // You'll need to add an isAdmin field to your User model first
  // if (!req.user?.isAdmin) {
  //   return next(createHttpError(403, 'Admin access required'));
  // }
  
  // For now, you can comment this out or implement basic admin check
  if (!req.user) {
    return next(createHttpError(403, 'Authentication required'));
  }
  
  // Temporary: allow all authenticated users
  // In production, implement proper admin roles
  next();
};

// Rate limiting middleware
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});