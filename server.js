import express from 'express';
import cors from 'cors';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import FormData from 'form-data';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import { YoutubeTranscript } from 'youtube-transcript';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Ensure temp directory exists
const tempDir = path.join(__dirname, 'temp');
await fs.mkdir(tempDir, { recursive: true });

// Store job status
const jobs = new Map();

// Detect platform from URL
function detectPlatform(url) {
  if (url.includes('youtube.com') || url.includes('youtu.be')) {
    return 'youtube';
  } else if (url.includes('instagram.com')) {
    return 'instagram';
  } else if (url.includes('twitter.com') || url.includes('x.com')) {
    return 'x';
  }
  return 'unknown';
}

// Extract YouTube video ID from URL
function extractYouTubeVideoId(url) {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

// Fetch YouTube transcript using official captions API
async function fetchYouTubeTranscript(url) {
  const videoId = extractYouTubeVideoId(url);
  if (!videoId) {
    throw new Error('Could not extract YouTube video ID from URL');
  }

  try {
    const transcriptItems = await YoutubeTranscript.fetchTranscript(videoId);

    if (!transcriptItems || transcriptItems.length === 0) {
      throw new Error('No transcript/captions available for this video. The video may not have captions enabled.');
    }

    // Combine all transcript segments into full text
    const fullText = transcriptItems.map(item => item.text).join(' ');

    // Clean up HTML entities and extra whitespace
    const cleanedText = fullText
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();

    // Build words array with timing info for SRT/VTT export
    const words = transcriptItems.map(item => ({
      text: item.text,
      offset: item.offset / 1000,       // Convert ms to seconds
      duration: item.duration / 1000     // Convert ms to seconds
    }));

    return {
      text: cleanedText,
      language: 'auto',  // YouTube transcript API doesn't always return language
      words: words
    };
  } catch (err) {
    if (err.message.includes('No transcript')) {
      throw err;
    }
    throw new Error(`YouTube transcript error: ${err.message}`);
  }
}

// Download video and extract audio using yt-dlp (for Instagram/X)
async function downloadAndExtractAudio(url, jobId) {
  const outputPath = path.join(tempDir, `${jobId}.mp3`);
  
  return new Promise((resolve, reject) => {
    const args = [
      '-x',                          // Extract audio
      '--audio-format', 'mp3',       // Convert to mp3
      '--audio-quality', '0',        // Best quality
      '-o', outputPath,              // Output file
      '--no-playlist',               // Don't download playlists
      '--max-filesize', '100M',      // Limit file size
      '-f', 'bestaudio/best',        // Fallback to best available format
      '--no-check-certificates',     // Skip certificate verification
      url
    ];

    const ytdlp = spawn('yt-dlp', args);
    
    let stderr = '';
    
    ytdlp.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    ytdlp.stdout.on('data', (data) => {
      console.log(`yt-dlp: ${data}`);
    });

    ytdlp.on('close', (code) => {
      if (code === 0) {
        resolve(outputPath);
      } else {
        reject(new Error(`yt-dlp failed with code ${code}: ${stderr}`));
      }
    });

    ytdlp.on('error', (err) => {
      reject(new Error(`Failed to start yt-dlp: ${err.message}`));
    });
  });
}

// Transcribe audio using Groq Whisper
async function transcribeAudio(audioPath, apiKey) {
  const { createReadStream } = await import('fs');
  const formData = new FormData();
  
  formData.append('file', createReadStream(audioPath), {
    filename: 'audio.mp3',
    contentType: 'audio/mpeg'
  });
  formData.append('model', 'whisper-large-v3');
  formData.append('response_format', 'verbose_json');

  const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      ...formData.getHeaders()
    },
    body: formData
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Groq API error: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  return {
    text: result.text,
    language: result.language,
    words: result.words || []
  };
}

// Cleanup temp files
async function cleanup(jobId) {
  try {
    const files = await fs.readdir(tempDir);
    for (const file of files) {
      if (file.startsWith(jobId)) {
        await fs.unlink(path.join(tempDir, file));
      }
    }
  } catch (err) {
    console.error('Cleanup error:', err);
  }
}

// API: Start conversion
app.post('/api/convert', async (req, res) => {
  const { url } = req.body;
  const apiKey = process.env.GROQ_API_KEY;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  if (!apiKey) {
    return res.status(500).json({ error: 'Server is not configured with a Groq API key. Please set GROQ_API_KEY in your .env file.' });
  }

  const platform = detectPlatform(url);
  if (platform === 'unknown') {
    return res.status(400).json({ error: 'Unsupported platform. Please use YouTube, Instagram, or X URLs.' });
  }

  const jobId = uuidv4();
  
  // Initialize job
  jobs.set(jobId, {
    status: 'downloading',
    platform,
    progress: 0,
    text: null,
    error: null,
    createdAt: Date.now()
  });

  res.json({ jobId, platform });

  // Process in background
  (async () => {
    try {
      if (platform === 'youtube') {
        // YouTube: Use transcript API directly (no download needed)
        jobs.get(jobId).status = 'transcribing';
        jobs.get(jobId).progress = 30;

        const result = await fetchYouTubeTranscript(url);

        jobs.get(jobId).status = 'completed';
        jobs.get(jobId).progress = 100;
        jobs.get(jobId).text = result.text;
        jobs.get(jobId).words = result.words;
        jobs.get(jobId).language = result.language;
      } else {
        // Instagram/X: Download audio with yt-dlp, then transcribe with Groq
        jobs.get(jobId).status = 'downloading';
        jobs.get(jobId).progress = 10;
        
        const audioPath = await downloadAndExtractAudio(url, jobId);
        
        jobs.get(jobId).status = 'transcribing';
        jobs.get(jobId).progress = 50;

        const result = await transcribeAudio(audioPath, apiKey);
        
        jobs.get(jobId).status = 'completed';
        jobs.get(jobId).progress = 100;
        jobs.get(jobId).text = result.text;
        jobs.get(jobId).words = result.words;
        jobs.get(jobId).language = result.language;

        // Cleanup audio files
        await cleanup(jobId);
      }
    } catch (err) {
      console.error('Conversion error:', err);
      jobs.get(jobId).status = 'error';
      jobs.get(jobId).error = err.message;
      await cleanup(jobId);
    }
  })();
});

// API: Check job status
app.get('/api/status/:jobId', (req, res) => {
  const { jobId } = req.params;
  const job = jobs.get(jobId);

  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  res.json(job);
});

// Cleanup old jobs periodically (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  const maxAge = 30 * 60 * 1000; // 30 minutes

  for (const [jobId, job] of jobs.entries()) {
    if (now - job.createdAt > maxAge) {
      jobs.delete(jobId);
      cleanup(jobId);
    }
  }
}, 5 * 60 * 1000);

app.listen(PORT, () => {
  console.log(`🎬 Video to Text server running at http://localhost:${PORT}`);
});
