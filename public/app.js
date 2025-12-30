// ========================================
// DOM Elements
// ========================================
const convertForm = document.getElementById('convertForm');
const videoUrlInput = document.getElementById('videoUrl');
const apiKeyInput = document.getElementById('apiKey');
const toggleApiKeyBtn = document.getElementById('toggleApiKey');
const submitBtn = document.getElementById('submitBtn');
const platformIndicator = document.getElementById('platformIndicator');

const progressSection = document.getElementById('progressSection');
const statusText = document.getElementById('statusText');
const progressPercent = document.getElementById('progressPercent');
const progressFill = document.getElementById('progressFill');

const resultSection = document.getElementById('resultSection');
const languageTag = document.getElementById('languageTag');
const copyBtn = document.getElementById('copyBtn');
const transcriptionText = document.getElementById('transcriptionText');
const newConversionBtn = document.getElementById('newConversion');

const errorSection = document.getElementById('errorSection');
const errorMessage = document.getElementById('errorMessage');
const retryBtn = document.getElementById('retryBtn');

// Platform badges
const platformBadges = document.querySelectorAll('.platform-badge');

// ========================================
// State
// ========================================
let currentJobId = null;
let pollInterval = null;

// ========================================
// Utilities
// ========================================
function detectPlatform(url) {
  if (url.includes('youtube.com') || url.includes('youtu.be')) {
    return 'youtube';
  } else if (url.includes('instagram.com')) {
    return 'instagram';
  } else if (url.includes('twitter.com') || url.includes('x.com')) {
    return 'x';
  }
  return null;
}

function updatePlatformIndicator(url) {
  const platform = detectPlatform(url);
  
  // Update platform badges
  platformBadges.forEach(badge => {
    badge.classList.remove('active');
    if (platform && badge.dataset.platform === platform) {
      badge.classList.add('active');
    }
  });
  
  // Update input indicator
  if (platform) {
    platformIndicator.textContent = platform === 'x' ? 'X' : platform;
    platformIndicator.className = `platform-indicator ${platform}`;
    platformIndicator.classList.remove('hidden');
  } else {
    platformIndicator.classList.add('hidden');
  }
}

function showSection(section) {
  progressSection.classList.add('hidden');
  resultSection.classList.add('hidden');
  errorSection.classList.add('hidden');
  
  if (section) {
    section.classList.remove('hidden');
  }
}

function updateProgress(progress, status) {
  progressFill.style.width = `${progress}%`;
  progressPercent.textContent = `${progress}%`;
  statusText.textContent = status;
  
  // Update steps
  const stepDownload = document.getElementById('step-download');
  const stepExtract = document.getElementById('step-extract');
  const stepTranscribe = document.getElementById('step-transcribe');
  
  stepDownload.className = 'step';
  stepExtract.className = 'step';
  stepTranscribe.className = 'step';
  
  if (progress >= 10) stepDownload.classList.add('active');
  if (progress >= 30) {
    stepDownload.classList.remove('active');
    stepDownload.classList.add('completed');
    stepExtract.classList.add('active');
  }
  if (progress >= 50) {
    stepExtract.classList.remove('active');
    stepExtract.classList.add('completed');
    stepTranscribe.classList.add('active');
  }
  if (progress >= 100) {
    stepTranscribe.classList.remove('active');
    stepTranscribe.classList.add('completed');
  }
}

function setFormDisabled(disabled) {
  videoUrlInput.disabled = disabled;
  apiKeyInput.disabled = disabled;
  submitBtn.disabled = disabled;
}

function getLanguageName(code) {
  try {
    const displayNames = new Intl.DisplayNames(['en'], { type: 'language' });
    return displayNames.of(code);
  } catch {
    return code?.toUpperCase() || 'Unknown';
  }
}

// ========================================
// API Functions
// ========================================
async function startConversion(url, apiKey) {
  const response = await fetch('/api/convert', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ url, apiKey })
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to start conversion');
  }
  
  return response.json();
}

async function checkStatus(jobId) {
  const response = await fetch(`/api/status/${jobId}`);
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to check status');
  }
  
  return response.json();
}

// ========================================
// Event Handlers
// ========================================
videoUrlInput.addEventListener('input', (e) => {
  updatePlatformIndicator(e.target.value);
});

toggleApiKeyBtn.addEventListener('click', () => {
  const eyeOpen = toggleApiKeyBtn.querySelector('.eye-open');
  const eyeClosed = toggleApiKeyBtn.querySelector('.eye-closed');
  
  if (apiKeyInput.type === 'password') {
    apiKeyInput.type = 'text';
    eyeOpen.classList.add('hidden');
    eyeClosed.classList.remove('hidden');
  } else {
    apiKeyInput.type = 'password';
    eyeOpen.classList.remove('hidden');
    eyeClosed.classList.add('hidden');
  }
});

convertForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const url = videoUrlInput.value.trim();
  const apiKey = apiKeyInput.value.trim();
  
  if (!url || !apiKey) return;
  
  const platform = detectPlatform(url);
  if (!platform) {
    showSection(errorSection);
    errorMessage.textContent = 'Please enter a valid YouTube, Instagram, or X URL.';
    return;
  }
  
  try {
    setFormDisabled(true);
    showSection(progressSection);
    updateProgress(0, 'Starting conversion...');
    
    const { jobId } = await startConversion(url, apiKey);
    currentJobId = jobId;
    
    // Start polling for status
    pollInterval = setInterval(async () => {
      try {
        const status = await checkStatus(jobId);
        
        if (status.status === 'downloading') {
          updateProgress(status.progress, 'Downloading video...');
        } else if (status.status === 'transcribing') {
          updateProgress(status.progress, 'Transcribing audio with AI...');
        } else if (status.status === 'completed') {
          clearInterval(pollInterval);
          updateProgress(100, 'Complete!');
          
          setTimeout(() => {
            showSection(resultSection);
            transcriptionText.textContent = status.text;
            languageTag.textContent = getLanguageName(status.language);
            setFormDisabled(false);
          }, 500);
        } else if (status.status === 'error') {
          clearInterval(pollInterval);
          throw new Error(status.error);
        }
      } catch (err) {
        clearInterval(pollInterval);
        showSection(errorSection);
        errorMessage.textContent = err.message;
        setFormDisabled(false);
      }
    }, 1000);
    
  } catch (err) {
    showSection(errorSection);
    errorMessage.textContent = err.message;
    setFormDisabled(false);
  }
});

copyBtn.addEventListener('click', async () => {
  const text = transcriptionText.textContent;
  
  try {
    await navigator.clipboard.writeText(text);
    copyBtn.classList.add('copied');
    copyBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
      Copied!
    `;
    
    setTimeout(() => {
      copyBtn.classList.remove('copied');
      copyBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>
        Copy
      `;
    }, 2000);
  } catch (err) {
    console.error('Failed to copy:', err);
  }
});

newConversionBtn.addEventListener('click', () => {
  videoUrlInput.value = '';
  updatePlatformIndicator('');
  showSection(null);
  videoUrlInput.focus();
});

retryBtn.addEventListener('click', () => {
  showSection(null);
  videoUrlInput.focus();
});

// ========================================
// Initialize
// ========================================
// Load saved API key from localStorage
const savedApiKey = localStorage.getItem('elevenlabs_api_key');
if (savedApiKey) {
  apiKeyInput.value = savedApiKey;
}

// Save API key on change
apiKeyInput.addEventListener('change', () => {
  if (apiKeyInput.value.trim()) {
    localStorage.setItem('elevenlabs_api_key', apiKeyInput.value.trim());
  }
});
