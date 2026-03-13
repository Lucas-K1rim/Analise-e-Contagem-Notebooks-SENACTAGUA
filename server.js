require("express-async-errors");
const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const ExcelJS = require("exceljs");
const PDFDocument = require("pdfkit");
const { Pool } = require("pg");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;
const DATABASE_URL = process.env.DATABASE_URL;
const SESSION_SECRET = process.env.SESSION_SECRET || "i9-session-dev";

if (!DATABASE_URL) {
  console.error("DATABASE_URL nao configurada. Crie o arquivo .env com base no .env.example.");
  process.exit(1);
}

const dbDir = path.join(__dirname, "data");
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dataPath = path.join(dbDir, "demandas.json");
const usersPath = path.join(dbDir, "users.json");

const authSessions = new Map();

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL.includes("render.com") || DATABASE_URL.includes("railway.app")
    ? { rejectUnauthorized: false }
    : false,
});

if (!fs.existsSync(usersPath)) {
  fs.writeFileSync(
    usersPath,
    JSON.stringify(
      [
        { username: "admin", password: "adm@2026", nome: "Administrador" },
        { username: "professor", password: "senac123", nome: "Professor" },
      ],
      null,
      2
    ),
    "utf8"
  );
}

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isIsoMonth(value) {
  return /^\d{4}-\d{2}$/.test(value);
}

function readUsers() {
  const raw = fs.readFileSync(usersPath, "utf8");
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeUsers(users) {
  fs.writeFileSync(usersPath, JSON.stringify(users, null, 2), "utf8");
}

function getAuthToken(req) {
  const authHeader = req.headers.authorization || "";
  const parts = authHeader.split(" ");
  if (parts.length === 2 && parts[0] === "Bearer") {
    return parts[1];
  }
  return "";
}

function authMiddleware(req, res, next) {
  const token = getAuthToken(req);
  if (!token || !authSessions.has(token)) {
    return res.status(401).json({ error: "Nao autorizado. Faca login." });
  }

  req.authUser = authSessions.get(token);
  next();
}

function getDemandasDoMes(month) {
  return pool
    .query(
      `SELECT id, professor, quantidade, data::text AS data, created_by, updated_by
       FROM demandas
       WHERE to_char(data, 'YYYY-MM') = $1
       ORDER BY data ASC, professor ASC, id ASC`,
      [month]
    )
    .then((result) => result.rows);
}

async function getResumoMensal(month) {
  const demandas = await getDemandasDoMes(month);

  const totalGeral = demandas.reduce((acc, item) => acc + Number(item.quantidade || 0), 0);

  const professorMap = new Map();
  for (const item of demandas) {
    const nome = String(item.professor || "").trim();
    if (!nome) continue;
    professorMap.set(nome, (professorMap.get(nome) || 0) + Number(item.quantidade || 0));
  }

  const porProfessor = Array.from(professorMap.entries())
    .map(([professor, total]) => ({ professor, total }))
    .sort((a, b) => {
      if (b.total !== a.total) return b.total - a.total;
      return a.professor.localeCompare(b.professor);
    });

  return {
    month,
    totalGeral,
    porProfessor,
    demandas,
  };
}

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      nome TEXT NOT NULL
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS demandas (
      id SERIAL PRIMARY KEY,
      professor TEXT NOT NULL,
      quantidade INTEGER NOT NULL CHECK (quantidade > 0),
      data DATE NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ,
      created_by TEXT,
      updated_by TEXT
    );
  `);

  const localUsers = readUsers();
  for (const user of localUsers) {
    await pool.query(
      `INSERT INTO users (username, password, nome)
       VALUES ($1, $2, $3)
       ON CONFLICT (username) DO UPDATE SET password = EXCLUDED.password, nome = EXCLUDED.nome`,
      [user.username, user.password, user.nome || user.username]
    );
  }

  if (fs.existsSync(dataPath)) {
    let jsonDemandas = [];
    try {
      const raw = fs.readFileSync(dataPath, "utf8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        jsonDemandas = parsed;
      }
    } catch {
      jsonDemandas = [];
    }

    const countResult = await pool.query("SELECT COUNT(*)::int AS total FROM demandas");
    const total = countResult.rows[0]?.total || 0;

    if (total === 0 && jsonDemandas.length > 0) {
      for (const item of jsonDemandas) {
        if (!item.professor || !item.data || !Number(item.quantidade)) continue;
        await pool.query(
          `INSERT INTO demandas (professor, quantidade, data, created_at, created_by, updated_by)
           VALUES ($1, $2, $3, COALESCE($4::timestamptz, NOW()), $5, $6)`,
          [
            String(item.professor).trim(),
            Number(item.quantidade),
            String(item.data),
            item.created_at || null,
            item.created_by || null,
            item.updated_by || null,
          ]
        );
      }
    }
  }
}

app.post("/api/register", async (req, res) => {
  const { nome, username, password } = req.body;

  const nomeLimpo = String(nome || "").trim();
  const usernameLimpo = String(username || "").trim().toLowerCase();
  const senha = String(password || "");

  if (!nomeLimpo || !usernameLimpo || !senha) {
    return res.status(400).json({ error: "Informe nome, usuario e senha." });
  }

  if (usernameLimpo.length < 3 || usernameLimpo.length > 30) {
    return res.status(400).json({ error: "Usuario deve ter entre 3 e 30 caracteres." });
  }

  if (!/^[a-z0-9._-]+$/.test(usernameLimpo)) {
    return res.status(400).json({ error: "Usuario so pode ter letras, numeros, ponto, underline e hifen." });
  }

  if (senha.length < 6) {
    return res.status(400).json({ error: "Senha deve ter pelo menos 6 caracteres." });
  }

  const existing = await pool.query("SELECT 1 FROM users WHERE username = $1 LIMIT 1", [usernameLimpo]);
  if (existing.rows.length > 0) {
    return res.status(409).json({ error: "Usuario ja existe." });
  }

  await pool.query(
    `INSERT INTO users (username, password, nome)
     VALUES ($1, $2, $3)`,
    [usernameLimpo, senha, nomeLimpo]
  );

  const users = readUsers();
  if (!users.some((item) => item.username === usernameLimpo)) {
    users.push({ username: usernameLimpo, password: senha, nome: nomeLimpo });
    writeUsers(users);
  }

  return res.status(201).json({ ok: true });
});

app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: "Informe usuario e senha." });
  }

  const result = await pool.query(
    `SELECT username, nome
     FROM users
     WHERE username = $1 AND password = $2
     LIMIT 1`,
    [String(username).trim().toLowerCase(), String(password)]
  );

  const user = result.rows[0];

  if (!user) {
    return res.status(401).json({ error: "Credenciais invalidas." });
  }

  const token = crypto.createHash("sha256").update(crypto.randomBytes(24)).update(SESSION_SECRET).digest("hex");
  const authUser = { username: user.username, nome: user.nome || user.username };
  authSessions.set(token, authUser);

  return res.json({ token, user: authUser });
});

app.post("/api/logout", authMiddleware, (req, res) => {
  const token = getAuthToken(req);
  authSessions.delete(token);
  return res.status(204).send();
});

app.use("/api", authMiddleware);

app.post("/api/demandas", async (req, res) => {
  const { professor, quantidade, data } = req.body;

  if (!professor || typeof professor !== "string" || !professor.trim()) {
    return res.status(400).json({ error: "Professor e obrigatorio." });
  }

  const quantidadeNumero = Number(quantidade);
  if (!Number.isInteger(quantidadeNumero) || quantidadeNumero <= 0) {
    return res.status(400).json({ error: "Quantidade deve ser inteiro maior que zero." });
  }

  if (!data || !isIsoDate(data)) {
    return res.status(400).json({ error: "Data deve estar no formato YYYY-MM-DD." });
  }

  const insertResult = await pool.query(
    `INSERT INTO demandas (professor, quantidade, data, created_by)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [professor.trim(), quantidadeNumero, data, req.authUser.username]
  );

  return res.status(201).json({ id: insertResult.rows[0].id });
});

app.get("/api/demandas", async (req, res) => {
  const month = req.query.month;
  if (!month || !isIsoMonth(month)) {
    return res.status(400).json({ error: "Informe o mes no formato YYYY-MM." });
  }

  const rows = await getDemandasDoMes(month);

  return res.json(rows);
});

app.put("/api/demandas/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Id invalido." });
  }

  const { professor, quantidade, data } = req.body;

  if (!professor || typeof professor !== "string" || !professor.trim()) {
    return res.status(400).json({ error: "Professor e obrigatorio." });
  }

  const quantidadeNumero = Number(quantidade);
  if (!Number.isInteger(quantidadeNumero) || quantidadeNumero <= 0) {
    return res.status(400).json({ error: "Quantidade deve ser inteiro maior que zero." });
  }

  if (!data || !isIsoDate(data)) {
    return res.status(400).json({ error: "Data deve estar no formato YYYY-MM-DD." });
  }

  const updateResult = await pool.query(
    `UPDATE demandas
     SET professor = $1,
         quantidade = $2,
         data = $3,
         updated_at = NOW(),
         updated_by = $4
     WHERE id = $5`,
    [professor.trim(), quantidadeNumero, data, req.authUser.username, id]
  );

  if (updateResult.rowCount === 0) {
    return res.status(404).json({ error: "Lancamento nao encontrado." });
  }

  return res.status(200).json({ ok: true });
});

app.delete("/api/demandas/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Id invalido." });
  }

  const deleteResult = await pool.query("DELETE FROM demandas WHERE id = $1", [id]);

  if (deleteResult.rowCount === 0) {
    return res.status(404).json({ error: "Lancamento nao encontrado." });
  }

  return res.status(204).send();
});

app.get("/api/resumo-mensal", async (req, res) => {
  const month = req.query.month;
  if (!month || !isIsoMonth(month)) {
    return res.status(400).json({ error: "Informe o mes no formato YYYY-MM." });
  }

  const resumo = await getResumoMensal(month);

  res.json({ month, totalGeral: resumo.totalGeral, porProfessor: resumo.porProfessor });
});

app.get("/api/export/excel", async (req, res) => {
  const month = req.query.month;
  if (!month || !isIsoMonth(month)) {
    return res.status(400).json({ error: "Informe o mes no formato YYYY-MM." });
  }

  const resumo = await getResumoMensal(month);
  const workbook = new ExcelJS.Workbook();

  const wsResumo = workbook.addWorksheet("Resumo");
  wsResumo.columns = [
    { header: "Professor", key: "professor", width: 30 },
    { header: "Total", key: "total", width: 12 },
  ];
  wsResumo.addRow({ professor: "TOTAL GERAL", total: resumo.totalGeral });
  wsResumo.addRows(resumo.porProfessor);

  const wsLanc = workbook.addWorksheet("Lancamentos");
  wsLanc.columns = [
    { header: "Data", key: "data", width: 14 },
    { header: "Professor", key: "professor", width: 30 },
    { header: "Quantidade", key: "quantidade", width: 14 },
    { header: "Criado por", key: "created_by", width: 16 },
    { header: "Atualizado por", key: "updated_by", width: 16 },
  ];
  wsLanc.addRows(resumo.demandas);

  const safeMonth = month.replace(/[^\d-]/g, "");
  const fileName = `i9-resumo-${safeMonth}.xlsx`;
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.setHeader("Content-Disposition", `attachment; filename=\"${fileName}\"`);

  await workbook.xlsx.write(res);
  res.end();
});

app.get("/api/export/pdf", async (req, res) => {
  const month = req.query.month;
  if (!month || !isIsoMonth(month)) {
    return res.status(400).json({ error: "Informe o mes no formato YYYY-MM." });
  }

  const resumo = await getResumoMensal(month);
  const safeMonth = month.replace(/[^\d-]/g, "");
  const fileName = `i9-resumo-${safeMonth}.pdf`;

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename=\"${fileName}\"`);

  const doc = new PDFDocument({ margin: 40 });
  doc.pipe(res);

  doc.fontSize(18).text(`I9 - Resumo Mensal ${month}`);
  doc.moveDown(0.5);
  doc.fontSize(12).text(`Total geral: ${resumo.totalGeral}`);
  doc.moveDown(0.8);

  doc.fontSize(13).text("Total por professor");
  doc.moveDown(0.3);
  if (resumo.porProfessor.length === 0) {
    doc.fontSize(11).text("Nenhum lancamento no mes.");
  } else {
    resumo.porProfessor.forEach((item) => {
      doc.fontSize(11).text(`${item.professor}: ${item.total}`);
    });
  }

  doc.moveDown(0.8);
  doc.fontSize(13).text("Lancamentos");
  doc.moveDown(0.3);

  if (resumo.demandas.length === 0) {
    doc.fontSize(11).text("Nenhum lancamento no mes.");
  } else {
    resumo.demandas.forEach((item) => {
      doc
        .fontSize(10)
        .text(
          `${item.data} | ${item.professor} | ${item.quantidade} | criado por: ${
            item.created_by || "-"
          }`
        );
    });
  }

  doc.end();
});

app.use((err, req, res, next) => {
  console.error(err);
  return res.status(500).json({ error: "Erro interno no servidor." });
});

initDb()
  .then(() => {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`I9 rodando em http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error("Falha ao iniciar o banco:", error);
    process.exit(1);
  });
