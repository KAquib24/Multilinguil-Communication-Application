// Simple fallback translation when Google Cloud is unavailable
export class FallbackTranslationService {
  
  static translate(text: string, targetLanguage: string, sourceLanguage?: string): string {
    // Simple mock translation - in production, you might use a different API
    const mockTranslations: Record<string, Record<string, string>> = {
      'es': {
        'hello': 'hola',
        'how are you': 'cómo estás',
        'good morning': 'buenos días',
      },
      'fr': {
        'hello': 'bonjour',
        'how are you': 'comment allez-vous',
        'good morning': 'bonjour',
      },
      'de': {
        'hello': 'hallo',
        'how are you': 'wie geht es dir',
        'good morning': 'guten morgen',
      }
    };
    
    const lowerText = text.toLowerCase();
    const targetDict = mockTranslations[targetLanguage] || {};
    
    // Try to find a match
    for (const [key, value] of Object.entries(targetDict)) {
      if (lowerText.includes(key)) {
        return text.replace(new RegExp(key, 'gi'), value);
      }
    }
    
    // Fallback
    return `[${targetLanguage}] ${text}`;
  }
  
  static textToSpeech(text: string, language: string): Buffer {
    // Return a mock audio buffer
    return Buffer.from('mock audio data');
  }
}