require('dotenv').config();
const express = require('express');
const { createClient } = require('redis');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

const client = createClient({
  url: process.env.REDIS_URL,
  socket: {
    reconnectStrategy: false,
  },
});
client.on('error', (err) => console.error('Redis error:', err.message));
client.on('connect', () => console.log('✅ Conectado ao Redis Cloud!'));

const userKey = (name) => `user:${name.toLowerCase()}`;
const postKey = (id) => `post:${id}`;
const POSTS_LIST = 'posts:ids';

app.post('/api/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Preencha todos os campos.' });
    if (password.length < 4) return res.status(400).json({ error: 'Senha deve ter no mínimo 4 caracteres.' });
    const key = userKey(name);
    const exists = await client.exists(key);
    if (exists) return res.status(409).json({ error: 'Nome de usuário já cadastrado.' });
    const hashedPassword = await bcrypt.hash(password, 10);
    await client.hSet(key, { name, email, password: hashedPassword, createdAt: new Date().toISOString() });
    return res.status(201).json({ message: `Conta criada com sucesso! Bem-vindo, ${name}.` });
  } catch (err) {
    return res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { name, password } = req.body;
    if (!name || !password) return res.status(400).json({ error: 'Preencha todos os campos.' });
    const user = await client.hGetAll(userKey(name));
    if (!user || Object.keys(user).length === 0) return res.status(401).json({ error: 'Usuário não encontrado.' });
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: 'Senha incorreta.' });
    return res.json({ message: 'Login realizado!', user: { name: user.name, email: user.email } });
  } catch (err) {
    return res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

app.post('/api/posts', async (req, res) => {
  try {
    const { author, content } = req.body;
    if (!author || !content || !content.trim()) return res.status(400).json({ error: 'Conteúdo obrigatório.' });
    const postId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    await client.hSet(postKey(postId), { id: postId, author, content: content.trim(), createdAt: new Date().toISOString(), likes: '0' });
    await client.lPush(POSTS_LIST, postId);
    return res.status(201).json({ message: 'Post publicado!', post: { id: postId, author, content: content.trim(), createdAt: new Date().toISOString(), likes: 0 } });
  } catch (err) {
    return res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

app.get('/api/posts', async (req, res) => {
  try {
    const { feed, author } = req.query;
    const postIds = await client.lRange(POSTS_LIST, 0, -1);
    if (!postIds || postIds.length === 0) return res.json({ posts: [] });
    let posts = await Promise.all(postIds.map((id) => client.hGetAll(postKey(id))));
    posts = posts
      .filter((p) => p && Object.keys(p).length > 0)
      .map((p) => ({ ...p, likes: parseInt(p.likes || '0', 10) }));
    if (feed === 'following' && author) {
      const followingSet = await client.sMembers(`user:${author.toLowerCase()}:following`);
      const followingLower = new Set(followingSet.map((u) => u.toLowerCase()));
      posts = posts.filter((p) => followingLower.has(p.author.toLowerCase()));
    }
    return res.json({ posts: posts.slice(0, 20) });
  } catch (err) {
    return res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

app.post('/api/posts/:id/like', async (req, res) => {
  try {
    const { author } = req.body;
    if (!author) return res.status(400).json({ error: 'Usuário não identificado.' });
    const key = postKey(req.params.id);
    const likesSetKey = `${key}:likes`;
    const exists = await client.exists(key);
    if (!exists) return res.status(404).json({ error: 'Post não encontrado.' });
    const added = await client.sAdd(likesSetKey, author);
    if (added === 0) return res.status(409).json({ error: 'Você já curtiu este post.', alreadyLiked: true });
    const newLikes = await client.hIncrBy(key, 'likes', 1);
    return res.json({ likes: newLikes });
  } catch (err) {
    return res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

app.post('/api/posts/:id/comments', async (req, res) => {
  try {
    const { author, content } = req.body;
    if (!author || !content || !content.trim()) return res.status(400).json({ error: 'Autor e conteúdo obrigatórios.' });
    const postId = req.params.id;
    const postExists = await client.exists(postKey(postId));
    if (!postExists) return res.status(404).json({ error: 'Post não encontrado.' });
    const commentId = `comment:${postId}:${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const now = new Date().toISOString();
    await client.hSet(commentId, { id: commentId, postId, author, content: content.trim(), createdAt: now });
    await client.lPush(`post:${postId}:comments`, commentId);
    return res.status(201).json({ comment: { id: commentId, postId, author, content: content.trim(), createdAt: now } });
  } catch (err) {
    return res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

app.get('/api/posts/:id/comments', async (req, res) => {
  try {
    const postId = req.params.id;
    const commentIds = await client.lRange(`post:${postId}:comments`, 0, -1);
    if (!commentIds || commentIds.length === 0) return res.json({ comments: [] });
    const comments = await Promise.all(commentIds.map((id) => client.hGetAll(id)));
    return res.json({ comments: comments.filter((c) => c && Object.keys(c).length > 0) });
  } catch (err) {
    return res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

app.get('/api/posts/user/:name', async (req, res) => {
  try {
    const authorName = req.params.name.toLowerCase();
    const postIds = await client.lRange(POSTS_LIST, 0, -1);
    if (!postIds || postIds.length === 0) return res.json({ posts: [] });
    const posts = await Promise.all(postIds.map((id) => client.hGetAll(postKey(id))));
    const filtered = posts
      .filter((p) => p && Object.keys(p).length > 0 && p.author && p.author.toLowerCase() === authorName)
      .map((p) => ({ ...p, likes: parseInt(p.likes || '0', 10) }));
    return res.json({ posts: filtered });
  } catch (err) {
    return res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

app.get('/api/posts/:id/liked', async (req, res) => {
  try {
    const { author } = req.query;
    if (!author) return res.status(400).json({ error: 'Parâmetro author obrigatório.' });
    const likesSetKey = `${postKey(req.params.id)}:likes`;
    const liked = await client.sIsMember(likesSetKey, author);
    return res.json({ liked });
  } catch (err) {
    return res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

app.post('/api/follow', async (req, res) => {
  try {
    const { follower, following } = req.body;
    if (!follower || !following) return res.status(400).json({ error: 'Parâmetros inválidos.' });
    if (follower.toLowerCase() === following.toLowerCase()) return res.status(400).json({ error: 'Não pode seguir a si mesmo.' });
    await client.sAdd(`user:${follower.toLowerCase()}:following`, following);
    await client.sAdd(`user:${following.toLowerCase()}:followers`, follower);
    return res.json({ message: 'Seguindo!' });
  } catch (err) {
    return res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

app.post('/api/unfollow', async (req, res) => {
  try {
    const { follower, following } = req.body;
    if (!follower || !following) return res.status(400).json({ error: 'Parâmetros inválidos.' });
    await client.sRem(`user:${follower.toLowerCase()}:following`, following);
    await client.sRem(`user:${following.toLowerCase()}:followers`, follower);
    return res.json({ message: 'Deixou de seguir.' });
  } catch (err) {
    return res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

app.get('/api/users/:name/following', async (req, res) => {
  try {
    const members = await client.sMembers(`user:${req.params.name.toLowerCase()}:following`);
    return res.json({ following: members });
  } catch (err) {
    return res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

app.get('/api/follow/status', async (req, res) => {
  try {
    const { follower, following } = req.query;
    if (!follower || !following) return res.status(400).json({ error: 'Parâmetros inválidos.' });
    const isFollowing = await client.sIsMember(`user:${follower.toLowerCase()}:following`, following);
    return res.json({ following: isFollowing });
  } catch (err) {
    return res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

async function main() {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
  });

  if (!process.env.REDIS_URL) {
    console.error('REDIS_URL não configurada; operações de dados ficarão indisponíveis.');
    return;
  }

  try {
    await client.connect();
    console.log('✅ Conectado ao Redis Cloud!');
  } catch (err) {
    console.error('Redis indisponível; o site continua acessível:', err.message);
  }
}

main();
