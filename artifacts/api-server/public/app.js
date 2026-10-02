// ── State ──────────────────────────────────────────────────────────────
let currentUser = null;
const likedPosts = new Set(); // rastreia posts curtidos nesta sessão
let currentFeedMode = 'general';

// ── Tab switching ──────────────────────────────────────────────────────
function switchTab(tab) {
  const isLogin = tab === "login";
  document
    .getElementById("tab-login")
    .classList.toggle("active", isLogin);
  document
    .getElementById("tab-register")
    .classList.toggle("active", !isLogin);
  document.getElementById("login-form").style.display = isLogin
    ? "block"
    : "none";
  document.getElementById("register-form").style.display = isLogin
    ? "none"
    : "block";
  clearAuthMsg();
}

// ── Auth messages ──────────────────────────────────────────────────────
function showAuthMsg(text, type = "error") {
  const el = document.getElementById("auth-msg");
  el.textContent = text;
  el.className = type;
}

function clearAuthMsg() {
  const el = document.getElementById("auth-msg");
  el.textContent = "";
  el.className = "";
}

// ── Toast ──────────────────────────────────────────────────────────────
let toastTimeout;
function showToast(text, type = "") {
  const el = document.getElementById("toast");
  el.textContent = text;
  el.className = `show ${type ? type + "-toast" : ""}`;
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => el.classList.remove("show"), 2800);
}

// ── Avatar helper ──────────────────────────────────────────────────────
function getInitial(name) {
  return name ? name[0].toUpperCase() : "?";
}

// ── Login ──────────────────────────────────────────────────────────────
async function handleLogin(e) {
  e.preventDefault();
  clearAuthMsg();
  const name = document.getElementById("login-name").value.trim();
  const password = document.getElementById("login-pass").value;
  const btn = document.getElementById("btn-login");

  if (!name || !password) {
    showAuthMsg("Preencha nome e senha.");
    return;
  }

  btn.disabled = true;
  btn.textContent = "Entrando...";

  try {
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, password }),
    });
    const data = await res.json();

    if (!res.ok) {
      showAuthMsg(data.error || "Erro ao entrar.");
    } else {
      currentUser = data.user;
      enterApp();
    }
  } catch {
    showAuthMsg("Não foi possível conectar ao servidor.");
  } finally {
    btn.disabled = false;
    btn.textContent = "Entrar";
  }
}

// ── Register ───────────────────────────────────────────────────────────
async function handleRegister(e) {
  e.preventDefault();
  clearAuthMsg();
  const name = document.getElementById("reg-name").value.trim();
  const email = document.getElementById("reg-email").value.trim();
  const password = document.getElementById("reg-pass").value;
  const btn = document.getElementById("btn-register");

  if (!name || !email || !password) {
    showAuthMsg("Preencha todos os campos.");
    return;
  }

  btn.disabled = true;
  btn.textContent = "Criando conta...";

  try {
    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });
    const data = await res.json();

    if (!res.ok) {
      showAuthMsg(data.error || "Erro ao criar conta.");
    } else {
      showAuthMsg(data.message + " Faça login.", "success");
      setTimeout(() => switchTab("login"), 1400);
    }
  } catch {
    showAuthMsg("Não foi possível conectar ao servidor.");
  } finally {
    btn.disabled = false;
    btn.textContent = "Criar conta";
  }
}

// ── Enter app ──────────────────────────────────────────────────────────
function enterApp() {
  document.getElementById("auth-screen").style.display = "none";
  document.getElementById("app-screen").style.display = "block";
  document.getElementById("header-name").textContent = currentUser.name;

  const av = document.getElementById("composer-avatar");
  av.textContent = getInitial(currentUser.name);

  loadFeed('general');
}

// ── Logout ─────────────────────────────────────────────────────────────
function handleLogout() {
  currentUser = null;
  likedPosts.clear();
  document.getElementById("app-screen").style.display = "none";
  document.getElementById("auth-screen").style.display = "flex";
  document.getElementById("login-name").value = "";
  document.getElementById("login-pass").value = "";
  document.getElementById("post-content").value = "";
  switchTab("login");
}

// ── Char counter ────────────────────────────────────────────────────────
function updateCharCount() {
  const len = document.getElementById("post-content").value.length;
  const el = document.getElementById("char-count");
  el.textContent = `${len} / 280`;
  el.className = len > 260 ? "danger" : len > 230 ? "warning" : "";
}

// ── Create post ─────────────────────────────────────────────────────────
async function handlePost() {
  const content = document.getElementById("post-content").value.trim();
  const msgEl = document.getElementById("post-msg");
  msgEl.textContent = "";
  msgEl.className = "";

  if (!content) {
    msgEl.textContent = "Escreva algo antes de publicar.";
    msgEl.className = "error";
    return;
  }

  const btn = document.getElementById("btn-post");
  btn.disabled = true;
  btn.textContent = "Publicando...";

  try {
    const res = await fetch("/api/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ author: currentUser.name, content }),
    });
    const data = await res.json();

    if (!res.ok) {
      msgEl.textContent = data.error || "Erro ao publicar.";
      msgEl.className = "error";
    } else {
      document.getElementById("post-content").value = "";
      updateCharCount();
      showToast("Post publicado!", "success");
      await loadFeed(currentFeedMode);
    }
  } catch {
    msgEl.textContent = "Não foi possível conectar ao servidor.";
    msgEl.className = "error";
  } finally {
    btn.disabled = false;
    btn.textContent = "Publicar";
  }
}

// ── Switch feed tab ─────────────────────────────────────────────────────
function switchFeedTab(mode) {
  currentFeedMode = mode;
  document.getElementById("tab-general").classList.toggle("active", mode === "general");
  document.getElementById("tab-following").classList.toggle("active", mode === "following");
  loadFeed(mode);
}

// ── Load feed ───────────────────────────────────────────────────────────
async function loadFeed(mode = 'general') {
  currentFeedMode = mode;
  const feed = document.getElementById("feed");
  feed.innerHTML = '<div class="spinner"></div>';

  try {
    const url = mode === 'following'
      ? `/api/posts?feed=following&author=${encodeURIComponent(currentUser.name)}`
      : '/api/posts?feed=general';
    const res = await fetch(url);
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || "Erro");

    if (!data.posts || data.posts.length === 0) {
      const emptyMsg = mode === 'following'
        ? '<p>Você ainda não segue ninguém, ou quem você segue não publicou nada.</p><small>Vá ao Feed Geral e siga alguns usuários!</small>'
        : '<p>Nenhuma postagem ainda</p><small>Seja o primeiro a publicar!</small>';
      feed.innerHTML = `
      <div class="feed-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M17 8h2a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-2v4l-4-4H9a2 2 0 0 1-2-2v-1"/>
          <path d="M15 3H7a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2l4 4V11h2a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2z"/>
        </svg>
        ${emptyMsg}
      </div>`;
      return;
    }

    feed.innerHTML = data.posts.map((post) => renderPost(post)).join("");

    // Restore liked + follow states in parallel
    const likedChecks = data.posts.map((post) =>
      fetch(`/api/posts/${post.id}/liked?author=${encodeURIComponent(currentUser.name)}`)
        .then((r) => r.json())
        .then((d) => ({ id: post.id, liked: d.liked }))
        .catch(() => ({ id: post.id, liked: false }))
    );
    const likedResults = await Promise.all(likedChecks);
    likedResults.forEach(({ id, liked }) => {
      if (liked) {
        likedPosts.add(id);
        const btn = document.getElementById(`like-btn-${id}`);
        if (btn) {
          btn.classList.add("liked");
          btn.querySelector("svg").setAttribute("fill", "currentColor");
        }
      }
    });

    // Check follow status for non-own posts
    await checkFollowStatuses(data.posts);
  } catch {
    feed.innerHTML = `<div class="feed-empty">
    <p style="color:var(--danger)">Erro ao carregar o feed.</p>
    <small>Verifique a conexão com o servidor.</small>
  </div>`;
  }
}

// ── Filter by user ──────────────────────────────────────────────────────
async function filterByUser(name) {
  const feed = document.getElementById("feed");
  feed.innerHTML = '<div class="spinner"></div>';

  // Deactivate feed tabs while viewing a user profile
  document.getElementById("tab-general").classList.remove("active");
  document.getElementById("tab-following").classList.remove("active");

  try {
    const res = await fetch(`/api/posts/user/${encodeURIComponent(name)}`);
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || "Erro");

    const backBtn = `<button class="btn-back" onclick="switchFeedTab(currentFeedMode)">← Voltar ao feed</button>`;

    if (!data.posts || data.posts.length === 0) {
      feed.innerHTML = backBtn + `
      <div class="feed-empty">
        <p>Nenhuma postagem de <strong>${escapeHtml(name)}</strong>.</p>
      </div>`;
      return;
    }

    feed.innerHTML = backBtn + data.posts.map((post) => renderPost(post)).join("");

    const likedChecks = data.posts.map((post) =>
      fetch(`/api/posts/${post.id}/liked?author=${encodeURIComponent(currentUser.name)}`)
        .then((r) => r.json())
        .then((d) => ({ id: post.id, liked: d.liked }))
        .catch(() => ({ id: post.id, liked: false }))
    );
    const results = await Promise.all(likedChecks);
    results.forEach(({ id, liked }) => {
      if (liked) {
        likedPosts.add(id);
        const btn = document.getElementById(`like-btn-${id}`);
        if (btn) {
          btn.classList.add("liked");
          btn.querySelector("svg").setAttribute("fill", "currentColor");
        }
      }
    });

    await checkFollowStatuses(data.posts);
  } catch {
    feed.innerHTML = `<button class="btn-back" onclick="switchFeedTab(currentFeedMode)">← Voltar ao feed</button>
    <div class="feed-empty"><p style="color:var(--danger)">Erro ao carregar posts do usuário.</p></div>`;
  }
}

// ── Follow helpers ──────────────────────────────────────────────────────
async function checkFollowStatuses(posts) {
  const otherPosts = posts.filter((p) => p.author !== currentUser?.name);
  if (!otherPosts.length) return;
  const checks = otherPosts.map((p) =>
    fetch(`/api/follow/status?follower=${encodeURIComponent(currentUser.name)}&following=${encodeURIComponent(p.author)}`)
      .then((r) => r.json())
      .then((d) => ({ postId: p.id, author: p.author, isFollowing: d.following }))
      .catch(() => ({ postId: p.id, author: p.author, isFollowing: false }))
  );
  const results = await Promise.all(checks);
  results.forEach(({ postId, isFollowing }) => {
    const btn = document.getElementById(`follow-btn-${postId}`);
    if (!btn) return;
    btn.style.display = "";
    btn.textContent = isFollowing ? "Seguindo" : "Seguir";
    btn.classList.toggle("following", isFollowing);
  });
}

async function toggleFollow(postId, author) {
  const btn = document.getElementById(`follow-btn-${postId}`);
  if (!btn) return;
  const isCurrentlyFollowing = btn.classList.contains("following");
  const endpoint = isCurrentlyFollowing ? "/api/unfollow" : "/api/follow";
  btn.disabled = true;
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ follower: currentUser.name, following: author }),
    });
    const data = await res.json();
    if (!res.ok) { showToast(data.error || "Erro.", "error"); return; }
    const nowFollowing = !isCurrentlyFollowing;
    btn.textContent = nowFollowing ? "Seguindo" : "Seguir";
    btn.classList.toggle("following", nowFollowing);
    showToast(data.message, nowFollowing ? "success" : "");
    // Reload feed if on "Seguindo" tab so removed posts disappear
    if (currentFeedMode === 'following' && !nowFollowing) {
      await loadFeed('following');
    }
  } catch {
    showToast("Erro ao alterar follow.", "error");
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ── Render post card ────────────────────────────────────────────────────
function renderPost(post) {
  const initial = getInitial(post.author);
  const isOwn = post.author === currentUser?.name;
  const liked = likedPosts.has(post.id);
  const time = formatTime(post.createdAt);

  return `
  <div class="post-card" id="card-${post.id}">
    <div class="post-top">
      <div class="avatar sm ${isOwn ? "" : "muted"}">${initial}</div>
      <div class="post-meta">
        <div class="post-author">
          <span class="author-link" onclick="filterByUser('${escapeHtml(post.author)}')">${escapeHtml(post.author)}</span>
          ${!isOwn ? `<button class="btn-follow" id="follow-btn-${post.id}" onclick="toggleFollow('${post.id}', '${escapeHtml(post.author)}')" style="display:none">Seguir</button>` : ''}
        </div>
        <div class="post-time">${time}</div>
      </div>
    </div>
    <p class="post-content">${escapeHtml(post.content)}</p>
    <div class="post-footer">
      <button
        class="btn-like ${liked ? "liked" : ""}"
        id="like-btn-${post.id}"
        onclick="handleLike('${post.id}')"
        title="Curtir"
      >
        <svg viewBox="0 0 24 24" fill="${liked ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
        </svg>
        <span id="like-count-${post.id}">${post.likes}</span>
      </button>
      <button
        class="btn-comment"
        id="comment-btn-${post.id}"
        onclick="toggleComments('${post.id}')"
        title="Comentar"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        Comentar
      </button>
    </div>
    <div class="comment-section" id="comments-${post.id}">
      <div class="comment-list" id="comment-list-${post.id}"></div>
      <div class="comment-form">
        <div class="avatar sm">${initial}</div>
        <textarea
          class="comment-input"
          id="comment-input-${post.id}"
          placeholder="Escreva um comentário..."
          rows="1"
        ></textarea>
        <button class="btn-submit-comment" onclick="submitComment('${post.id}')">Comentar</button>
      </div>
    </div>
  </div>`;
}

// ── Comments ────────────────────────────────────────────────────────────
function toggleComments(postId) {
  const section = document.getElementById(`comments-${postId}`);
  const btn = document.getElementById(`comment-btn-${postId}`);
  const isOpen = section.classList.contains("open");
  section.classList.toggle("open");
  btn.classList.toggle("active", !isOpen);
  if (!isOpen) loadComments(postId);
}

async function loadComments(postId) {
  const list = document.getElementById(`comment-list-${postId}`);
  list.innerHTML = '<div class="spinner" style="width:16px;height:16px;margin:8px auto"></div>';
  try {
    const res = await fetch(`/api/posts/${postId}/comments`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    if (!data.comments || data.comments.length === 0) {
      list.innerHTML = '<p class="comments-empty">Nenhum comentário ainda. Seja o primeiro!</p>';
      return;
    }
    list.innerHTML = data.comments.map((c) => `
      <div class="comment-item">
        <div class="avatar sm muted">${getInitial(c.author)}</div>
        <div class="comment-body">
          <div class="comment-author">${escapeHtml(c.author)}</div>
          <div class="comment-content">${escapeHtml(c.content)}</div>
          <div class="comment-time">${formatTime(c.createdAt)}</div>
        </div>
      </div>`).join("");
  } catch {
    list.innerHTML = '<p class="comments-empty" style="color:var(--danger)">Erro ao carregar comentários.</p>';
  }
}

async function submitComment(postId) {
  const input = document.getElementById(`comment-input-${postId}`);
  const content = input.value.trim();
  if (!content) return;
  const btn = input.nextElementSibling;
  btn.disabled = true;
  try {
    const res = await fetch(`/api/posts/${postId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ author: currentUser.name, content }),
    });
    const data = await res.json();
    if (!res.ok) { showToast(data.error || "Erro ao comentar.", "error"); return; }
    input.value = "";
    await loadComments(postId);
  } catch {
    showToast("Erro ao enviar comentário.", "error");
  } finally {
    btn.disabled = false;
  }
}

// ── Like a post ─────────────────────────────────────────────────────────
async function handleLike(postId) {
  if (likedPosts.has(postId)) {
    showToast("Você já curtiu este post.", "");
    return;
  }

  try {
    const res = await fetch(`/api/posts/${postId}/like`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ author: currentUser.name }),
    });
    const data = await res.json();

    if (res.ok) {
      likedPosts.add(postId);
      const countEl = document.getElementById(`like-count-${postId}`);
      const btn = document.getElementById(`like-btn-${postId}`);
      if (countEl) countEl.textContent = data.likes;
      if (btn) {
        btn.classList.add("liked");
        btn.querySelector("svg").setAttribute("fill", "currentColor");
      }
    } else if (data.alreadyLiked) {
      likedPosts.add(postId);
      const btn = document.getElementById(`like-btn-${postId}`);
      if (btn) {
        btn.classList.add("liked");
        btn.querySelector("svg").setAttribute("fill", "currentColor");
      }
      showToast("Você já curtiu este post.", "");
    }
  } catch {
    showToast("Erro ao curtir.", "error");
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatTime(isoString) {
  if (!isoString) return "";
  const date = new Date(isoString);
  const now = new Date();
  const diff = (now - date) / 1000;

  if (diff < 60) return "agora mesmo";
  if (diff < 3600) return `${Math.floor(diff / 60)} min atrás`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h atrás`;

  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
