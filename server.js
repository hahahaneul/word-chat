const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// Direct room join via URL: /room/:roomId
app.get('/room/:roomId', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// In-memory chat rooms
const rooms = new Map();

// Predefined fake document titles for subheadings
const sectionTitles = [
  '1. 문제 인식 (Problem)_창업 아이템의 필요성',
  '2. 솔루션 (Solution)_제품/서비스 개요',
  '3. 시장 분석 (Market Analysis)',
  '4. 비즈니스 모델 (Business Model)',
  '5. 경쟁 우위 (Competitive Advantage)',
  '6. 마케팅 전략 (Marketing Strategy)',
  '7. 재무 계획 (Financial Plan)',
  '8. 팀 구성 (Team)',
  '9. 향후 계획 (Roadmap)',
  '10. 결론 및 요약 (Conclusion)',
];

function createRoom(name, creatorId) {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const room = {
    id,
    name,
    messages: [],
    createdAt: new Date().toISOString(),
    users: new Set(),
  };
  rooms.set(id, room);
  return room;
}

// Create some default rooms
createRoom('[별첨 1] 2026년 예비창업패키지 사업계획서 양식.docx');
createRoom('Appendix A_심사양식.docx');
createRoom('한글표시사항 밀키트.docx');

io.on('connection', (socket) => {
  // Send room list
  function sendRoomList() {
    const roomList = Array.from(rooms.values()).map((r) => ({
      id: r.id,
      name: r.name,
      createdAt: r.createdAt,
      userCount: r.users.size,
      messageCount: r.messages.length,
    }));
    io.emit('room-list', roomList);
  }

  sendRoomList();

  socket.on('create-room', (name) => {
    createRoom(name || '새 문서.docx');
    sendRoomList();
  });

  socket.on('join-room', (roomId) => {
    const room = rooms.get(roomId);
    if (!room) return;

    // Leave previous rooms
    for (const [id, r] of rooms) {
      if (r.users.has(socket.id)) {
        r.users.delete(socket.id);
        socket.leave(id);
      }
    }

    room.users.add(socket.id);
    socket.join(roomId);
    socket.emit('room-joined', {
      id: room.id,
      name: room.name,
      messages: room.messages,
    });
    sendRoomList();
  });

  socket.on('send-message', ({ roomId, text }) => {
    const room = rooms.get(roomId);
    if (!room || !text.trim()) return;

    const msgIndex = room.messages.length;
    // Every ~15 messages (roughly 3 pages), insert a section heading
    const sectionIdx = Math.floor(msgIndex / 15);
    let sectionHeading = null;
    if (msgIndex > 0 && msgIndex % 15 === 0 && sectionIdx <= sectionTitles.length) {
      sectionHeading = sectionTitles[sectionIdx - 1] || `${sectionIdx + 1}. 추가 사항`;
    }

    const message = {
      id: Date.now().toString(36),
      text: text.trim(),
      timestamp: new Date().toISOString(),
      sectionHeading,
    };

    room.messages.push(message);
    io.to(roomId).emit('new-message', message);
  });

  socket.on('leave-room', () => {
    for (const [id, r] of rooms) {
      if (r.users.has(socket.id)) {
        r.users.delete(socket.id);
        socket.leave(id);
      }
    }
    sendRoomList();
  });

  socket.on('disconnect', () => {
    for (const [, r] of rooms) {
      r.users.delete(socket.id);
    }
    sendRoomList();
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
