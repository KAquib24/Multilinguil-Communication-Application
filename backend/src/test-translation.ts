import { v2 } from '@google-cloud/translate';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const { Translate } = v2;

async function testTranslation() {
  console.log('🔍 Testing Google Translation API...\n');
  
  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  
  if (!credentialsPath) {
    console.error('❌ GOOGLE_APPLICATION_CREDENTIALS not set');
    return;
  }
  
  try {
    // Load credentials
    const absolutePath = path.isAbsolute(credentialsPath) 
      ? credentialsPath 
      : path.resolve(process.cwd(), credentialsPath);
    
    console.log(`📁 Loading credentials from: ${absolutePath}`);
    
    if (!fs.existsSync(absolutePath)) {
      console.error(`❌ Credentials file not found`);
      return;
    }
    
    const credentials = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
    console.log('✅ Credentials loaded');
    console.log(`   Project ID: ${credentials.project_id}\n`);
    
    // Initialize Translate client
    const translate = new Translate({
      credentials,
      projectId: credentials.project_id
    });
    
    console.log('✅ Translate client initialized\n');
    
    // Test translations
    const testPhrases = [
      { text: 'Hello', from: 'en', to: 'es' },
      { text: 'How are you?', from: 'en', to: 'fr' },
      { text: 'Good morning', from: 'en', to: 'hi' },
      { text: 'नमस्ते', from: 'hi', to: 'en' },
    ];
    
    for (const test of testPhrases) {
      console.log(`🔄 Translating: "${test.text}" (${test.from} → ${test.to})`);
      
      try {
        const [translation] = await translate.translate(test.text, test.to);
        console.log(`✅ Result: "${translation}"\n`);
      } catch (err: any) {
        console.error(`❌ Failed: ${err.message}\n`);
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

testTranslation();