/**
 * LeaveFlow Pro - Main Application Logic
 */

document.addEventListener("DOMContentLoaded", () => {
  // Global State
  const state = {
    employees: [],
    leaveRequests: [],
    holidays: [],
    currentEmployee: null,
    tempAttachments: [], // รายการไฟล์แนบชั่วคราวในฟอร์มยื่นคำขอ
    selectedLeaveRequest: null,
    charts: {
      leaveType: null,
      department: null
    },
    activeStatusFilter: "ALL"
  };

  // Date Pickers
  let startDatePicker = null;
  let endDatePicker = null;
  let holidayDatePicker = null;
  let reportStartDatePicker = null;
  let reportEndDatePicker = null;

  // Initialize
  initLucide();
  initDatePickers();
  initEventHandlers();
  loadData();

  /**
   * เรนเดอร์ไอคอน Lucide
   */
  function initLucide() {
    if (window.lucide) {
      lucide.createIcons();
    }
  }

  /**
   * เริ่มต้น Date Pickers (Flatpickr)
   */
  function initDatePickers() {
    const config = {
      dateFormat: "Y-m-d",
      altInput: true,
      altFormat: "j F Y",
      locale: "th",
      disableMobile: true
    };

    startDatePicker = flatpickr("#leave-form-start-date", {
      ...config,
      onChange: () => calculateFormDays()
    });

    endDatePicker = flatpickr("#leave-form-end-date", {
      ...config,
      onChange: () => calculateFormDays()
    });

    holidayDatePicker = flatpickr("#holiday-modal-date", {
      ...config
    });

    reportStartDatePicker = flatpickr("#report-filter-start", {
      ...config,
      onChange: () => renderReports()
    });

    reportEndDatePicker = flatpickr("#report-filter-end", {
      ...config,
      onChange: () => renderReports()
    });
  }

  /**
   * ดึงข้อมูลทั้งหมดและรีเฟรชหน้าจอ
   */
  async function loadData() {
    updateConnectionIndicator();
    try {
      const data = await window.leaveAPI.fetchAllData();
      state.employees = data.employees || [];
      state.leaveRequests = data.leaveRequests || [];
      state.holidays = data.holidays || [];

      // อัปเดต UI แต่ละส่วน
      updateDashboardKPIs();
      renderDashboardCharts();
      renderDashboardRecentTable();
      populateEmployeeSelects();
      populateDepartmentSelects();
      renderApprovalsTable();
      renderEmployeeCards();
      renderHolidaysTable();
      renderReports();
      updatePendingBadge();
      initLucide();
    } catch (err) {
      console.error("Load data error:", err);
      Swal.fire({
        icon: "error",
        title: "เกิดข้อผิดพลาดในการโหลดข้อมูล",
        text: err.message
      });
    }
  }

  /**
   * อัปเดตแถบสถานะการเชื่อมต่อ (Live vs Demo)
   */
  function updateConnectionIndicator() {
    const isLive = window.leaveAPI.isLive();
    const statusPill = document.getElementById("sidebar-db-status");
    const descPill = document.getElementById("sidebar-db-desc");
    const settingUrlInput = document.getElementById("setting-gas-url");

    if (settingUrlInput) {
      settingUrlInput.value = window.leaveAPI.getGasUrl();
    }

    if (isLive) {
      statusPill.className = "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-500/20 text-blue-400 border border-blue-500/30";
      statusPill.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse"></span> Google Sheet Live`;
      descPill.textContent = "เชื่อมต่อ Google Sheet แล้ว";
    } else {
      statusPill.className = "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30";
      statusPill.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Offline / Demo`;
      descPill.textContent = "โหมดจำลอง (LocalStorage)";
    }
  }

  /**
   * อัปเดตตัวเลขแจ้งเตือน Pending ในเมนู Sidebar
   */
  function updatePendingBadge() {
    const pendingCount = state.leaveRequests.filter(r => r.status === "Pending").length;
    const badge = document.getElementById("badge-pending-count");
    if (badge) {
      if (pendingCount > 0) {
        badge.textContent = pendingCount;
        badge.classList.remove("hidden");
      } else {
        badge.classList.add("hidden");
      }
    }
  }

  /**
   * 1. Dashboard: KPIs
   */
  function updateDashboardKPIs() {
    const todayStr = new Date().toISOString().slice(0, 10);
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();

    // กำลังลาในวันนี้ (Approved และวันที่ตรงกับวันนี้)
    const todayLeaves = state.leaveRequests.filter(r => {
      if (r.status !== "Approved") return false;
      return r.start_date <= todayStr && todayStr <= r.end_date;
    }).length;

    // คำขอรออนุมัติ
    const pendingLeaves = state.leaveRequests.filter(r => r.status === "Pending").length;

    // อนุมัติในเดือนนี้
    const approvedMonth = state.leaveRequests.filter(r => {
      if (r.status !== "Approved") return false;
      const d = new Date(r.start_date);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    }).length;

    // พนักงานทั้งหมด
    const totalEmployees = state.employees.length;

    document.getElementById("kpi-today-leaves").textContent = todayLeaves;
    document.getElementById("kpi-pending-leaves").textContent = pendingLeaves;
    document.getElementById("kpi-approved-month").textContent = approvedMonth;
    document.getElementById("kpi-total-employees").textContent = totalEmployees;
  }

  /**
   * 1. Dashboard: Charts (Chart.js)
   */
  function renderDashboardCharts() {
    const currentYear = new Date().getFullYear();
    const currentYearRequests = state.leaveRequests.filter(r => {
      return new Date(r.start_date).getFullYear() === currentYear && (r.status === "Approved" || r.status === "Pending");
    });

    // 1. Leave Type Doughnut Chart
    const typeCounts = {
      annual: 0,
      personal: 0,
      sick: 0,
      other: 0
    };

    currentYearRequests.forEach(r => {
      const days = Number(r.total_days || 0);
      if (r.leave_type === "annual") typeCounts.annual += days;
      else if (r.leave_type === "personal") typeCounts.personal += days;
      else if (r.leave_type === "sick") typeCounts.sick += days;
      else typeCounts.other += days;
    });

    const ctxType = document.getElementById("leaveTypeChart");
    if (ctxType) {
      if (state.charts.leaveType) state.charts.leaveType.destroy();
      state.charts.leaveType = new Chart(ctxType, {
        type: "doughnut",
        data: {
          labels: ["พักร้อน", "ลากิจ", "ลาป่วย", "อื่นๆ"],
          datasets: [{
            data: [typeCounts.annual, typeCounts.personal, typeCounts.sick, typeCounts.other],
            backgroundColor: ["#3b82f6", "#a855f7", "#f43f5e", "#f59e0b"],
            borderWidth: 2,
            borderColor: "#ffffff"
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: "bottom", labels: { boxWidth: 12, font: { family: "Prompt", size: 11 } } }
          },
          cutout: "65%"
        }
      });
    }

    // 2. Department Bar Chart
    const deptTotals = {};
    CONFIG.DEPARTMENTS.forEach(d => {
      // เอาชื่อย่อมาทำ label เพื่อความกะทัดรัด
      const shortName = d.split("(")[0].trim();
      deptTotals[shortName] = 0;
    });

    currentYearRequests.forEach(r => {
      const deptShort = (r.department || "ไม่ระบุ").split("(")[0].trim();
      const days = Number(r.total_days || 0);
      deptTotals[deptShort] = (deptTotals[deptShort] || 0) + days;
    });

    const ctxDept = document.getElementById("departmentLeaveChart");
    if (ctxDept) {
      if (state.charts.department) state.charts.department.destroy();
      state.charts.department = new Chart(ctxDept, {
        type: "bar",
        data: {
          labels: Object.keys(deptTotals),
          datasets: [{
            label: "วันลาสะสม (วัน)",
            data: Object.values(deptTotals),
            backgroundColor: "#6366f1",
            borderRadius: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false }
          },
          scales: {
            y: { beginAtZero: true, grid: { color: "#f1f5f9" } },
            x: { grid: { display: false }, ticks: { font: { family: "Prompt", size: 10 } } }
          }
        }
      });
    }
  }

  /**
   * 1. Dashboard: Recent Table
   */
  function renderDashboardRecentTable() {
    const tbody = document.getElementById("dashboard-recent-table");
    if (!tbody) return;

    const recent = [...state.leaveRequests].slice(0, 5);
    if (recent.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" class="text-center py-6 text-slate-400">ยังไม่มีประวัติคำขอลา</td></tr>`;
      return;
    }

    tbody.innerHTML = recent.map(req => {
      const typeInfo = CONFIG.LEAVE_TYPES[req.leave_type] || CONFIG.LEAVE_TYPES.other;
      const statusBadge = getStatusBadge(req.status);

      return `
        <tr class="hover:bg-slate-50 transition-colors">
          <td class="py-3 px-4 font-mono font-medium text-slate-700">${req.request_id}</td>
          <td class="py-3 px-4 font-semibold text-slate-800">${escapeHtml(req.emp_name)}</td>
          <td class="py-3 px-4 text-slate-500">${escapeHtml(req.department)}</td>
          <td class="py-3 px-4">
            <span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${typeInfo.badgeClass}">
              ${typeInfo.name.split(" ")[0]}
            </span>
          </td>
          <td class="py-3 px-4 font-mono text-[11px] text-slate-600">${req.start_date} ถึง ${req.end_date}</td>
          <td class="py-3 px-4 text-center font-bold text-slate-700">${req.total_days}</td>
          <td class="py-3 px-4 text-center">${statusBadge}</td>
          <td class="py-3 px-4 text-right">
            <button onclick="window.viewLeaveDetail('${req.request_id}')" class="text-blue-600 hover:text-blue-800 font-medium text-xs">
              ดูข้อมูล
            </button>
          </td>
        </tr>
      `;
    }).join("");
  }

  /**
   * เติมข้อมูลลง Dropdown พนักงานในหน้าต่างๆ
   */
  function populateEmployeeSelects() {
    const leaveSelect = document.getElementById("leave-form-emp-select");
    const reportSelect = document.getElementById("report-filter-emp");

    const empOptions = state.employees.map(emp => {
      return `<option value="${emp.emp_id}">${emp.emp_id} - ${escapeHtml(emp.name)} (${escapeHtml(emp.department)})</option>`;
    }).join("");

    if (leaveSelect) {
      leaveSelect.innerHTML = `<option value="">-- ค้นหาและเลือกพนักงาน --</option>` + empOptions;
    }

    if (reportSelect) {
      reportSelect.innerHTML = `<option value="">-- พนักงานทุกคน --</option>` + empOptions;
    }
  }

  /**
   * เติมข้อมูลแผนกลง Dropdown
   */
  function populateDepartmentSelects() {
    const deptOptions = CONFIG.DEPARTMENTS.map(d => `<option value="${d}">${d}</option>`).join("");
    
    const modalDeptSelect = document.getElementById("emp-modal-dept");
    if (modalDeptSelect) modalDeptSelect.innerHTML = deptOptions;

    const filterDeptSelect = document.getElementById("filter-employee-dept");
    if (filterDeptSelect) {
      filterDeptSelect.innerHTML = `<option value="">-- ทุกแผนก --</option>` + deptOptions;
    }
  }

  /**
   * ฟังก์ชันคำนวณวันลาจริงในแบบฟอร์ม (ตัดวันเสาร์-อาทิตย์ และวันหยุดนักขัตฤกษ์)
   */
  function calculateFormDays() {
    const startDate = document.getElementById("leave-form-start-date").value;
    const endDate = document.getElementById("leave-form-end-date").value;
    const durationType = document.getElementById("leave-form-duration-type").value;
    const banner = document.getElementById("leave-calc-details");
    const totalDaysSpan = document.getElementById("calculated-total-days");

    if (!startDate || !endDate) {
      totalDaysSpan.textContent = "0";
      banner.textContent = "กรุณาเลือกวันที่เริ่มและสิ้นสุดการลา";
      return 0;
    }

    const workingDays = window.leaveAPI.calculateWorkingDays(startDate, endDate, durationType, state.holidays);
    totalDaysSpan.textContent = workingDays;

    if (workingDays === 0) {
      banner.innerHTML = `<span class="text-rose-600 font-semibold">ช่วงวันที่เลือกตรงกับวันหยุดทั้งหมด (วันเสาร์-อาทิตย์ หรือวันหยุดนักขัตฤกษ์)</span>`;
    } else {
      banner.textContent = `คำนวณวันทำงานสุทธิ (ตัดวันเสาร์-อาทิตย์ และวันหยุดนักขัตฤกษ์ออกแล้ว)`;
    }

    // ตรวจสอบโควตาคงเหลือของพนักงาน
    checkQuotaWarning(workingDays);
    return workingDays;
  }

  /**
   * ตรวจสอบว่าลาเกินวันลาคงเหลือหรือไม่
   */
  function checkQuotaWarning(requestedDays) {
    if (!state.currentEmployee) return;

    const leaveType = document.getElementById("leave-form-type").value;
    const balances = window.leaveAPI.calculateEmployeeBalances(state.currentEmployee, state.leaveRequests);

    let remaining = 0;
    let typeName = "";

    if (leaveType === "annual") {
      remaining = balances.annual.remaining;
      typeName = "ลาพักร้อน";
    } else if (leaveType === "personal") {
      remaining = balances.personal.remaining;
      typeName = "ลากิจ";
    } else if (leaveType === "sick") {
      remaining = balances.sick.remaining;
      typeName = "ลาป่วย";
    } else {
      remaining = balances.other.remaining;
      typeName = "ลาอื่นๆ";
    }

    const banner = document.getElementById("leave-calc-details");
    if (requestedDays > remaining) {
      banner.innerHTML = `<span class="text-amber-700 font-bold">⚠️ แจ้งเตือน: จำนวนวันที่ลา (${requestedDays} วัน) เกินกว่าสิทธิ์ ${typeName} คงเหลือ (${remaining} วัน)</span>`;
    }
  }

  /**
   * อัปเดตแสดงโควตาวันลาคงเหลือของพนักงานที่ถูกเลือกในฟอร์มยื่นคำขอ
   */
  function updateEmployeeLiveQuota(empId) {
    const container = document.getElementById("emp-live-quota-container");
    const deptInput = document.getElementById("leave-form-emp-dept");

    if (!empId) {
      state.currentEmployee = null;
      if (container) container.classList.add("hidden");
      if (deptInput) deptInput.value = "";
      return;
    }

    const emp = state.employees.find(e => String(e.emp_id).trim() === String(empId).trim());
    state.currentEmployee = emp;

    if (emp) {
      if (deptInput) deptInput.value = `${emp.department} - ${emp.position || ""}`;
      const balances = window.leaveAPI.calculateEmployeeBalances(emp, state.leaveRequests);

      document.getElementById("quota-remain-annual").textContent = balances.annual.remaining;
      document.getElementById("quota-remain-personal").textContent = balances.personal.remaining;
      document.getElementById("quota-remain-sick").textContent = balances.sick.remaining;
      document.getElementById("quota-remain-other").textContent = balances.other.remaining;

      if (container) container.classList.remove("hidden");
      calculateFormDays();
    }
  }

  /**
   * 2. แนบเอกสารหลักฐาน (Multi-attachment handling)
   */
  async function handleFilesUpload(files) {
    if (!files || files.length === 0) return;

    for (let file of Array.from(files)) {
      // ตรวจสอบขนาดไฟล์ไม่เกิน 10MB
      if (file.size > 10 * 1024 * 1024) {
        Swal.fire({
          icon: "warning",
          title: "ไฟล์มีขนาดใหญ่เกินไป",
          text: `ไฟล์ ${file.name} มีขนาดเกิน 10MB`
        });
        continue;
      }

      try {
        const fileObj = await LeaveAPI.fileToBase64(file);
        state.tempAttachments.push(fileObj);
      } catch (err) {
        console.error("File read error:", err);
      }
    }

    renderAttachmentsPreview();
  }

  /**
   * เรนเดอร์รูปภาพ/ไฟล์แนบที่เลือกในฟอร์ม
   */
  function renderAttachmentsPreview() {
    const container = document.getElementById("attachment-preview-list");
    if (!container) return;

    if (state.tempAttachments.length === 0) {
      container.innerHTML = "";
      return;
    }

    container.innerHTML = state.tempAttachments.map((item, index) => {
      const isImg = item.type && item.type.startsWith("image/");
      const sizeKb = Math.round(item.size / 1024);

      return `
        <div class="relative group bg-white border border-slate-200 rounded-xl p-2.5 flex items-center gap-3 shadow-sm">
          ${isImg 
            ? `<img src="${item.base64}" alt="${escapeHtml(item.name)}" class="w-12 h-12 rounded-lg object-cover border border-slate-100 shrink-0">`
            : `<div class="w-12 h-12 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center shrink-0 font-bold text-xs"><i data-lucide="file" class="w-6 h-6"></i></div>`
          }
          <div class="min-w-0 flex-1">
            <p class="text-xs font-medium text-slate-800 truncate" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</p>
            <p class="text-[10px] text-slate-400">${sizeKb} KB</p>
          </div>
          <button type="button" onclick="window.removeAttachment(${index})" class="text-slate-400 hover:text-rose-600 p-1 rounded-lg transition-colors" title="ลบไฟล์นี้">
            <i data-lucide="trash-2" class="w-4 h-4"></i>
          </button>
        </div>
      `;
    }).join("");

    initLucide();
  }

  window.removeAttachment = function(index) {
    state.tempAttachments.splice(index, 1);
    renderAttachmentsPreview();
  };

  /**
   * 3. Approvals Table
   */
  function renderApprovalsTable() {
    const tbody = document.getElementById("approvals-table-body");
    const countInfo = document.getElementById("approvals-count-info");
    const searchTerm = (document.getElementById("filter-search-approvals")?.value || "").toLowerCase().trim();

    let filtered = [...state.leaveRequests];

    // Status filter
    if (state.activeStatusFilter !== "ALL") {
      filtered = filtered.filter(r => r.status === state.activeStatusFilter);
    }

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(r => {
        return (
          String(r.request_id).toLowerCase().includes(searchTerm) ||
          String(r.emp_id).toLowerCase().includes(searchTerm) ||
          String(r.emp_name).toLowerCase().includes(searchTerm) ||
          String(r.department).toLowerCase().includes(searchTerm)
        );
      });
    }

    if (countInfo) {
      countInfo.textContent = `แสดง ${filtered.length} จากทั้งหมด ${state.leaveRequests.length} รายการ`;
    }

    if (!tbody) return;
    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" class="text-center py-10 text-slate-400">ไม่พบข้อมูลคำขอลาตามเงื่อนไขที่เลือก</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(req => {
      const typeInfo = CONFIG.LEAVE_TYPES[req.leave_type] || CONFIG.LEAVE_TYPES.other;
      const statusBadge = getStatusBadge(req.status);
      const attachmentsCount = (req.attachments && Array.isArray(req.attachments)) ? req.attachments.length : 0;

      return `
        <tr class="hover:bg-slate-50 transition-colors">
          <td class="py-3 px-4">
            <span class="font-mono font-bold text-slate-800 block">${req.request_id}</span>
            <span class="text-[10px] text-slate-400">${new Date(req.created_at).toLocaleDateString('th-TH')}</span>
          </td>
          <td class="py-3 px-4">
            <span class="font-semibold text-slate-800 block">${escapeHtml(req.emp_name)}</span>
            <span class="text-[11px] text-slate-400">${escapeHtml(req.emp_id)} • ${escapeHtml(req.department)}</span>
          </td>
          <td class="py-3 px-4">
            <span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${typeInfo.badgeClass}">
              ${typeInfo.name.split(" ")[0]}
            </span>
          </td>
          <td class="py-3 px-4 font-mono text-xs text-slate-600">
            ${req.start_date} ถึง ${req.end_date}
            ${req.leave_duration_type !== "full" ? `<span class="block text-[10px] text-blue-600">(${req.leave_duration_type === "morning" ? "ครึ่งวันเช้า" : "ครึ่งวันบ่าย"})</span>` : ""}
          </td>
          <td class="py-3 px-4 text-center font-bold text-slate-700">${req.total_days}</td>
          <td class="py-3 px-4">
            ${attachmentsCount > 0 
              ? `<span class="inline-flex items-center gap-1 text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded-md border border-blue-200">
                  <i data-lucide="paperclip" class="w-3.5 h-3.5"></i> ${attachmentsCount} ไฟล์
                </span>` 
              : `<span class="text-slate-400 text-[11px]">ไม่มี</span>`}
          </td>
          <td class="py-3 px-4 text-center">${statusBadge}</td>
          <td class="py-3 px-4 text-right">
            <button onclick="window.viewLeaveDetail('${req.request_id}')" class="bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-200 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors">
              ตรวจสอบ / จัดการ
            </button>
          </td>
        </tr>
      `;
    }).join("");

    initLucide();
  }

  /**
   * ดูรายละเอียดคำขอและอนุมัติใน Modal
   */
  window.viewLeaveDetail = function(requestId) {
    const req = state.leaveRequests.find(r => r.request_id === requestId);
    if (!req) return;

    state.selectedLeaveRequest = req;

    document.getElementById("detail-modal-req-id").textContent = req.request_id;
    document.getElementById("detail-modal-created-at").textContent = "ยื่นคำขอเมื่อ: " + new Date(req.created_at).toLocaleString("th-TH");
    document.getElementById("detail-modal-emp-name").textContent = req.emp_name;
    document.getElementById("detail-modal-emp-id").textContent = "รหัส: " + req.emp_id;
    document.getElementById("detail-modal-dept").textContent = req.department;

    const typeInfo = CONFIG.LEAVE_TYPES[req.leave_type] || CONFIG.LEAVE_TYPES.other;
    document.getElementById("detail-modal-type").textContent = typeInfo.name;
    document.getElementById("detail-modal-days").textContent = `${req.total_days} วันทำการ`;
    document.getElementById("detail-modal-date-range").textContent = `${req.start_date} ถึง ${req.end_date} (${req.leave_duration_type === "full" ? "เต็มวัน" : (req.leave_duration_type === "morning" ? "ครึ่งวันเช้า" : "ครึ่งวันบ่าย")})`;
    document.getElementById("detail-modal-reason").textContent = req.reason || "-";

    // Status box
    const statusBox = document.getElementById("detail-modal-status-box");
    const statusSpan = document.getElementById("detail-modal-status");
    const approverSpan = document.getElementById("detail-modal-approver");
    const approverLabel = document.getElementById("detail-modal-approver-label");

    statusSpan.innerHTML = getStatusBadge(req.status);
    if (req.status === "Approved") {
      approverLabel.textContent = "อนุมัติโดย:";
      approverSpan.textContent = req.approved_by || "HR";
      statusBox.className = "p-3 rounded-xl border border-emerald-200 bg-emerald-50 flex items-center justify-between";
    } else if (req.status === "Rejected") {
      approverLabel.textContent = "ไม่อนุมัติโดย / เหตุผล:";
      approverSpan.textContent = `${req.approved_by || "HR"} (${req.rejection_reason || "ไม่ได้ระบุเหตุผล"})`;
      statusBox.className = "p-3 rounded-xl border border-rose-200 bg-rose-50 flex items-center justify-between";
    } else {
      approverLabel.textContent = "สถานะ:";
      approverSpan.textContent = "รอผู้มีอำนาจตรวจสอบ";
      statusBox.className = "p-3 rounded-xl border border-amber-200 bg-amber-50 flex items-center justify-between";
    }

    // Attachments Preview
    const attachmentsContainer = document.getElementById("detail-modal-attachments");
    const attachments = req.attachments || [];
    if (attachments.length === 0) {
      attachmentsContainer.innerHTML = `<p class="text-slate-400 col-span-2 italic">ไม่มีไฟล์แนบในคำขอนี้</p>`;
    } else {
      attachmentsContainer.innerHTML = attachments.map(item => {
        const isImg = (item.type && item.type.startsWith("image/")) || (item.url && item.url.match(/\.(jpeg|jpg|gif|png)/i));
        const fileUrl = item.url || item.base64 || "#";

        return `
          <div class="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center gap-3">
            ${isImg 
              ? `<a href="${fileUrl}" target="_blank" class="block shrink-0"><img src="${fileUrl}" class="w-14 h-14 rounded-lg object-cover border border-slate-200 shadow-sm hover:opacity-80 transition-opacity"></a>` 
              : `<div class="w-14 h-14 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center shrink-0 font-bold"><i data-lucide="file-text" class="w-7 h-7"></i></div>`}
            <div class="min-w-0 flex-1">
              <p class="font-semibold text-slate-800 text-xs truncate" title="${escapeHtml(item.name || 'เอกสารแนบ')}">${escapeHtml(item.name || 'เอกสารแนบ')}</p>
              <a href="${fileUrl}" target="_blank" download="${escapeHtml(item.name || 'file')}" class="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-800 font-medium mt-1">
                <i data-lucide="external-link" class="w-3.5 h-3.5"></i> เปิดดู / ดาวน์โหลด
              </a>
            </div>
          </div>
        `;
      }).join("");
    }

    // ปรับปุ่มการอนุมัติ (หากอนุมัติหรือไม่อนุมัติไปแล้ว ให้แสดงหรือซ่อน)
    const actionsGroup = document.getElementById("approval-actions-group");
    const rejectionInputGroup = document.getElementById("rejection-input-group");
    if (rejectionInputGroup) rejectionInputGroup.classList.add("hidden");

    if (req.status === "Pending") {
      actionsGroup.classList.remove("hidden");
    } else {
      actionsGroup.classList.add("hidden");
    }

    // แสดง Modal
    document.getElementById("modal-leave-detail").classList.remove("hidden");
    initLucide();
  };

  /**
   * 4. Employee Quota & Balances
   */
  function renderEmployeeCards() {
    const grid = document.getElementById("employees-card-grid");
    const searchTerm = (document.getElementById("filter-search-employee")?.value || "").toLowerCase().trim();
    const deptFilter = document.getElementById("filter-employee-dept")?.value || "";

    if (!grid) return;

    let filtered = [...state.employees];
    if (deptFilter) {
      filtered = filtered.filter(e => e.department === deptFilter);
    }
    if (searchTerm) {
      filtered = filtered.filter(e => {
        return (
          String(e.emp_id).toLowerCase().includes(searchTerm) ||
          String(e.name).toLowerCase().includes(searchTerm)
        );
      });
    }

    if (filtered.length === 0) {
      grid.innerHTML = `<div class="col-span-3 text-center py-12 text-slate-400 bg-white rounded-2xl border border-slate-200">ไม่พบข้อมูลพนักงานที่ตรงกับคำค้นหา</div>`;
      return;
    }

    grid.innerHTML = filtered.map(emp => {
      const balances = window.leaveAPI.calculateEmployeeBalances(emp, state.leaveRequests);

      // คำนวณเปอร์เซ็นต์ที่ใช้ไปของพักร้อน
      const annualPercent = balances.annual.quota > 0 
        ? Math.min(100, Math.round((balances.annual.used / balances.annual.quota) * 100)) 
        : 0;

      return `
        <div class="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover-lift flex flex-col justify-between space-y-4">
          <div>
            <div class="flex items-start justify-between">
              <div>
                <span class="inline-block px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-slate-100 text-slate-700 mb-1">${emp.emp_id}</span>
                <h4 class="font-bold text-slate-800 text-base leading-snug">${escapeHtml(emp.name)}</h4>
                <p class="text-xs text-slate-500">${escapeHtml(emp.department)}</p>
                <p class="text-[11px] text-slate-400">${escapeHtml(emp.position || "พนักงาน")}</p>
              </div>
              <div class="flex items-center gap-1">
                <button onclick="window.editEmployee('${emp.emp_id}')" class="p-1.5 text-slate-400 hover:text-blue-600 rounded-lg hover:bg-slate-100 transition-colors" title="แก้ไขข้อมูล">
                  <i data-lucide="edit-3" class="w-4 h-4"></i>
                </button>
                <button onclick="window.confirmDeleteEmployee('${emp.emp_id}')" class="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-slate-100 transition-colors" title="ลบพนักงาน">
                  <i data-lucide="trash-2" class="w-4 h-4"></i>
                </button>
              </div>
            </div>

            <!-- Annual Leave Progress Bar -->
            <div class="mt-4 pt-3 border-t border-slate-100">
              <div class="flex justify-between text-xs mb-1">
                <span class="font-medium text-slate-600">ใช้วันพักร้อนไปแล้ว</span>
                <span class="font-bold text-blue-600">${balances.annual.used} / ${balances.annual.quota} วัน (${annualPercent}%)</span>
              </div>
              <div class="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                <div class="bg-blue-600 h-2 rounded-full transition-all duration-500" style="width: ${annualPercent}%"></div>
              </div>
            </div>

            <!-- Quota Badges Grid -->
            <div class="grid grid-cols-4 gap-2 mt-4 text-center">
              <div class="bg-blue-50/70 p-2 rounded-xl border border-blue-100">
                <span class="text-[10px] text-blue-700 font-medium block">พักร้อนเหลือ</span>
                <span class="text-sm font-bold text-blue-900">${balances.annual.remaining}</span>
              </div>
              <div class="bg-purple-50/70 p-2 rounded-xl border border-purple-100">
                <span class="text-[10px] text-purple-700 font-medium block">ลากิจเหลือ</span>
                <span class="text-sm font-bold text-purple-900">${balances.personal.remaining}</span>
              </div>
              <div class="bg-rose-50/70 p-2 rounded-xl border border-rose-100">
                <span class="text-[10px] text-rose-700 font-medium block">ลาป่วยเหลือ</span>
                <span class="text-sm font-bold text-rose-900">${balances.sick.remaining}</span>
              </div>
              <div class="bg-amber-50/70 p-2 rounded-xl border border-amber-100">
                <span class="text-[10px] text-amber-700 font-medium block">อื่นๆ เหลือ</span>
                <span class="text-sm font-bold text-amber-900">${balances.other.remaining}</span>
              </div>
            </div>
          </div>

          <div class="pt-2 border-t border-slate-100 flex items-center justify-between">
            <span class="text-[11px] text-slate-400">โทร: ${escapeHtml(emp.phone || "-")}</span>
            <button onclick="window.viewEmployeeLeaveHistory('${emp.emp_id}')" class="text-xs text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1">
              ดูประวัติการลา <i data-lucide="chevron-right" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        </div>
      `;
    }).join("");

    initLucide();
  }

  /**
   * แก้ไขข้อมูลพนักงาน
   */
  window.editEmployee = function(empId) {
    const emp = state.employees.find(e => String(e.emp_id).trim() === String(empId).trim());
    if (!emp) return;

    document.getElementById("employee-modal-title").innerHTML = `<i data-lucide="user-cog" class="w-5 h-5 text-blue-600"></i> แก้ไขข้อมูลพนักงาน: ${emp.emp_id}`;
    document.getElementById("emp-modal-id").value = emp.emp_id;
    document.getElementById("emp-modal-id").readOnly = true;
    document.getElementById("emp-modal-name").value = emp.name;
    document.getElementById("emp-modal-dept").value = emp.department;
    document.getElementById("emp-modal-position").value = emp.position || "";
    document.getElementById("emp-modal-email").value = emp.email || "";
    document.getElementById("emp-modal-phone").value = emp.phone || "";
    document.getElementById("emp-modal-quota-annual").value = emp.annual_leave_quota;
    document.getElementById("emp-modal-quota-personal").value = emp.personal_leave_quota;
    document.getElementById("emp-modal-quota-sick").value = emp.sick_leave_quota;
    document.getElementById("emp-modal-quota-other").value = emp.other_leave_quota;

    document.getElementById("modal-employee").classList.remove("hidden");
    initLucide();
  };

  /**
   * ยืนยันการลบพนักงาน
   */
  window.confirmDeleteEmployee = async function(empId) {
    const confirm = await Swal.fire({
      icon: "warning",
      title: "ยืนยันการลบพนักงาน?",
      text: `ต้องการลบข้อมูลพนักงานรหัส ${empId} หรือไม่?`,
      showCancelButton: true,
      confirmButtonColor: "#ef4444",
      cancelButtonColor: "#64748b",
      confirmButtonText: "ใช่, ต้องการลบ",
      cancelButtonText: "ยกเลิก"
    });

    if (confirm.isConfirmed) {
      try {
        await window.leaveAPI.deleteEmployee(empId);
        Swal.fire({ icon: "success", title: "ลบพนักงานเรียบร้อย", timer: 1500, showConfirmButton: false });
        loadData();
      } catch (err) {
        Swal.fire({ icon: "error", title: "เกิดข้อผิดพลาด", text: err.message });
      }
    }
  };

  /**
   * ดูประวัติการลาของพนักงานรายบุคคล โดยเปิด Tab รายงานแล้วกรองให้อัตโนมัติ
   */
  window.viewEmployeeLeaveHistory = function(empId) {
    switchTab("tab-reports");
    const reportEmpSelect = document.getElementById("report-filter-emp");
    if (reportEmpSelect) {
      reportEmpSelect.value = empId;
      renderReports();
    }
  };

  /**
   * 5. Holidays Table
   */
  function renderHolidaysTable() {
    const tbody = document.getElementById("holidays-table-body");
    if (!tbody) return;

    if (state.holidays.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" class="text-center py-8 text-slate-400">ยังไม่มีข้อมูลวันหยุดนักขัตฤกษ์ในระบบ กรุณากดปุ่ม "โหลดวันหยุดไทยมาตรฐาน" หรือเพิ่มวันหยุดเอง</td></tr>`;
      return;
    }

    // เรียงตามวันที่
    const sorted = [...state.holidays].sort((a, b) => new Date(a.holiday_date) - new Date(b.holiday_date));

    tbody.innerHTML = sorted.map(h => {
      const dateObj = new Date(h.holiday_date);
      const thaiDate = dateObj.toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" });

      return `
        <tr class="hover:bg-slate-50 transition-colors">
          <td class="py-3 px-4 font-mono font-medium text-slate-800">${h.holiday_date} <span class="text-slate-400 font-sans">(${thaiDate})</span></td>
          <td class="py-3 px-4 font-semibold text-slate-800">${escapeHtml(h.name)}</td>
          <td class="py-3 px-4 text-center font-mono text-slate-500">${h.year || dateObj.getFullYear()}</td>
          <td class="py-3 px-4 text-right">
            <button onclick="window.confirmDeleteHoliday('${h.id}')" class="text-rose-600 hover:text-rose-800 font-medium text-xs">
              ลบออก
            </button>
          </td>
        </tr>
      `;
    }).join("");
  }

  window.confirmDeleteHoliday = async function(id) {
    try {
      await window.leaveAPI.deleteHoliday(id);
      loadData();
    } catch (err) {
      Swal.fire({ icon: "error", title: "ไม่สามารถลบได้", text: err.message });
    }
  };

  /**
   * 6. Reports & Export
   */
  function renderReports() {
    const tbody = document.getElementById("report-table-body");
    const summaryText = document.getElementById("report-summary-text");
    const periodText = document.getElementById("report-header-period");

    const startDate = document.getElementById("report-filter-start")?.value || "";
    const endDate = document.getElementById("report-filter-end")?.value || "";
    const empId = document.getElementById("report-filter-emp")?.value || "";
    const leaveType = document.getElementById("report-filter-type")?.value || "";

    let filtered = [...state.leaveRequests];

    if (startDate) filtered = filtered.filter(r => r.start_date >= startDate);
    if (endDate) filtered = filtered.filter(r => r.end_date <= endDate);
    if (empId) filtered = filtered.filter(r => String(r.emp_id).trim() === String(empId).trim());
    if (leaveType) filtered = filtered.filter(r => r.leave_type === leaveType);

    if (periodText) {
      periodText.textContent = `ข้อมูล ณ วันที่: ${new Date().toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" })} ${startDate && endDate ? `(ช่วงวันที่ ${startDate} ถึง ${endDate})` : ""}`;
    }

    if (summaryText) {
      const totalDays = filtered.reduce((acc, curr) => acc + Number(curr.total_days || 0), 0);
      summaryText.textContent = `รวมรายการขอลาทั้งสิ้น ${filtered.length} รายการ (รวม ${totalDays} วันทำการ)`;
    }

    if (!tbody) return;
    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" class="text-center py-8 text-slate-400">ไม่พบประวัติการลาตามเงื่อนไขที่เลือก</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map((req, index) => {
      const typeInfo = CONFIG.LEAVE_TYPES[req.leave_type] || CONFIG.LEAVE_TYPES.other;
      return `
        <tr>
          <td class="py-2.5 px-3 text-center">${index + 1}</td>
          <td class="py-2.5 px-3 font-mono">${req.emp_id}</td>
          <td class="py-2.5 px-3 font-semibold">${escapeHtml(req.emp_name)}</td>
          <td class="py-2.5 px-3">${escapeHtml(req.department)}</td>
          <td class="py-2.5 px-3">${typeInfo.name.split(" ")[0]}</td>
          <td class="py-2.5 px-3 font-mono text-[11px]">${req.start_date} ถึง ${req.end_date}</td>
          <td class="py-2.5 px-3 text-center font-bold">${req.total_days}</td>
          <td class="py-2.5 px-3 text-slate-600 max-w-xs truncate">${escapeHtml(req.reason)}</td>
          <td class="py-2.5 px-3 text-center font-semibold ${req.status === 'Approved' ? 'text-emerald-700' : (req.status === 'Rejected' ? 'text-rose-700' : 'text-amber-700')}">${req.status}</td>
        </tr>
      `;
    }).join("");
  }

  /**
   * Export รายงานเป็น Excel (.xlsx) ด้วย SheetJS
   */
  function exportToExcel() {
    const table = document.querySelector("#printable-report-section table");
    if (!table) return;

    const wb = XLSX.utils.table_to_book(table, { sheet: "Leave_Report" });
    const today = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `Leave_History_Report_${today}.xlsx`);
  }

  /**
   * พิมพ์ใบลาทางการ (Official Printable Leave Slip)
   */
  function openPrintableLeaveSlip(req) {
    if (!req) return;

    const emp = state.employees.find(e => String(e.emp_id).trim() === String(req.emp_id).trim());
    const balances = emp ? window.leaveAPI.calculateEmployeeBalances(emp, state.leaveRequests) : null;
    const typeInfo = CONFIG.LEAVE_TYPES[req.leave_type] || CONFIG.LEAVE_TYPES.other;

    document.getElementById("slip-req-id").textContent = req.request_id;
    document.getElementById("slip-date").textContent = new Date(req.created_at).toLocaleDateString("th-TH");
    document.getElementById("slip-emp-name").textContent = req.emp_name;
    document.getElementById("slip-emp-id").textContent = req.emp_id;
    document.getElementById("slip-emp-dept").textContent = req.department;
    document.getElementById("slip-emp-position").textContent = emp ? emp.position : "-";

    document.getElementById("slip-leave-type").textContent = typeInfo.name;
    document.getElementById("slip-leave-days").textContent = `${req.total_days} วันทำการ (${req.leave_duration_type === "full" ? "เต็มวัน" : (req.leave_duration_type === "morning" ? "ครึ่งวันเช้า" : "ครึ่งวันบ่าย")})`;
    document.getElementById("slip-leave-start").textContent = req.start_date;
    document.getElementById("slip-leave-end").textContent = req.end_date;
    document.getElementById("slip-leave-reason").textContent = req.reason || "-";

    // Balances row in slip
    const balContainer = document.getElementById("slip-leave-balances");
    if (balances && balContainer) {
      balContainer.innerHTML = `
        <div class="p-1 border border-slate-200 rounded">
          <span class="block text-[10px] text-slate-500">พักร้อนคงเหลือ</span>
          <span class="font-bold text-blue-700">${balances.annual.remaining} วัน</span>
        </div>
        <div class="p-1 border border-slate-200 rounded">
          <span class="block text-[10px] text-slate-500">ลากิจคงเหลือ</span>
          <span class="font-bold text-purple-700">${balances.personal.remaining} วัน</span>
        </div>
        <div class="p-1 border border-slate-200 rounded">
          <span class="block text-[10px] text-slate-500">ลาป่วยคงเหลือ</span>
          <span class="font-bold text-rose-700">${balances.sick.remaining} วัน</span>
        </div>
        <div class="p-1 border border-slate-200 rounded">
          <span class="block text-[10px] text-slate-500">อื่นๆ คงเหลือ</span>
          <span class="font-bold text-amber-700">${balances.other.remaining} วัน</span>
        </div>
      `;
    }

    document.getElementById("modal-printable-slip").classList.remove("hidden");
    initLucide();
  }

  /**
   * Helper: Status Badge HTML
   */
  function getStatusBadge(status) {
    if (status === "Approved") {
      return `<span class="badge-status badge-status-approved"><i data-lucide="check" class="w-3 h-3"></i> อนุมัติแล้ว</span>`;
    } else if (status === "Rejected") {
      return `<span class="badge-status badge-status-rejected"><i data-lucide="x" class="w-3 h-3"></i> ไม่อนุมัติ</span>`;
    } else if (status === "Cancelled") {
      return `<span class="badge-status badge-status-cancelled">ยกเลิกแล้ว</span>`;
    } else {
      return `<span class="badge-status badge-status-pending"><i data-lucide="clock" class="w-3 h-3"></i> รออนุมัติ</span>`;
    }
  }

  /**
   * สลับแท็บ (Tab Navigation)
   */
  function switchTab(targetTabId) {
    // ซ่อนทุก Tab
    document.querySelectorAll(".tab-pane").forEach(pane => pane.classList.add("hidden"));
    document.querySelectorAll(".nav-item").forEach(item => {
      item.classList.remove("active", "bg-blue-600", "text-white");
      item.classList.add("text-slate-400");
    });

    // แสดง Tab ที่เลือก
    const activePane = document.getElementById(targetTabId);
    if (activePane) activePane.classList.remove("hidden");

    const activeBtn = document.querySelector(`.nav-item[data-tab="${targetTabId}"]`);
    if (activeBtn) {
      activeBtn.classList.add("active", "bg-blue-600", "text-white");
      activeBtn.classList.remove("text-slate-400");
    }

    // เปลี่ยน Title หัวเว็บ
    const pageTitle = document.getElementById("page-title");
    const pageSubtitle = document.getElementById("page-subtitle");

    switch (targetTabId) {
      case "tab-dashboard":
        pageTitle.textContent = "แดชบอร์ดภาพรวมการลางาน";
        pageSubtitle.textContent = "สถิติและภาพรวมการลางานของพนักงานทั้งองค์กร";
        renderDashboardCharts();
        break;
      case "tab-leave-request":
        pageTitle.textContent = "บันทึกยื่นคำขอลา";
        pageSubtitle.textContent = "ระบบคำนวณวันทำงาน หักวันหยุดนักขัตฤกษ์ และแนบเอกสารหลักฐาน";
        break;
      case "tab-leave-approvals":
        pageTitle.textContent = "คำขอ & อนุมัติการลา";
        pageSubtitle.textContent = "รายการตรวจสอบและดำเนินการอนุมัติคำขอลา";
        renderApprovalsTable();
        break;
      case "tab-employee-balances":
        pageTitle.textContent = "สิทธิ์วันลาพนักงาน";
        pageSubtitle.textContent = "ตรวจสอบและจัดการโควตาวันลาคงเหลือของพนักงานแต่ละคน";
        renderEmployeeCards();
        break;
      case "tab-holidays":
        pageTitle.textContent = "วันหยุดนักขัตฤกษ์";
        pageSubtitle.textContent = "กำหนดปฏิทินวันหยุดประจำปีเพื่อไม่นำไปนับเป็นวันลา";
        renderHolidaysTable();
        break;
      case "tab-reports":
        pageTitle.textContent = "รายงาน & พิมพ์ประวัติ";
        pageSubtitle.textContent = "พิมพ์ใบลาทางการ Export Excel และออกรายงานสรุปย้อนหลัง";
        renderReports();
        break;
      case "tab-settings":
        pageTitle.textContent = "เชื่อมต่อ Google Sheets";
        pageSubtitle.textContent = "ตั้งค่าผูก Web App API เพื่อจัดเก็บข้อมูลบน Google Drive & Sheet";
        break;
    }

    initLucide();
  }

  /**
   * ผูก Event Handlers
   */
  function initEventHandlers() {
    // Navigation Tabs
    document.querySelectorAll(".nav-item").forEach(btn => {
      btn.addEventListener("click", () => {
        const tab = btn.getAttribute("data-tab");
        switchTab(tab);
      });
    });

    // Mobile Menu Toggle
    const mobileMenuBtn = document.getElementById("mobile-menu-btn");
    const sidebarNav = document.getElementById("sidebar-nav");
    if (mobileMenuBtn && sidebarNav) {
      mobileMenuBtn.addEventListener("click", () => {
        sidebarNav.classList.toggle("hidden");
      });
    }

    // Quick New Leave Button
    document.getElementById("btn-quick-new-leave")?.addEventListener("click", () => {
      switchTab("tab-leave-request");
    });

    // Refresh Data Button
    document.getElementById("btn-refresh-data")?.addEventListener("click", async () => {
      const btn = document.getElementById("btn-refresh-data");
      btn.classList.add("opacity-50", "pointer-events-none");
      await loadData();
      btn.classList.remove("opacity-50", "pointer-events-none");
      Swal.fire({
        toast: true,
        position: "top-end",
        icon: "success",
        title: "รีเฟรชข้อมูลล่าสุดแล้ว",
        showConfirmButton: false,
        timer: 1500
      });
    });

    // Goto Approvals from Dashboard
    document.querySelector(".btn-goto-approvals")?.addEventListener("click", () => {
      switchTab("tab-leave-approvals");
    });

    // Employee Selection in Leave Form
    document.getElementById("leave-form-emp-select")?.addEventListener("change", (e) => {
      updateEmployeeLiveQuota(e.target.value);
    });

    // Duration Type Change (Full vs Half Day)
    document.getElementById("leave-form-duration-type")?.addEventListener("change", () => {
      calculateFormDays();
    });

    // Leave Type Change
    document.getElementById("leave-form-type")?.addEventListener("change", () => {
      calculateFormDays();
    });

    // Dropzone & File Input Events
    const dropzone = document.getElementById("dropzone-area");
    const fileInput = document.getElementById("file-input-multiple");

    if (dropzone && fileInput) {
      dropzone.addEventListener("click", () => fileInput.click());
      fileInput.addEventListener("change", (e) => handleFilesUpload(e.target.files));

      dropzone.addEventListener("dragover", (e) => {
        e.preventDefault();
        dropzone.classList.add("dropzone-active");
      });

      dropzone.addEventListener("dragleave", () => {
        dropzone.classList.remove("dropzone-active");
      });

      dropzone.addEventListener("drop", (e) => {
        e.preventDefault();
        dropzone.classList.remove("dropzone-active");
        if (e.dataTransfer.files) {
          handleFilesUpload(e.dataTransfer.files);
        }
      });
    }

    // Submit Leave Form
    document.getElementById("form-leave-request")?.addEventListener("submit", async (e) => {
      e.preventDefault();

      if (!state.currentEmployee) {
        Swal.fire({ icon: "warning", title: "กรุณาเลือกพนักงานผู้ขอยื่นลา" });
        return;
      }

      const totalDays = calculateFormDays();
      if (totalDays <= 0) {
        Swal.fire({ icon: "warning", title: "ไม่สามารถยื่นลาได้", text: "ช่วงวันที่เลือกตรงกับวันหยุดทั้งหมด หรือไม่มีวันทำงาน" });
        return;
      }

      const payload = {
        emp_id: state.currentEmployee.emp_id,
        emp_name: state.currentEmployee.name,
        department: state.currentEmployee.department,
        leave_type: document.getElementById("leave-form-type").value,
        leave_duration_type: document.getElementById("leave-form-duration-type").value,
        start_date: document.getElementById("leave-form-start-date").value,
        end_date: document.getElementById("leave-form-end-date").value,
        total_days: totalDays,
        reason: document.getElementById("leave-form-reason").value,
        attachments: state.tempAttachments
      };

      const btn = document.getElementById("btn-submit-leave-form");
      btn.disabled = true;
      btn.innerHTML = `<i data-lucide="loader" class="w-4 h-4 animate-spin"></i> กำลังบันทึกข้อมูล...`;

      try {
        const res = await window.leaveAPI.submitLeaveRequest(payload);
        Swal.fire({
          icon: "success",
          title: "ยื่นใบลาสำเร็จ!",
          text: `รหัสคำขอ: ${res.request_id || ""}`,
          confirmButtonText: "ตกลง"
        });

        // ล้างฟอร์ม
        document.getElementById("form-leave-request").reset();
        state.tempAttachments = [];
        renderAttachmentsPreview();
        updateEmployeeLiveQuota(null);
        await loadData();
        switchTab("tab-leave-approvals");
      } catch (err) {
        Swal.fire({ icon: "error", title: "เกิดข้อผิดพลาดในการส่งคำขอ", text: err.message });
      } finally {
        btn.disabled = false;
        btn.innerHTML = `<i data-lucide="send" class="w-4 h-4"></i> <span>บันทึกยื่นใบลา</span>`;
        initLucide();
      }
    });

    // Approvals: Status Filter buttons
    document.querySelectorAll(".filter-status-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".filter-status-btn").forEach(b => {
          b.classList.remove("active", "bg-blue-600", "text-white");
          b.classList.add("text-slate-600");
        });
        btn.classList.add("active", "bg-blue-600", "text-white");
        btn.classList.remove("text-slate-600");

        state.activeStatusFilter = btn.getAttribute("data-status");
        renderApprovalsTable();
      });
    });

    // Approvals: Search input
    document.getElementById("filter-search-approvals")?.addEventListener("input", () => {
      renderApprovalsTable();
    });

    // Approvals: Approve Button in Modal
    document.getElementById("btn-approve-leave")?.addEventListener("click", async () => {
      if (!state.selectedLeaveRequest) return;

      const confirm = await Swal.fire({
        title: "ยืนยันการอนุมัติคำขอลา?",
        text: `รหัสคำขอ: ${state.selectedLeaveRequest.request_id}`,
        icon: "question",
        showCancelButton: true,
        confirmButtonColor: "#059669",
        confirmButtonText: "อนุมัติ",
        cancelButtonText: "ยกเลิก"
      });

      if (confirm.isConfirmed) {
        try {
          await window.leaveAPI.updateLeaveStatus(state.selectedLeaveRequest.request_id, "Approved", "HR Manager", "");
          Swal.fire({ icon: "success", title: "อนุมัติคำขอลาเรียบร้อยแล้ว", timer: 1500, showConfirmButton: false });
          document.getElementById("modal-leave-detail").classList.add("hidden");
          await loadData();
        } catch (err) {
          Swal.fire({ icon: "error", title: "เกิดข้อผิดพลาด", text: err.message });
        }
      }
    });

    // Approvals: Reject Button in Modal
    document.getElementById("btn-reject-leave")?.addEventListener("click", async () => {
      if (!state.selectedLeaveRequest) return;

      const { value: reason } = await Swal.fire({
        title: "ระบุเหตุผลที่ไม่อนุมัติ",
        input: "text",
        inputPlaceholder: "เช่น งานเร่งด่วน หรือ วันลาไม่เพียงพอ...",
        showCancelButton: true,
        confirmButtonColor: "#e11d48",
        confirmButtonText: "ยืนยันไม่อนุมัติ",
        cancelButtonText: "ยกเลิก",
        inputValidator: (value) => {
          if (!value) return "กรุณาระบุเหตุผลที่ไม่อนุมัติ!";
        }
      });

      if (reason) {
        try {
          await window.leaveAPI.updateLeaveStatus(state.selectedLeaveRequest.request_id, "Rejected", "HR Manager", reason);
          Swal.fire({ icon: "success", title: "บันทึกสถานะไม่อนุมัติแล้ว", timer: 1500, showConfirmButton: false });
          document.getElementById("modal-leave-detail").classList.add("hidden");
          await loadData();
        } catch (err) {
          Swal.fire({ icon: "error", title: "เกิดข้อผิดพลาด", text: err.message });
        }
      }
    });

    // Print Leave Slip from Modal
    document.getElementById("btn-print-leave-slip")?.addEventListener("click", () => {
      if (state.selectedLeaveRequest) {
        openPrintableLeaveSlip(state.selectedLeaveRequest);
      }
    });

    // Employee Search & Dept Filter
    document.getElementById("filter-search-employee")?.addEventListener("input", () => renderEmployeeCards());
    document.getElementById("filter-employee-dept")?.addEventListener("change", () => renderEmployeeCards());

    // Open Add Employee Modal
    document.getElementById("btn-open-add-employee-modal")?.addEventListener("click", () => {
      document.getElementById("employee-modal-title").innerHTML = `<i data-lucide="user-plus" class="w-5 h-5 text-blue-600"></i> เพิ่มข้อมูลพนักงานใหม่`;
      document.getElementById("form-employee").reset();
      document.getElementById("emp-modal-id").readOnly = false;
      document.getElementById("modal-employee").classList.remove("hidden");
      initLucide();
    });

    // Save Employee Form
    document.getElementById("form-employee")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const payload = {
        emp_id: document.getElementById("emp-modal-id").value.trim(),
        name: document.getElementById("emp-modal-name").value.trim(),
        department: document.getElementById("emp-modal-dept").value,
        position: document.getElementById("emp-modal-position").value.trim(),
        email: document.getElementById("emp-modal-email").value.trim(),
        phone: document.getElementById("emp-modal-phone").value.trim(),
        annual_leave_quota: Number(document.getElementById("emp-modal-quota-annual").value || 0),
        personal_leave_quota: Number(document.getElementById("emp-modal-quota-personal").value || 0),
        sick_leave_quota: Number(document.getElementById("emp-modal-quota-sick").value || 0),
        other_leave_quota: Number(document.getElementById("emp-modal-quota-other").value || 0)
      };

      try {
        await window.leaveAPI.saveEmployee(payload);
        Swal.fire({ icon: "success", title: "บันทึกข้อมูลพนักงานเรียบร้อย", timer: 1500, showConfirmButton: false });
        document.getElementById("modal-employee").classList.add("hidden");
        loadData();
      } catch (err) {
        Swal.fire({ icon: "error", title: "เกิดข้อผิดพลาด", text: err.message });
      }
    });

    // Open Add Holiday Modal
    document.getElementById("btn-open-add-holiday-modal")?.addEventListener("click", () => {
      document.getElementById("form-holiday").reset();
      document.getElementById("modal-holiday").classList.remove("hidden");
    });

    // Save Holiday Form
    document.getElementById("form-holiday")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const payload = {
        holiday_date: document.getElementById("holiday-modal-date").value,
        name: document.getElementById("holiday-modal-name").value.trim(),
        year: new Date(document.getElementById("holiday-modal-date").value).getFullYear()
      };

      try {
        await window.leaveAPI.saveHoliday(payload);
        Swal.fire({ icon: "success", title: "บันทึกวันหยุดเรียบร้อย", timer: 1500, showConfirmButton: false });
        document.getElementById("modal-holiday").classList.add("hidden");
        loadData();
      } catch (err) {
        Swal.fire({ icon: "error", title: "เกิดข้อผิดพลาด", text: err.message });
      }
    });

    // Sync Default Thai Holidays
    document.getElementById("btn-sync-thai-holidays")?.addEventListener("click", async () => {
      const year = new Date().getFullYear();
      const confirm = await Swal.fire({
        title: `โหลดวันหยุดนักขัตฤกษ์ประจำปี ${year}?`,
        text: "ระบบจะนำเข้าชุดวันหยุดราชการและวันหยุดนักขัตฤกษ์ไทยมาตรฐานลงในระบบ",
        icon: "info",
        showCancelButton: true,
        confirmButtonText: "โหลดวันหยุด",
        cancelButtonText: "ยกเลิก"
      });

      if (confirm.isConfirmed) {
        try {
          await window.leaveAPI.syncDefaultHolidays(year);
          Swal.fire({ icon: "success", title: "โหลดวันหยุดเรียบร้อย", timer: 1500, showConfirmButton: false });
          loadData();
        } catch (err) {
          Swal.fire({ icon: "error", title: "เกิดข้อผิดพลาด", text: err.message });
        }
      }
    });

    // Report Filters
    document.getElementById("report-filter-emp")?.addEventListener("change", () => renderReports());
    document.getElementById("report-filter-type")?.addEventListener("change", () => renderReports());
    document.getElementById("btn-export-excel")?.addEventListener("click", () => exportToExcel());
    document.getElementById("btn-print-report")?.addEventListener("click", () => window.print());

    // Settings: Save GAS URL
    document.getElementById("btn-save-gas-url")?.addEventListener("click", async () => {
      const url = document.getElementById("setting-gas-url").value.trim();
      window.leaveAPI.setGasUrl(url);
      updateConnectionIndicator();
      Swal.fire({ icon: "success", title: "บันทึกการตั้งค่าแล้ว", timer: 1500, showConfirmButton: false });
      loadData();
    });

    // Settings: Switch to Demo Mode
    document.getElementById("btn-switch-demo-mode")?.addEventListener("click", () => {
      window.leaveAPI.setMode("demo");
      updateConnectionIndicator();
      Swal.fire({ icon: "info", title: "สลับเป็นโหมดจำลอง (Offline)", timer: 1500, showConfirmButton: false });
      loadData();
    });

    // Settings: Test GAS Connection
    document.getElementById("btn-test-gas-connection")?.addEventListener("click", async () => {
      const url = document.getElementById("setting-gas-url").value.trim();
      const btn = document.getElementById("btn-test-gas-connection");
      btn.disabled = true;
      btn.innerHTML = `<i data-lucide="loader" class="w-4 h-4 animate-spin"></i> กำลังทดสอบ...`;

      try {
        await window.leaveAPI.testConnection(url);
        Swal.fire({
          icon: "success",
          title: "เชื่อมต่อสำเร็จ!",
          text: "Google Apps Script Web App ตอบสนองพร้อมใช้งาน"
        });
      } catch (err) {
        Swal.fire({
          icon: "error",
          title: "การเชื่อมต่อล้มเหลว",
          text: err.message
        });
      } finally {
        btn.disabled = false;
        btn.innerHTML = `<i data-lucide="plug" class="w-4 h-4"></i> <span>ทดสอบการเชื่อมต่อ</span>`;
        initLucide();
      }
    });

    // Close Modals
    document.querySelectorAll(".btn-close-modal").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("#modal-leave-detail, #modal-employee, #modal-holiday, #modal-printable-slip").forEach(m => m.classList.add("hidden"));
      });
    });
  }

  // Helper Escape HTML
  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
});
