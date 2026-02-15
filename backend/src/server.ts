// server.ts
import express, { Application, Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import mongoSanitize from 'express-mongo-sanitize';
import cookieParser from 'cookie-parser';
import { Server } from 'socket.io';
import http from 'http';
import createHttpError from 'http-errors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
dotenv.config();

// ES Modules fix for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import routes - IMPORTANT: Import .ts files, not .js
import authRoutes from './routes/auth.routes.js'; // This should be .ts
import chatRoutes from './routes/chat.routes.js'; // This should be .ts
import callRoutes from './routes/call.routes.js'; // This should be .ts
import translationRoutes from './routes/translation.routes.js'; // This should be .ts
import userRoutes from './routes/user.routes.js';
import friendRequestRoutes from './routes/friendRequest.routes.js';

// Import WebSocket handlers
import { initializeSocket } from './socket/socket.handler.js'; // This should be .ts

// Import middleware
import { authenticate } from './middleware/auth.middleware.js'; // This should be .ts
import errorHandler from './middleware/errorHandler.js'; // This should be .ts

// Initialize Express app
const app: Application = express();
const PORT = process.env.PORT || 5001;

// Create HTTP server for Socket.IO
const server = http.createServer(app);

// Initialize Socket.IO with CORS configuration
// Initialize Socket.IO with CORS configuration
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  },
  pingTimeout: 10000,
  pingInterval: 25000,
});

// FIXED: Make io available globally for translation service
(global as any).io = io;

app.set("io", io);
app.use(express.json({ limit: "50mb" }));


// ====================
// 🛡️ SECURITY MIDDLEWARE
// ====================
app.use(helmet());

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiting to API routes
app.use('/api/', apiLimiter);

// CORS configuration
const corsOptions = {
  origin: process.env.FRONTEND_URL?.split(',') || ['http://localhost:3000'],
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // Enable pre-flight for all routes

// ====================
// 🚀 EXPRESS MIDDLEWARE
// ====================
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
app.use(compression());
app.use(mongoSanitize());

// Static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/assets', express.static(path.join(__dirname, 'public/assets')));

// Logging middleware
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// ====================
// 🗄️ DATABASE CONNECTION
// ====================
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/whatsapp_clone');
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    
    // Create indexes for better performance
    await mongoose.connection.collection('users').createIndex({ email: 1 }, { unique: true });
    await mongoose.connection.collection('chats').createIndex({ participants: 1 });
    await mongoose.connection.collection('messages').createIndex({ chatId: 1, createdAt: -1 });
    await mongoose.connection.collection('calls').createIndex({ participants: 1, createdAt: -1 });
    
    console.log('✅ Database indexes created');
  } catch (error: any) {
    console.error(`❌ MongoDB connection error: ${error.message}`);
    process.exit(1);
  }
};

// ====================
// 🌐 ROUTES
// ====================

// Health check endpoint (public)
app.get('/api/health', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    environment: process.env.NODE_ENV,
  });
});

// API Documentation (public)
app.get('/api/docs', (req: Request, res: Response) => {
  res.json({
    message: 'WhatsApp Clone API Documentation',
    endpoints: {
      auth: '/api/v1/auth',
      chats: '/api/v1/chats',
      calls: '/api/v1/calls',
      translation: '/api/v1/translation',
    },
    version: '1.0.0',
  });
});

// API v1 Routes - ONLY USE ROUTES YOU ACTUALLY HAVE
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/friend-requests', friendRequestRoutes);
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/chats', authenticate, chatRoutes);
app.use('/api/v1/calls', authenticate, callRoutes);
app.use('/api/v1/translation', authenticate, translationRoutes);

// COMMENT OUT OR REMOVE ROUTES YOU DON'T HAVE
// app.use('/api/v1/users', authenticate, userRoutes);
// app.use('/api/v1/messages', authenticate, messageRoutes);
// app.use('/api/v1/stories', authenticate, storyRoutes);
// app.use('/api/v1/status', authenticate, statusRoutes);
// app.use('/api/v1/payments', authenticate, paymentRoutes);
// app.use('/api/v1/notifications', authenticate, notificationRoutes);

// WebSocket test endpoint
app.get('/api/v1/ws-test', authenticate, (req: Request, res: Response) => {
  res.json({
    message: 'WebSocket endpoint is active',
    userId: (req as any).user?._id,
    socketId: (req as any).socketId,
  });
});

// File upload test endpoint
app.post('/api/v1/upload-test', authenticate, (req: Request, res: Response) => {
  res.json({
    message: 'File upload endpoint is active',
    maxSize: '10MB',
    allowedTypes: ['image/jpeg', 'image/png', 'image/gif', 'video/mp4', 'audio/mpeg'],
  });
});

// ====================
// 🚫 404 HANDLER
// ====================
app.use('*', (req: Request, res: Response, next: NextFunction) => {
  next(createHttpError(404, `Route ${req.originalUrl} not found`));
});

// ====================
// 🛡️ ERROR HANDLER
// ====================
app.use(errorHandler);

// ====================
// 🔌 WEBSOCKET SETUP
// ====================
// Initialize Socket.IO handlers
initializeSocket(io);

// Socket.IO connection logging
io.on('connection', (socket) => {
  console.log(`🔌 New WebSocket connection: ${socket.id}`);
  
  socket.on('disconnect', (reason) => {
    console.log(`🔌 WebSocket disconnected: ${socket.id} - Reason: ${reason}`);
  });
  
  socket.on('error', (error) => {
    console.error(`🔌 WebSocket error: ${error.message}`);
  });
});

// ====================
// 🚀 SERVER STARTUP
// ====================
const startServer = async () => {
  try {
    // Connect to database
    await connectDB();
    
    // Start HTTP server (not app.listen() because of Socket.IO)
    server.listen(PORT, () => {
      console.log(`
🚀 WhatsApp Clone Server is running!
      
📍 Environment: ${process.env.NODE_ENV || 'development'}
📍 Port: ${PORT}
📍 Database: ${process.env.MONGODB_URI?.split('@')[1] || 'localhost'}
📍 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:3000'}
      
🔌 WebSocket Server: ws://localhost:${PORT}
      
📍 Available Endpoints:
📱 GET    /api/health                - Health check
📚 GET    /api/docs                  - API documentation
      
🔐 Authentication:
🔐 POST   /api/v1/auth/register      - Register new user
🔐 POST   /api/v1/auth/login         - Login user
      
💬 Chats:
💬 GET    /api/v1/chats              - Get all chats
💬 POST   /api/v1/chats              - Create chat
      
📞 Calls:
📞 POST   /api/v1/calls              - Start call
📞 GET    /api/v1/calls/:callId      - Get call details
      
🔤 Translation (Day 6):
🔤 POST   /api/v1/translation/translate - Translate text
🔤 POST   /api/v1/translation/speech-to-text - Speech to text
🔤 POST   /api/v1/translation/text-to-speech - Text to speech
🔤 GET    /api/v1/translation/languages - Get supported languages
      
📡 WebSocket:
📡 GET    /api/v1/ws-test             - WebSocket test
📤 POST   /api/v1/upload-test         - Upload test
      `);
      
      // Log available translation services
      if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        console.log('🔤 Google Translation API: ✅ Enabled');
      } else if (process.env.AZURE_TRANSLATOR_KEY) {
        console.log('🔤 Azure Translation API: ✅ Enabled');
      } else {
        console.log('🔤 Translation API: ❌ Not configured');
      }
      
      if (process.env.CLOUDINARY_CLOUD_NAME) {
        console.log('☁️ Cloudinary: ✅ Enabled');
      }
    });
    
    // Handle server errors
    server.on('error', (error: Error) => {
      console.error(`❌ Server error: ${error.message}`);
      process.exit(1);
    });
    
  } catch (error: any) {
    console.error(`❌ Failed to start server: ${error.message}`);
    process.exit(1);
  }
};

console.log("CREDENTIAL PATH:", process.env.GOOGLE_APPLICATION_CREDENTIALS);


// ====================
// 🚪 GRACEFUL SHUTDOWN
// ====================
const gracefulShutdown = () => {
  console.log('\n🛑 Received shutdown signal, closing server gracefully...');
  
  server.close(async (err) => {
    if (err) {
      console.error('❌ Error during server close:', err);
      process.exit(1);
    }
    
    console.log('✅ HTTP server closed');
    
    try {
      await mongoose.connection.close();
      console.log('✅ Database connection closed');
    } catch (dbError) {
      console.error('❌ Error closing database:', dbError);
    }
    
    console.log('👋 Server shutdown complete');
    process.exit(0);
  });
  
  setTimeout(() => {
    console.error('⏰ Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
};

// Handle termination signals
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// ====================
// 🏁 START SERVER
// ====================
startServer();

// Export for testing
export { app, server, io };