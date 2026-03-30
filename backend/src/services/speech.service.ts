const ttsClient = new TextToSpeechClient();
import axios from "axios";
import createHttpError from "http-errors";
import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
// ✅ ADD THIS IMPORT
import { TextToSpeechClient } from "@google-cloud/text-to-speech";

interface SpeechConfig {
  provider: "google" | "azure" | "aws" | "ibm";
  apiKey?: string;
  endpoint?: string;
  region?: string;
}

interface SpeechRecognitionResult {
  text: string;
  confidence: number;
  language: string;
  duration: number;
}

interface SpeechSynthesisResult {
  audioUrl: string;
  duration: number;
  fileSize: number;
  language: string;
}

interface RealTimeTranslationResult {
  originalText: string;
  translatedText: string;
  translatedAudio?: string;
  confidence: number;
  duration: number;
  isFinal: boolean;
}

export class SpeechService {
  private audioBuffers: Map<string, Buffer[]> = new Map();
  private config: SpeechConfig;
  private uploadDir: string;
  // ✅ ADD TTS CLIENT
  private ttsClient: TextToSpeechClient;

  constructor() {
    this.config = {
      provider: (process.env.SPEECH_PROVIDER as any) || "google",
      apiKey: process.env.SPEECH_API_KEY,
      endpoint: process.env.SPEECH_ENDPOINT,
      region: process.env.SPEECH_REGION,
    };

    this.uploadDir = path.join(process.cwd(), "uploads", "speech");
    this.ensureUploadDir();

    // ✅ INITIALIZE GOOGLE TTS CLIENT (WINDOWS SAFE)
    try {
      const keyPath = path.resolve(process.cwd(), "google-credentials.json");

      if (!fs.existsSync(keyPath)) {
        throw new Error("google-credentials.json not found");
      }

      const credentials = JSON.parse(fs.readFileSync(keyPath, "utf8"));

      this.ttsClient = new TextToSpeechClient({
        credentials,
        projectId: credentials.project_id,
      });

      console.log("✅ Google TTS authenticated via key file");
    } catch (error) {
      console.error("❌ Failed to initialize Google TTS:", error);
      this.ttsClient = null as any;
    }
  }

  private ensureUploadDir() {
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  // Convert speech (audio) to text
  async speechToText(
    audioBuffer: Buffer,
    language: string = "en-US",
    audioFormat: string = "webm",
  ): Promise<SpeechRecognitionResult> {
    try {
      let result: SpeechRecognitionResult;

      if (this.config.provider === "google") {
        result = await this.googleSpeechToText(
          audioBuffer,
          language,
          audioFormat,
        );
      } else if (this.config.provider === "azure") {
        result = await this.azureSpeechToText(audioBuffer, language);
      } else if (this.config.provider === "aws") {
        result = await this.awsTranscribe(audioBuffer, language);
      } else {
        throw createHttpError(501, "Speech provider not implemented");
      }

      return result;
    } catch (error: any) {
      console.error("Speech-to-text error:", error.message);
      throw createHttpError(500, "Failed to convert speech to text");
    }
  }

  private async googleSpeechToText(
    audioBuffer: Buffer,
    language: string,
    audioFormat: string,
  ): Promise<SpeechRecognitionResult> {
    const content = audioBuffer.toString("base64");

    const response = await axios.post(
      `https://speech.googleapis.com/v1/speech:recognize?key=${this.config.apiKey}`,
      {
        config: {
          encoding: "LINEAR16",
          sampleRateHertz: 16000,
          languageCode: language,
          enableAutomaticPunctuation: true,
          model: "latest_long",
          enableWordTimeOffsets: true,
        },
        audio: {
          content,
        },
      },
    );

    if (!response.data.results || response.data.results.length === 0) {
      throw createHttpError(400, "No speech detected");
    }

    const result = response.data.results[0];
    const alternative = result.alternatives[0];

    const duration = result.resultEndTime
      ? parseFloat(result.resultEndTime.replace("s", ""))
      : alternative.words?.reduce((sum: number, word: any) => {
          const endTime = parseFloat(word.endTime.replace("s", ""));
          const startTime = parseFloat(word.startTime.replace("s", ""));
          return sum + (endTime - startTime);
        }, 0) || 0;

    return {
      text: alternative.transcript,
      confidence: alternative.confidence || 0.8,
      language,
      duration,
    };
  }

  private async azureSpeechToText(
    audioBuffer: Buffer,
    language: string,
  ): Promise<SpeechRecognitionResult> {
    const response = await axios.post(
      `${this.config.endpoint}/speechtotext/recognize`,
      audioBuffer,
      {
        headers: {
          "Ocp-Apim-Subscription-Key": this.config.apiKey,
          "Content-Type": "audio/wav; codec=audio/pcm; samplerate=16000",
          Accept: "application/json",
        },
        params: {
          language,
          format: "detailed",
        },
      },
    );

    if (response.data.RecognitionStatus !== "Success") {
      throw createHttpError(400, "Speech recognition failed");
    }

    const bestResult = response.data.NBest?.[0];

    return {
      text: bestResult.Display,
      confidence: bestResult.Confidence,
      language,
      duration: response.data.Duration || 0,
    };
  }

  private async awsTranscribe(
    audioBuffer: Buffer,
    language: string,
  ): Promise<SpeechRecognitionResult> {
    // Simplified AWS implementation - in production you would use AWS SDK
    const tempFile = path.join(this.uploadDir, `${uuidv4()}.wav`);
    fs.writeFileSync(tempFile, audioBuffer);

    // Simulated result for development
    const text = "This is a simulated transcription for development purposes.";

    return {
      text,
      confidence: 0.85,
      language,
      duration: audioBuffer.length / 16000, // Rough estimate
    };
  }

  // Convert text to speech
  async textToSpeech(
    text: string,
    language: string = "en-US",
  ): Promise<SpeechSynthesisResult> {
    return this.googleTextToSpeechSDK(text, language);
  }

  // ✅ NEW: Fixed Google TTS using SDK (RECOMMENDED)
  private async googleTextToSpeechSDK(
    text: string,
    language: string,
    voice?: string,
    speakingRate: number = 1.0,
  ): Promise<SpeechSynthesisResult> {
    // Check if TTS client is available
    if (!this.ttsClient) {
      throw new Error(
        "TTS client not initialized. Check Google Cloud credentials.",
      );
    }

    try {
      console.log(`🔊 Generating speech for: "${text}" in ${language}`);

      const request = {
        input: { text },
        voice: {
          languageCode: language,
          name: voice || this.getDefaultVoice(language),
          ssmlGender: "NEUTRAL" as const,
        },
        audioConfig: {
          audioEncoding: "OGG_OPUS" as const,
          speakingRate,
          pitch: 0,
        },
      };

      const [response] = await this.ttsClient.synthesizeSpeech(request);

      if (!response.audioContent) {
        throw new Error("No audio returned from Google TTS");
      }

      const filename = `${uuidv4()}.ogg`;
      const filePath = path.join(this.uploadDir, filename);

      fs.writeFileSync(filePath, response.audioContent);

      const stats = fs.statSync(filePath);

      console.log(`✅ Speech generated: ${filename} (${stats.size} bytes)`);

      return {
        audioUrl: `/uploads/speech/${filename}`,
        duration: this.estimateAudioDuration(text.length),
        fileSize: stats.size,
        language,
      };
    } catch (error: any) {
      console.error("❌ Google TTS SDK error:", error.message);
      throw error;
    }
  }

  private async azureTextToSpeech(
    text: string,
    language: string,
    voice?: string,
  ): Promise<SpeechSynthesisResult> {
    const ssml = `
      <speak version='1.0' xml:lang='${language}'>
        <voice xml:lang='${language}' name='${voice || this.getDefaultVoice(language)}'>
          ${this.escapeXml(text)}
        </voice>
      </speak>
    `;

    const response = await axios.post(
      `${this.config.endpoint}/cognitiveservices/v1`,
      ssml,
      {
        headers: {
          "Ocp-Apim-Subscription-Key": this.config.apiKey,
          "Content-Type": "application/ssml+xml",
          "X-Microsoft-OutputFormat": "audio-16khz-128kbitrate-mono-mp3",
        },
        responseType: "arraybuffer",
      },
    );

    const filename = `${uuidv4()}.mp3`;
    const filePath = path.join(this.uploadDir, filename);
    fs.writeFileSync(filePath, Buffer.from(response.data));

    const stats = fs.statSync(filePath);

    return {
      audioUrl: `/uploads/speech/${filename}`,
      duration: this.estimateAudioDuration(text.length),
      fileSize: stats.size,
      language,
    };
  }

  private async awsPolly(
    text: string,
    language: string,
    voice?: string,
  ): Promise<SpeechSynthesisResult> {
    // Simplified AWS Polly implementation
    const filename = `${uuidv4()}.mp3`;
    const filePath = path.join(this.uploadDir, filename);

    // Create placeholder file
    const placeholderText = `Audio for: ${text.substring(0, 50)}...`;
    fs.writeFileSync(filePath, placeholderText);

    return {
      audioUrl: `/uploads/speech/${filename}`,
      duration: this.estimateAudioDuration(text.length),
      fileSize: placeholderText.length,
      language,
    };
  }

  // Real-time speech translation pipeline (Enhanced for streaming)
  async realTimeTranslationPipeline(
    audioBuffer: Buffer,
    sourceLanguage: string = "en-US",
    targetLanguage: string = "en",
    userId?: string,
    isFinal: boolean = true,
  ): Promise<RealTimeTranslationResult> {
    try {
      // Step 1: Speech to text
      const sttResult = await this.speechToText(
  audioBuffer,
  sourceLanguage,
  "pcm",
);

      // Step 2: Translate text
      const translationService = new (
        await import("./translation.service.js")
      ).TranslationService();
      const translationResult = await translationService.translateText(
        sttResult.text,
        targetLanguage,
        sourceLanguage,
      );

      // Step 3: Text to speech (optional, for audio output)
      let translatedAudioUrl: string | undefined;
      if (isFinal) {
        const ttsResult = await this.textToSpeech(
          translationResult.translatedText,
          targetLanguage,
        );

        // 🔥 ADD THIS PART
        const fullPath = path.join(process.cwd(), ttsResult.audioUrl);

        const audioBuffer = fs.readFileSync(fullPath);
        const base64Audio = audioBuffer.toString("base64");

        // ✅ send base64 instead of URL
        translatedAudioUrl = base64Audio;
      }

      return {
        originalText: sttResult.text,
        translatedText: translationResult.translatedText,
        translatedAudio: translatedAudioUrl,
        confidence: translationResult.confidence * sttResult.confidence,
        duration: sttResult.duration,
        isFinal,
      };
    } catch (error: any) {
      console.error("Real-time translation pipeline error:", error.message);
      throw error;
    }
  }

  // Stream processing for WebSocket real-time translation
  async processStreamingAudio(
  audioChunk: Buffer,
  sessionId: string,
  sourceLanguage: string,
  targetLanguage: string,
  userId: string,
): Promise<RealTimeTranslationResult | null> {

  // create buffer if not exists
  if (!this.audioBuffers.has(sessionId)) {
    this.audioBuffers.set(sessionId, []);
  }

  const bufferArray = this.audioBuffers.get(sessionId)!;

  // push incoming chunk
  bufferArray.push(audioChunk);

  // wait for enough audio (~1–2 sec)
  if (bufferArray.length < 20) {
    return null; // ❌ do not process yet
  }

  // merge chunks
  const mergedBuffer = Buffer.concat(bufferArray);

  // clear buffer
  this.audioBuffers.set(sessionId, []);

  console.log("🔥 Processing buffered audio...");

  // process full chunk
  return await this.realTimeTranslationPipeline(
    mergedBuffer,
    sourceLanguage,
    targetLanguage,
    userId,
    true
  );
}

  // Helper methods
  private getDefaultVoice(languageCode: string): string {
    const voiceMap: Record<string, string> = {
      "en-US": "en-US-Standard-C",
      "en-GB": "en-GB-Standard-A",
      "es-ES": "es-ES-Standard-A",
      "fr-FR": "fr-FR-Standard-A",
      "de-DE": "de-DE-Standard-A",
      "zh-CN": "cmn-CN-Standard-A",
      "ja-JP": "ja-JP-Standard-A",
      "ko-KR": "ko-KR-Standard-A",
      "ar-SA": "ar-SA-Standard-A",
      "ru-RU": "ru-RU-Standard-A",
      "hi-IN": "hi-IN-Standard-A", // ✅ Added Hindi support
    };

    return voiceMap[languageCode] || "en-US-Standard-C";
  }

  private estimateAudioDuration(textLength: number): number {
    // Rough estimate: 150 words per minute, average 5 letters per word
    const words = textLength / 5;
    const minutes = words / 150;
    return Math.ceil(minutes * 60); // Convert to seconds
  }

  private escapeXml(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  // Clean up old audio files
  async cleanupOldFiles(maxAgeHours: number = 24) {
    try {
      const files = fs.readdirSync(this.uploadDir);
      const now = Date.now();
      const maxAgeMs = maxAgeHours * 60 * 60 * 1000;

      for (const file of files) {
        const filePath = path.join(this.uploadDir, file);
        const stats = fs.statSync(filePath);

        if (now - stats.mtimeMs > maxAgeMs) {
          fs.unlinkSync(filePath);
        }
      }
    } catch (error) {
      console.error("Cleanup error:", error);
    }
  }
}

export default SpeechService;
