const tabs = document.querySelectorAll(".tab");
const tabPanels = document.querySelectorAll(".tab-panel");
const appCard = document.getElementById("app-card");

const authBox = document.getElementById("auth-box");
const loginForm = document.getElementById("login-form");
const loginUsernameInput = document.getElementById("login-username");
const loginPasswordInput = document.getElementById("login-password");
const loginMsg = document.getElementById("login-msg");
const userNameEl = document.getElementById("user-name");
const btnLogout = document.getElementById("btn-logout");

const form = document.getElementById("form-demanda");
const professorInput = document.getElementById("professor");
const quantidadeInput = document.getElementById("quantidade");
const dataInput = document.getElementById("data");
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

function hojeIso() {
  return new Date().toISOString().slice(0, 10);
}

function mesAtualIso() {
  return new Date().toISOString().slice(0, 7);
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
      '<tr><td colspan="3">Nenhum lançamento no mês.</td></tr>';
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

  const quantidade = Number(quantidadeTexto);
  if (!Number.isInteger(quantidade) || quantidade <= 0) {
    alert("Quantidade invalida.");
    return;
  }

  try {
    await apiFetch(`/api/demandas/${item.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ professor, quantidade, data }),
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

function renderizarGrafico(porProfessor) {
  const canvas = document.getElementById("grafico-professores");
  if (!canvas) return;

  const labels = porProfessor.map((item) => item.professor);
  const valores = porProfessor.map((item) => item.total);

  if (graficoProfessores) {
    graficoProfessores.data.labels = labels;
    graficoProfessores.data.datasets[0].data = valores;
    graficoProfessores.update();
    return;
  }

  graficoProfessores = new Chart(canvas, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Quantidade total",
          data: valores,
          backgroundColor: "#2f7a4d",
          borderRadius: 6,
        },
      ],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
      },
      scales: {
        x: {
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
  renderizarGrafico(resumo.porProfessor);
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

async function fazerLogin(event) {
  event.preventDefault();
  loginMsg.textContent = "Entrando...";
  loginMsg.style.color = "#1f5f39";

  try {
    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: loginUsernameInput.value.trim(),
        password: loginPasswordInput.value,
      }),
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
  } catch (error) {
    loginMsg.textContent = error.message;
    loginMsg.style.color = "#b42318";
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
loginForm.addEventListener("submit", fazerLogin);
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
  atualizarResumo().catch(() => {
    setLoginState(false);
  });
} else {
  setLoginState(false);
}
