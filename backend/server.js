const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const axios = require('axios');
const supabase = require('./supabaseClient');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Set up multer storage to save uploaded files locally
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/'); // files save to /backend/uploads/
  },
  filename: (req, file, cb) => {
    // Add timestamp to avoid overwrites
    cb(null, Date.now() + '-' + file.originalname);
  }
});
const upload = multer({ storage });

// POST /upload route with AssemblyAI integration
app.post('/upload', upload.single('file'), async (req, res) => {
  console.log('=== UPLOAD REQUEST START ===');
  console.log('REQ BODY:', req.body);
  console.log('REQ FILE:', req.file);

  if (!req.file) {
    console.error('No file uploaded');
    return res.status(400).send('No file uploaded.');
  }

  const userId = req.body.user_id;
  const filename = req.file.filename;
  const filepath = req.file.path;

  try {
    // Insert a new row with null transcript and duration for now
    const { data, error } = await supabase
      .from('transcriptions')
      .insert([{
        user_id: userId,
        filename: filename,
        filepath: filepath,
        transcript: null,
        duration_seconds: null
      }]);
    if (error) {
      console.error('Supabase insert error:', error);
      return res.status(500).json({ error: error.message, details: error });
    }
    console.log('Inserted file info into DB.');

    // Step 1: Upload audio file to AssemblyAI
    const uploadResponse = await axios.post(
      'https://api.assemblyai.com/v2/upload',
      fs.createReadStream(filepath),
      {
        headers: { authorization: process.env.ASSEMBLYAI_API_KEY },
      }
    );
    const uploadUrl = uploadResponse.data.upload_url;
    console.log('File uploaded to AssemblyAI:', uploadUrl);

    // Step 2: Request transcript
    const transcriptResponse = await axios.post(
      'https://api.assemblyai.com/v2/transcript',
      { audio_url: uploadUrl },
      {
        headers: { authorization: process.env.ASSEMBLYAI_API_KEY },
      }
    );
    const transcriptId = transcriptResponse.data.id;
    console.log('Transcript job started:', transcriptId);

    // Step 3: Poll for transcript completion
    let transcriptResult = null;
    while (true) {
      await new Promise(resolve => setTimeout(resolve, 5000)); // wait 5 seconds

      const statusResponse = await axios.get(
        `https://api.assemblyai.com/v2/transcript/${transcriptId}`,
        {
          headers: { authorization: process.env.ASSEMBLYAI_API_KEY }
        }
      );

      if (statusResponse.data.status === 'completed') {
        transcriptResult = statusResponse.data;
        break;
      } else if (statusResponse.data.status === 'error') {
        return res.status(500).json({ error: transcriptResult.error });
      }
      console.log('Waiting for transcript...');
    }
    console.log('Transcript completed!');

    // Step 4: Update DB with transcript and duration
    await supabase
      .from('transcriptions')
      .update({
        transcript: transcriptResult.text,
        duration_seconds: transcriptResult.audio_duration_seconds
      })
      .eq('filename', filename);

    // Step 5: Send back transcript
    res.json({ success: true, transcript: transcriptResult.text });

  } catch (err) {
    console.error('Error during transcription:', err.message || err);
    res.status(500).json({ error: err.message || 'Server error' });
  }

  console.log('=== UPLOAD REQUEST END ===');
});

// Basic test route
app.get('/', (req, res) => {
  res.send("Backend is working!");
});

// Test database connection endpoint
app.get('/test-db', async (req, res) => {
  try {
    const { data, error } = await supabase.from('transcriptions').select('*').limit(1);
    res.json({ data, error, message: 'Database test' });
  } catch (err) {
    res.json({ error: 'Database connection failed', details: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log('Ready to accept requests.');
});