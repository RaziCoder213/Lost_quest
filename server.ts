import express from 'express';
import cors from 'cors';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_FILE = path.join(process.cwd(), 'database.json');

// Initial data structure
const initialData = {
  users: {},
  quests: [],
  notifications: [],
  claims: []
};

// Persistence helper
function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    }
  } catch (e) {
    console.error("Failed to load database.json", e);
  }
  return initialData;
}

function saveData(data: any) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error("Failed to save database.json", e);
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  let db = loadData();

  // API Routes
  app.get('/api/db', (req, res) => {
    res.json(db);
  });

  app.post('/api/users/:uid', (req, res) => {
    db.users[req.params.uid] = req.body;
    saveData(db);
    res.json({ success: true });
  });

  app.get('/api/users/:uid', (req, res) => {
    res.json(db.users[req.params.uid] || null);
  });

  app.get('/api/quests', (req, res) => {
    res.json(db.quests);
  });

  app.post('/api/quests', (req, res) => {
    const newQuest = { ...req.body, id: Math.random().toString(36).substr(2, 9) };
    db.quests.push(newQuest);
    saveData(db);
    res.json(newQuest);
  });

  app.patch('/api/quests/:id', (req, res) => {
    const idx = db.quests.findIndex((q: any) => q.id === req.params.id);
    if (idx !== -1) {
      db.quests[idx] = { ...db.quests[idx], ...req.body };
      saveData(db);
      res.json(db.quests[idx]);
    } else {
      res.status(404).json({ error: 'Quest not found' });
    }
  });

  app.post('/api/notifications', (req, res) => {
    const newNotif = { ...req.body, id: Date.now().toString() };
    db.notifications.push(newNotif);
    saveData(db);
    res.json(newNotif);
  });

  app.get('/api/notifications/:userId', (req, res) => {
    res.json(db.notifications.filter((n: any) => n.userId === req.params.userId));
  });

  // Vite middleware
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
