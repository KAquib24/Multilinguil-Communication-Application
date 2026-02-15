import { Request, Response, NextFunction } from 'express';
import { HttpError } from 'http-errors';
import mongoose from 'mongoose';

interface ErrorResponse {
  success: boolean;
  message: string;
  error?: any;
  stack?: string;
  timestamp: string;
}

const errorHandler = (
  err: HttpError | Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  let statusCode = 500;
  let message = 'Internal Server Error';
  let error: any = {};
  
  // Handle HTTP errors
  if ('status' in err) {
    statusCode = err.status || 500;
    message = err.message || message;
  }
  
  // Handle Mongoose errors
  if (err instanceof mongoose.Error.ValidationError) {
    statusCode = 400;
    message = 'Validation Error';
    error = Object.values(err.errors).map(e => e.message);
  } else if (err instanceof mongoose.Error.CastError) {
    statusCode = 400;
    message = `Invalid ${err.path}: ${err.value}`;
  } else if (err.name === 'MongoServerError' && (err as any).code === 11000) {
    statusCode = 409;
    message = 'Duplicate field value entered';
    const field = Object.keys((err as any).keyPattern)[0];
    error = { [field]: `This ${field} already exists` };
  } else if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token';
  } else if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token expired';
  } else if (err.name === 'MulterError') {
    statusCode = 400;
    message = `File upload error: ${err.message}`;
  }
  
  // Build error response
  const errorResponse: ErrorResponse = {
    success: false,
    message,
    timestamp: new Date().toISOString(),
  };
  
  // Include error details in development
  if (process.env.NODE_ENV === 'development') {
    errorResponse.error = err;
    errorResponse.stack = err.stack;
  } else if (Object.keys(error).length > 0) {
    errorResponse.error = error;
  }
  
  // Log error
  console.error(`❌ [${new Date().toISOString()}] ${statusCode} ${message}`, {
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    userId: (req as any).user?._id,
    error: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });
  
  // Send response
  res.status(statusCode).json(errorResponse);
};

export default errorHandler;