import { v2 } from '@google-cloud/translate';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const { Translate } = v2;

async function testTranslation() {
  console.log('\n🔍 ====================================');
  console.log('🔍 TESTING GOOGLE TRANSLATION API');
  console.log('====================================\n');

  // Option 1: Direct path to credentials
  const credentialsPath = path.join(process.cwd(), 'google-credentials.json');
  
  console.log(`📁 Looking for credentials at: ${credentialsPath}`);
  
  if (!fs.existsSync(credentialsPath)) {
    console.error('❌ google-credentials.json NOT FOUND!');
    console.log('\n📝 Please place google-credentials.json in:');
    console.log(`   ${process.cwd()}`);
    return;
  }
  
  try {
    // Load credentials
    const credentialsContent = fs.readFileSync(credentialsPath, 'utf8');
    const credentials = JSON.parse(credentialsContent);
    
    console.log('✅ Credentials file found!');
    console.log(`   Project ID: ${credentials.project_id}`);
    console.log(`   Client Email: ${credentials.client_email}\n`);
    
    // Initialize Translate client
    const translate = new Translate({
      credentials: credentials,
      projectId: credentials.project_id
    });
    
    console.log('✅ Translate client initialized successfully\n');
    
    // Test translations
    console.log('🔄 RUNNING TEST TRANSLATIONS...\n');
    
    const tests = [
      { text: 'Hello, how are you?', to: 'es', expected: 'Hola' },
      { text: 'Good morning', to: 'fr', expected: 'Bonjour' },
      { text: 'My name is John', to: 'hi', expected: 'मेरा नाम' },
      { text: 'I love programming', to: 'de', expected: 'Programmierung' },
      { text: 'What is your name?', to: 'ja', expected: '名前' },
      { text: 'नमस्ते दोस्त', to: 'en', expected: 'Hello' },
    ];
    
    let successCount = 0;
    
    for (let i = 0; i < tests.length; i++) {
      const test = tests[i];
      console.log(`${i + 1}. "${test.text}" → ${test.to.toUpperCase()}`);
      
      try {
        const [translation] = await translate.translate(test.text, test.to);
        console.log(`   ✅ Result: "${translation}"`);
        
        // Check if translation looks reasonable
        if (translation && translation.length > 0) {
          successCount++;
        }
        console.log('');
      } catch (err: any) {
        console.log(`   ❌ Error: ${err.message}\n`);
      }
      
      // Small delay to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    console.log('====================================');
    console.log(`📊 RESULTS: ${successCount}/${tests.length} successful`);
    console.log('====================================\n');
    
    if (successCount === tests.length) {
      console.log('🎉 PERFECT! Your translation API is working correctly!\n');
    } else if (successCount > 0) {
      console.log('⚠️ PARTIAL SUCCESS: Some translations worked, some failed\n');
    } else {
      console.log('❌ FAILED: No translations worked. Check your credentials and API enablement.\n');
    }
    
  } catch (error: any) {
    console.error('\n❌ FATAL ERROR:', error.message);
    if (error.message.includes('quota')) {
      console.log('\n💡 TIP: Your Google Cloud quota might be exhausted or API not enabled.');
      console.log('   Enable Cloud Translation API in Google Cloud Console.');
    }
    if (error.message.includes('permission')) {
      console.log('\n💡 TIP: Check if your service account has permission to use Translation API.');
    }
  }
}

// Run the test
testTranslation();