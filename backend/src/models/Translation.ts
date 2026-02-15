import mongoose, { Document, Schema } from 'mongoose';

export interface ITranslationSegment {
  text: string;
  sourceLanguage: string;
  targetLanguage: string;
  translatedText: string;
  confidence: number;
  timestamp: Date;
  duration?: number;
  speakerId?: mongoose.Types.ObjectId;
}

export interface ITranslationSession extends Document {
  sessionId: string;
  callId?: mongoose.Types.ObjectId;
  chatId?: mongoose.Types.ObjectId;
  participants: mongoose.Types.ObjectId[];
  sourceLanguage: string;
  targetLanguage: string;
  isActive: boolean;
  segments: ITranslationSegment[];
  createdAt: Date;
  updatedAt: Date;
}

const translationSegmentSchema = new Schema<ITranslationSegment>(
  {
    text: {
      type: String,
      required: true,
    },
    sourceLanguage: {
      type: String,
      required: true,
      default: 'en',
    },
    targetLanguage: {
      type: String,
      required: true,
      default: 'en',
    },
    translatedText: {
      type: String,
      required: true,
    },
    confidence: {
      type: Number,
      required: true,
      min: 0,
      max: 1,
      default: 0.9,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
    duration: Number,
    speakerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { _id: false }
);

const translationSessionSchema = new Schema<ITranslationSession>(
  {
    sessionId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    callId: {
      type: Schema.Types.ObjectId,
      ref: 'Call',
    },
    chatId: {
      type: Schema.Types.ObjectId,
      ref: 'Chat',
    },
    participants: [{
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    }],
    sourceLanguage: {
      type: String,
      required: true,
      default: 'en',
    },
    targetLanguage: {
      type: String,
      required: true,
      default: 'en',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    segments: [translationSegmentSchema],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes
translationSessionSchema.index({ callId: 1 });
translationSessionSchema.index({ chatId: 1 });
translationSessionSchema.index({ participants: 1 });
translationSessionSchema.index({ isActive: 1 });
translationSessionSchema.index({ createdAt: -1 });

// Virtuals
translationSessionSchema.virtual('translatedCount').get(function() {
  return this.segments.length;
});

translationSessionSchema.virtual('totalDuration').get(function() {
  return this.segments.reduce((total, segment) => total + (segment.duration || 0), 0);
});

const TranslationSession = mongoose.model<ITranslationSession>('TranslationSession', translationSessionSchema);

export default TranslationSession;