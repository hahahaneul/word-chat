const socket = io();

// DOM refs
const homeScreen = document.getElementById('home-screen');
const chatScreen = document.getElementById('chat-screen');
const roomList = document.getElementById('room-list');
const messagesContainer = document.getElementById('messages-container');
const chatInput = document.getElementById('chat-input');
const docTitle = document.getElementById('doc-title');
const newDocCard = document.getElementById('new-doc-card');
const btnNew = document.getElementById('btn-new');
const btnHome = document.getElementById('btn-home');
const btnBack = document.getElementById('btn-back');
const modal = document.getElementById('new-room-modal');
const modalCreate = document.getElementById('modal-create');
const modalCancel = document.getElementById('modal-cancel');
const roomNameInput = document.getElementById('room-name-input');
const pageCount = document.getElementById('page-count');
const wordCount = document.getElementById('word-count');
const onlineIndicator = document.getElementById('online-indicator');
const onlineCount = document.getElementById('online-count');
const documentArea = document.querySelector('.document-area');

let currentRoomId = null;
let totalWords = 0;

// Helpers
function timeAgo(dateStr) {
  const now = new Date();
  const d = new Date(dateStr);
  const diff = now - d;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '방금 전';
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}일 전`;
  return d.toLocaleDateString('ko-KR');
}

// Stable fake paths per room (seeded by room id hash)
const fakePaths = [
  '문서 » 업무보고',
  '바탕 화면 » 프로젝트 » 2026_Q1',
  '다운로드',
  '문서 » 회의록',
  '바탕 화면 » 기획팀 » 공유자료',
  '문서 » 참고자료',
  '바탕 화면 » 보고서',
  '다운로드 » 메일첨부',
];
function getPathForRoom(roomId) {
  let hash = 0;
  for (let i = 0; i < roomId.length; i++) hash = (hash * 31 + roomId.charCodeAt(i)) | 0;
  return fakePaths[Math.abs(hash) % fakePaths.length];
}

const wordIcon = `<svg viewBox="0 0 32 32" width="28" height="28">
  <rect x="2" y="2" width="28" height="28" rx="3" fill="#2b579a"/>
  <text x="8" y="22" font-size="16" fill="white" font-weight="bold" font-family="Segoe UI">W</text>
</svg>`;

// Screens
function showHome() {
  homeScreen.classList.add('active');
  chatScreen.classList.remove('active');
  onlineIndicator.style.display = 'none';
  currentRoomId = null;
  document.title = '문서1 - 호환성 모드 - Word';
  socket.emit('leave-room');
}

function showChat(roomData) {
  homeScreen.classList.remove('active');
  chatScreen.classList.add('active');
  onlineIndicator.style.display = 'flex';
  currentRoomId = roomData.id;
  docTitle.textContent = roomData.name;
  document.title = roomData.name + ' - 호환성 모드 - Word';

  messagesContainer.innerHTML = '';
  totalWords = 0;

  roomData.messages.forEach((msg) => appendMessage(msg, false));
  scrollToBottom();

  // Focus hidden input
  setTimeout(() => chatInput.focus(), 100);
}

// Room list rendering
socket.on('room-list', (rooms) => {
  roomList.innerHTML = '';
  rooms.forEach((room) => {
    const el = document.createElement('div');
    el.className = 'doc-item';
    el.innerHTML = `
      <div class="doc-icon">${wordIcon}</div>
      <div class="doc-info">
        <div class="doc-name">${escapeHtml(room.name)}</div>
        <div class="doc-path">${getPathForRoom(room.id)}</div>
      </div>
      <div class="doc-date">${timeAgo(room.createdAt)}</div>
    `;
    el.addEventListener('click', () => socket.emit('join-room', room.id));
    roomList.appendChild(el);

    // Update online count
    if (room.userCount) {
      onlineCount.textContent = room.userCount;
    }
  });
});

socket.on('room-joined', (roomData) => {
  showChat(roomData);
});

// Messages
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function appendMessage(msg, scroll = true) {
  // Section heading
  if (msg.sectionHeading) {
    const heading = document.createElement('div');
    heading.className = 'msg-section-heading';
    heading.textContent = msg.sectionHeading;
    messagesContainer.appendChild(heading);
  }

  // Main message with bullet
  const line = document.createElement('div');
  line.className = 'msg-line';
  line.innerHTML = `<span class="msg-bullet">○</span><span>${escapeHtml(msg.text)}</span>`;
  messagesContainer.appendChild(line);

  // Count words
  totalWords += msg.text.split(/\s+/).filter(Boolean).length;
  updateStatus();

  if (scroll) scrollToBottom();
}

function updateStatus() {
  const msgCount = messagesContainer.querySelectorAll('.msg-line').length;
  const pages = Math.max(1, Math.ceil(msgCount / 15));
  pageCount.textContent = `${pages}/${pages} 페이지`;
  wordCount.textContent = `${totalWords}개 단어`;
}

socket.on('new-message', (msg) => {
  appendMessage(msg);
});

function scrollToBottom() {
  requestAnimationFrame(() => {
    documentArea.scrollTop = documentArea.scrollHeight;
  });
}

// Input handling
document.addEventListener('keydown', (e) => {
  if (!currentRoomId) return;
  if (e.key === 'Escape') {
    showHome();
    return;
  }
  chatInput.focus();
});

chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    const text = chatInput.value.trim();
    if (text && currentRoomId) {
      socket.emit('send-message', { roomId: currentRoomId, text });
      chatInput.value = '';
    }
  }
});

// Keep input focused when clicking document area
documentArea.addEventListener('click', () => {
  if (currentRoomId) chatInput.focus();
});

// Navigation
btnBack.addEventListener('click', showHome);
btnHome.addEventListener('click', showHome);

// Ribbon tab navigation: 파일 and 홈 tabs go back to home
document.querySelectorAll('.ribbon-tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    const text = tab.textContent.trim();
    if (text === '파일' || text === '홈') {
      showHome();
    }
  });
});

// Share button
const shareBtn = document.getElementById('btn-share');
const shareModal = document.getElementById('share-modal');
const shareLink = document.getElementById('share-link');
const shareCopy = document.getElementById('share-copy');
const shareClose = document.getElementById('share-close');

shareBtn.addEventListener('click', () => {
  if (!currentRoomId) return;
  const url = window.location.origin + '/room/' + currentRoomId;
  shareLink.value = url;
  shareModal.classList.add('show');
  shareLink.select();
});

shareCopy.addEventListener('click', () => {
  shareLink.select();
  navigator.clipboard.writeText(shareLink.value).then(() => {
    shareCopy.textContent = '복사됨!';
    setTimeout(() => { shareCopy.textContent = '복사'; }, 1500);
  });
});

shareClose.addEventListener('click', () => shareModal.classList.remove('show'));
shareModal.addEventListener('click', (e) => {
  if (e.target === shareModal) shareModal.classList.remove('show');
});

// Auto-join room from URL path /room/:roomId
(function checkUrlRoom() {
  const match = window.location.pathname.match(/^\/room\/(.+)$/);
  if (match) {
    const roomId = match[1];
    socket.emit('join-room', roomId);
    // Clean up URL without reload
    window.history.replaceState({}, '', '/');
  }
})();

// New room modal
function showModal() {
  modal.classList.add('show');
  roomNameInput.value = '';
  roomNameInput.focus();
}
function hideModal() {
  modal.classList.remove('show');
}

newDocCard.addEventListener('click', showModal);
btnNew.addEventListener('click', showModal);

modalCreate.addEventListener('click', () => {
  let name = roomNameInput.value.trim();
  if (!name) name = '새 문서.docx';
  if (!name.endsWith('.docx') && !name.endsWith('.doc')) name += '.docx';
  socket.emit('create-room', name);
  hideModal();
});

modalCancel.addEventListener('click', hideModal);

roomNameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') modalCreate.click();
  if (e.key === 'Escape') hideModal();
});

modal.addEventListener('click', (e) => {
  if (e.target === modal) hideModal();
});

// Update online count from room list
socket.on('room-list', (rooms) => {
  if (currentRoomId) {
    const current = rooms.find((r) => r.id === currentRoomId);
    if (current) {
      onlineCount.textContent = current.userCount;
    }
  }
});
