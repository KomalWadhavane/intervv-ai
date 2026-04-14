import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Simple JSON "Database"
  const DB_PATH = path.join(process.cwd(), "db.json");
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify({ interviews: [], users: [] }));
  }

  // Auth Middleware (Simple)
  const getUsers = () => JSON.parse(fs.readFileSync(DB_PATH, "utf-8")).users;
  const saveUsers = (users: any) => {
    const data = JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));
    data.users = users;
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
  };

  // API Routes
  app.post("/api/auth/signup", (req, res) => {
    const { email, password, name } = req.body;
    const users = getUsers();
    if (users.find((u: any) => u.email === email)) {
      return res.status(400).json({ error: "User already exists" });
    }
    const newUser = { id: Date.now().toString(), email, password, name };
    users.push(newUser);
    saveUsers(users);
    res.status(201).json({ id: newUser.id, email: newUser.email, name: newUser.name });
  });

  app.post("/api/auth/login", (req, res) => {
    const { email, password } = req.body;
    const users = getUsers();
    const user = users.find((u: any) => u.email === email && u.password === password);
    if (!user) return res.status(401).json({ error: "Invalid credentials" });
    res.json({ id: user.id, email: user.email, name: user.name });
  });

  app.get("/api/interviews", (req, res) => {
    const userId = req.query.userId;
    const data = JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));
    const interviews = userId ? data.interviews.filter((i: any) => i.userId === userId) : data.interviews;
    res.json(interviews);
  });

  app.post("/api/interviews", (req, res) => {
    const data = JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));
    const newInterview = {
      id: Date.now().toString(),
      createdAt: new Date().toISOString(),
      ...req.body
    };
    data.interviews.push(newInterview);
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
    res.status(201).json(newInterview);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
