// ========================================
// DOM Elements
// ========================================
const convertForm = document.getElementById('convertForm');
const videoUrlInput = document.getElementById('videoUrl');
const submitBtn = document.getElementById('submitBtn');
const platformIndicator = document.getElementById('platformIndicator');

const progressSection = document.getElementById('progressSection');
const statusText = document.getElementById('statusText');
const progressPercent = document.getElementById('progressPercent');
const progressFill = document.getElementById('progressFill');

const resultSection = document.getElementById('resultSection');
const wordCountEl = document.getElementById('wordCount');
const readingTimeEl = document.getElementById('readingTime');
const languageTag = document.getElementById('languageTag');
const searchInput = document.getElementById('searchInput');
const copyBtn = document.getElementById('copyBtn');
const transcriptionText = document.getElementById('transcriptionText');
const newConversionBtn = document.getElementById('newConversion');
const downloadDropdown = document.getElementById('downloadDropdown');
const downloadBtn = document.getElementById('downloadBtn');

const errorSection = document.getElementById('errorSection');
const errorMessage = document.getElementById('errorMessage');
const retryBtn = document.getElementById('retryBtn');

// History elements
const historySidebar = document.getElementById('historySidebar');
const sidebarOverlay = document.getElementById('sidebarOverlay');
const historyToggle = document.getElementById('historyToggle');
const closeSidebar = document.getElementById('closeSidebar');
const historyList = document.getElementById('historyList');
const historyCount = document.getElementById('historyCount');
const clearHistoryBtn = document.getElementById('clearHistory');

// Platform badges
const platformBadges = document.querySelectorAll('.platform-badge');

// ========================================
// State
// ========================================
let currentJobId = null;
let pollInterval = null;
let currentTranscription = null;
let currentUrl = null;
let originalText = '';

// ========================================
// History Management
// ========================================
const HISTORY_KEY = 'videototext_history';
const MAX_HISTORY = 20;

function getHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
  } catch {
    return [];
  }
}

function saveToHistory(item) {
  const history = getHistory();
  history.unshift(item);
  if (history.length > MAX_HISTORY) {
    history.pop();
  }
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  updateHistoryUI();
}

function clearHistory() {
  localStorage.removeItem(HISTORY_KEY);
  updateHistoryUI();
}

function updateHistoryUI() {
  const history = getHistory();
  
  // Update count badge
  if (history.length > 0) {
    historyCount.textContent = history.length;
    historyCount.classList.remove('hidden');
    clearHistoryBtn.classList.remove('hidden');
  } else {
    historyCount.classList.add('hidden');
    clearHistoryBtn.classList.add('hidden');
  }
  
  // Update history list
  if (history.length === 0) {
    historyList.innerHTML = `
      <div class="history-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
          <polyline points="14 2 14 8 20 8"></polyline>
        </svg>
        <p>No transcriptions yet</p>
        <span>Your history will appear here</span>
      </div>
    `;
    return;
  }
  
  historyList.innerHTML = history.map((item, index) => `
    <div class="history-item" data-index="${index}">
      <div class="history-item-header">
        <div class="history-item-platform ${item.platform}">
          ${getPlatformIcon(item.platform)}
          <span>${item.platform}</span>
        </div>
        <span class="history-item-date">${formatDate(item.date)}</span>
      </div>
      <div class="history-item-preview">${item.preview}</div>
    </div>
  `).join('');
  
  // Add click handlers
  historyList.querySelectorAll('.history-item').forEach(item => {
    item.addEventListener('click', () => {
      const index = parseInt(item.dataset.index);
      loadFromHistory(index);
    });
  });
}

function loadFromHistory(index) {
  const history = getHistory();
  const item = history[index];
  if (!item) return;
  
  currentTranscription = { text: item.text, language: item.language };
  currentUrl = item.url;
  originalText = item.text;
  
  showResult(item.text, item.language);
  closeSidebarFunc();
}

function getPlatformIcon(platform) {
  const icons = {
    youtube: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>',
    instagram: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>'
  };
  return icons[platform] || '';
}

function formatDate(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now - date;
  
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
  
  return date.toLocaleDateString();
}

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
  
  platformBadges.forEach(badge => {
    badge.classList.remove('active');
    if (platform && badge.dataset.platform === platform) {
      badge.classList.add('active');
    }
  });
  
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

function calculateStats(text) {
  const words = text.trim().split(/\s+/).filter(w => w.length > 0);
  const wordCount = words.length;
  const readingTime = Math.max(1, Math.ceil(wordCount / 200));
  
  return { wordCount, readingTime };
}

function showResult(text, language) {
  showSection(resultSection);
  
  originalText = text;
  transcriptionText.textContent = text;
  languageTag.textContent = getLanguageName(language);
  
  const stats = calculateStats(text);
  wordCountEl.textContent = `${stats.wordCount.toLocaleString()} words`;
  readingTimeEl.textContent = `${stats.readingTime} min read`;
  
  searchInput.value = '';
  setFormDisabled(false);
}

// ========================================
// Search Functionality
// ========================================
function highlightText(text, query) {
  if (!query) return text;
  
  const regex = new RegExp(`(${escapeRegex(query)})`, 'gi');
  return text.replace(regex, '<mark>$1</mark>');
}

function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ========================================
// Download Functionality
// ========================================
function downloadFile(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function generateSRT(text) {
  // Simple SRT generation - splits text into chunks
  const words = text.split(' ');
  const chunkSize = 10;
  const chunks = [];
  
  for (let i = 0; i < words.length; i += chunkSize) {
    chunks.push(words.slice(i, i + chunkSize).join(' '));
  }
  
  return chunks.map((chunk, i) => {
    const startSec = i * 3;
    const endSec = startSec + 3;
    const start = formatTimestamp(startSec);
    const end = formatTimestamp(endSec);
    return `${i + 1}\n${start} --> ${end}\n${chunk}\n`;
  }).join('\n');
}

function generateVTT(text) {
  return 'WEBVTT\n\n' + generateSRT(text).replace(/,/g, '.');
}

function formatTimestamp(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)},000`;
}

function pad(n) {
  return n.toString().padStart(2, '0');
}

// ========================================
// Sidebar Functions
// ========================================
function openSidebar() {
  historySidebar.classList.add('open');
  sidebarOverlay.classList.add('visible');
  document.body.style.overflow = 'hidden';
}

function closeSidebarFunc() {
  historySidebar.classList.remove('open');
  sidebarOverlay.classList.remove('visible');
  document.body.style.overflow = '';
}

// ========================================
// API Functions
// ========================================
async function startConversion(url) {
  const response = await fetch('/api/convert', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url })
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

// History sidebar
historyToggle.addEventListener('click', openSidebar);
closeSidebar.addEventListener('click', closeSidebarFunc);
sidebarOverlay.addEventListener('click', closeSidebarFunc);
clearHistoryBtn.addEventListener('click', () => {
  if (confirm('Clear all history?')) {
    clearHistory();
  }
});

// Search
searchInput.addEventListener('input', (e) => {
  const query = e.target.value;
  if (query) {
    transcriptionText.innerHTML = highlightText(originalText, query);
  } else {
    transcriptionText.textContent = originalText;
  }
});

// Download dropdown
downloadBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  downloadDropdown.classList.toggle('open');
});

document.addEventListener('click', () => {
  downloadDropdown.classList.remove('open');
});

document.querySelectorAll('.dropdown-item').forEach(item => {
  item.addEventListener('click', (e) => {
    e.stopPropagation();
    const format = item.dataset.format;
    const timestamp = new Date().toISOString().slice(0, 10);
    
    if (format === 'txt') {
      downloadFile(originalText, `transcription-${timestamp}.txt`, 'text/plain');
    } else if (format === 'srt') {
      downloadFile(generateSRT(originalText), `transcription-${timestamp}.srt`, 'text/plain');
    } else if (format === 'vtt') {
      downloadFile(generateVTT(originalText), `transcription-${timestamp}.vtt`, 'text/vtt');
    }
    
    downloadDropdown.classList.remove('open');
  });
});

// Form submit
convertForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const url = videoUrlInput.value.trim();
  if (!url) return;
  
  const platform = detectPlatform(url);
  if (!platform) {
    showSection(errorSection);
    errorMessage.textContent = 'Please enter a valid YouTube, Instagram, or X URL.';
    return;
  }
  
  currentUrl = url;
  
  try {
    setFormDisabled(true);
    showSection(progressSection);
    updateProgress(0, 'Starting conversion...');
    
    const { jobId } = await startConversion(url);
    currentJobId = jobId;
    
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
          
          currentTranscription = status;
          
          // Save to history
          saveToHistory({
            url: currentUrl,
            platform,
            text: status.text,
            language: status.language,
            preview: status.text.substring(0, 100) + (status.text.length > 100 ? '...' : ''),
            date: new Date().toISOString()
          });
          
          setTimeout(() => {
            showResult(status.text, status.language);
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

// Copy button
copyBtn.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(originalText);
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

// New conversion
newConversionBtn.addEventListener('click', () => {
  videoUrlInput.value = '';
  updatePlatformIndicator('');
  showSection(null);
  videoUrlInput.focus();
});

// Retry
retryBtn.addEventListener('click', () => {
  showSection(null);
  videoUrlInput.focus();
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeSidebarFunc();
    downloadDropdown.classList.remove('open');
  }
});

// ========================================
// Initialize
// ========================================
updateHistoryUI();
