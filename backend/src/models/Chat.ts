import mongoose, { Document, Schema } from "mongoose";

export interface IMessage extends Document {
  sender: mongoose.Types.ObjectId;
  content: string;
  type: "text" | "image" | "file" | "audio" | "video" | "location";
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  thumbnail?: string;
  duration?: number; // for audio/video
  latitude?: number;
  longitude?: number;
  locationName?: string;
  readBy: mongoose.Types.ObjectId[];
  deleted: boolean;
  deletedAt?: Date;
  forwarded: boolean;
  forwardedFrom?: mongoose.Types.ObjectId;
  replyTo?: mongoose.Types.ObjectId;
  reactions: {
    userId: mongoose.Types.ObjectId;
    emoji: string;
  }[];
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface IChat extends Document {
  participants: [
    {
      type: mongoose.Schema.Types.ObjectId;
      ref: "User";
    },
  ];
  isGroup: boolean;
  groupName?: string;
  groupPhoto?: string;
  groupDescription?: string;
  groupAdmins: mongoose.Types.ObjectId[];
  lastMessage?: mongoose.Types.ObjectId;
  lastMessageAt: Date;
  messages: IMessage[];
  pinned: boolean;
  mutedBy: mongoose.Types.ObjectId[];
  archivedBy: mongoose.Types.ObjectId[];
  typing: {
    userId: mongoose.Types.ObjectId;
    startedAt: Date;
  }[];
  createdAt: Date;
  updatedAt: Date;
}

const reactionSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    emoji: {
      type: String,
      required: true,
    },
  },
  { _id: false },
);

const messageSchema = new Schema<IMessage>(
  {
    sender: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    content: {
      type: String,
      required: function () {
        return this.type === "text";
      },
      trim: true,
      maxlength: [5000, "Message cannot exceed 5000 characters"],
    },
    type: {
      type: String,
      enum: ["text", "image", "file", "audio", "video", "location"],
      default: "text",
      required: true,
    },
    fileUrl: String,
    fileName: String,
    fileSize: Number,
    mimeType: String,
    thumbnail: String,
    duration: Number,
    latitude: Number,
    longitude: Number,
    locationName: String,
    readBy: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
        default: [],
      },
    ],
    deleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: Date,
    forwarded: {
      type: Boolean,
      default: false,
    },
    forwardedFrom: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    replyTo: {
      type: Schema.Types.ObjectId,
      ref: "Message",
    },
    reactions: [reactionSchema],
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// Type for validator context
interface ValidatorThis {
  isGroup: boolean;
}

const chatSchema = new Schema<IChat>(
  {
    participants: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
        participants: [
          {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
          },
        ],
      },
    ],
    isGroup: {
      type: Boolean,
      default: false,
      required: true,
    },
    groupName: {
      type: String,
      required: function (this: ValidatorThis) {
        return this.isGroup === true;
      },
      trim: true,
      maxlength: [100, "Group name cannot exceed 100 characters"],
    },
    groupPhoto: {
      type: String,
      default: function () {
        return process.env.DEFAULT_GROUP_PIC || "";
      },
    },
    groupDescription: {
      type: String,
      maxlength: [500, "Group description cannot exceed 500 characters"],
    },
    groupAdmins: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
        default: [],
      },
    ],
    lastMessage: {
      type: Schema.Types.ObjectId,
      ref: "Message",
    },
    lastMessageAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    messages: [messageSchema],
    pinned: {
      type: Boolean,
      default: false,
      index: true,
    },
    mutedBy: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
        default: [],
      },
    ],
    archivedBy: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
        default: [],
      },
    ],
    typing: [
      {
        userId: {
          type: Schema.Types.ObjectId,
          ref: "User",
        },
        startedAt: Date,
      },
    ],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// Indexes for faster queries
chatSchema.index({ participants: 1, isGroup: 1 });
chatSchema.index({ lastMessageAt: -1 });
chatSchema.index({ pinned: -1, lastMessageAt: -1 });
chatSchema.index({ "messages.createdAt": -1 });
chatSchema.index({ "messages.sender": 1 });

// Virtual for unread message count
chatSchema.virtual("unreadCount").get(function () {
  // This would be calculated per user in the service layer
  return 0;
});

// Pre-save middleware
chatSchema.pre("save", function (next) {
  if (this.isModified("messages") && this.messages.length > 0) {
    this.lastMessage = this.messages[this.messages.length - 1]._id;
    this.lastMessageAt = new Date();
  }
  next();
});

// Static method to find or create one-on-one chat
chatSchema.statics.findOrCreateOneOnOne = async function (
  userId1: string,
  userId2: string,
) {
  const Chat = this;

  // Check if chat already exists
  let chat = await Chat.findOne({
    isGroup: false,
    participants: { $all: [userId1, userId2], $size: 2 },
  });

  if (!chat) {
    // Create new chat
    chat = new Chat({
      participants: [userId1, userId2],
      isGroup: false,
    });
    await chat.save();
  }

  return chat;
};

// Define static methods interface
interface ChatModel extends mongoose.Model<IChat> {
  findOrCreateOneOnOne(userId1: string, userId2: string): Promise<IChat>;
}

const Chat = mongoose.model<IChat, ChatModel>("Chat", chatSchema);
const Message = mongoose.model<IMessage>("Message", messageSchema);

export { Chat, Message };
