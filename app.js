/* ===== Supabase Client ===== */
const supabaseClient = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

/* ===== State ===== */
const state = {
  user: null,
  notes: [],
  activeId: null,
  search: '',
  saveTimer: null,
};

/* ===== Helpers ===== */
function uid() { return crypto.randomUUID ? crypto.randomUUID() : ('n_' + Date.now().toString(36) + Math.random().toString(36).slice(2,8)); }

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
  t._timer = setTimeout(() => t.classList.add('hidden'), 3200);
}

/* ===== Theme ===== */
function applyTheme(theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
}
function initTheme() {
  const saved = localStorage.getItem('mulahzaty_theme');
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(saved || (prefersDark ? 'dark' : 'light'));
}
function toggleTheme() {
  const isDark = document.documentElement.classList.contains('dark');
  const next = isDark ? 'light' : 'dark';
  applyTheme(next);
  localStorage.setItem('mulahzaty_theme', next);
}

function showAuth() {
  document.getElementById('authView').classList.remove('hidden');
  document.getElementById('appView').classList.add('hidden');
}
function showApp() {
  document.getElementById('authView').classList.add('hidden');
  document.getElementById('appView').classList.remove('hidden');
}

function mapNote(row) {
  return {
    id: row.id,
    title: row.title || '',
    content: row.content || '',
    color: row.color || '',
    pinned: !!row.pinned,
    createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
    updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : Date.now(),
  };
}

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

/* ===== Auth ===== */
async function register(name, email, password) {
  const { data, error } = await supabaseClient.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: { data: { name: name.trim() } },
  });
  if (error) throw error;
  if (!data.session) {
    // email confirmation required
    toast('تم إنشاء الحساب. يرجى تأكيد بريدك الإلكتروني ثم تسجيل الدخول.', 'success');
    return null;
  }
  return data.user;
}

async function login(email, password) {
  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });
  if (error) throw error;
  return data.user;
}

async function logout() {
  flushSave();
  await supabaseClient.auth.signOut();
  state.user = null; state.notes = []; state.activeId = null;
  showAuth();
}

function enterApp(user) {
  if (state.user && state.user.id === user.id) return;
  state.user = user;
  const name = (user.user_metadata && user.user_metadata.name) || user.email.split('@')[0];
  document.getElementById('userName').textContent = name;
  document.getElementById('userAvatar').textContent = (name || '?').charAt(0).toUpperCase();
  showApp();
  loadNotes();
}

/* ===== Notes ===== */
async function loadNotes() {
  state.notes = [];
  renderNotesList();
  const listEl = document.getElementById('notesList');
  listEl.innerHTML = '<div class="notes-empty"><div>جارٍ تحميل الملاحظات...</div></div>';
  const { data, error } = await supabaseClient
    .from('notes')
    .select('*')
    .order('updated_at', { ascending: false });
  if (error) {
    toast('فشل تحميل الملاحظات: ' + error.message, 'error');
    state.notes = [];
    renderNotesList();
    showEmpty();
    return;
  }
  state.notes = (data || []).map(mapNote);
  renderNotesList();
  if (state.notes.length) openNote(state.notes.slice().sort(sortNotes)[0].id);
  else showEmpty();
}

async function createNote() {
  if (!state.user) return;
  const { data, error } = await supabaseClient
    .from('notes')
    .insert({ user_id: state.user.id, title: '', content: '', color: '', pinned: false })
    .select()
    .single();
  if (error) { toast('فشل إنشاء ملاحظة: ' + error.message, 'error'); return; }
  const note = mapNote(data);
  state.notes.unshift(note);
  state.activeId = note.id;
  renderNotesList();
  openNote(note.id);
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
  document.querySelectorAll('.color-dot').forEach(d => d.classList.toggle('selected', d.dataset.color === (note.color || '')));
  document.getElementById('pinBtn').style.color = note.pinned ? 'var(--accent)' : '';
  updateMeta(note);
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
  const title = titleEl.value;
  const content = contentEl.value;
  note.title = title; note.content = content; note.updatedAt = Date.now();
  supabaseClient.from('notes').update({ title, content }).eq('id', note.id).then(({ error }) => {
    if (error) toast('فشل الحفظ: ' + error.message, 'error');
  });
}

function scheduleSave() {
  const status = document.getElementById('saveStatus');
  status.textContent = 'جارٍ الحفظ...';
  status.className = 'save-status saving';
  clearTimeout(state.saveTimer);
  const targetId = state.activeId;
  state.saveTimer = setTimeout(async () => {
    if (state.activeId !== targetId) return;
    const note = state.notes.find(n => n.id === targetId);
    if (!note) return;
    const title = document.getElementById('noteTitle').value;
    const content = document.getElementById('noteContent').value;
    note.title = title; note.content = content; note.updatedAt = Date.now();
    const { error } = await supabaseClient.from('notes').update({ title, content }).eq('id', targetId);
    if (error) { toast('فشل الحفظ: ' + error.message, 'error'); return; }
    renderNotesList();
    updateMeta(note);
    const st = document.getElementById('saveStatus');
    st.textContent = 'محفوظ';
    st.className = 'save-status saved';
    setTimeout(() => { st.className = 'save-status'; st.textContent = 'محفوظ'; }, 1200);
  }, 600);
}

async function deleteNote(id) {
  flushSave();
  if (!confirm('هل أنت متأكد من حذف هذه الملاحظة؟ لا يمكن التراجع.')) return;
  const { error } = await supabaseClient.from('notes').delete().eq('id', id);
  if (error) { toast('فشل الحذف: ' + error.message, 'error'); return; }
  state.notes = state.notes.filter(n => n.id !== id);
  state.activeId = null;
  renderNotesList();
  if (state.notes.length) openNote(state.notes.slice().sort(sortNotes)[0].id);
  else showEmpty();
  toast('تم حذف الملاحظة', 'success');
}

async function togglePin() {
  const note = state.notes.find(n => n.id === state.activeId);
  if (!note) return;
  const newVal = !note.pinned;
  const { error } = await supabaseClient.from('notes').update({ pinned: newVal }).eq('id', note.id);
  if (error) { toast('فشل التحديث: ' + error.message, 'error'); return; }
  note.pinned = newVal;
  note.updatedAt = Date.now();
  openNote(note.id);
  toast(note.pinned ? 'تم تثبيت الملاحظة' : 'تم إلغاء التثبيت', 'success');
}

async function setColor(color) {
  const note = state.notes.find(n => n.id === state.activeId);
  if (!note) return;
  const { error } = await supabaseClient.from('notes').update({ color }).eq('id', note.id);
  if (error) { toast('فشل التحديث: ' + error.message, 'error'); return; }
  note.color = color;
  note.updatedAt = Date.now();
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
  list.querySelectorAll('.note-item').forEach(el => {
    el.addEventListener('click', () => openNote(el.dataset.id));
  });
  document.getElementById('notesCount').textContent = `${state.notes.length} ملاحظة`;
}

/* ===== Event wiring ===== */
function wireEvents() {
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

  document.querySelectorAll('.toggle-pw').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = document.getElementById(btn.dataset.target);
      input.type = input.type === 'password' ? 'text' : 'password';
    });
  });

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
      err.textContent = ex.message || 'فشل تسجيل الدخول';
    }
  });

  document.getElementById('registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('regName').value;
    const email = document.getElementById('regEmail').value;
    const pw = document.getElementById('regPassword').value;
    const pw2 = document.getElementById('regPassword2').value;
    const err = document.getElementById('registerError');
    err.textContent = '';
    if (pw !== pw2) { err.textContent = 'كلمتا المرور غير متطابقتين'; return; }
    if (pw.length < 6) { err.textContent = 'كلمة المرور يجب أن تكون 6 أحرف على الأقل'; return; }
    try {
      const user = await register(name, email, pw);
      if (user) enterApp(user);
    } catch (ex) {
      err.textContent = ex.message || 'فشل إنشاء الحساب';
    }
  });

  document.getElementById('logoutBtn').addEventListener('click', () => {
    if (confirm('هل تريد تسجيل الخروج؟')) logout();
  });

  const themeBtn = document.getElementById('themeToggleBtn');
  if (themeBtn) themeBtn.addEventListener('click', toggleTheme);

  document.getElementById('newNoteBtn').addEventListener('click', createNote);
  document.getElementById('emptyNewBtn').addEventListener('click', createNote);

  document.getElementById('noteTitle').addEventListener('input', scheduleSave);
  document.getElementById('noteContent').addEventListener('input', scheduleSave);

  document.getElementById('pinBtn').addEventListener('click', togglePin);

  document.getElementById('deleteBtn').addEventListener('click', () => {
    if (state.activeId) deleteNote(state.activeId);
  });

  document.querySelectorAll('.color-dot').forEach(dot => {
    dot.addEventListener('click', () => setColor(dot.dataset.color));
  });

  document.getElementById('searchInput').addEventListener('input', (e) => {
    state.search = e.target.value;
    renderNotesList();
  });

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
      if (state.user) { e.preventDefault(); createNote(); }
    }
  });
}

/* ===== Init ===== */
let _initialized = false;
async function init() {
  if (_initialized) return;
  _initialized = true;
  initTheme();
  wireEvents();

  // Listen to auth state changes
  supabaseClient.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' && session && session.user) {
      enterApp(session.user);
    } else if (event === 'SIGNED_OUT') {
      state.user = null; state.notes = []; state.activeId = null;
      showAuth();
    }
  });

  // Check existing session
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session && session.user) {
    enterApp(session.user);
  } else {
    showAuth();
  }
}

initTheme();
window.addEventListener('beforeunload', flushSave);
document.addEventListener('DOMContentLoaded', init);
if (document.readyState !== 'loading') init();
