import { SpeechClient } from "@google-cloud/speech";
import { v2 } from "@google-cloud/translate";
import { TextToSpeechClient } from "@google-cloud/text-to-speech";
import fs from "fs";
import { PassThrough } from "stream";
import createHttpError from "http-errors";
import path from "path";
import { fileURLToPath } from "url";

const { Translate } = v2;

// Get current directory in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Google Cloud clients
let speechClient: SpeechClient;
let translateClient: any;
let ttsClient: TextToSpeechClient;

// Initialize with better error handling for ES modules
try {
  // Absolute path to your credentials file
  const keyPath = path.resolve(process.cwd(), "google-credentials.json");

  console.log("🔐 Using Google credentials:", keyPath);

  if (!fs.existsSync(keyPath)) {
    throw new Error("google-credentials.json not found in project root");
  }

  const credentials = JSON.parse(fs.readFileSync(keyPath, "utf8"));

  // Initialize Google Speech client
  speechClient = new SpeechClient({
    credentials,
    projectId: credentials.project_id,
  });

  // Initialize Google Translate client
  translateClient = new Translate({
    credentials,
    projectId: credentials.project_id,
  });

  // Initialize Google Text-to-Speech client
  ttsClient = new TextToSpeechClient({
    credentials,
    projectId: credentials.project_id,
  });

  console.log("✅ Google Cloud clients initialized successfully");
} catch (error) {
  console.error("❌ Google Cloud initialization failed:", error);
}

// Active translation sessions
export interface TranslationSession {
  callId: string;
  userId: string;
  targetLanguage: string;
  sourceLanguage?: string;
  recognizeStream: any;
  audioBuffer: Buffer[];
  isActive: boolean;
  lastActivity: Date;
}

// Store active sessions
const activeSessions = new Map<string, Map<string, TranslationSession>>();

export class LiveTranslationService {
  /**
   * Start a translation session for a user in a call
   */
  static startSession(
    callId: string,
    userId: string,
    targetLanguage: string,
    sourceLanguage?: string,
  ): void {
    // Check if speechClient is initialized
    if (!speechClient) {
      console.error(
        "❌ Google Speech client not initialized. Check credentials.",
      );
      throw createHttpError(
        500,
        "Speech service not available - check Google Cloud credentials",
      );
    }

    // Initialize call sessions map if not exists
    if (!activeSessions.has(callId)) {
      activeSessions.set(callId, new Map());
    }

    const callSessions = activeSessions.get(callId)!;

    // Stop existing session if any
    if (callSessions.has(userId)) {
      this.stopSession(callId, userId);
    }

    try {
      // Map language codes to Google format for recognition
      const googleRecognitionLanguage = this.getSupportedLanguageCode(
        sourceLanguage || "en-US",
      );

      // Target language for translation (just the language code, not locale)
      const googleTargetLanguage = targetLanguage.split("-")[0]; // e.g., "en-US" -> "en"

      console.log(
        `🔤 Starting speech recognition with language: ${googleRecognitionLanguage}`,
      );
      console.log(`🎯 Target translation language: ${googleTargetLanguage}`);

      // ✅ Store session metadata first
      const sessionData: TranslationSession = {
        callId,
        userId,
        targetLanguage: googleTargetLanguage,
        sourceLanguage: googleRecognitionLanguage,
        recognizeStream: null, // will be set below
        audioBuffer: [],
        isActive: true,
        lastActivity: new Date(),
      };

      callSessions.set(userId, sessionData);

      // ✅ Create a function to (re)start the stream
      const createStream = () => {
        if (!callSessions.get(userId)?.isActive) {
          console.log(
            `⏹️ Session for user ${userId} is no longer active, not restarting stream`,
          );
          return; // Session was stopped
        }

        console.log(`🔄 (Re)starting recognition stream for user ${userId}`);

        const recognitionLanguage =
          sourceLanguage === "auto" ? undefined : sourceLanguage;

        const recognizeStream = speechClient.streamingRecognize({
          config: {
            encoding: "LINEAR16",
            sampleRateHertz: 16000,
            audioChannelCount: 1,
            languageCode: recognitionLanguage, // undefined means auto-detect
            enableAutomaticPunctuation: true,
            model: "latest_long",
            useEnhanced: true, // Enable enhanced model for better detection
          },
          interimResults: true,
        });

        // Handle recognition results
        recognizeStream.on("data", async (response: any) => {
          try {
            if (!response.results || response.results.length === 0) {
              return;
            }

            const result = response.results[0];
            const alternative = result.alternatives[0];
            const transcription = alternative.transcript;
            const isFinal = result.isFinal;
            const confidence = alternative.confidence;

            if (transcription && transcription.trim()) {
              // Get detected language (or use sourceLanguage as fallback)
              const detectedLanguage =
                result.languageCode || googleRecognitionLanguage;

              // Extract base language code for display
              const detectedBaseLanguage = detectedLanguage.split("-")[0];

              console.log(
                `🎤 Recognized (${isFinal ? "FINAL" : "INTERIM"}): "${transcription}" (${detectedLanguage})`,
              );

              // ========== TRANSLATION SECTION ==========
              try {
                if (translateClient) {
                  console.log(
                    `🌍 Translating: "${transcription}" to ${googleTargetLanguage}`,
                  );

                  // Simple translation
                  const [translation] = await translateClient.translate(
                    transcription,
                    googleTargetLanguage,
                  );

                  console.log(`✅ Translated: "${translation}"`);

                  // Emit result
                  this.emitTranslationResult(callId, userId, {
                    original: transcription,
                    translated: translation,
                    sourceLanguage: detectedBaseLanguage,
                    targetLanguage: googleTargetLanguage,
                    isFinal: isFinal || false,
                    confidence: confidence,
                    timestamp: new Date(),
                  });

                  // If final, also generate speech
                  if (isFinal && ttsClient && translation) {
                    this.generateSpeech(
                      translation,
                      googleTargetLanguage,
                      callId,
                      userId,
                    );
                  }
                } else {
                  console.warn("Translate client not available");

                  // Emit with fallback
                  this.emitTranslationResult(callId, userId, {
                    original: transcription,
                    translated: `[${googleTargetLanguage}] ${transcription}`,
                    sourceLanguage: detectedBaseLanguage,
                    targetLanguage: googleTargetLanguage,
                    isFinal: isFinal || false,
                    confidence: confidence,
                    timestamp: new Date(),
                  });
                }
              } catch (transError: any) {
                console.error("Translation error:", transError.message);

                // Still emit so user knows it's working
                this.emitTranslationResult(callId, userId, {
                  original: transcription,
                  translated: transcription, // Send original as fallback
                  sourceLanguage: detectedBaseLanguage,
                  targetLanguage: googleTargetLanguage,
                  isFinal: isFinal || false,
                  confidence: confidence,
                  timestamp: new Date(),
                });
              }
            }
          } catch (err) {
            console.error("Error processing recognition data:", err);
          }
        });

        recognizeStream.on("error", (error: any) => {
          console.error(
            `❌ Recognition stream error for user ${userId}:`,
            error.message,
          );

          // ✅ Restart stream on error (unless session was intentionally stopped)
          const session = callSessions.get(userId);
          if (session?.isActive) {
            console.log(
              `🔄 Restarting stream after error for user ${userId} in 1 second`,
            );
            session.recognizeStream = null; // Mark as null so chunks get buffered
            setTimeout(() => createStream(), 1000);
          }
        });

        recognizeStream.on("end", () => {
          console.log(`🔚 Recognition stream ended for user ${userId}`);

          // ✅ Restart stream when it ends naturally (timeout, silence, etc.)
          const session = callSessions.get(userId);
          if (session?.isActive) {
            console.log(
              `🔄 Restarting stream after end for user ${userId} in 500ms`,
            );
            session.recognizeStream = null; // Mark as null so chunks get buffered
            setTimeout(() => createStream(), 500);
          }
        });

        // ✅ Update session with new stream
        const session = callSessions.get(userId);
        if (session) {
          session.recognizeStream = recognizeStream;

          // ✅ Flush any buffered chunks
          if (session.audioBuffer.length > 0) {
            console.log(
              `📤 Flushing ${session.audioBuffer.length} buffered chunks for user ${userId}`,
            );
            session.audioBuffer.forEach((chunk) => {
              try {
                recognizeStream.write(chunk);
              } catch (writeError) {
                console.error(`❌ Failed to write buffered chunk:`, writeError);
              }
            });
            session.audioBuffer = [];
          }
        }
      };

      // Start initial stream
      createStream();

      console.log(
        `✅ Translation session started for user ${userId} in call ${callId}`,
      );

      // Log active sessions count
      console.log(
        `📊 Active sessions: ${activeSessions.size} calls, ${callSessions.size} users in this call`,
      );
    } catch (error) {
      console.error("❌ Failed to start translation session:", error);
      throw error;
    }
  }

  /**
   * Process an audio chunk for a user
   */
  static processAudioChunk(
    callId: string,
    userId: string,
    audioChunk: Buffer,
  ): boolean {
    const callSessions = activeSessions.get(callId);
    if (!callSessions) {
      console.log(`❌ No call sessions found for call ${callId}`);
      return false;
    }

    const session = callSessions.get(userId);
    if (!session) {
      console.log(`❌ No session found for user ${userId} in call ${callId}`);
      return false;
    }

    if (!session.isActive) {
      console.log(`❌ Session inactive for user ${userId} in call ${callId}`);
      return false;
    }

    // ✅ If stream is null (restarting), buffer the chunk
    if (!session.recognizeStream) {
      console.log(
        `⏳ Stream restarting, buffering chunk for ${userId} (buffer size: ${session.audioBuffer.length + 1})`,
      );
      session.audioBuffer.push(audioChunk);
      session.lastActivity = new Date();
      return true; // Return true so frontend doesn't think session is dead
    }

    try {
      // ✅ Flush any buffered chunks first
      if (session.audioBuffer.length > 0) {
        console.log(
          `📤 Flushing ${session.audioBuffer.length} buffered chunks for ${userId}`,
        );
        session.audioBuffer.forEach((chunk) => {
          session.recognizeStream.write(chunk);
        });
        session.audioBuffer = [];
      }

      session.recognizeStream.write(audioChunk);
      session.lastActivity = new Date();

      // Log every 20th chunk or so to avoid spam
      if (Math.random() < 0.05) {
        console.log(
          `✅ Processed audio chunk for user ${userId}, size: ${audioChunk.length} bytes`,
        );
      }

      return true;
    } catch (error) {
      console.error(
        `❌ Failed to process audio chunk for user ${userId}:`,
        error,
      );
      session.recognizeStream = null; // Mark as null so next chunk knows to buffer
      return false;
    }
  }

  /**
   * Stop a translation session
   */
  static stopSession(callId: string, userId: string): void {
    const callSessions = activeSessions.get(callId);
    if (!callSessions) return;

    const session = callSessions.get(userId);
    if (session) {
      session.isActive = false; // Mark inactive first to prevent restarts

      if (session.recognizeStream) {
        try {
          session.recognizeStream.end();
        } catch (error) {
          console.error(`Error ending stream for user ${userId}:`, error);
        }
      }

      callSessions.delete(userId);
    }

    if (callSessions.size === 0) {
      activeSessions.delete(callId);
    }

    console.log(
      `🛑 Translation session stopped for user ${userId} in call ${callId}`,
    );
  }

  /**
   * Stop all sessions for a call
   */
  static stopAllSessions(callId: string): void {
    const callSessions = activeSessions.get(callId);
    if (callSessions) {
      callSessions.forEach((_, userId) => {
        this.stopSession(callId, userId);
      });
    }
  }

  /**
   * Generate speech from translated text
   */
  private static async generateSpeech(
    text: string,
    language: string,
    callId: string,
    userId: string,
  ): Promise<void> {
    if (!ttsClient) {
      console.warn("TTS client not available");
      return;
    }

    try {
      // Map language code to TTS voice
      const voiceLanguage = this.getTTSLanguageCode(language);

      const request = {
        input: { text },
        voice: {
          languageCode: voiceLanguage,
          ssmlGender: "NEUTRAL" as const,
        },
        audioConfig: {
          audioEncoding: "OGG_OPUS" as const,
          speakingRate: 1.0,
          pitch: 0,
        },
      };

      console.log(`🔊 Generating TTS for: "${text}" in ${voiceLanguage}`);

      const [response] = await ttsClient.synthesizeSpeech(request);

      if (response.audioContent) {
        // Emit audio result
        this.emitAudioResult(callId, userId, response.audioContent as Buffer);
        console.log(
          `✅ TTS generated, size: ${(response.audioContent as Buffer).length} bytes`,
        );
      }
    } catch (error) {
      console.error("❌ TTS generation error:", error);
    }
  }

  /**
   * Placeholder for socket emission - will be set by socket handler
   */
  static emitTranslationResult: (
    callId: string,
    userId: string,
    result: {
      original: string;
      translated: string;
      sourceLanguage: string;
      targetLanguage: string;
      isFinal: boolean;
      confidence: number;
      timestamp: Date;
    },
  ) => void = () => {};

  /**
   * Placeholder for audio emission - will be set by socket handler
   */
  static emitAudioResult: (
    callId: string,
    userId: string,
    audioBuffer: Buffer,
  ) => void = () => {};

  /**
   * Clean up inactive sessions
   */
  static cleanupInactiveSessions(): void {
    const now = new Date();
    const timeoutMs = 30000; // 30 seconds

    activeSessions.forEach((sessions, callId) => {
      sessions.forEach((session, userId) => {
        if (now.getTime() - session.lastActivity.getTime() > timeoutMs) {
          console.log(`🧹 Cleaning up inactive session for user ${userId}`);
          this.stopSession(callId, userId);
        }
      });
    });
  }

  /**
   * Get supported language code for Google Speech
   */
  private static getSupportedLanguageCode(language: string): string {
    // If it's already a full locale (e.g., "en-US"), use it
    if (language.includes("-")) {
      return language;
    }

    // Map of languages to their supported variants
    const languageMap: Record<string, string> = {
      hi: "hi-IN", // Hindi (India)
      en: "en-US", // English (US)
      es: "es-ES", // Spanish (Spain)
      fr: "fr-FR", // French (France)
      de: "de-DE", // German (Germany)
      zh: "cmn-CN", // Chinese (Mandarin)
      ar: "ar-SA", // Arabic (Saudi Arabia)
      ru: "ru-RU", // Russian
      pt: "pt-PT", // Portuguese
      ja: "ja-JP", // Japanese
      ko: "ko-KR", // Korean
      it: "it-IT", // Italian
      nl: "nl-NL", // Dutch
      pl: "pl-PL", // Polish
      tr: "tr-TR", // Turkish
      vi: "vi-VN", // Vietnamese
    };

    return languageMap[language] || language + "-" + language.toUpperCase();
  }

  /**
   * Get TTS language code
   */
  private static getTTSLanguageCode(language: string): string {
    // For TTS, we want just the language code, not the full locale
    const baseCode = language.split("-")[0];

    // Map to supported TTS languages
    const ttsMap: Record<string, string> = {
      hi: "hi-IN",
      en: "en-US",
      es: "es-ES",
      fr: "fr-FR",
      de: "de-DE",
      it: "it-IT",
      ja: "ja-JP",
      ko: "ko-KR",
      pt: "pt-PT",
      ru: "ru-RU",
      ar: "ar-XA",
      zh: "cmn-CN",
    };

    return ttsMap[baseCode] || "en-US";
  }

  /**
   * Debug method to get session info
   */
  static getSessionInfo(): any {
    const info: any = {};
    activeSessions.forEach((sessions, callId) => {
      info[callId] = Array.from(sessions.keys()).map((userId) => {
        const session = sessions.get(userId)!;
        return {
          userId,
          targetLanguage: session.targetLanguage,
          sourceLanguage: session.sourceLanguage,
          isActive: session.isActive,
          hasStream: !!session.recognizeStream,
          bufferedChunks: session.audioBuffer.length,
          lastActivity: session.lastActivity,
        };
      });
    });
    return info;
  }
}

// Run cleanup every minute
setInterval(() => {
  LiveTranslationService.cleanupInactiveSessions();
}, 60000);
