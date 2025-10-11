const express = require('express');
const cors = require('cors');
const multer = require('multer');
const supabase = require('./supabaseClient');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS and JSON support
app.use(cors());
app.use(express.json());

// Set up storage for uploaded files
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/'); // saves files to /backend/uploads/
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});
const upload = multer({ storage });

// File upload route that also saves metadata to Supabase
app.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).send('No file uploaded.');

  // For now, receive user_id as a field in the request (frontend or postman should send it)
  const userId = req.body.user_id; // we'll explain better user_id handling next!
  const filename = req.file.filename;
  const filepath = req.file.path;

  // Insert metadata into Supabase
  const { data, error } = await supabase
    .from('transcriptions')
    .insert([{
      user_id: userId,
      filename: filename,
      filepath: filepath,
      transcript: null, // to be filled after speech-to-text
      duration_seconds: null, // to be filled after audio processing
    }]);

  if (error) return res.status(500).json({ error });
  res.status(200).json({ success: true, transcription: data[0] });
});

// Basic test route
app.get('/', (req, res) => {
  res.send("Backend is working!");
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});