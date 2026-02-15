import { SpeechClient } from '@google-cloud/speech';
import { v2 } from '@google-cloud/translate';
import { TextToSpeechClient } from '@google-cloud/text-to-speech';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

dotenv.config();

const { Translate } = v2;

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testGoogleCloud() {
  console.log('🔍 Testing Google Cloud credentials...');
  
  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  
  if (!credentialsPath) {
    console.error('❌ GOOGLE_APPLICATION_CREDENTIALS not set');
    return false;
  }
  
  // Resolve absolute path
  const absolutePath = path.isAbsolute(credentialsPath) 
    ? credentialsPath 
    : path.resolve(process.cwd(), credentialsPath);
  
  console.log(`📁 Credentials path: ${absolutePath}`);
  
  if (!fs.existsSync(absolutePath)) {
    console.error(`❌ Credentials file not found at: ${absolutePath}`);
    console.log(`📂 Current directory: ${process.cwd()}`);
    console.log(`📂 Files in current directory:`);
    fs.readdirSync(process.cwd()).forEach(file => {
      console.log(`   - ${file}`);
    });
    return false;
  }
  
  try {
    // Read and parse JSON file
    const credentials = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
    console.log('✅ Credentials file loaded');
    console.log(`   Project ID: ${credentials.project_id}`);
    console.log(`   Client Email: ${credentials.client_email}`);
    
    // Test Speech client
    console.log('\n🔊 Testing Speech client...');
    const speechClient = new SpeechClient({ credentials });
    console.log('✅ Speech client initialized');
    
    // Test Translate client
    console.log('\n🌍 Testing Translate client...');
    const translateClient = new Translate({ credentials });
    console.log('✅ Translate client initialized');
    
    // Test TTS client
    console.log('\n🔈 Testing Text-to-Speech client...');
    const ttsClient = new TextToSpeechClient({ credentials });
    console.log('✅ TTS client initialized');
    
    // Test a simple translation
    console.log('\n🔄 Testing simple translation...');
    const [translation] = await translateClient.translate('Hello', 'es');
    console.log(`   "Hello" -> "${translation}"`);
    
    console.log('\n✅ All Google Cloud services are working!');
    return true;
    
  } catch (error) {
    console.error('❌ Error testing Google Cloud:', error);
    return false;
  }
}

testGoogleCloud().then(success => {
  if (!success) {
    console.log('\n🔧 Fixes needed:');
    console.log('1. Make sure google-credentials.json exists in backend folder');
    console.log('2. Check that the path in .env is correct');
    console.log('3. Verify the credentials file has valid keys');
  }
});