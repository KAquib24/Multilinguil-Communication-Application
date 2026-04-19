// Handle Google Cloud credentials from environment variable
import fs from 'fs';
import path from 'path';

// Create credentials file from environment variable (for Render deployment)
if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
  const credentialsPath = path.join(process.cwd(), 'google-credentials.json');
  fs.writeFileSync(credentialsPath, process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
  process.env.GOOGLE_APPLICATION_CREDENTIALS = credentialsPath;
  console.log('✅ Google Cloud credentials loaded from environment variable');
}

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
import { fileURLToPath } from 'url';

// Load environment variables
dotenv.config();

// ES Modules fix for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import routes
import authRoutes from './routes/auth.routes.js';
import chatRoutes from './routes/chat.routes.js';
import callRoutes from './routes/call.routes.js';
import translationRoutes from './routes/translation.routes.js';
import userRoutes from './routes/user.routes.js';
import friendRequestRoutes from './routes/friendRequest.routes.js';

// Import WebSocket handlers
import { initializeSocket } from './socket/socket.handler.js';

// Import middleware
import { authenticate } from './middleware/auth.middleware.js';
import errorHandler from './middleware/errorHandler.js';

// Initialize Express app
const app: Application = express();
const PORT = process.env.PORT || 5001;

// Create HTTP server for Socket.IO
const server = http.createServer(app);

// ====================
// 🔧 CORS CONFIGURATION - MUST BE FIRST
// ====================

// Get frontend URLs from environment or use defaults
const getFrontendUrls = () => {
  const urls = [
    'http://localhost:3000',
    'http://localhost:5001',
  ];
  
  // Add from environment variable
  if (process.env.FRONTEND_URL) {
    process.env.FRONTEND_URL.split(',').forEach(url => urls.push(url.trim()));
  }
  
  // Add your specific Vercel URLs
  urls.push(
    'https://whatsapp-clone-frontend.vercel.app',
    'https://whatsapp-clone-frontend-6l1lxhq15-kaquib24s-projects.vercel.app'
  );
  
  return urls;
};

// CORS options
const corsOptions = {
  origin: function (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
    const allowedOrigins = getFrontendUrls();
    
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) {
      return callback(null, true);
    }
    
    // Check if origin is allowed
    const isAllowed = allowedOrigins.some(allowed => {
      if (allowed === origin) return true;
      // Allow all Vercel preview deployments
      if (allowed === 'https://whatsapp-clone-frontend.vercel.app' && origin.includes('vercel.app')) return true;
      // Allow all Render preview deployments
      if (origin.includes('.onrender.com')) return true;
      return false;
    });
    
    if (isAllowed) {
      callback(null, true);
    } else {
      console.log(`❌ CORS blocked origin: ${origin}`);
      callback(null, true); // Still allow for testing - remove in production if needed
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin',
    'Cookie',
    'Set-Cookie'
  ],
  exposedHeaders: ['Set-Cookie'],
  optionsSuccessStatus: 200,
  preflightContinue: false,
};

// Apply CORS middleware FIRST
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// Initialize Socket.IO with CORS configuration
const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      const allowedOrigins = getFrontendUrls();
      if (!origin || allowedOrigins.some(allowed => origin.includes(allowed) || origin.includes('vercel.app') || origin.includes('onrender.com'))) {
        callback(null, true);
      } else {
        callback(new Error('CORS not allowed'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST'],
  },
  pingTimeout: 10000,
  pingInterval: 25000,
  transports: ['websocket', 'polling'],
});

// Make io available globally
(global as any).io = io;
app.set("io", io);

// ====================
// 🛡️ SECURITY MIDDLEWARE
// ====================
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
}));

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiting to API routes
app.use('/api/', apiLimiter);

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

// API v1 Routes
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/friend-requests', friendRequestRoutes);
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/chats', authenticate, chatRoutes);
app.use('/api/v1/calls', authenticate, callRoutes);
app.use('/api/v1/translation', authenticate, translationRoutes);

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
    
    // Start HTTP server
    server.listen(PORT, () => {
      console.log(`
🚀 WhatsApp Clone Server is running!
      
📍 Environment: ${process.env.NODE_ENV || 'development'}
📍 Port: ${PORT}
📍 Database: ${process.env.MONGODB_URI?.split('@')[1]?.split('/')[0] || 'localhost'}
📍 Frontend URLs: ${getFrontendUrls().join(', ')}
      
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
      
🔤 Translation:
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