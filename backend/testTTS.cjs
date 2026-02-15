const textToSpeech = require('@google-cloud/text-to-speech');
const fs = require('fs');

async function testTTS() {
  const client = new textToSpeech.TextToSpeechClient();

  const request = {
    input: { text: 'नमस्ते मेरे दोस्त' },
    voice: {
      languageCode: 'hi-IN',
      ssmlGender: 'MALE',
    },
    audioConfig: {
      audioEncoding: 'MP3',
    },
  };

  const [response] = await client.synthesizeSpeech(request);

  fs.writeFileSync('output.mp3', response.audioContent, 'binary');

  console.log('✅ Audio file generated: output.mp3');
}

testTTS();
