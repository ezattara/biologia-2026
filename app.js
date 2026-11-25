import { ASIGNATURAS, PLAN_INFO } from "./data/plan_data.js";
import { DataService } from "./supabase_client.js";

const dataService = new DataService();

const state = {
  activeTab: "curriculum",
  activeTrack: "licenciatura",
  viewMode: "diagram", // 'diagram' | 'table'
  searchQuery: "",
  selectedCourseId: null,
  myProfile: null,
  myInterests: [],
  coordData: { profiles: [], interests: [] },
  coordViewMode: "by-course", // 'by-course' | 'by-prof'
  coordFilterStatus: "all",
  coordSearch: ""
};

// Map for quick lookup
const courseById = new Map(ASIGNATURAS.map((c) => [c.id, c]));

// DOM helpers
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function showToast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => el.classList.add("hidden"), 3200);
}

// ============================================================================
// INITIALIZATION
// ============================================================================
async function init() {
  await dataService.init();

  if (!dataService.isSupabase) {
    $("#demo-banner").classList.remove("hidden");
  }

  bindEvents();
  populateQuickAddSelect();
  await refreshUserData();
  renderAll();

  window.addEventListener("auth-changed", async () => {
    await refreshUserData();
    renderAll();
  });

  window.addEventListener("resize", () => {
    if (state.viewMode === "diagram" && state.activeTab === "curriculum") {
      drawCorrelativityArrows();
    }
  });
}

async function refreshUserData() {
  if (dataService.currentUser) {
    try {
      const [profile, interests] = await Promise.all([
        dataService.getMyProfile(),
        dataService.getMyInterests()
      ]);
      state.myProfile = profile;
      state.myInterests = interests;
    } catch (err) {
      console.error(err);
      showToast("Error al cargar tus datos: " + err.message);
    }

    if (dataService.isCoordinator) {
      $("#tab-coordinator").classList.remove("hidden");
      try {
        state.coordData = await dataService.getCoordinatorConsolidated();
      } catch (err) {
        console.error(err);
      }
    } else {
      $("#tab-coordinator").classList.add("hidden");
      if (state.activeTab === "coordinator") {
        switchTab("curriculum");
      }
    }
  } else {
    state.myProfile = null;
    state.myInterests = [];
    state.coordData = { profiles: [], interests: [] };
    $("#tab-coordinator").classList.add("hidden");
    if (state.activeTab === "coordinator") {
      switchTab("curriculum");
    }
  }
}

// ============================================================================
// EVENTS
// ============================================================================
function bindEvents() {
  // Tabs
  $$(".nav-tab").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  // Track selector
  $$(".track-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.activeTrack = btn.dataset.track;
      state.selectedCourseId = null;
      $$(".track-btn").forEach((b) => b.classList.toggle("active", b === btn));
      renderCurriculum();
    });
  });

  // Search
  $("#course-search").addEventListener("input", (e) => {
    state.searchQuery = e.target.value.trim().toLowerCase();
    renderCurriculum();
  });

  // View mode toggle
  $("#btn-view-diagram").addEventListener("click", () => {
    state.viewMode = "diagram";
    $("#btn-view-diagram").classList.add("active");
    $("#btn-view-table").classList.remove("active");
    renderCurriculum();
  });

  $("#btn-view-table").addEventListener("click", () => {
    state.viewMode = "table";
    $("#btn-view-table").classList.add("active");
    $("#btn-view-diagram").classList.remove("active");
    renderCurriculum();
  });

  $("#btn-clear-selection").addEventListener("click", () => {
    state.selectedCourseId = null;
    renderCurriculum();
  });

  // Modal close
  $("#btn-close-modal").addEventListener("click", closeCourseModal);
  $("#course-modal").addEventListener("click", (e) => {
    if (e.target.id === "course-modal") closeCourseModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeCourseModal();
      $("#demo-login-modal").classList.add("hidden");
    }
  });

  // Profile form
  $("#profile-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const updated = await dataService.saveMyProfile({
        full_name: $("#prof-name").value,
        department: $("#prof-dept").value,
        current_position: $("#prof-position").value,
        current_courses: $("#prof-current-courses").value,
        general_notes: $("#prof-notes").value
      });
      state.myProfile = updated;
      $("#profile-save-status").textContent = "✓ Guardado";
      setTimeout(() => ($("#profile-save-status").textContent = ""), 2500);
      showToast("Tus datos docentes fueron guardados.");
      if (dataService.isCoordinator) {
        state.coordData = await dataService.getCoordinatorConsolidated();
      }
    } catch (err) {
      showToast("Error al guardar perfil: " + err.message);
    }
  });

  $("#btn-go-diagram").addEventListener("click", () => switchTab("curriculum"));

  $("#btn-quick-add").addEventListener("click", () => {
    const id = Number($("#quick-add-course").value);
    if (id) openCourseModal(id);
  });

  // Demo quick buttons
  $("#btn-demo-prof").addEventListener("click", () => {
    dataService.signInDemo({
      email: "docente.prueba@crub.uncoma.edu.ar",
      name: "Dr. Carlos Gómez (Demo)",
      asCoordinator: false
    });
    showToast("Sesión iniciada como Docente (Demo).");
  });

  $("#btn-demo-coord").addEventListener("click", () => {
    dataService.signInDemo({
      email: "coordinacion@crub.uncoma.edu.ar",
      name: "Coordinación Carrera (Demo)",
      asCoordinator: true
    });
    showToast("Sesión iniciada como Coordinación (Demo).");
  });

  $("#btn-close-demo-modal").addEventListener("click", () => {
    $("#demo-login-modal").classList.add("hidden");
  });

  $("#demo-login-form").addEventListener("submit", (e) => {
    e.preventDefault();
    dataService.signInDemo({
      email: $("#demo-login-email").value,
      name: $("#demo-login-name").value,
      asCoordinator: $("#demo-login-coord").checked
    });
    $("#demo-login-modal").classList.add("hidden");
    showToast("Sesión iniciada en Modo Demo.");
  });

  // Coordinator controls
  $("#btn-refresh-coord").addEventListener("click", async () => {
    try {
      state.coordData = await dataService.getCoordinatorConsolidated();
      renderCoordinator();
      showToast("Datos actualizados.");
    } catch (err) {
      showToast("Error: " + err.message);
    }
  });

  $("#btn-coord-by-course").addEventListener("click", () => {
    state.coordViewMode = "by-course";
    $("#btn-coord-by-course").classList.add("active");
    $("#btn-coord-by-prof").classList.remove("active");
    renderCoordinator();
  });

  $("#btn-coord-by-prof").addEventListener("click", () => {
    state.coordViewMode = "by-prof";
    $("#btn-coord-by-prof").classList.add("active");
    $("#btn-coord-by-course").classList.remove("active");
    renderCoordinator();
  });

  $("#coord-filter-status").addEventListener("change", (e) => {
    state.coordFilterStatus = e.target.value;
    renderCoordinator();
  });

  $("#coord-search").addEventListener("input", (e) => {
    state.coordSearch = e.target.value.trim().toLowerCase();
    renderCoordinator();
  });

  $("#btn-export-csv").addEventListener("click", () => exportConsolidated(","));
  $("#btn-export-tsv").addEventListener("click", () => exportConsolidated("\t"));
}

function switchTab(tabId) {
  state.activeTab = tabId;
  $$(".nav-tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === tabId));
  $$(".tab-view").forEach((v) => v.classList.toggle("active", v.id === "view-" + tabId));
  if (tabId === "curriculum" && state.viewMode === "diagram") {
    requestAnimationFrame(drawCorrelativityArrows);
  }
  if (tabId === "my-interests") renderMyInterests();
  if (tabId === "coordinator") renderCoordinator();
}

function renderAll() {
  renderAuthArea();
  renderBadges();
  renderCurriculum();
  renderMyInterests();
  if (dataService.isCoordinator) renderCoordinator();
}

// ============================================================================
// AUTH UI
// ============================================================================
function renderAuthArea() {
  const area = $("#auth-area");
  if (dataService.currentUser) {
    area.innerHTML = `
      <div class="user-pill">
        <span>${escapeHtml(dataService.currentUser.name)}</span>
        ${dataService.isCoordinator ? '<span class="badge badge-coord">Coordinación</span>' : ""}
      </div>
      <button id="btn-logout" class="btn btn-xs btn-outline-light">Cerrar sesión</button>
    `;
    $("#btn-logout").addEventListener("click", () => dataService.signOut());
  } else if (dataService.isSupabase) {
    area.innerHTML = `
      <button id="btn-google-login" class="btn btn-google">
        <span>Ingresar con Google</span>
      </button>
    `;
    $("#btn-google-login").addEventListener("click", () => dataService.signInWithGoogle());
  } else {
    area.innerHTML = `
      <button id="btn-open-demo-login" class="btn btn-outline-light">Ingresar (Demo)</button>
    `;
    $("#btn-open-demo-login").addEventListener("click", () => {
      $("#demo-login-modal").classList.remove("hidden");
    });
  }
}

function renderBadges() {
  const badge = $("#my-interests-badge");
  if (dataService.currentUser && state.myInterests.length > 0) {
    badge.textContent = state.myInterests.length;
    badge.classList.remove("hidden");
  } else {
    badge.classList.add("hidden");
  }
}

// ============================================================================
// CURRICULUM & INTERACTIVE DIAGRAM
// ============================================================================
function getFilteredCourses() {
  return ASIGNATURAS.filter((c) => {
    const inTrack =
      state.activeTrack === "all" || c.trayectos.includes(state.activeTrack);
    if (!inTrack) return false;
    if (!state.searchQuery) return true;
    const hay = `${c.id} ${c.nombre} ${c.contenidos_minimos}`.toLowerCase();
    return hay.includes(state.searchQuery);
  });
}

function getDirectPrereqs(course) {
  return new Set([
    ...(course.aprobada_cursar || []),
    ...(course.regularizada_cursar || [])
  ]);
}

function getDirectUnlocks(courseId, visibleIds) {
  const unlocks = new Set();
  for (const c of ASIGNATURAS) {
    if (!visibleIds.has(c.id)) continue;
    if (
      (c.aprobada_cursar || []).includes(courseId) ||
      (c.regularizada_cursar || []).includes(courseId)
    ) {
      unlocks.add(c.id);
    }
  }
  return unlocks;
}

function renderCurriculum() {
  const trackMeta = PLAN_INFO.titulos.find((t) => t.id === state.activeTrack);
  $("#track-info-text").innerHTML = trackMeta
    ? `<strong>${escapeHtml(trackMeta.nombre)}</strong> · ${escapeHtml(trackMeta.tipo)} — ${escapeHtml(trackMeta.descripcion)}`
    : `<strong>Todos los espacios curriculares (41)</strong> · Incluye Licenciatura, espacios específicos de Tecnicaturas e Inglés Técnico.`;

  const courses = getFilteredCourses();
  const visibleIds = new Set(courses.map((c) => c.id));

  if (state.selectedCourseId && !visibleIds.has(state.selectedCourseId)) {
    state.selectedCourseId = null;
  }

  $("#btn-clear-selection").classList.toggle("hidden", !state.selectedCourseId);

  if (state.viewMode === "diagram") {
    $("#diagram-container").classList.remove("hidden");
    $("#table-container").classList.add("hidden");
    $("#diagram-legend").classList.remove("hidden");
    renderDiagram(courses, visibleIds);
  } else {
    $("#diagram-container").classList.add("hidden");
    $("#table-container").classList.remove("hidden");
    $("#diagram-legend").classList.add("hidden");
    renderTable(courses);
  }
}

function getCuatGroup(cuatStr) {
  const s = String(cuatStr);
  if (s === "Transversal") return "transversal";
  // Odd cuatrimestres (1, 3, 5, 7, 9) -> 1er Cuatrimestre del año
  if (["1", "3", "5", "7", "9"].includes(s)) return "c1";
  // Even or spanning (2, 4, 6, 8, 10, 5-6, 9-10) -> 2do Cuatrimestre / Anual
  return "c2";
}

function renderDiagram(courses, visibleIds) {
  const grid = $("#diagram-grid");
  const myInterestMap = new Map(state.myInterests.map((i) => [i.course_id, i]));

  const selectedCourse = state.selectedCourseId
    ? courseById.get(state.selectedCourseId)
    : null;
  const directPrereqs = selectedCourse ? getDirectPrereqs(selectedCourse) : new Set();
  const directUnlocks = selectedCourse
    ? getDirectUnlocks(selectedCourse.id, visibleIds)
    : new Set();

  const years = [1, 2, 3, 4, 5].filter((y) =>
    courses.some((c) => c.anio === y)
  );
  const hasTransversal = courses.some((c) => c.anio === 0);

  let html = "";

  for (const anio of years) {
    const yearCourses = courses.filter((c) => c.anio === anio);
    const c1 = yearCourses.filter((c) => getCuatGroup(c.cuatrimestre) === "c1");
    const c2 = yearCourses.filter((c) => getCuatGroup(c.cuatrimestre) === "c2");

    const c1Num = anio * 2 - 1;
    const c2Num = anio * 2;

    html += `
      <div class="year-row">
        <div class="year-label">${anio}° AÑO</div>
        <div class="cuat-col">
          <div class="cuat-header">1er Cuatrimestre (${c1Num}° C)</div>
          <div class="cards-flow">
            ${c1.map((c) => renderCourseCard(c, myInterestMap, selectedCourse, directPrereqs, directUnlocks)).join("")}
          </div>
        </div>
        <div class="cuat-col">
          <div class="cuat-header">2do Cuatrimestre (${c2Num}° C) / Anual</div>
          <div class="cards-flow">
            ${c2.map((c) => renderCourseCard(c, myInterestMap, selectedCourse, directPrereqs, directUnlocks)).join("")}
          </div>
        </div>
      </div>
    `;
  }

  if (hasTransversal) {
    const trans = courses.filter((c) => c.anio === 0);
    html += `
      <div class="year-row transversal-row">
        <div class="year-label">REQ.</div>
        <div class="cuat-col">
          <div class="cuat-header">Requisitos Transversales</div>
          <div class="cards-flow">
            ${trans.map((c) => renderCourseCard(c, myInterestMap, selectedCourse, directPrereqs, directUnlocks)).join("")}
          </div>
        </div>
      </div>
    `;
  }

  if (!html) {
    html = `<div class="empty-state"><p>No se encontraron asignaturas que coincidan con tu búsqueda.</p></div>`;
  }

  grid.innerHTML = html;

  // Bind card clicks
  grid.querySelectorAll(".course-card").forEach((card) => {
    const id = Number(card.dataset.courseId);
    card.addEventListener("click", (e) => {
      if (e.target.closest(".card-detail-btn")) {
        openCourseModal(id);
        return;
      }
      state.selectedCourseId = state.selectedCourseId === id ? null : id;
      renderCurriculum();
    });
  });

  requestAnimationFrame(drawCorrelativityArrows);
}

function renderCourseCard(c, myInterestMap, selectedCourse, directPrereqs, directUnlocks) {
  const interest = myInterestMap.get(c.id);
  const isSpecificTech = c.id >= 36 && c.id <= 40;

  let stateClass = "";
  if (selectedCourse) {
    if (c.id === selectedCourse.id) stateClass = "is-selected";
    else if (directPrereqs.has(c.id)) stateClass = "is-prereq";
    else if (directUnlocks.has(c.id)) stateClass = "is-unlock";
    else stateClass = "is-dimmed";
  }

  return `
    <div class="course-card ${isSpecificTech ? "specific-tech" : ""} ${stateClass}" data-course-id="${c.id}">
      <div class="course-card-top">
        <span class="course-id">#${c.id}</span>
        <span class="badge badge-cre">${c.cre} CRE</span>
      </div>
      <div class="course-title">${escapeHtml(c.nombre)}</div>
      ${
        interest
          ? `<div class="my-interest-flag">
              ${interest.wants_charge ? '<span class="badge badge-charge">A cargo</span>' : ""}
              ${interest.wants_participant ? '<span class="badge badge-part">Participante</span>' : ""}
            </div>`
          : ""
      }
      <div class="course-card-footer">
        <span class="course-meta">${c.ip_total} hs IP${c.cre_req ? ` · Req ${c.cre_req} CRE` : ""}</span>
        <button type="button" class="card-detail-btn">Detalles / Postular</button>
      </div>
    </div>
  `;
}

function drawCorrelativityArrows() {
  const svg = $("#correlativity-svg");
  const wrapper = $("#diagram-container");
  const grid = $("#diagram-grid");
  if (!svg || !wrapper || !grid) return;

  const width = grid.scrollWidth + 40;
  const height = grid.scrollHeight + 40;
  svg.setAttribute("width", width);
  svg.setAttribute("height", height);
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

  if (!state.selectedCourseId) {
    svg.innerHTML = "";
    return;
  }

  const selected = courseById.get(state.selectedCourseId);
  if (!selected) {
    svg.innerHTML = "";
    return;
  }

  const wrapperRect = wrapper.getBoundingClientRect();
  const scrollLeft = wrapper.scrollLeft;
  const scrollTop = wrapper.scrollTop;

  const getCardCenter = (id) => {
    const el = grid.querySelector(`.course-card[data-course-id="${id}"]`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      x: r.left - wrapperRect.left + scrollLeft + r.width / 2,
      y: r.top - wrapperRect.top + scrollTop + r.height / 2,
      top: r.top - wrapperRect.top + scrollTop,
      bottom: r.bottom - wrapperRect.top + scrollTop
    };
  };

  const selPos = getCardCenter(selected.id);
  if (!selPos) {
    svg.innerHTML = "";
    return;
  }

  let defs = `
    <defs>
      <marker id="arrow-amber" markerWidth="8" markerHeight="8" refX="7" refY="3.5" orient="auto">
        <polygon points="0 0, 8 3.5, 0 7" fill="#d97706" />
      </marker>
      <marker id="arrow-blue" markerWidth="8" markerHeight="8" refX="7" refY="3.5" orient="auto">
        <polygon points="0 0, 8 3.5, 0 7" fill="#004a87" />
      </marker>
      <marker id="arrow-teal" markerWidth="8" markerHeight="8" refX="7" refY="3.5" orient="auto">
        <polygon points="0 0, 8 3.5, 0 7" fill="#0d9488" />
      </marker>
    </defs>
  `;

  let paths = "";

  const drawCurve = (from, to, color, dashed, markerId) => {
    const startY = from.y < to.y ? from.bottom : from.top;
    const endY = from.y < to.y ? to.top : to.bottom;
    const dy = Math.max(30, Math.abs(endY - startY) * 0.45);
    const cp1y = from.y < to.y ? startY + dy : startY - dy;
    const cp2y = from.y < to.y ? endY - dy : endY + dy;

    paths += `<path d="M ${from.x} ${startY} C ${from.x} ${cp1y}, ${to.x} ${cp2y}, ${to.x} ${endY}"
      fill="none" stroke="${color}" stroke-width="2.4"
      ${dashed ? 'stroke-dasharray="6 4"' : ""}
      marker-end="url(#${markerId})" opacity="0.9" />`;
  };

  // Prereqs -> Selected
  for (const pid of selected.aprobada_cursar || []) {
    const pos = getCardCenter(pid);
    if (pos) drawCurve(pos, selPos, "#d97706", false, "arrow-amber");
  }
  for (const pid of selected.regularizada_cursar || []) {
    const pos = getCardCenter(pid);
    if (pos) drawCurve(pos, selPos, "#004a87", true, "arrow-blue");
  }

  // Selected -> Unlocks
  for (const c of ASIGNATURAS) {
    const isAprob = (c.aprobada_cursar || []).includes(selected.id);
    const isReg = (c.regularizada_cursar || []).includes(selected.id);
    if (isAprob || isReg) {
      const pos = getCardCenter(c.id);
      if (pos) drawCurve(selPos, pos, "#0d9488", isReg && !isAprob, "arrow-teal");
    }
  }

  svg.innerHTML = defs + paths;
}

function renderTable(courses) {
  const tbody = $("#plan-table-body");
  const myInterestMap = new Map(state.myInterests.map((i) => [i.course_id, i]));

  tbody.innerHTML = courses
    .map((c) => {
      const interest = myInterestMap.get(c.id);
      const interestHtml = interest
        ? `${interest.wants_charge ? '<span class="badge badge-charge">A cargo</span> ' : ""}${
            interest.wants_participant ? '<span class="badge badge-part">Participante</span>' : ""
          }`
        : '<span class="muted">—</span>';

      return `
        <tr>
          <td><strong>#${c.id}</strong></td>
          <td>${c.anio === 0 ? "Req." : c.anio + "°"}</td>
          <td>${escapeHtml(c.cuatrimestre)}</td>
          <td><strong>${escapeHtml(c.nombre)}</strong></td>
          <td>${c.ip_total}</td>
          <td>${c.tae}</td>
          <td>${c.tte}</td>
          <td><span class="badge badge-cre">${c.cre}</span></td>
          <td>${c.aprobada_cursar.length ? c.aprobada_cursar.join(", ") : "—"}</td>
          <td>${c.regularizada_cursar.length ? c.regularizada_cursar.join(", ") : "—"}</td>
          <td>${interestHtml}</td>
          <td><button class="btn btn-xs btn-outline btn-open-course" data-id="${c.id}">Ver / Postular</button></td>
        </tr>
      `;
    })
    .join("");

  tbody.querySelectorAll(".btn-open-course").forEach((btn) => {
    btn.addEventListener("click", () => openCourseModal(Number(btn.dataset.id)));
  });
}

// ============================================================================
// COURSE DETAIL MODAL
// ============================================================================
function openCourseModal(courseId) {
  const c = courseById.get(courseId);
  if (!c) return;

  const trackLabels = {
    licenciatura: "Licenciatura",
    bachiller: "Bachiller",
    tec_lab: "Téc. Laboratorio",
    tec_biodiv: "Téc. Biodiversidad"
  };

  $("#modal-course-badges").innerHTML = `
    <span class="course-id">#${c.id}</span>
    <span class="badge badge-cre">${c.anio === 0 ? "Transversal" : `${c.anio}° Año · Cuat. ${c.cuatrimestre}`}</span>
    <span class="badge" style="background:#f1f5f9;color:#334155;">${escapeHtml(c.regimen)}</span>
    ${c.trayectos.map((t) => `<span class="badge" style="background:#e2e8f0;color:#1e293b;">${trackLabels[t]}</span>`).join("")}
  `;

  $("#modal-course-title").textContent = c.nombre;

  $("#modal-hours-grid").innerHTML = `
    <div class="hour-box"><div class="val">${c.cre}</div><div class="lbl">CRE</div></div>
    <div class="hour-box"><div class="val">${c.ip_total} hs</div><div class="lbl">IP Total</div></div>
    <div class="hour-box"><div class="val">${c.ip_teoricas} hs</div><div class="lbl">IP Teóricas</div></div>
    <div class="hour-box"><div class="val">${c.ip_practicas} hs</div><div class="lbl">IP Prácticas</div></div>
    <div class="hour-box"><div class="val">${c.ip_semanal} hs</div><div class="lbl">IP Semanal</div></div>
    <div class="hour-box"><div class="val">${c.tae} hs</div><div class="lbl">TAE</div></div>
    <div class="hour-box"><div class="val">${c.tte} hs</div><div class="lbl">TTE</div></div>
  `;

  // Correlatives
  const renderChips = (ids) =>
    ids.length
      ? `<div class="corr-chips">${ids
          .map((id) => {
            const target = courseById.get(id);
            return `<button type="button" class="corr-chip" data-jump-id="${id}">#${id} ${escapeHtml(target?.nombre || "")}</button>`;
          })
          .join("")}</div>`
      : `<span class="muted">Ninguna</span>`;

  const unlocks = ASIGNATURAS.filter(
    (other) =>
      other.aprobada_cursar.includes(c.id) ||
      other.regularizada_cursar.includes(c.id)
  ).map((o) => o.id);

  $("#modal-correlatives").innerHTML = `
    <div><strong>Aprobada para cursar:</strong> ${renderChips(c.aprobada_cursar)}</div>
    <div><strong>Regularizada para cursar / Aprobada para rendir:</strong> ${renderChips(c.regularizada_cursar)}</div>
    ${c.cre_req ? `<div><strong>Requerimiento de créditos:</strong> <span class="badge badge-cre">${c.cre_req} CRE</span></div>` : ""}
    <div><strong>Habilita el cursado de:</strong> ${renderChips(unlocks)}</div>
  `;

  $("#modal-correlatives").querySelectorAll("[data-jump-id]").forEach((chip) => {
    chip.addEventListener("click", () => openCourseModal(Number(chip.dataset.jumpId)));
  });

  $("#modal-contenidos").textContent = c.contenidos_minimos;
  $("#modal-fundamentacion").textContent = c.fundamentacion || "—";
  $("#modal-objetivos").innerHTML = (c.objetivos || [])
    .map((o) => `<li>${escapeHtml(o)}</li>`)
    .join("");
  $("#modal-articulacion").textContent = c.articulacion || "—";
  $("#modal-equivalencia").textContent = c.equivalencia || "—";

  renderModalInterestBox(c);
  $("#course-modal").classList.remove("hidden");
}

function renderModalInterestBox(course) {
  const container = $("#modal-interest-content");
  if (!dataService.currentUser) {
    container.innerHTML = `
      <p class="muted" style="margin-bottom:0.65rem;">Iniciá sesión con tu cuenta para postularte como participante del equipo de cátedra o docente a cargo.</p>
      <div id="modal-login-btn-wrap"></div>
    `;
    const wrap = $("#modal-login-btn-wrap");
    if (dataService.isSupabase) {
      wrap.innerHTML = `<button class="btn btn-google" id="btn-modal-google">Ingresar con Google</button>`;
      $("#btn-modal-google").addEventListener("click", () => dataService.signInWithGoogle());
    } else {
      wrap.innerHTML = `<button class="btn btn-primary" id="btn-modal-demo">Ingresar (Modo Demo)</button>`;
      $("#btn-modal-demo").addEventListener("click", () => {
        $("#demo-login-modal").classList.remove("hidden");
      });
    }
    return;
  }

  const existing = state.myInterests.find((i) => i.course_id === course.id);
  container.innerHTML = `
    <form id="modal-interest-form" class="interest-form-row">
      <div class="role-checkboxes">
        <label class="checkbox-label">
          <input type="checkbox" id="chk-participant" ${existing?.wants_participant ? "checked" : ""} />
          <span>Participante del equipo de cátedra</span>
        </label>
        <label class="checkbox-label">
          <input type="checkbox" id="chk-charge" ${existing?.wants_charge ? "checked" : ""} />
          <span>Docente a cargo de la asignatura</span>
        </label>
      </div>
      <div class="form-field">
        <label for="interest-comment">Comentarios / experiencia / disponibilidad (opcional)</label>
        <textarea id="interest-comment" rows="2" placeholder="Ej: experiencia previa en la temática, interés en dictar prácticos, etc.">${escapeHtml(existing?.comment || "")}</textarea>
      </div>
      <div class="form-actions">
        ${existing ? `<button type="button" id="btn-delete-interest" class="btn btn-danger-outline">Quitar mi postulación</button>` : ""}
        <button type="submit" class="btn btn-primary">${existing ? "Actualizar postulación" : "Guardar postulación"}</button>
      </div>
    </form>
  `;

  $("#modal-interest-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const wants_participant = $("#chk-participant").checked;
    const wants_charge = $("#chk-charge").checked;
    const comment = $("#interest-comment").value;

    if (!wants_participant && !wants_charge && !existing) {
      showToast("Seleccioná al menos un rol (Participante o Docente a cargo).");
      return;
    }

    try {
      await dataService.saveCourseInterest({
        course_id: course.id,
        wants_participant,
        wants_charge,
        comment
      });
      await refreshUserData();
      renderAll();
      renderModalInterestBox(course);
      showToast(
        wants_participant || wants_charge
          ? "Postulación guardada correctamente."
          : "Postulación eliminada."
      );
    } catch (err) {
      showToast("Error al guardar: " + err.message);
    }
  });

  if (existing) {
    $("#btn-delete-interest").addEventListener("click", async () => {
      try {
        await dataService.deleteCourseInterest(course.id);
        await refreshUserData();
        renderAll();
        renderModalInterestBox(course);
        showToast("Postulación eliminada.");
      } catch (err) {
        showToast("Error al eliminar: " + err.message);
      }
    });
  }
}

function closeCourseModal() {
  $("#course-modal").classList.add("hidden");
}

// ============================================================================
// MY INTERESTS TAB
// ============================================================================
function populateQuickAddSelect() {
  const sel = $("#quick-add-course");
  sel.innerHTML =
    `<option value="">Seleccionar una asignatura para postularse...</option>` +
    ASIGNATURAS.map(
      (c) => `<option value="${c.id}">#${c.id} — ${escapeHtml(c.nombre)} (${c.anio === 0 ? "Transv." : c.anio + "° Año"})</option>`
    ).join("");
}

function renderMyInterests() {
  const unauth = $("#my-interests-unauth");
  const auth = $("#my-interests-auth");

  if (!dataService.currentUser) {
    unauth.classList.remove("hidden");
    auth.classList.add("hidden");
    const actions = $("#unauth-actions");
    if (dataService.isSupabase) {
      actions.innerHTML = `<button class="btn btn-google" id="btn-tab-google">Ingresar con Google</button>`;
      $("#btn-tab-google").addEventListener("click", () => dataService.signInWithGoogle());
    } else {
      actions.innerHTML = `<button class="btn btn-primary" id="btn-tab-demo">Ingresar (Modo Demo)</button>`;
      $("#btn-tab-demo").addEventListener("click", () => $("#demo-login-modal").classList.remove("hidden"));
    }
    return;
  }

  unauth.classList.add("hidden");
  auth.classList.remove("hidden");

  if (state.myProfile) {
    $("#prof-name").value = state.myProfile.full_name || "";
    $("#prof-email").value = state.myProfile.email || dataService.currentUser.email;
    $("#prof-dept").value = state.myProfile.department || "";
    $("#prof-position").value = state.myProfile.current_position || "";
    $("#prof-current-courses").value = state.myProfile.current_courses || "";
    $("#prof-notes").value = state.myProfile.general_notes || "";
  }

  const list = $("#my-interests-list");
  if (state.myInterests.length === 0) {
    list.innerHTML = `
      <div class="empty-state" style="padding:1.5rem;">
        <p>Todavía no expresaste interés en ninguna asignatura. Usá el selector superior o explorá el Diagrama.</p>
      </div>
    `;
    return;
  }

  list.innerHTML = state.myInterests
    .map((item) => {
      const c = courseById.get(item.course_id);
      if (!c) return "";
      return `
        <div class="interest-item">
          <div class="interest-item-main">
            <h3>#${c.id} — ${escapeHtml(c.nombre)}</h3>
            <div class="interest-item-roles">
              ${item.wants_charge ? '<span class="badge badge-charge">Docente a cargo</span>' : ""}
              ${item.wants_participant ? '<span class="badge badge-part">Participante equipo de cátedra</span>' : ""}
              <span class="badge badge-cre">${c.anio === 0 ? "Transversal" : `${c.anio}° Año · Cuat. ${c.cuatrimestre}`}</span>
            </div>
            ${item.comment ? `<p class="interest-item-comment">"${escapeHtml(item.comment)}"</p>` : ""}
          </div>
          <div style="display:flex;gap:0.4rem;">
            <button class="btn btn-xs btn-outline btn-edit-interest" data-id="${c.id}">Editar</button>
            <button class="btn btn-xs btn-danger-outline btn-remove-interest" data-id="${c.id}">Quitar</button>
          </div>
        </div>
      `;
    })
    .join("");

  list.querySelectorAll(".btn-edit-interest").forEach((b) => {
    b.addEventListener("click", () => openCourseModal(Number(b.dataset.id)));
  });

  list.querySelectorAll(".btn-remove-interest").forEach((b) => {
    b.addEventListener("click", async () => {
      try {
        await dataService.deleteCourseInterest(Number(b.dataset.id));
        await refreshUserData();
        renderAll();
        showToast("Postulación quitada.");
      } catch (err) {
        showToast("Error: " + err.message);
      }
    });
  });
}

// ============================================================================
// COORDINATOR CONSOLIDATED DASHBOARD
// ============================================================================
function renderCoordinator() {
  if (!dataService.isCoordinator) return;

  const { profiles, interests } = state.coordData;
  const profileMap = new Map(profiles.map((p) => [p.id, p]));

  // Stats
  const coursesWithCharge = new Set(
    interests.filter((i) => i.wants_charge).map((i) => i.course_id)
  );
  const coursesWithAny = new Set(interests.map((i) => i.course_id));
  const uniqueProfs = new Set(interests.map((i) => i.user_id));

  $("#coord-stats").innerHTML = `
    <div class="stat-card">
      <div class="stat-value">${uniqueProfs.size}</div>
      <div class="stat-label">Docentes con postulaciones</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${interests.length}</div>
      <div class="stat-label">Postulaciones totales</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${coursesWithCharge.size} / ${ASIGNATURAS.length}</div>
      <div class="stat-label">Espacios con postulante "A cargo"</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${ASIGNATURAS.length - coursesWithAny.size}</div>
      <div class="stat-label">Espacios sin ningún interesado</div>
    </div>
  `;

  const container = $("#coord-content");
  const q = state.coordSearch;

  if (state.coordViewMode === "by-course") {
    const filteredCourses = ASIGNATURAS.filter((c) => {
      const cInterests = interests.filter((i) => i.course_id === c.id);
      const hasCharge = cInterests.some((i) => i.wants_charge);
      const hasAny = cInterests.length > 0;

      if (state.coordFilterStatus === "no-charge" && hasCharge) return false;
      if (state.coordFilterStatus === "no-interest" && hasAny) return false;
      if (state.coordFilterStatus === "with-interest" && !hasAny) return false;

      if (!q) return true;
      const courseMatch = `${c.id} ${c.nombre}`.toLowerCase().includes(q);
      const profMatch = cInterests.some((i) => {
        const p = profileMap.get(i.user_id);
        return (
          p &&
          `${p.full_name} ${p.email} ${p.department}`.toLowerCase().includes(q)
        );
      });
      return courseMatch || profMatch;
    });

    container.innerHTML = filteredCourses
      .map((c) => {
        const cInterests = interests.filter((i) => i.course_id === c.id);
        const chargeCount = cInterests.filter((i) => i.wants_charge).length;
        const partCount = cInterests.filter((i) => i.wants_participant).length;

        return `
          <div class="coord-course-card">
            <div class="coord-course-header">
              <h3>#${c.id} — ${escapeHtml(c.nombre)} <span class="muted" style="font-weight:400;">(${c.anio === 0 ? "Transversal" : `${c.anio}° Año · Cuat. ${c.cuatrimestre}`} · ${c.cre} CRE)</span></h3>
              <div style="display:flex;gap:0.4rem;">
                ${
                  chargeCount > 0
                    ? `<span class="badge badge-charge">${chargeCount} a cargo</span>`
                    : `<span class="badge badge-missing">Sin docente a cargo</span>`
                }
                <span class="badge badge-part">${partCount} participante(s)</span>
              </div>
            </div>
            ${
              cInterests.length === 0
                ? `<p class="muted" style="margin:0;">Sin postulaciones registradas aún.</p>`
                : `
                <table class="coord-signups-table">
                  <thead>
                    <tr>
                      <th>Docente</th>
                      <th>Departamento</th>
                      <th>Rol(es)</th>
                      <th>Comentarios</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${cInterests
                      .map((i) => {
                        const p = profileMap.get(i.user_id) || {};
                        return `
                          <tr>
                            <td><strong>${escapeHtml(p.full_name || "Sin nombre")}</strong><br/><span class="muted">${escapeHtml(p.email || "")}</span></td>
                            <td>${escapeHtml(p.department || "—")}${p.current_position ? `<br/><span class="muted">${escapeHtml(p.current_position)}</span>` : ""}</td>
                            <td>
                              ${i.wants_charge ? '<span class="badge badge-charge">A cargo</span> ' : ""}
                              ${i.wants_participant ? '<span class="badge badge-part">Participante</span>' : ""}
                            </td>
                            <td>${escapeHtml(i.comment || "—")}</td>
                          </tr>
                        `;
                      })
                      .join("")}
                  </tbody>
                </table>
              `
            }
          </div>
        `;
      })
      .join("");
  } else {
    // By Professor
    const filteredProfiles = profiles.filter((p) => {
      if (!q) return true;
      return `${p.full_name} ${p.email} ${p.department}`.toLowerCase().includes(q);
    });

    container.innerHTML = filteredProfiles.length
      ? filteredProfiles
          .map((p) => {
            const pInterests = interests.filter((i) => i.user_id === p.id);
            return `
              <div class="coord-course-card">
                <div class="coord-course-header">
                  <div>
                    <h3>${escapeHtml(p.full_name || p.email)}</h3>
                    <p class="muted" style="margin:0;">${escapeHtml(p.email)} · ${escapeHtml(p.department || "Sin depto.")} ${p.current_position ? "· " + escapeHtml(p.current_position) : ""}</p>
                    ${p.current_courses ? `<p class="muted" style="margin:0;">Plan actual: ${escapeHtml(p.current_courses)}</p>` : ""}
                    ${p.general_notes ? `<p class="muted" style="margin:0;">Obs: ${escapeHtml(p.general_notes)}</p>` : ""}
                  </div>
                  <span class="badge badge-cre">${pInterests.length} asignatura(s)</span>
                </div>
                ${
                  pInterests.length === 0
                    ? `<p class="muted" style="margin:0;">Sin asignaturas seleccionadas.</p>`
                    : `
                    <table class="coord-signups-table">
                      <thead>
                        <tr><th>Asignatura</th><th>Rol(es)</th><th>Comentarios</th></tr>
                      </thead>
                      <tbody>
                        ${pInterests
                          .map((i) => {
                            const c = courseById.get(i.course_id);
                            return `
                              <tr>
                                <td><strong>#${i.course_id}</strong> — ${escapeHtml(c?.nombre || "")}</td>
                                <td>
                                  ${i.wants_charge ? '<span class="badge badge-charge">A cargo</span> ' : ""}
                                  ${i.wants_participant ? '<span class="badge badge-part">Participante</span>' : ""}
                                </td>
                                <td>${escapeHtml(i.comment || "—")}</td>
                              </tr>
                            `;
                          })
                          .join("")}
                      </tbody>
                    </table>
                  `
                }
              </div>
            `;
          })
          .join("")
      : `<div class="card empty-state"><p>No hay docentes registrados que coincidan con el filtro.</p></div>`;
  }
}

function exportConsolidated(sep) {
  const { profiles, interests } = state.coordData;
  const profileMap = new Map(profiles.map((p) => [p.id, p]));
  const headers = [
    "ID_Asignatura",
    "Año",
    "Cuatrimestre",
    "Asignatura",
    "Docente",
    "Email",
    "Departamento",
    "Cargo_Actual",
    "Docente_a_Cargo",
    "Participante_Catedra",
    "Comentario_Asignatura",
    "Observaciones_Generales"
  ];

  const sanitize = (v) => {
    const s = String(v ?? "").replace(/\r?\n/g, " ");
    if (sep === "," && (s.includes(",") || s.includes('"'))) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s.replace(/\t/g, " ");
  };

  const rows = [headers.join(sep)];
  for (const i of interests) {
    const c = courseById.get(i.course_id) || {};
    const p = profileMap.get(i.user_id) || {};
    rows.push(
      [
        i.course_id,
        c.anio === 0 ? "Transversal" : c.anio,
        c.cuatrimestre,
        c.nombre,
        p.full_name,
        p.email,
        p.department,
        p.current_position,
        i.wants_charge ? "SI" : "NO",
        i.wants_participant ? "SI" : "NO",
        i.comment,
        p.general_notes
      ]
        .map(sanitize)
        .join(sep)
    );
  }

  const ext = sep === "\t" ? "tsv" : "csv";
  const blob = new Blob(["\uFEFF" + rows.join("\n")], {
    type: "text/plain;charset=utf-8"
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `consulta_docente_plan2026.${ext}`;
  a.click();
  URL.revokeObjectURL(url);
}

init();
