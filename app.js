/* ===== Storage Keys ===== */
const K = {
  users: 'mulahzaty_users',
  session: 'mulahzaty_session',
  notes: (uid) => `mulahzaty_notes_${uid}`,
};

/* ===== State ===== */
const state = {
  user: null,
  notes: [],
  activeId: null,
  search: '',
  saveTimer: null,
};

/* ===== Helpers ===== */
function uid() { return 'n_' + Date.now().toString(36) + Math.random().toString(36).slice(2,8); }
function userId() { return 'u_' + Date.now().toString(36) + Math.random().toString(36).slice(2,8); }

async function hashPassword(pw) {
  if (window.crypto && window.crypto.subtle) {
    try {
      const enc = new TextEncoder().encode(pw);
      const buf = await crypto.subtle.digest('SHA-256', enc);
      return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
    } catch (e) { /* fallback */ }
  }
  let h = 5381;
  for (let i = 0; i < pw.length; i++) h = ((h << 5) + h) + pw.charCodeAt(i);
  return 'fb_' + (h >>> 0).toString(16);
}

function getUsers() { try { return JSON.parse(localStorage.getItem(K.users) || '[]'); } catch { return []; } }
function setUsers(u) { localStorage.setItem(K.users, JSON.stringify(u)); }
function getSession() { return localStorage.getItem(K.session); }
function setSession(id) { if (id) localStorage.setItem(K.session, id); else localStorage.removeItem(K.session); }

function loadNotes() {
  try { state.notes = JSON.parse(localStorage.getItem(K.notes(state.user.id)) || '[]'); }
  catch { state.notes = []; }
}
function saveNotes() {
  localStorage.setItem(K.notes(state.user.id), JSON.stringify(state.notes));
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function formatDate(ts) {
  const d = new Date(ts);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return 'الآن';
  if (diff < 3600000) return `منذ ${Math.floor(diff/60000)} د`;
  if (diff < 86400000) return `منذ ${Math.floor(diff/3600000)} س`;
  return d.toLocaleDateString('ar-SA', { year:'numeric', month:'short', day:'numeric' });
}

function toast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast' + (type ? ' ' + type : '');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.add('hidden'), 2800);
}

/* ===== Auth ===== */
function showAuth() {
  document.getElementById('authView').classList.remove('hidden');
  document.getElementById('appView').classList.add('hidden');
}
function showApp() {
  document.getElementById('authView').classList.add('hidden');
  document.getElementById('appView').classList.remove('hidden');
}

async function register(name, email, password) {
  email = email.trim().toLowerCase();
  const users = getUsers();
  if (users.some(u => u.email === email)) throw new Error('البريد الإلكتروني مستخدم بالفعل');
  if (password.length < 6) throw new Error('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
  const hash = await hashPassword(password);
  const user = { id: userId(), name: name.trim(), email, password: hash, createdAt: Date.now() };
  users.push(user);
  setUsers(users);
  return user;
}

async function login(email, password) {
  email = email.trim().toLowerCase();
  const users = getUsers();
  const user = users.find(u => u.email === email);
  if (!user) throw new Error('البريد الإلكتروني أو كلمة المرور غير صحيحة');
  const hash = await hashPassword(password);
  if (hash !== user.password) throw new Error('البريد الإلكتروني أو كلمة المرور غير صحيحة');
  return user;
}

function enterApp(user) {
  state.user = { id: user.id, name: user.name, email: user.email };
  setSession(user.id);
  loadNotes();
  document.getElementById('userName').textContent = user.name;
  document.getElementById('userAvatar').textContent = (user.name || '?').charAt(0).toUpperCase();
  showApp();
  renderNotesList();
  if (state.notes.length) openNote(state.notes.slice().sort(sortNotes)[0].id);
  else showEmpty();
}

function logout() {
  flushSave();
  state.user = null; state.notes = []; state.activeId = null;
  setSession(null);
  showAuth();
}

/* ===== Notes logic ===== */
function sortNotes(a, b) {
  if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
  return (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt);
}

function filteredNotes() {
  const q = state.search.trim().toLowerCase();
  let list = state.notes.slice();
  if (q) list = list.filter(n => (n.title + ' ' + n.content).toLowerCase().includes(q));
  list.sort(sortNotes);
  return list;
}

function createNote() {
  const note = {
    id: uid(),
    title: '',
    content: '',
    color: '',
    pinned: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  state.notes.unshift(note);
  saveNotes();
  state.activeId = note.id;
  renderNotesList();
  openNote(note.id);
  // focus title
  setTimeout(() => document.getElementById('noteTitle').focus(), 50);
}

function openNote(id) {
  if (id !== state.activeId) flushSave();
  const note = state.notes.find(n => n.id === id);
  if (!note) return;
  state.activeId = id;
  document.getElementById('emptyState').classList.add('hidden');
  document.getElementById('editor').classList.remove('hidden');
  const titleEl = document.getElementById('noteTitle');
  const contentEl = document.getElementById('noteContent');
  titleEl.value = note.title;
  contentEl.value = note.content;
  // color
  document.querySelectorAll('.color-dot').forEach(d => d.classList.toggle('selected', d.dataset.color === (note.color || '')));
  // pin
  document.getElementById('pinBtn').classList.toggle('pinned-active', !!note.pinned);
  document.getElementById('pinBtn').style.color = note.pinned ? 'var(--accent)' : '';
  updateMeta(note);
  // editor bg tint
  applyColor(note.color);
  renderNotesList();
}

function applyColor(color) {
  const editor = document.getElementById('editor');
  editor.style.background = color ? color : '';
}

function updateMeta(note) {
  const el = document.getElementById('editorMeta');
  el.innerHTML = `<span>أنشئت: ${formatDate(note.createdAt)}</span><span>آخر تعديل: ${formatDate(note.updatedAt)}</span><span>${(note.content || '').length} حرف</span>`;
}

function flushSave() {
  if (!state.saveTimer) return;
  clearTimeout(state.saveTimer);
  state.saveTimer = null;
  const note = state.notes.find(n => n.id === state.activeId);
  if (!note) return;
  const titleEl = document.getElementById('noteTitle');
  const contentEl = document.getElementById('noteContent');
  if (!titleEl || !contentEl) return;
  note.title = titleEl.value;
  note.content = contentEl.value;
  note.updatedAt = Date.now();
  saveNotes();
}

function scheduleSave() {
  const status = document.getElementById('saveStatus');
  status.textContent = 'جارٍ الحفظ...';
  status.className = 'save-status saving';
  clearTimeout(state.saveTimer);
  const targetId = state.activeId;
  state.saveTimer = setTimeout(() => {
    if (state.activeId !== targetId) return; // switched away; already flushed
    const note = state.notes.find(n => n.id === targetId);
    if (!note) return;
    note.title = document.getElementById('noteTitle').value;
    note.content = document.getElementById('noteContent').value;
    note.updatedAt = Date.now();
    saveNotes();
    renderNotesList();
    updateMeta(note);
    const st = document.getElementById('saveStatus');
    st.textContent = 'محفوظ';
    st.className = 'save-status saved';
    setTimeout(() => { st.className = 'save-status'; st.textContent = 'محفوظ'; }, 1200);
  }, 600);
}

function deleteNote(id) {
  flushSave();
  if (!confirm('هل أنت متأكد من حذف هذه الملاحظة؟ لا يمكن التراجع.')) return;
  state.notes = state.notes.filter(n => n.id !== id);
  saveNotes();
  state.activeId = null;
  renderNotesList();
  if (state.notes.length) openNote(state.notes.slice().sort(sortNotes)[0].id);
  else showEmpty();
  toast('تم حذف الملاحظة', 'success');
}

function togglePin() {
  const note = state.notes.find(n => n.id === state.activeId);
  if (!note) return;
  note.pinned = !note.pinned;
  note.updatedAt = Date.now();
  saveNotes();
  openNote(note.id);
  toast(note.pinned ? 'تم تثبيت الملاحظة' : 'تم إلغاء التثبيت', 'success');
}

function setColor(color) {
  const note = state.notes.find(n => n.id === state.activeId);
  if (!note) return;
  note.color = color;
  note.updatedAt = Date.now();
  saveNotes();
  document.querySelectorAll('.color-dot').forEach(d => d.classList.toggle('selected', d.dataset.color === color));
  applyColor(color);
  renderNotesList();
}

function showEmpty() {
  flushSave();
  state.activeId = null;
  document.getElementById('emptyState').classList.remove('hidden');
  document.getElementById('editor').classList.add('hidden');
  renderNotesList();
}

function renderNotesList() {
  const list = document.getElementById('notesList');
  const items = filteredNotes();
  if (items.length === 0) {
    list.innerHTML = `<div class="notes-empty">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
      <div>${state.search ? 'لا توجد نتائج' : 'لا توجد ملاحظات بعد'}</div>
    </div>`;
  } else {
    list.innerHTML = items.map(n => {
      const title = n.title.trim() || 'بدون عنوان';
      const preview = (n.content || '').trim().replace(/\s+/g,' ') || '...';
      const colorStyle = n.color ? `--note-color:${n.color};` : '';
      return `<div class="note-item ${n.id === state.activeId ? 'active' : ''} ${n.pinned ? 'pinned' : ''} ${n.color ? 'has-color' : ''}" data-id="${n.id}" style="${colorStyle}">
        <div class="note-item-title">${escapeHtml(title)}</div>
        <div class="note-item-preview">${escapeHtml(preview)}</div>
        <div class="note-item-meta">
          <span class="note-item-date">${formatDate(n.updatedAt || n.createdAt)}</span>
          ${n.color ? `<span class="note-item-color" style="background:${n.color}"></span>` : ''}
        </div>
      </div>`;
    }).join('');
  }
  // click handlers
  list.querySelectorAll('.note-item').forEach(el => {
    el.addEventListener('click', () => openNote(el.dataset.id));
  });
  // count
  document.getElementById('notesCount').textContent = `${state.notes.length} ملاحظة`;
}

/* ===== Event wiring ===== */
function wireEvents() {
  // auth tabs
  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const isLogin = tab.dataset.tab === 'login';
      document.getElementById('loginForm').classList.toggle('hidden', !isLogin);
      document.getElementById('registerForm').classList.toggle('hidden', isLogin);
      document.getElementById('loginError').textContent = '';
      document.getElementById('registerError').textContent = '';
    });
  });

  // toggle password
  document.querySelectorAll('.toggle-pw').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = document.getElementById(btn.dataset.target);
      input.type = input.type === 'password' ? 'text' : 'password';
    });
  });

  // login
  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const pw = document.getElementById('loginPassword').value;
    const err = document.getElementById('loginError');
    err.textContent = '';
    try {
      const user = await login(email, pw);
      enterApp(user);
    } catch (ex) {
      err.textContent = ex.message;
    }
  });

  // register
  document.getElementById('registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('regName').value;
    const email = document.getElementById('regEmail').value;
    const pw = document.getElementById('regPassword').value;
    const pw2 = document.getElementById('regPassword2').value;
    const err = document.getElementById('registerError');
    err.textContent = '';
    if (pw !== pw2) { err.textContent = 'كلمتا المرور غير متطابقتين'; return; }
    try {
      const user = await register(name, email, pw);
      toast('تم إنشاء الحساب بنجاح', 'success');
      // auto login
      enterApp(user);
    } catch (ex) {
      err.textContent = ex.message;
    }
  });

  // logout
  document.getElementById('logoutBtn').addEventListener('click', () => {
    if (confirm('هل تريد تسجيل الخروج؟')) logout();
  });

  // new note
  document.getElementById('newNoteBtn').addEventListener('click', createNote);
  document.getElementById('emptyNewBtn').addEventListener('click', createNote);

  // editor inputs
  document.getElementById('noteTitle').addEventListener('input', scheduleSave);
  document.getElementById('noteContent').addEventListener('input', scheduleSave);

  // pin
  document.getElementById('pinBtn').addEventListener('click', togglePin);

  // delete
  document.getElementById('deleteBtn').addEventListener('click', () => {
    if (state.activeId) deleteNote(state.activeId);
  });

  // color picker
  document.querySelectorAll('.color-dot').forEach(dot => {
    dot.addEventListener('click', () => setColor(dot.dataset.color));
  });

  // search
  document.getElementById('searchInput').addEventListener('input', (e) => {
    state.search = e.target.value;
    renderNotesList();
  });

  // keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
      if (state.user) { e.preventDefault(); createNote(); }
    }
    if (e.key === 'Escape' && state.activeId) {
      // blur
    }
  });
}

/* ===== Init ===== */
let _initialized = false;
function init() {
  if (_initialized) return;
  _initialized = true;
  wireEvents();
  const sid = getSession();
  if (sid) {
    const users = getUsers();
    const user = users.find(u => u.id === sid);
    if (user) { enterApp(user); return; }
    setSession(null);
  }
  showAuth();
}

window.addEventListener('beforeunload', flushSave);
document.addEventListener('DOMContentLoaded', init);
if (document.readyState !== 'loading') init();
