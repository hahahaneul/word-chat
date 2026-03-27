const socket = io();

// DOM refs
const homeScreen = document.getElementById('home-screen');
const chatScreen = document.getElementById('chat-screen');
const roomList = document.getElementById('room-list');
const pagesContainer = document.getElementById('pages-container');
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
let messages = [];

// Page height constants (matching CSS: 900px height - 72px*2 padding = 756px content area)
const PAGE_CONTENT_HEIGHT = 756;

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
  messages = [];
  document.title = '문서1 - 호환성 모드 - Word';
  window.history.pushState({}, '', '/');
  socket.emit('leave-room');
}

function showChat(roomData) {
  homeScreen.classList.remove('active');
  chatScreen.classList.add('active');
  onlineIndicator.style.display = 'flex';
  currentRoomId = roomData.id;
  docTitle.textContent = roomData.name;
  document.title = roomData.name + ' - 호환성 모드 - Word';

  messages = roomData.messages || [];
  totalWords = 0;
  messages.forEach(msg => {
    totalWords += msg.text.split(/\s+/).filter(Boolean).length;
  });

  renderAllPages();
  scrollToInput();

  setTimeout(() => {
    const input = document.getElementById('chat-input');
    if (input) input.focus();
  }, 100);
}

// ===== PAGE RENDERING =====
function renderAllPages() {
  // Save current input value before destroying
  const oldInput = document.getElementById('chat-input');
  const savedValue = oldInput ? oldInput.value : '';
  const wasFocused = oldInput && document.activeElement === oldInput;

  pagesContainer.innerHTML = '';

  if (messages.length === 0) {
    createPage(0, []);
  } else {
    // Distribute messages across pages using overflow detection
    const pagesData = distributeMessages();
    pagesData.forEach((pageMessages, i) => {
      createPage(i, pageMessages);
    });
  }

  addInputToLastPage();
  updateStatus();

  // Restore input value and focus
  const newInput = document.getElementById('chat-input');
  if (newInput && savedValue) {
    newInput.value = savedValue;
  }
  if (newInput && wasFocused) {
    newInput.focus();
  }
}

function distributeMessages() {
  const pages = [];
  let current = [];
  pages.push(current);

  // Create a hidden measurer page
  const measurer = document.createElement('div');
  measurer.className = 'document-page';
  measurer.style.position = 'absolute';
  measurer.style.visibility = 'hidden';
  measurer.style.left = '-9999px';
  document.body.appendChild(measurer);

  const pageContent = document.createElement('div');
  pageContent.className = 'page-content';
  measurer.appendChild(pageContent);

  const msgContainer = document.createElement('div');
  msgContainer.className = 'messages-container';
  pageContent.appendChild(msgContainer);

  const maxHeight = PAGE_CONTENT_HEIGHT - 30; // Reserve space for input line

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];

    // Add section heading if present
    if (msg.sectionHeading) {
      const heading = document.createElement('div');
      heading.className = 'msg-section-heading';
      heading.textContent = msg.sectionHeading;
      msgContainer.appendChild(heading);
    }

    const line = document.createElement('div');
    line.className = 'msg-line';
    line.innerHTML = `<span class="msg-bullet">${msg.bullet || '○'}</span><span>${escapeHtml(msg.text)}</span>`;
    msgContainer.appendChild(line);

    if (msgContainer.scrollHeight > maxHeight && current.length > 0) {
      // Overflow — remove this message's elements and start new page
      msgContainer.removeChild(line);
      if (msg.sectionHeading) {
        const headings = msgContainer.querySelectorAll('.msg-section-heading');
        const lastHeading = headings[headings.length - 1];
        if (lastHeading) msgContainer.removeChild(lastHeading);
      }
      current = [msg];
      pages.push(current);
      // Reset measurer
      msgContainer.innerHTML = '';
      if (msg.sectionHeading) {
        const heading2 = document.createElement('div');
        heading2.className = 'msg-section-heading';
        heading2.textContent = msg.sectionHeading;
        msgContainer.appendChild(heading2);
      }
      const line2 = document.createElement('div');
      line2.className = 'msg-line';
      line2.innerHTML = `<span class="msg-bullet">${msg.bullet || '○'}</span><span>${escapeHtml(msg.text)}</span>`;
      msgContainer.appendChild(line2);
    } else {
      current.push(msg);
    }
  }

  document.body.removeChild(measurer);
  return pages;
}

function createPage(index, pageMessages) {
  const page = document.createElement('div');
  page.className = 'document-page';
  page.dataset.pageIndex = index;

  const content = document.createElement('div');
  content.className = 'page-content';

  const msgContainer = document.createElement('div');
  msgContainer.className = 'messages-container';
  msgContainer.id = `page-msgs-${index}`;

  pageMessages.forEach(msg => {
    if (msg.sectionHeading) {
      const heading = document.createElement('div');
      heading.className = 'msg-section-heading';
      heading.textContent = msg.sectionHeading;
      msgContainer.appendChild(heading);
    }
    const line = document.createElement('div');
    line.className = 'msg-line';
    line.innerHTML = `<span class="msg-bullet">${msg.bullet || '○'}</span><span>${escapeHtml(msg.text)}</span>`;
    msgContainer.appendChild(line);
  });

  content.appendChild(msgContainer);
  page.appendChild(content);
  pagesContainer.appendChild(page);
}

function addInputToLastPage() {
  const pages = pagesContainer.querySelectorAll('.document-page');
  const lastPage = pages[pages.length - 1];
  if (!lastPage) return;

  const content = lastPage.querySelector('.page-content');
  const msgContainer = content.querySelector('.messages-container');

  const inputLine = document.createElement('div');
  inputLine.className = 'input-line';
  inputLine.id = 'input-line';
  inputLine.innerHTML = `<span class="msg-bullet input-bullet">○</span><input type="text" id="chat-input" class="inline-input" placeholder="" autocomplete="off">`;
  msgContainer.appendChild(inputLine);
}

// Global input handler using event delegation (registered once)
let isComposing = false;
document.addEventListener('compositionstart', (e) => {
  if (e.target.id === 'chat-input') isComposing = true;
});
document.addEventListener('compositionend', (e) => {
  if (e.target.id === 'chat-input') isComposing = false;
});
document.addEventListener('keydown', (e) => {
  if (e.target.id !== 'chat-input') return;
  if (e.key === 'Enter' && !isComposing) {
    e.preventDefault();
    const text = e.target.value.trim();
    if (text && currentRoomId) {
      socket.emit('send-message', { roomId: currentRoomId, text });
      e.target.value = '';
    }
  }
  if (e.key === 'Escape') {
    showHome();
  }
});

// ===== MESSAGE HANDLING =====
function appendMessage(msg) {
  messages.push(msg);
  totalWords += msg.text.split(/\s+/).filter(Boolean).length;

  // Try adding to the current last page
  const pages = pagesContainer.querySelectorAll('.document-page');
  const lastPage = pages[pages.length - 1];

  if (lastPage) {
    const msgContainer = lastPage.querySelector('.messages-container');
    const inputLine = msgContainer.querySelector('.input-line');

    // Add section heading if present
    if (msg.sectionHeading) {
      const heading = document.createElement('div');
      heading.className = 'msg-section-heading';
      heading.textContent = msg.sectionHeading;
      if (inputLine) {
        msgContainer.insertBefore(heading, inputLine);
      } else {
        msgContainer.appendChild(heading);
      }
    }

    const line = document.createElement('div');
    line.className = 'msg-line';
    line.innerHTML = `<span class="msg-bullet">${msg.bullet || '○'}</span><span>${escapeHtml(msg.text)}</span>`;
    if (inputLine) {
      msgContainer.insertBefore(line, inputLine);
    } else {
      msgContainer.appendChild(line);
    }

    // Check overflow (content height exceeds page content area)
    if (msgContainer.scrollHeight > PAGE_CONTENT_HEIGHT) {
      // Re-render all pages to redistribute
      renderAllPages();
    }
  }

  updateStatus();
  scrollToInput();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function updateStatus() {
  const pageTotal = pagesContainer.querySelectorAll('.document-page').length;
  pageCount.textContent = `${pageTotal}/${pageTotal} 페이지`;
  wordCount.textContent = `${totalWords}개 단어`;
}

function scrollToInput() {
  requestAnimationFrame(() => {
    const inputLine = document.getElementById('input-line');
    if (inputLine) inputLine.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
}

// ===== SOCKET EVENTS =====
socket.on('room-joined', (roomData) => {
  showChat(roomData);
});

socket.on('new-message', (msg) => {
  appendMessage(msg);
});

socket.on('user-count', (count) => {
  onlineCount.textContent = count;
});

// ===== NAVIGATION =====
// Keep input focused when clicking document area
documentArea.addEventListener('click', () => {
  if (currentRoomId) {
    const input = document.getElementById('chat-input');
    if (input) input.focus();
  }
});

btnBack.addEventListener('click', showHome);
btnHome.addEventListener('click', showHome);

document.querySelectorAll('.ribbon-tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    const text = tab.textContent.trim();
    if (text === '파일' || text === '홈') {
      showHome();
    }
  });
});

// ===== SHARE =====
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

// ===== AUTO-JOIN FROM URL =====
(function checkUrlRoom() {
  const match = window.location.pathname.match(/^\/room\/(.+)$/);
  if (match) {
    socket.emit('join-room', match[1]);
  }
})();

// ===== NEW ROOM MODAL =====
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
  socket.emit('create-room', name, (roomId) => {
    window.history.pushState({}, '', '/room/' + roomId);
    socket.emit('join-room', roomId);
  });
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

// ===== FAKE FILE LIST =====
const fakeFiles = [
  { name: '[별첨 1] 2026년 예비창업패키지 사업계획서 양식.docx', path: '문서 » 참고자료', date: '3시간 전' },
  { name: '2026_Q1_실적보고서_최종.docx', path: '바탕 화면 » 프로젝트 » 2026_Q1', date: '화 오전 9:29' },
  { name: '주간업무보고_03월4주차.docx', path: '바탕 화면 » 업무보고', date: '화 오전 9:29' },
  { name: 'Appendix A_심사양식.docx', path: '다운로드', date: '월 오후 5:26' },
  { name: '한글표시사항 밀키트.docx', path: '문서 » 카카오톡 받은 파일', date: '월 오전 11:07' },
  { name: '외식·카페 특화 AI 운영 과정 상세페이지.docx', path: '다운로드', date: '목 오후 3:54' },
  { name: 'AI 자동화 & 업무 비서 구축 과정 상세페이지.docx', path: '다운로드', date: '목 오후 3:54' },
];

function renderFakeList() {
  roomList.innerHTML = '';
  fakeFiles.forEach((file) => {
    const el = document.createElement('div');
    el.className = 'doc-item fake-item';
    el.innerHTML = `
      <div class="doc-icon">${wordIcon}</div>
      <div class="doc-info">
        <div class="doc-name">${escapeHtml(file.name)}</div>
        <div class="doc-path">${file.path}</div>
      </div>
      <div class="doc-date">${file.date}</div>
    `;
    roomList.appendChild(el);
  });
}

renderFakeList();
