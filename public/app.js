// --- UI Elements ---
const tabs = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');
const jobDescriptionInput = document.getElementById('job-description');
const errorMessage = document.getElementById('error-message');
const analyzeBtn = document.getElementById('analyze-btn');
const loadingState = document.getElementById('loading-state');
const verdictCard = document.getElementById('verdict-card');
const apiErrorCard = document.getElementById('api-error-card');
const writeProposalBtn = document.getElementById('write-proposal-btn');
const proposalCard = document.getElementById('proposal-card');
const proposalOutput = document.getElementById('proposal-output');
const copyBtn = document.getElementById('copy-btn');
const regenerateBtn = document.getElementById('regenerate-btn');
const historyList = document.getElementById('history-list');
const emptyHistory = document.getElementById('empty-history');
const clearHistoryBtn = document.getElementById('clear-history-btn');

let currentJobDescription = "";
let currentAnalysis = null;

// --- Tab Logic ---
tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    tabs.forEach(t => t.classList.remove('active'));
    tabContents.forEach(c => c.classList.remove('active'));
    
    tab.classList.add('active');
    document.getElementById(tab.dataset.target).classList.add('active');
  });
});

// --- API Helper ---
async function callAI(jobDescription, phase) {
  const response = await fetch('/.netlify/functions/groq', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jobDescription, phase })
  });
  
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    const error = new Error(errData.error || 'API request failed');
    error.details = errData.details;
    error.payloadSize = errData.payloadSize;
    error.kbInfo = errData.kbInfo;
    throw error;
  }
  
  const data = await response.json();
  const content = data.choices[0].message.content;
  
  if (phase === 'analyze') {
    // Sometimes AI wraps JSON in markdown blocks
    const cleanContent = content.replace(/^```json/m, '').replace(/```$/m, '').trim();
    return JSON.parse(cleanContent);
  }
  return content;
}

// --- Analyze Logic ---
analyzeBtn.addEventListener('click', async () => {
  currentJobDescription = jobDescriptionInput.value.trim();
  
  if (!currentJobDescription) {
    jobDescriptionInput.classList.add('shake');
    errorMessage.classList.remove('hidden');
    setTimeout(() => {
      jobDescriptionInput.classList.remove('shake');
    }, 400);
    return;
  }
  
  errorMessage.classList.add('hidden');
  jobDescriptionInput.classList.remove('shake');
  
  // UI State
  verdictCard.classList.add('hidden');
  proposalCard.classList.add('hidden');
  apiErrorCard.classList.add('hidden');
  loadingState.classList.remove('hidden');
  
  try {
    currentAnalysis = await callAI(currentJobDescription, 'analyze');
    renderVerdict(currentAnalysis);
    saveToHistory(currentJobDescription, currentAnalysis);
  } catch (error) {
    console.error(error);
    const detailMsg = error.payloadSize ? ` (Size: ${Math.round(error.payloadSize/1024)}KB)` : "";
    const kbMsg = error.kbInfo ? `\n[${error.kbInfo}]` : "";
    document.getElementById('api-error-text').textContent = error.message + detailMsg + kbMsg;
    apiErrorCard.classList.remove('hidden');
  } finally {
    loadingState.classList.add('hidden');
  }
});

function renderVerdict(data) {
  document.getElementById('verdict-badge').textContent = data.decision;
  document.getElementById('verdict-badge').className = `badge ${data.decision?.toLowerCase() || 'skip'}`;
  
  document.getElementById('score-text').textContent = `${data.matchScore}%`;
  document.getElementById('score-fill').style.width = `${data.matchScore}%`;
  
  document.getElementById('verdict-reason').textContent = data.reason;
  
  const greenList = document.getElementById('green-flags-list');
  greenList.innerHTML = '';
  (data.greenFlags || []).forEach(flag => {
    const li = document.createElement('li');
    li.textContent = flag;
    greenList.appendChild(li);
  });
  
  const redList = document.getElementById('red-flags-list');
  redList.innerHTML = '';
  (data.redFlags || []).forEach(flag => {
    const li = document.createElement('li');
    li.textContent = flag;
    redList.appendChild(li);
  });
  
  if (data.decision === 'APPLY') {
    writeProposalBtn.classList.remove('hidden');
  } else {
    writeProposalBtn.classList.add('hidden');
  }
  
  verdictCard.classList.remove('hidden');
}

// --- Proposal Logic ---
writeProposalBtn.addEventListener('click', generateProposal);
regenerateBtn.addEventListener('click', generateProposal);

async function generateProposal() {
  proposalCard.classList.add('hidden');
  apiErrorCard.classList.add('hidden');
  loadingState.classList.remove('hidden');
  
  try {
    const proposal = await callAI(currentJobDescription, 'propose');
    
    proposalOutput.textContent = proposal;
    
    const words = proposal.trim().split(/\s+/).length;
    document.getElementById('word-count').textContent = `${words} words`;
    
    proposalCard.classList.remove('hidden');
  } catch (error) {
    console.error(error);
    const detailMsg = error.payloadSize ? ` (Size: ${Math.round(error.payloadSize/1024)}KB)` : "";
    const kbMsg = error.kbInfo ? `\n[${error.kbInfo}]` : "";
    document.getElementById('api-error-text').textContent = error.message + detailMsg + kbMsg;
    apiErrorCard.classList.remove('hidden');
  } finally {
    loadingState.classList.add('hidden');
  }
}

// --- Copy Logic ---
copyBtn.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(proposalOutput.textContent);
    const originalText = copyBtn.textContent;
    copyBtn.textContent = 'Copied!';
    setTimeout(() => {
      copyBtn.textContent = originalText;
    }, 2000);
  } catch (err) {
    console.error('Failed to copy text: ', err);
  }
});

// --- History Logic ---
function saveToHistory(jobDesc, analysis) {
  let history = JSON.parse(localStorage.getItem('conpeloHistory') || '[]');
  
  const newItem = {
    id: Date.now().toString(),
    snippet: jobDesc.substring(0, 60) + (jobDesc.length > 60 ? '...' : ''),
    decision: analysis.decision || 'SKIP',
    score: analysis.matchScore || 0,
    date: new Date().toLocaleDateString()
  };
  
  history.unshift(newItem);
  if (history.length > 10) history = history.slice(0, 10);
  
  localStorage.setItem('conpeloHistory', JSON.stringify(history));
  renderHistory();
}

function renderHistory() {
  const history = JSON.parse(localStorage.getItem('conpeloHistory') || '[]');
  
  if (history.length === 0) {
    historyList.innerHTML = '';
    emptyHistory.classList.remove('hidden');
    return;
  }
  
  emptyHistory.classList.add('hidden');
  historyList.innerHTML = '';
  
  history.forEach(item => {
    const div = document.createElement('div');
    div.className = 'history-item';
    div.innerHTML = `
      <div class="history-content">
        <div class="history-text">${item.snippet}</div>
        <div class="history-meta">
          <span class="badge ${item.decision.toLowerCase()}" style="padding: 2px 8px; font-size: 11px;">${item.decision}</span>
          <span>Score: ${item.score}%</span>
          <span>${item.date}</span>
        </div>
      </div>
      <button class="delete-btn" data-id="${item.id}" aria-label="Delete">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
      </button>
    `;
    historyList.appendChild(div);
  });
  
  // Attach delete listeners
  document.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.currentTarget.dataset.id;
      let hist = JSON.parse(localStorage.getItem('conpeloHistory') || '[]');
      hist = hist.filter(item => item.id !== id);
      localStorage.setItem('conpeloHistory', JSON.stringify(hist));
      renderHistory();
    });
  });
}

clearHistoryBtn.addEventListener('click', () => {
  localStorage.removeItem('conpeloHistory');
  renderHistory();
});

// Initial render
renderHistory();
