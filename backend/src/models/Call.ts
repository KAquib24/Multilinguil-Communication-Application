import mongoose, { Document, Schema, Model } from 'mongoose';

export enum CallType {
  VOICE = 'voice',
  VIDEO = 'video',
}

export enum CallStatus {
  INITIATED = 'initiated',
  RINGING = 'ringing',
  ANSWERED = 'answered',
  REJECTED = 'rejected',
  ENDED = 'ended',
  MISSED = 'missed',
}

export interface ICallParticipant {
  userId: mongoose.Types.ObjectId;
  joinedAt: Date | null;
  isActive: boolean;
  streamId?: string;
}

// Define the interface for the Call document WITH methods
export interface ICall extends Document {
  callId: string;
  initiator: mongoose.Types.ObjectId;
  participants: ICallParticipant[];
  type: CallType;
  status: CallStatus;
  chat?: mongoose.Types.ObjectId;
  startTime: Date;
  endTime?: Date;
  turnServers: any[];
  metadata: {
    isRecording: boolean;
    isScreenSharing: boolean;
    translationEnabled: boolean;
    sourceLanguage: string;
    targetLanguage: string;
    maxParticipants: number;
    [key: string]: any;
  };
  
  // Virtual properties
  readonly duration: number;
  readonly isActive: boolean;
  
  // Instance methods
  updateStatus(status: CallStatus): this;
  addParticipant(userId: string, streamId?: string): this;
  removeParticipant(userId: string): this;
}

// Define the interface for the Call model (static methods if any)
export interface ICallModel extends Model<ICall> {
  // Static methods if needed
}

const callSchema = new Schema<ICall, ICallModel>(
  {
    callId: {
      type: String,
      required: true,
      unique: true,
    },
    initiator: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    participants: [
      {
        userId: {
          type: Schema.Types.ObjectId,
          ref: 'User',
          required: true,
        },
        joinedAt: {
          type: Date,
          default: null,
        },
        isActive: {
          type: Boolean,
          default: false,
        },
        streamId: {
          type: String,
          default: '',
        },
      },
    ],
    type: {
      type: String,
      enum: Object.values(CallType),
      default: CallType.VOICE,
    },
    status: {
      type: String,
      enum: Object.values(CallStatus),
      default: CallStatus.INITIATED,
    },
    chat: {
      type: Schema.Types.ObjectId,
      ref: 'Chat',
      required: false,
    },
    startTime: {
      type: Date,
      default: Date.now,
    },
    endTime: {
      type: Date,
      required: false,
    },
    turnServers: {
      type: Schema.Types.Mixed, // FIXED: Remove array brackets, use Mixed directly
      default: [],
    },
    metadata: {
      isRecording: {
        type: Boolean,
        default: false,
      },
      isScreenSharing: {
        type: Boolean,
        default: false,
      },
      translationEnabled: {
        type: Boolean,
        default: false,
      },
      sourceLanguage: {
        type: String,
        default: 'en',
      },
      targetLanguage: {
        type: String,
        default: 'en',
      },
      maxParticipants: {
        type: Number,
        default: 10,
      },
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ==================== INSTANCE METHODS ====================

callSchema.methods.updateStatus = function(this: ICall, status: CallStatus): ICall {
  this.status = status;
  if (status === CallStatus.ENDED) {
    this.endTime = new Date();
  }
  return this;
};

callSchema.methods.addParticipant = function(this: ICall, userId: string, streamId?: string): ICall {
  // Find if participant already exists
  const participantIndex = this.participants.findIndex(
    (p: ICallParticipant) => p.userId.toString() === userId
  );
  
  if (participantIndex !== -1) {
    // Update existing participant
    this.participants[participantIndex].joinedAt = new Date();
    this.participants[participantIndex].isActive = true;
    if (streamId) {
      this.participants[participantIndex].streamId = streamId;
    }
  } else {
    // Add new participant
    this.participants.push({
      userId: new mongoose.Types.ObjectId(userId),
      joinedAt: new Date(),
      isActive: true,
      streamId: streamId || '',
    } as ICallParticipant);
  }
  
  return this;
};

callSchema.methods.removeParticipant = function(this: ICall, userId: string): ICall {
  const participantIndex = this.participants.findIndex(
    (p: ICallParticipant) => p.userId.toString() === userId
  );
  
  if (participantIndex !== -1) {
    this.participants[participantIndex].isActive = false;
  }
  
  return this;
};

// ==================== VIRTUAL PROPERTIES ====================

callSchema.virtual('duration').get(function () {
  if (!this.endTime) return 0;
  return Math.floor(
    (this.endTime.getTime() - this.startTime.getTime()) / 1000
  );
});


callSchema.virtual('isActive').get(function(this: ICall) {
  return [CallStatus.INITIATED, CallStatus.RINGING, CallStatus.ANSWERED].includes(this.status);
});

// Create and export the model
const Call = mongoose.model<ICall, ICallModel>('Call', callSchema);

// REMOVE duplicate exports - they're already exported above
// export { CallType, CallStatus, ICall }; // DELETE THIS LINE

export default Call;