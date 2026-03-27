const socket = io();

// DOM Elements
const homeScreen = document.getElementById('home-screen');
const chatScreen = document.getElementById('chat-screen');
const slidePanel = document.getElementById('slide-panel');
const slideContainer = document.getElementById('slide-container');
const slideArea = document.getElementById('slide-area');
const docTitle = document.getElementById('doc-title');
const slideInfo = document.getElementById('slide-info');
const onlineCount = document.getElementById('online-count');
const newDocCard = document.getElementById('new-doc-card');
const modalNew = document.getElementById('modal-new');
const modalShare = document.getElementById('modal-share');
const modalRoomName = document.getElementById('modal-room-name');
const modalCreate = document.getElementById('modal-create');
const modalCancel = document.getElementById('modal-cancel');
const shareBtn = document.getElementById('share-btn');
const shareLink = document.getElementById('share-link');
const copyLink = document.getElementById('copy-link');
const closeShare = document.getElementById('close-share');
const backBtn = document.getElementById('back-btn');

let currentRoomId = null;
let messages = [];
let myBullet = '○';

// Section titles for slides
const slideTitles = [
  '프로젝트 개요',
  '현황 분석',
  '전략 방향',
  '실행 계획',
  '기대 효과',
  '일정 및 마일스톤',
  '리소스 계획',
  '리스크 관리',
  '팀 구성',
  '요약 및 Q&A',
];

// Dynamic overflow detection instead of fixed count
const MAX_MSGS_PER_SLIDE = 20; // safety cap

// ===== SCREEN MANAGEMENT =====
function showHome() {
  homeScreen.classList.add('active');
  chatScreen.classList.remove('active');
  if (currentRoomId) {
    socket.emit('leave-room');
    currentRoomId = null;
  }
  messages = [];
  window.history.pushState({}, '', '/ppt');
}

function showChat(roomData) {
  homeScreen.classList.remove('active');
  chatScreen.classList.add('active');
  currentRoomId = roomData.id;

  let name = roomData.name || '프레젠테이션1.pptx';
  if (!name.endsWith('.pptx')) name += '.pptx';
  docTitle.textContent = name;
  document.title = name + ' - PowerPoint';

  messages = roomData.messages || [];
  renderAllSlides();

  setTimeout(() => {
    const input = document.querySelector('.inline-input');
    if (input) input.focus();
  }, 100);
}

// ===== SLIDE RENDERING =====
// Calculate how many messages fit per slide based on slide dimensions
function getMaxContentHeight() {
  // Use the slide-area width to calculate slide height via 16:9 aspect ratio
  const containerWidth = slideContainer.offsetWidth || 800;
  const slideHeight = containerWidth * 9 / 16;
  // Subtract padding (40px top + 40px bottom), title area (~60px), and input space (~40px)
  return Math.max(150, slideHeight - 180);
}

function distributeMessages() {
  const slides = [[]];
  const maxH = getMaxContentHeight();

  // Create off-screen measurer
  const measurer = document.createElement('div');
  measurer.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;';
  measurer.style.width = (slideContainer.offsetWidth || 800) + 'px';
  // Use same styles as slide-messages
  measurer.style.display = 'flex';
  measurer.style.flexDirection = 'column';
  measurer.style.gap = '6px';
  document.body.appendChild(measurer);

  for (let i = 0; i < messages.length; i++) {
    const line = createMessageLine(messages[i]);
    measurer.appendChild(line);

    if (measurer.scrollHeight > maxH && slides[slides.length - 1].length > 0) {
      // Overflowed — start new slide
      measurer.removeChild(line);
      slides.push([messages[i]]);
      measurer.innerHTML = '';
      const newLine = createMessageLine(messages[i]);
      measurer.appendChild(newLine);
    } else {
      slides[slides.length - 1].push(messages[i]);
    }

    if (slides[slides.length - 1].length >= MAX_MSGS_PER_SLIDE) {
      slides.push([]);
      measurer.innerHTML = '';
    }
  }

  document.body.removeChild(measurer);
  // Remove trailing empty slide
  if (slides.length > 1 && slides[slides.length - 1].length === 0) {
    slides.pop();
  }
  return slides;
}

function renderAllSlides() {
  slideContainer.innerHTML = '';
  slidePanel.innerHTML = '';

  if (messages.length === 0) {
    createSlide(0, []);
  } else {
    const slidesData = distributeMessages();
    slidesData.forEach((slideMessages, i) => {
      createSlide(i, slideMessages);
    });
  }

  // Add input to last slide
  addInputToLastSlide();
  updateStatus();
  updateThumbnails();
}

function createSlide(index, slideMessages) {
  const slide = document.createElement('div');
  slide.className = 'slide';
  slide.dataset.slideIndex = index;

  // Title
  const title = document.createElement('div');
  title.className = 'slide-title';
  title.textContent = slideTitles[index] || `슬라이드 ${index + 1}`;
  slide.appendChild(title);

  // Messages container
  const msgContainer = document.createElement('div');
  msgContainer.className = 'slide-messages';
  msgContainer.id = `slide-msgs-${index}`;

  slideMessages.forEach(msg => {
    msgContainer.appendChild(createMessageLine(msg));
  });

  slide.appendChild(msgContainer);
  slideContainer.appendChild(slide);

  // Create thumbnail
  createThumbnail(index, slideMessages);
}

function createMessageLine(msg) {
  const line = document.createElement('div');
  line.className = 'msg-line';
  line.innerHTML = `<span class="msg-bullet">${msg.bullet || '○'}</span><span>${escapeHtml(msg.text)}</span>`;
  return line;
}

function addInputToLastSlide() {
  const slides = slideContainer.querySelectorAll('.slide');
  const lastSlide = slides[slides.length - 1];
  if (!lastSlide) return;

  const msgContainer = lastSlide.querySelector('.slide-messages');

  const inputLine = document.createElement('div');
  inputLine.className = 'input-line';
  inputLine.innerHTML = `<span class="input-bullet">${myBullet}</span><input type="text" class="inline-input" id="chat-input" placeholder="" autocomplete="off">`;
  msgContainer.appendChild(inputLine);

  const chatInput = document.getElementById('chat-input');
  setupInputHandlers(chatInput);
}

function setupInputHandlers(chatInput) {
  let isComposing = false;

  chatInput.addEventListener('compositionstart', () => { isComposing = true; });
  chatInput.addEventListener('compositionend', () => { isComposing = false; });

  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !isComposing) {
      e.preventDefault();
      const text = chatInput.value.trim();
      if (text && currentRoomId) {
        socket.emit('send-message', { roomId: currentRoomId, text });
        chatInput.value = '';
      }
    }
    if (e.key === 'Escape') {
      showHome();
    }
  });

  // Keep focus
  document.addEventListener('click', (e) => {
    if (chatScreen.classList.contains('active') &&
        !e.target.closest('.modal-overlay') &&
        !e.target.closest('.share-btn') &&
        !e.target.closest('.close-btn') &&
        !e.target.closest('.ribbon-tab') &&
        !e.target.closest('.slide-thumb')) {
      chatInput.focus();
    }
  });
}

// ===== THUMBNAILS =====
function createThumbnail(index, slideMessages) {
  const thumb = document.createElement('div');
  thumb.className = 'slide-thumb' + (index === getActiveSlideIndex() ? ' active' : '');
  thumb.dataset.slideIndex = index;

  const number = document.createElement('div');
  number.className = 'slide-thumb-number';
  number.textContent = index + 1;

  const content = document.createElement('div');
  content.className = 'slide-thumb-content';

  const titleEl = document.createElement('div');
  titleEl.className = 'thumb-title';
  titleEl.textContent = slideTitles[index] || `슬라이드 ${index + 1}`;
  content.appendChild(titleEl);

  slideMessages.forEach(msg => {
    const line = document.createElement('div');
    line.className = 'thumb-line';
    line.textContent = `${msg.bullet || '○'} ${msg.text}`;
    content.appendChild(line);
  });

  thumb.appendChild(number);
  thumb.appendChild(content);
  slidePanel.appendChild(thumb);

  thumb.addEventListener('click', () => {
    scrollToSlide(index);
  });
}

function updateThumbnails() {
  // Rebuild thumbnails from actual rendered slides
  slidePanel.innerHTML = '';
  const slides = slideContainer.querySelectorAll('.slide');
  slides.forEach((slide, i) => {
    const msgLines = slide.querySelectorAll('.msg-line');
    const slideMessages = [];
    msgLines.forEach(line => {
      const bullet = line.querySelector('.msg-bullet')?.textContent || '○';
      const text = line.querySelector('span:last-child')?.textContent || '';
      slideMessages.push({ bullet, text });
    });
    createThumbnail(i, slideMessages);
  });
}

function getActiveSlideIndex() {
  const slides = slideContainer.querySelectorAll('.slide');
  return Math.max(0, slides.length - 1);
}

function scrollToSlide(index) {
  const slides = slideContainer.querySelectorAll('.slide');
  if (slides[index]) {
    slides[index].scrollIntoView({ behavior: 'smooth', block: 'start' });
    // Update active thumbnail
    slidePanel.querySelectorAll('.slide-thumb').forEach((t, i) => {
      t.classList.toggle('active', i === index);
    });
  }
}

// ===== MESSAGE HANDLING =====
function appendMessage(msg) {
  messages.push(msg);

  // Try adding to current last slide
  const slides = slideContainer.querySelectorAll('.slide');
  const lastSlide = slides[slides.length - 1];

  if (lastSlide) {
    const msgContainer = lastSlide.querySelector('.slide-messages');
    const inputLine = msgContainer.querySelector('.input-line');
    const line = createMessageLine(msg);

    if (inputLine) {
      msgContainer.insertBefore(line, inputLine);
    } else {
      msgContainer.appendChild(line);
    }

    // Check if the slide content now overflows
    const maxH = getMaxContentHeight();
    if (msgContainer.scrollHeight > maxH) {
      // Overflowed — re-render all slides to redistribute
      renderAllSlides();
      const newSlideCount = slideContainer.querySelectorAll('.slide').length;
      scrollToSlide(newSlideCount - 1);
    } else {
      updateThumbnails();
    }
  }

  updateStatus();

  // Scroll input into view
  const input = document.querySelector('.inline-input');
  if (input) {
    input.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function updateStatus() {
  const slideCount = Math.max(1, slideContainer.querySelectorAll('.slide').length);
  slideInfo.textContent = `슬라이드 ${slideCount}/${slideCount}`;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ===== SOCKET EVENTS =====
socket.on('room-joined', (roomData) => {
  showChat(roomData);
  if (roomData.messages && roomData.messages.length > 0) {
    // Set my bullet from the first available
    myBullet = '○'; // Will be set by server on first message
  }
});

socket.on('new-message', (msg) => {
  appendMessage(msg);
  // Update my bullet for next message
  if (!myBullet || myBullet === '○') {
    // Will use whatever server assigns
  }
});

socket.on('user-count', (count) => {
  onlineCount.textContent = count;
});

// ===== NAVIGATION =====
backBtn.addEventListener('click', showHome);

document.getElementById('tab-file').addEventListener('click', showHome);
document.getElementById('tab-home').addEventListener('click', (e) => {
  if (chatScreen.classList.contains('active')) {
    // Stay in chat, just highlight tab
    document.querySelectorAll('.ribbon-tab').forEach(t => t.classList.remove('active'));
    e.target.classList.add('active');
  } else {
    showHome();
  }
});

document.getElementById('btn-home').addEventListener('click', showHome);

// ===== NEW ROOM =====
newDocCard.addEventListener('click', () => { modalNew.style.display = 'flex'; modalRoomName.focus(); });
document.getElementById('btn-new').addEventListener('click', () => { modalNew.style.display = 'flex'; modalRoomName.focus(); });
modalCancel.addEventListener('click', () => { modalNew.style.display = 'none'; modalRoomName.value = ''; });

modalCreate.addEventListener('click', () => {
  let name = modalRoomName.value.trim() || '새 프레젠테이션';
  if (!name.endsWith('.pptx')) name += '.pptx';
  modalNew.style.display = 'none';
  modalRoomName.value = '';

  socket.emit('create-room', name, (roomId) => {
    window.history.pushState({}, '', '/ppt/room/' + roomId);
    socket.emit('join-room', roomId);
  });
});

modalRoomName.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') modalCreate.click();
  if (e.key === 'Escape') { modalNew.style.display = 'none'; modalRoomName.value = ''; }
});

// ===== SHARE =====
shareBtn.addEventListener('click', () => {
  if (!currentRoomId) return;
  shareLink.value = window.location.origin + '/ppt/room/' + currentRoomId;
  modalShare.style.display = 'flex';
});

copyLink.addEventListener('click', () => {
  navigator.clipboard.writeText(shareLink.value);
  copyLink.textContent = '복사됨!';
  setTimeout(() => { copyLink.textContent = '복사'; }, 1500);
});

closeShare.addEventListener('click', () => { modalShare.style.display = 'none'; });
modalShare.addEventListener('click', (e) => { if (e.target === modalShare) modalShare.style.display = 'none'; });
modalNew.addEventListener('click', (e) => { if (e.target === modalNew) { modalNew.style.display = 'none'; modalRoomName.value = ''; } });

// ===== AUTO-JOIN FROM URL =====
const pathMatch = window.location.pathname.match(/\/ppt\/room\/([^/]+)/);
if (pathMatch) {
  socket.emit('join-room', pathMatch[1]);
}
