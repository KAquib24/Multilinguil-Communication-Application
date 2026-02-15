const speech = require('@google-cloud/speech');
const { Translate } = require('@google-cloud/translate').v2;

async function test() {
  const client = new speech.SpeechClient();
  const translate = new Translate();

  const [translation] = await translate.translate(
    'Hello my friend',
    'hi'
  );

  console.log('Translation:', translation);
}

test();
