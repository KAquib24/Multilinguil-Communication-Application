import { SpeechClient } from "@google-cloud/speech";
import { v2 } from "@google-cloud/translate";
import { TextToSpeechClient } from "@google-cloud/text-to-speech";
import { PassThrough } from "stream";
import createHttpError from "http-errors";
import fs from "fs";
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
  const keyPath = path.resolve(
    process.cwd(),
    "google-credentials.json"
  );

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
      // Map language codes to Google format
      const googleLanguageCode = this.getSupportedLanguageCode(
        sourceLanguage || "en-US",
      );
      const googleTargetLanguage = targetLanguage;

      console.log(
        `🔤 Starting speech recognition with language: ${googleLanguageCode}`,
      );

      // Create streaming recognition stream
      const recognizeStream = speechClient.streamingRecognize({
        config: {
          encoding: "WEBM_OPUS" as const,
          sampleRateHertz: 48000,
          audioChannelCount: 1,
          languageCode: googleLanguageCode,
          enableAutomaticPunctuation: true,
          enableWordTimeOffsets: false,
          model: "command_and_search",
          useEnhanced: true,
        },
        interimResults: true,
      });

      // Handle recognition results
      recognizeStream.on("data", async (response: any) => {
        try {
          const transcription = response.results
            ?.map((result: any) => result.alternatives[0].transcript)
            .join("");

          const isFinal = response.results?.[0]?.isFinal;

          if (transcription && transcription.trim()) {
            // Get detected language
            const detectedLanguage =
              response.results?.[0]?.languageCode || sourceLanguage || "en";

            console.log(
              `🎤 Recognized: "${transcription}" (${detectedLanguage})`,
            );

            // ========== FIXED TRANSLATION SECTION ==========
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
                  sourceLanguage: detectedLanguage,
                  targetLanguage: googleTargetLanguage,
                  isFinal: isFinal || false,
                  timestamp: new Date(),
                });

                // If final, also generate speech
                if (isFinal && ttsClient) {
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
                  sourceLanguage: detectedLanguage,
                  targetLanguage: googleTargetLanguage,
                  isFinal: isFinal || false,
                  timestamp: new Date(),
                });
              }
            } catch (transError: any) {
              console.error("Translation error:", transError.message);

              // Still emit so user knows it's working
              this.emitTranslationResult(callId, userId, {
                original: transcription,
                translated: transcription, // Send original as fallback
                sourceLanguage: detectedLanguage,
                targetLanguage: googleTargetLanguage,
                isFinal: isFinal || false,
                timestamp: new Date(),
              });
            }
            // ========== END OF FIXED SECTION ==========
          }
        } catch (err) {
          console.error("Error processing recognition data:", err);
        }
      });

      recognizeStream.on("error", (error) => {
        console.error(`❌ Recognition stream error for user ${userId}:`, error);
        this.stopSession(callId, userId);
      });

      // Store session
      callSessions.set(userId, {
        callId,
        userId,
        targetLanguage: googleTargetLanguage,
        sourceLanguage: googleLanguageCode,
        recognizeStream,
        audioBuffer: [],
        isActive: true,
        lastActivity: new Date(),
      });

      console.log(
        `✅ Translation session started for user ${userId} in call ${callId}`,
      );
    } catch (error) {
      console.error("❌ Failed to start translation session:", error);
      console.error("TTS ERROR:", error);
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
    if (!callSessions) return false;

    const session = callSessions.get(userId);
    if (!session || !session.isActive || !session.recognizeStream) return false;

    try {
      // Write chunk to recognition stream
      session.recognizeStream.write(audioChunk);
      session.lastActivity = new Date();
      return true;
    } catch (error) {
      console.error(
        `❌ Failed to process audio chunk for user ${userId}:`,
        error,
      );
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
    if (session && session.recognizeStream) {
      try {
        session.recognizeStream.end();
        session.isActive = false;
      } catch (error) {
        console.error(`Error ending stream for user ${userId}:`, error);
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
      const request = {
        input: { text },
        voice: {
          languageCode: language,
          ssmlGender: "NEUTRAL" as const,
        },
        audioConfig: {
          audioEncoding: "OGG_OPUS" as const,
          speakingRate: 1.0,
          pitch: 0,
        },
      };

      const [response] = await ttsClient.synthesizeSpeech(request);

      if (response.audioContent) {
        // Emit audio result
        this.emitAudioResult(callId, userId, response.audioContent as Buffer);
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

  // Add this function inside LiveTranslationService class
  private static getSupportedLanguageCode(language: string): string {
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
}

// Run cleanup every minute
setInterval(() => {
  LiveTranslationService.cleanupInactiveSessions();
}, 60000);
