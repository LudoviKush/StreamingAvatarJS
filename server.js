const express = require('express');
const multer = require('multer');
const OpenAI = require('openai');
const path = require('path');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const speech = require('@google-cloud/speech');
const app = express();
app.use(express.json());
require('dotenv').config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const systemSetup = `You are the assistant of Technology Reply Romania, assist the user in a kind and informative way explaining what we work on and our services offered.`

const upload = multer({ dest: '/tmp/' });
app.use(express.static(path.join(__dirname, '.')));

const speechClient = new speech.SpeechClient();

app.post('/google/transcribe', upload.single('audio'), async (req, res) => {
  const inputPath = req.file.path;
  const format = 'wav';
  const outputPath = `${inputPath}.${format}`;

  try {
    // Convert to a supported format if necessary
    await new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .toFormat(format)
        .audioFrequency(16000)
        .audioChannels(1)
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .saveToFile(outputPath);
    });

    const audio = {
      content: fs.readFileSync(outputPath).toString('base64'),
    };
    const config = {
      encoding: 'LINEAR16',
      sampleRateHertz: 16000,
      languageCode: 'it-IT',
    };
    const request = {
      audio: audio,
      config: config,
    };

    const [response] = await speechClient.recognize(request);
    const transcription = response.results
      .map(result => result.alternatives[0].transcript)
      .join('\n');

    fs.unlinkSync(inputPath); // Clean up the original file
    fs.unlinkSync(outputPath); // Clean up the converted file
    res.json({ text: transcription });
  } catch (error) {
    console.error('Error processing audio file:', error);
    res.status(500).send('Error processing your request');
  }
});

app.post('/whisper/transcribe', upload.single('audio'), async (req, res) => {
  const inputPath = req.file.path;
  const format = 'mp3'; // Define the format variable here
  const outputPath = `${inputPath}.${format}`;

  try {
    // Convert to a supported format if necessary
    await new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .toFormat(format)
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .saveToFile(outputPath);
    });

    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(outputPath),
      model: "whisper-1",
      language: "it"
    });

    fs.unlinkSync(inputPath); // Clean up the original file
    fs.unlinkSync(outputPath); // Clean up the converted file
    res.json({ text: transcription.text });
  } catch (error) {
    console.error('Error processing audio file:', error);
    res.status(500).send('Error processing your request');
  }
});

app.post('/openai/complete', async (req, res) => {
  try {
    const prompt = req.body.prompt;
    const chatCompletion = await openai.chat.completions.create({
      messages: [
        { role: 'system', content: systemSetup},
        { role: 'user', content: prompt }
      ],
      model: 'gpt-3.5-turbo',
    });
    res.json({ text: chatCompletion.choices[0].message.content });
  } catch (error) {
    console.error('Error calling OpenAI:', error);
    res.status(500).send('Error processing your request');
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, function () {
  console.log(`App is listening on port ${PORT}!`);
});