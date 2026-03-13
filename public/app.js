const tabs = document.querySelectorAll(".tab");
const tabPanels = document.querySelectorAll(".tab-panel");
const appCard = document.getElementById("app-card");

const authBox = document.getElementById("auth-box");
const loginForm = document.getElementById("login-form");
const loginUsernameInput = document.getElementById("login-username");
const loginPasswordInput = document.getElementById("login-password");
const loginMsg = document.getElementById("login-msg");
const registerForm = document.getElementById("register-form");
const registerNameInput = document.getElementById("register-name");
const registerUsernameInput = document.getElementById("register-username");
const registerPasswordInput = document.getElementById("register-password");
const registerPasswordConfirmInput = document.getElementById("register-password-confirm");
const registerMsg = document.getElementById("register-msg");
const userNameEl = document.getElementById("user-name");
const btnLogout = document.getElementById("btn-logout");

const form = document.getElementById("form-demanda");
const professorInput = document.getElementById("professor");
const formProfessor = document.getElementById("form-professor");
const novoProfessorInput = document.getElementById("novo-professor");
const turnoProfessorInput = document.getElementById("turno-professor");
const professorMsg = document.getElementById("professor-msg");
const tabelaProfessoresCadastrados = document.getElementById("tabela-professores-cadastrados");
const quantidadeInput = document.getElementById("quantidade");
const dataInput = document.getElementById("data");
const manualInput = document.getElementById("manual");
const formMsg = document.getElementById("form-msg");
const mesInput = document.getElementById("mes");
const btnAtualizar = document.getElementById("btn-atualizar");
const totalGeralEl = document.getElementById("total-geral");
const qtdeProfessoresEl = document.getElementById("qtde-professores");
const tabelaProfessores = document.getElementById("tabela-professores");
const tabelaLancamentos = document.getElementById("tabela-lancamentos");
const btnExportExcel = document.getElementById("btn-export-excel");
const btnExportPdf = document.getElementById("btn-export-pdf");
const filtroLancamentos = document.getElementById("filtro-lancamentos");

let authToken = localStorage.getItem("i9_token") || "";
let authUser = localStorage.getItem("i9_user") || "";
let graficoProfessores = null;
let demandasCache = [];
let professoresCache = [];

function hojeIso() {
  return new Date().toISOString().slice(0, 10);
}

function mesAtualIso() {
  return new Date().toISOString().slice(0, 7);
}

function formatarTurno(turno) {
  if (turno === "manha") return "Manhã";
  if (turno === "tarde") return "Tarde";
  return "Noite";
}

function preencherSelectProfessores(professores) {
  const valorAtual = professorInput.value;
  professorInput.innerHTML = "";

  const optionDefault = document.createElement("option");
  optionDefault.value = "";
  optionDefault.textContent = "Selecione o professor";
  professorInput.appendChild(optionDefault);

  professores.forEach((prof) => {
    const option = document.createElement("option");
    option.value = prof.nome;
    option.textContent = `${prof.nome} (${formatarTurno(prof.turno)})`;
    professorInput.appendChild(option);
  });

  if (valorAtual && professores.some((prof) => prof.nome === valorAtual)) {
    professorInput.value = valorAtual;
  }
}

function preencherTabelaProfessoresCadastrados(professores) {
  tabelaProfessoresCadastrados.innerHTML = "";

  if (!professores.length) {
    tabelaProfessoresCadastrados.innerHTML =
      '<tr><td colspan="2">Nenhum professor cadastrado.</td></tr>';
    return;
  }

  professores.forEach((prof) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${prof.nome}</td><td>${formatarTurno(prof.turno)}</td>`;
    tabelaProfessoresCadastrados.appendChild(tr);
  });
}

async function carregarProfessores() {
  const professores = await apiFetch("/api/professores");
  professoresCache = professores;
  preencherSelectProfessores(professores);
  preencherTabelaProfessoresCadastrados(professores);
}

function setLoginState(loggedIn, nome = "") {
  authBox.classList.toggle("logged-in", loggedIn);
  authBox.classList.toggle("logged-out", !loggedIn);
  appCard.classList.toggle("hidden", !loggedIn);
  userNameEl.textContent = loggedIn ? `Conectado: ${nome}` : "";

  if (!loggedIn) {
    localStorage.removeItem("i9_token");
    localStorage.removeItem("i9_user");
    authToken = "";
    authUser = "";
  }
}

function authHeaders(extra = {}) {
  return {
    ...extra,
    Authorization: `Bearer ${authToken}`,
  };
}

async function apiFetch(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: authHeaders(options.headers || {}),
  });

  let body = null;
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    body = await response.json();
  }

  if (!response.ok) {
    if (response.status === 401) {
      setLoginState(false);
    }
    const errorMessage = body && body.error ? body.error : "Erro na requisicao.";
    throw new Error(errorMessage);
  }

  return body;
}

function setActiveTab(tabName) {
  tabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.tab === tabName));
  tabPanels.forEach((panel) => panel.classList.toggle("active", panel.id === tabName));
}

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    setActiveTab(tab.dataset.tab);
  });
});

async function salvarDemanda(event) {
  event.preventDefault();
  formMsg.textContent = "Salvando...";
  formMsg.style.color = "#1f5f39";

  try {
    const payload = {
      professor: professorInput.value.trim(),
      quantidade: Number(quantidadeInput.value),
      data: dataInput.value,
      manual: manualInput.checked,
    };

    const result = await apiFetch("/api/demandas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!result || !result.id) {
      throw new Error("Erro ao salvar.");
    }

    form.reset();
    dataInput.value = hojeIso();
    manualInput.checked = false;
    formMsg.textContent = "Lançamento salvo com sucesso.";
    await atualizarResumo();
  } catch (error) {
    formMsg.textContent = error.message;
    formMsg.style.color = "#b42318";
  }
}

function preencherTabelaProfessores(linhas) {
  tabelaProfessores.innerHTML = "";

  if (!linhas.length) {
    tabelaProfessores.innerHTML =
      '<tr><td colspan="2">Nenhum lançamento no mês.</td></tr>';
    return;
  }

  linhas.forEach((item) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${item.professor}</td><td>${item.total}</td>`;
    tabelaProfessores.appendChild(tr);
  });
}

function preencherTabelaLancamentos(linhas) {
  tabelaLancamentos.innerHTML = "";

  if (!linhas.length) {
    tabelaLancamentos.innerHTML =
      '<tr><td colspan="5">Nenhum lançamento no mês.</td></tr>';
    return;
  }

  linhas.forEach((item) => {
    const tr = document.createElement("tr");

    const tdData = document.createElement("td");
    tdData.textContent = item.data;

    const tdProfessor = document.createElement("td");
    tdProfessor.textContent = item.professor;

    const tdQuantidade = document.createElement("td");
    tdQuantidade.textContent = item.quantidade;

    const tdTipo = document.createElement("td");
    const badge = document.createElement("span");
    badge.className = item.manual ? "tipo-badge manual" : "tipo-badge normal";
    badge.textContent = item.manual ? "Manual" : "Normal";
    tdTipo.appendChild(badge);

    const tdAcoes = document.createElement("td");
    const rowActions = document.createElement("div");
    rowActions.className = "btn-row";

    const btnEditar = document.createElement("button");
    btnEditar.type = "button";
    btnEditar.className = "tiny";
    btnEditar.textContent = "Editar";
    btnEditar.addEventListener("click", () => editarLancamento(item));

    const btnExcluir = document.createElement("button");
    btnExcluir.type = "button";
    btnExcluir.className = "tiny danger";
    btnExcluir.textContent = "Excluir";
    btnExcluir.addEventListener("click", () => excluirLancamento(item.id));

    rowActions.appendChild(btnEditar);
    rowActions.appendChild(btnExcluir);
    tdAcoes.appendChild(rowActions);

    tr.appendChild(tdData);
    tr.appendChild(tdProfessor);
    tr.appendChild(tdQuantidade);
    tr.appendChild(tdTipo);
    tr.appendChild(tdAcoes);
    tabelaLancamentos.appendChild(tr);
  });
}

async function editarLancamento(item) {
  const professor = prompt("Professor:", item.professor);
  if (professor === null) return;

  const quantidadeTexto = prompt("Quantidade:", String(item.quantidade));
  if (quantidadeTexto === null) return;

  const data = prompt("Data (YYYY-MM-DD):", item.data);
  if (data === null) return;

  const manual = confirm(
    `Este lancamento e manual?\n\nOK = Manual\nCancelar = Normal\n\nAtual: ${
      item.manual ? "Manual" : "Normal"
    }`
  );

  const quantidade = Number(quantidadeTexto);
  if (!Number.isInteger(quantidade) || quantidade <= 0) {
    alert("Quantidade invalida.");
    return;
  }

  try {
    await apiFetch(`/api/demandas/${item.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ professor, quantidade, data, manual }),
    });
    await atualizarResumo();
  } catch (error) {
    alert(error.message);
  }
}

async function excluirLancamento(id) {
  const ok = confirm("Deseja excluir este lancamento?");
  if (!ok) return;

  try {
    await apiFetch(`/api/demandas/${id}`, { method: "DELETE" });
    await atualizarResumo();
  } catch (error) {
    alert(error.message);
  }
}

function montarSeriesGrafico(demandas) {
  const mapa = new Map();

  demandas.forEach((item) => {
    const professor = String(item.professor || "").trim() || "Sem nome";
    if (!mapa.has(professor)) {
      mapa.set(professor, { manual: 0, normal: 0, total: 0 });
    }

    const registro = mapa.get(professor);
    const quantidade = Number(item.quantidade || 0);
    if (item.manual) {
      registro.manual += quantidade;
    } else {
      registro.normal += quantidade;
    }
    registro.total += quantidade;
  });

  const ordenado = Array.from(mapa.entries()).sort((a, b) => b[1].total - a[1].total);

  return {
    labels: ordenado.map(([professor]) => professor),
    manuais: ordenado.map(([, valor]) => valor.manual),
    normais: ordenado.map(([, valor]) => valor.normal),
  };
}

function renderizarGrafico(demandas) {
  const canvas = document.getElementById("grafico-professores");
  if (!canvas) return;

  const series = montarSeriesGrafico(demandas);
  const labels = series.labels;
  const valoresManuais = series.manuais;
  const valoresNormais = series.normais;

  if (graficoProfessores) {
    graficoProfessores.data.labels = labels;
    graficoProfessores.data.datasets[0].data = valoresNormais;
    graficoProfessores.data.datasets[1].data = valoresManuais;
    graficoProfessores.update();
    return;
  }

  graficoProfessores = new Chart(canvas, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Normal",
          data: valoresNormais,
          backgroundColor: "#003878",
          borderRadius: 6,
        },
        {
          label: "Manual",
          data: valoresManuais,
          backgroundColor: "#f7941d",
          borderRadius: 6,
        },
      ],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: true },
      },
      scales: {
        y: {
          stacked: true,
        },
        x: {
          stacked: true,
          beginAtZero: true,
          ticks: { precision: 0 },
        },
      },
    },
  });
}

function aplicarFiltro() {
  const termo = filtroLancamentos ? filtroLancamentos.value.toLowerCase().trim() : "";
  const filtradas = termo
    ? demandasCache.filter((item) =>
        String(item.professor || "").toLowerCase().includes(termo)
      )
    : demandasCache;
  preencherTabelaLancamentos(filtradas);
}

async function atualizarResumo() {
  const month = mesInput.value;
  if (!month) return;

  const [resumo, demandas] = await Promise.all([
    apiFetch(`/api/resumo-mensal?month=${month}`),
    apiFetch(`/api/demandas?month=${month}`),
  ]);

  demandasCache = demandas;
  totalGeralEl.textContent = resumo.totalGeral;
  qtdeProfessoresEl.textContent = resumo.porProfessor.length;
  renderizarGrafico(demandas);
  preencherTabelaProfessores(resumo.porProfessor);
  aplicarFiltro();
}

async function exportarArquivo(tipo) {
  const month = mesInput.value;
  if (!month) {
    alert("Informe o mes para exportar.");
    return;
  }

  const response = await fetch(`/api/export/${tipo}?month=${month}`, {
    headers: authHeaders(),
  });

  if (!response.ok) {
    let mensagem = "Erro ao exportar.";
    try {
      const body = await response.json();
      if (body.error) mensagem = body.error;
    } catch {
      // Ignora erro de parse de resposta nao JSON
    }

    if (response.status === 401) {
      setLoginState(false);
    }
    throw new Error(mensagem);
  }

  const blob = await response.blob();
  const extension = tipo === "excel" ? "xlsx" : "pdf";
  const fileName = `i9-resumo-${month}.${extension}`;
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function executarLogin(username, password) {
  const response = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error || "Falha no login.");
  }

  authToken = result.token;
  authUser = result.user.nome;
  localStorage.setItem("i9_token", authToken);
  localStorage.setItem("i9_user", authUser);
  setLoginState(true, authUser);
  loginMsg.textContent = "";
  loginForm.reset();
  await atualizarResumo();
}

async function fazerLogin(event) {
  event.preventDefault();
  loginMsg.textContent = "Entrando...";
  loginMsg.style.color = "#1f5f39";

  try {
    await executarLogin(loginUsernameInput.value.trim(), loginPasswordInput.value);
    await carregarProfessores();
  } catch (error) {
    loginMsg.textContent = error.message;
    loginMsg.style.color = "#b42318";
  }
}

async function criarConta(event) {
  event.preventDefault();
  registerMsg.textContent = "Criando conta...";
  registerMsg.style.color = "#1f5f39";

  const nome = registerNameInput.value.trim();
  const username = registerUsernameInput.value.trim().toLowerCase();
  const password = registerPasswordInput.value;
  const confirmPassword = registerPasswordConfirmInput.value;

  if (password !== confirmPassword) {
    registerMsg.textContent = "As senhas nao conferem.";
    registerMsg.style.color = "#b42318";
    return;
  }

  try {
    const response = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome, username, password }),
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || "Erro ao criar conta.");
    }

    registerMsg.textContent = "Conta criada. Entrando...";
    registerMsg.style.color = "#1f5f39";
    await executarLogin(username, password);
    await carregarProfessores();
    registerForm.reset();
  } catch (error) {
    registerMsg.textContent = error.message;
    registerMsg.style.color = "#b42318";
  }
}

async function cadastrarProfessor(event) {
  event.preventDefault();
  professorMsg.textContent = "Cadastrando...";
  professorMsg.style.color = "#1f5f39";

  try {
    const nome = novoProfessorInput.value.trim();
    const turno = turnoProfessorInput.value;

    const response = await fetch("/api/professores", {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ nome, turno }),
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || "Erro ao cadastrar professor.");
    }

    professorMsg.textContent = "Professor cadastrado com sucesso.";
    formProfessor.reset();
    turnoProfessorInput.value = "noite";
    await carregarProfessores();
  } catch (error) {
    professorMsg.textContent = error.message;
    professorMsg.style.color = "#b42318";
  }
}

async function fazerLogout() {
  try {
    if (authToken) {
      await fetch("/api/logout", { method: "POST", headers: authHeaders() });
    }
  } finally {
    setLoginState(false);
  }
}

form.addEventListener("submit", salvarDemanda);
formProfessor.addEventListener("submit", cadastrarProfessor);
loginForm.addEventListener("submit", fazerLogin);
registerForm.addEventListener("submit", criarConta);
btnLogout.addEventListener("click", fazerLogout);
filtroLancamentos.addEventListener("input", aplicarFiltro);

btnAtualizar.addEventListener("click", async () => {
  try {
    await atualizarResumo();
  } catch (error) {
    alert(error.message);
  }
});

btnExportExcel.addEventListener("click", async () => {
  try {
    await exportarArquivo("excel");
  } catch (error) {
    alert(error.message);
  }
});

btnExportPdf.addEventListener("click", async () => {
  try {
    await exportarArquivo("pdf");
  } catch (error) {
    alert(error.message);
  }
});

dataInput.value = hojeIso();
mesInput.value = mesAtualIso();

if (authToken && authUser) {
  setLoginState(true, authUser);
  Promise.all([carregarProfessores(), atualizarResumo()]).catch(() => {
    setLoginState(false);
  });
} else {
  setLoginState(false);
}
