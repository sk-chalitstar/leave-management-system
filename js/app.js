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
    editAttachments: [], // รายการไฟล์แนบในฟอร์มแก้ไขคำขอลา
    selectedLeaveRequest: null,
    historyViewMode: localStorage.getItem("LEAVE_HISTORY_VIEW") || (window.innerWidth < 768 ? "cards" : "table"),
    reportViewMode: localStorage.getItem("LEAVE_REPORT_VIEW") || (window.innerWidth < 768 ? "cards" : "table"),
    charts: {
      leaveType: null,
      department: null
    }
  };

  // Date Pickers
  let startDatePicker = null;
  let endDatePicker = null;
  let holidayDatePicker = null;
  let reportStartDatePicker = null;
  let reportEndDatePicker = null;

  // Initialize
  initLucide();
  initRealTimeClock();
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
   * Real-time Clock (เวลาจริง)
   * แสดงวันที่ปัจจุบันและเวลาจริงที่เดินวินาทีต่อวินาที
   */
  function initRealTimeClock() {
    const clockEl = document.getElementById("realtime-clock");
    if (!clockEl) return;

    function tick() {
      const now = new Date();
      const thaiMonths = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
      const d = now.getDate();
      const m = thaiMonths[now.getMonth()];
      const y = now.getFullYear() + 543;
      const hh = String(now.getHours()).padStart(2, "0");
      const mm = String(now.getMinutes()).padStart(2, "0");
      const ss = String(now.getSeconds()).padStart(2, "0");

      clockEl.textContent = `${d} ${m} ${y} ${hh}:${mm}:${ss} น.`;
    }

    tick();
    setInterval(tick, 1000);
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
      onChange: (selectedDates, dateStr) => {
        const durationType = document.getElementById("leave-form-duration-type").value;
        if (durationType === "hourly" && endDatePicker) {
          endDatePicker.setDate(dateStr, true);
        }
        calculateFormDays();
      }
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
      // ซิงค์คำขอลาที่ค้างส่ง (เช่น เพิ่งเปิดลิงก์เชื่อมต่อ URL บนมือถือ หรือบันทึกไว้ตอนออฟไลน์)
      if (window.leaveAPI.isLive()) {
        try {
          const syncRes = await window.leaveAPI.autoSyncPendingRequests();
          if (syncRes && syncRes.syncedCount > 0) {
            Swal.fire({
              toast: true,
              position: "top-end",
              icon: "success",
              title: `ซิงค์รายการลาที่ค้างส่ง ${syncRes.syncedCount} รายการขึ้น Google Sheet แล้ว`,
              showConfirmButton: false,
              timer: 3000
            });
          }
        } catch (e) {
          console.warn("Auto sync pending requests error:", e);
        }
      }

      const data = await window.leaveAPI.fetchAllData();
      state.employees = data.employees || [];
      
      const fetchedRequests = data.leaveRequests || [];
      // รวมข้อมูลที่ดึงมาใหม่เข้ากับคำขอที่เพิ่งยื่นในเครื่อง เพื่อป้องกันปัญหาการดีเลย์ของ Google Sheets
      let deletedIds = [];
      try {
        deletedIds = JSON.parse(localStorage.getItem("LEAVE_DELETED_REQUEST_IDS") || "[]");
      } catch (e) {}

      const mergedRequests = [...fetchedRequests];
      state.leaveRequests.forEach(existing => {
        if (!deletedIds.includes(String(existing.request_id).trim())) {
          if (!mergedRequests.some(r => String(r.request_id).trim() === String(existing.request_id).trim())) {
            mergedRequests.unshift(existing);
          }
        }
      });

      state.leaveRequests = mergedRequests;
      window.leaveAPI.safeSetLeaves(mergedRequests);
      state.holidays = data.holidays || [];

      // รักษา state.currentEmployee ให้ซิงค์กับข้อมูลใหม่ล่าสุด
      if (state.currentEmployee) {
        const found = state.employees.find(e => String(e.emp_id).trim() === String(state.currentEmployee.emp_id).trim());
        if (found) {
          state.currentEmployee = found;
        }
      }

      // อัปเดต UI แต่ละส่วน
      updateDashboardKPIs();
      renderDashboardCharts();
      renderDashboardRecentTable();
      populateEmployeeSelects();
      populateDepartmentSelects();
      populateReportYearFilter();
      renderLeaveHistoryTable();
      renderEmployeeCards();
      renderHolidaysTable();
      renderReports();
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
   * อัปเดตแถบสถานะการเชื่อมต่อ (Live vs Demo) ทั้งบน Desktop, Mobile Header และ Leave Form
   */
  function updateConnectionIndicator() {
    const isLive = window.leaveAPI.isLive();
    const currentGasUrl = window.leaveAPI.getGasUrl();
    const statusPill = document.getElementById("sidebar-db-status");
    const descPill = document.getElementById("sidebar-db-desc");
    const settingUrlInput = document.getElementById("setting-gas-url");
    const mobileIndicator = document.getElementById("mobile-db-indicator");
    const formOfflineNotice = document.getElementById("leave-form-offline-notice");
    const mobileSyncInput = document.getElementById("setting-mobile-sync-url");

    if (settingUrlInput) {
      settingUrlInput.value = currentGasUrl;
    }

    if (mobileSyncInput) {
      if (currentGasUrl) {
        mobileSyncInput.value = window.location.origin + window.location.pathname + "?gasUrl=" + encodeURIComponent(currentGasUrl);
      } else {
        mobileSyncInput.value = "";
      }
    }

    if (isLive) {
      if (statusPill) {
        statusPill.className = "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-500/20 text-blue-400 border border-blue-500/30";
        statusPill.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse"></span> Google Sheet Live`;
      }
      if (descPill) descPill.textContent = "เชื่อมต่อ Google Sheet แล้ว";

      if (mobileIndicator) {
        mobileIndicator.className = "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700 border border-blue-200 cursor-pointer";
        mobileIndicator.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse"></span> <span>Sheet Live</span>`;
      }

      if (formOfflineNotice) formOfflineNotice.classList.add("hidden");
    } else {
      if (statusPill) {
        statusPill.className = "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30";
        statusPill.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Offline / Demo`;
      }
      if (descPill) descPill.textContent = "โหมดจำลอง (LocalStorage)";

      if (mobileIndicator) {
        mobileIndicator.className = "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 cursor-pointer";
        mobileIndicator.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span> <span>ออฟไลน์</span>`;
      }

      if (formOfflineNotice) formOfflineNotice.classList.remove("hidden");
    }
  }

  /**
   * 1. Dashboard: KPIs
   */
  function updateDashboardKPIs() {
    const todayStr = LeaveAPI.formatDateISO(new Date());
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();

    // กำลังลาในวันนี้ (วันที่ตรงกับวันนี้)
    const todayLeaves = state.leaveRequests.filter(r => {
      if (r.status === "Cancelled" || r.status === "Rejected") return false;
      const s = LeaveAPI.formatDateISO(r.start_date);
      const e = LeaveAPI.formatDateISO(r.end_date);
      return s <= todayStr && todayStr <= e;
    }).length;

    // บันทึกการลาทั้งหมด
    const totalLeaves = state.leaveRequests.length;

    // การลาในเดือนนี้
    const leavesThisMonth = state.leaveRequests.filter(r => {
      if (r.status === "Cancelled" || r.status === "Rejected") return false;
      const d = new Date(r.start_date);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    }).length;

    // พนักงานทั้งหมด
    const totalEmployees = state.employees.length;

    const elToday = document.getElementById("kpi-today-leaves");
    if (elToday) elToday.textContent = todayLeaves;
    const elPending = document.getElementById("kpi-pending-leaves");
    if (elPending) elPending.textContent = totalLeaves;
    const elApproved = document.getElementById("kpi-approved-month");
    if (elApproved) elApproved.textContent = leavesThisMonth;
    const elEmps = document.getElementById("kpi-total-employees");
    if (elEmps) elEmps.textContent = totalEmployees;
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
    const depts = window.leaveAPI.getDepartments();
    depts.forEach(d => {
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
      const startDMY = LeaveAPI.formatDateDMY(req.start_date);
      const endDMY = LeaveAPI.formatDateDMY(req.end_date);

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
          <td class="py-3 px-4 font-mono text-[11px] text-slate-600">${startDMY} ถึง ${endDMY}</td>
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

    const currentLeaveEmp = leaveSelect?.value || (state.currentEmployee ? state.currentEmployee.emp_id : "");
    const currentReportEmp = reportSelect?.value || "";

    const empOptions = state.employees.map(emp => {
      return `<option value="${emp.emp_id}">${emp.emp_id} - ${escapeHtml(emp.name)} (${escapeHtml(emp.department)})</option>`;
    }).join("");

    if (leaveSelect) {
      leaveSelect.innerHTML = `<option value="">-- ค้นหาและเลือกพนักงาน --</option>` + empOptions;
      if (currentLeaveEmp && state.employees.some(e => e.emp_id === currentLeaveEmp)) {
        leaveSelect.value = currentLeaveEmp;
        // อัปเดตโควตาและเวรหยุดให้สดใหม่อยู่เสมอ
        updateEmployeeLiveQuota(currentLeaveEmp);
      }
    }

    if (reportSelect) {
      reportSelect.innerHTML = `<option value="">-- พนักงานทุกคน --</option>` + empOptions;
      if (currentReportEmp && state.employees.some(e => e.emp_id === currentReportEmp)) {
        reportSelect.value = currentReportEmp;
      }
    }
  }

  /**
   * เติมข้อมูลลง Dropdown เลือกปีรายงาน (พ.ศ. / ค.ศ.)
   */
  function populateReportYearFilter() {
    const yearSelect = document.getElementById("report-filter-year");
    if (!yearSelect) return;

    const currentYear = new Date().getFullYear();
    const yearsSet = new Set([currentYear, currentYear - 1, currentYear - 2, currentYear + 1]);

    (state.leaveRequests || []).forEach(r => {
      if (r.start_date) {
        const y = parseInt(LeaveAPI.formatDateISO(r.start_date).slice(0, 4), 10);
        if (!isNaN(y) && y > 2000) yearsSet.add(y);
      }
      if (r.end_date) {
        const y = parseInt(LeaveAPI.formatDateISO(r.end_date).slice(0, 4), 10);
        if (!isNaN(y) && y > 2000) yearsSet.add(y);
      }
    });

    const sortedYears = Array.from(yearsSet).sort((a, b) => b - a);
    const currentValue = yearSelect.value;

    yearSelect.innerHTML = `<option value="">-- ทุกปี (All Years) --</option>` +
      sortedYears.map(y => {
        const thYear = y + 543;
        const isCurrent = y === currentYear ? " (ปีปัจจุบัน)" : "";
        return `<option value="${y}" ${String(y) === String(currentValue) ? "selected" : ""}>พ.ศ. ${thYear} (${y})${isCurrent}</option>`;
      }).join("");
  }

  /**
   * เติมข้อมูลแผนกลง Dropdown ทุกที่ในระบบ และจัดการรายการแผนก
   */
  function populateDepartmentSelects() {
    const departments = window.leaveAPI.getDepartments();
    const deptOptions = departments.map(d => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join("");
    
    const modalDeptSelect = document.getElementById("emp-modal-dept");
    if (modalDeptSelect) modalDeptSelect.innerHTML = deptOptions;

    const filterDeptSelect = document.getElementById("filter-employee-dept");
    if (filterDeptSelect) {
      filterDeptSelect.innerHTML = `<option value="">-- ทุกแผนก --</option>` + deptOptions;
    }

    const filterHistoryDept = document.getElementById("filter-history-dept");
    if (filterHistoryDept) {
      filterHistoryDept.innerHTML = `<option value="">-- ทุกแผนก --</option>` + deptOptions;
    }

    renderDepartmentsList();
  }

  /**
   * เรนเดอร์รายการแผนกใน Modal จัดการแผนก
   */
  function renderDepartmentsList() {
    const container = document.getElementById("departments-list-container");
    if (!container) return;

    const departments = window.leaveAPI.getDepartments();
    if (departments.length === 0) {
      container.innerHTML = `<p class="text-slate-400 py-3 text-center">ยังไม่มีข้อมูลแผนก</p>`;
      return;
    }

    container.innerHTML = departments.map(dept => {
      return `
        <div class="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs hover:bg-white transition-colors">
          <span class="font-medium text-slate-800">${escapeHtml(dept)}</span>
          <div class="flex items-center gap-1">
            <button type="button" onclick="window.editDepartment('${escapeHtml(dept)}')" class="p-1 text-slate-400 hover:text-blue-600 transition-colors" title="แก้ไขชื่อแผนก">
              <i data-lucide="edit-2" class="w-3.5 h-3.5"></i>
            </button>
            <button type="button" onclick="window.deleteDepartment('${escapeHtml(dept)}')" class="p-1 text-slate-400 hover:text-rose-600 transition-colors" title="ลบแผนกนี้">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        </div>
      `;
    }).join("");

    initLucide();
  }

  window.addDepartment = function() {
    const input = document.getElementById("input-new-department");
    const name = (input?.value || "").trim();
    if (!name) {
      Swal.fire({ icon: "warning", title: "กรุณาระบุชื่อแผนก" });
      return;
    }

    let depts = window.leaveAPI.getDepartments();
    if (depts.includes(name)) {
      Swal.fire({ icon: "warning", title: "มีแผนกนี้อยู่ในระบบแล้ว" });
      return;
    }

    depts.push(name);
    window.leaveAPI.saveDepartments(depts);
    input.value = "";
    populateDepartmentSelects();
    Swal.fire({ toast: true, position: "top-end", icon: "success", title: "เพิ่มแผนกเรียบร้อย", showConfirmButton: false, timer: 1500 });
  };

  window.editDepartment = async function(oldName) {
    const { value: newName } = await Swal.fire({
      title: "แก้ไขชื่อแผนก",
      input: "text",
      inputValue: oldName,
      showCancelButton: true,
      confirmButtonText: "บันทึก",
      cancelButtonText: "ยกเลิก",
      inputValidator: (value) => {
        if (!value || !value.trim()) return "กรุณากรอกชื่อแผนก";
      }
    });

    if (newName && newName.trim() !== oldName) {
      let depts = window.leaveAPI.getDepartments();
      const idx = depts.indexOf(oldName);
      if (idx !== -1) {
        depts[idx] = newName.trim();
        window.leaveAPI.saveDepartments(depts);

        state.employees.forEach(emp => {
          if (emp.department === oldName) {
            emp.department = newName.trim();
            window.leaveAPI.saveEmployee(emp);
          }
        });

        populateDepartmentSelects();
        renderEmployeeCards();
        Swal.fire({ icon: "success", title: "แก้ไขแผนกสำเร็จ", timer: 1500, showConfirmButton: false });
      }
    }
  };

  window.deleteDepartment = async function(deptName) {
    const confirm = await Swal.fire({
      title: "ยืนยันการลบแผนก?",
      text: `ต้องการลบแผนก "${deptName}" หรือไม่?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#e11d48",
      confirmButtonText: "ลบ",
      cancelButtonText: "ยกเลิก"
    });

    if (confirm.isConfirmed) {
      let depts = window.leaveAPI.getDepartments();
      depts = depts.filter(d => d !== deptName);
      window.leaveAPI.saveDepartments(depts);
      populateDepartmentSelects();
      Swal.fire({ icon: "success", title: "ลบแผนกเรียบร้อย", timer: 1500, showConfirmButton: false });
    }
  };

  /**
   * ฟังก์ชันคำนวณวันลาจริงในแบบฟอร์ม (ตัดวันเสาร์-อาทิตย์, วันหยุดนักขัตฤกษ์ และรองรับรายชั่วโมง)
   */
  function calculateFormDays() {
    const startDate = document.getElementById("leave-form-start-date").value;
    let endDate = document.getElementById("leave-form-end-date").value;
    const durationType = document.getElementById("leave-form-duration-type").value;
    const banner = document.getElementById("leave-calc-details");
    const totalDaysSpan = document.getElementById("calculated-total-days");
    const hourlyBox = document.getElementById("hourly-leave-options");
    const hourlySelect = document.getElementById("leave-form-hours-select");
    const hourlyEquiv = document.getElementById("hourly-equiv-text");

    let hours = 2;
    if (durationType === "hourly") {
      if (hourlyBox) hourlyBox.classList.remove("hidden");
      hours = Number(hourlySelect?.value || 2);
      
      // บังคับวันสิ้นสุดให้เท่ากับวันเริ่มต้น
      if (startDate && startDatePicker) {
        endDate = startDate;
        document.getElementById("leave-form-end-date").value = startDate;
        if (endDatePicker) endDatePicker.setDate(startDate, false);
      }
      const equivDay = Math.round((hours / 8) * 100) / 100;
      if (hourlyEquiv) hourlyEquiv.textContent = `${hours} ชม. = ${equivDay} วันทำการ`;
    } else {
      if (hourlyBox) hourlyBox.classList.add("hidden");
    }

    if (!state.currentEmployee) {
      totalDaysSpan.textContent = "0";
      banner.innerHTML = `<span class="text-amber-700 font-medium">⚠️ กรุณาค้นหาและเลือกพนักงานผู้ขอยื่นลาด้านบน เพื่อคำนวณวันทำการตามเวรหยุดจริง</span>`;
      return 0;
    }

    if (!startDate || !endDate) {
      totalDaysSpan.textContent = "0";
      banner.textContent = "กรุณาเลือกวันที่เริ่มและสิ้นสุดการลา";
      return 0;
    }

    const workingDays = window.leaveAPI.calculateWorkingDays(startDate, endDate, durationType, state.holidays, hours, state.currentEmployee);
    totalDaysSpan.textContent = workingDays;

    if (workingDays === 0) {
      const restLabel = formatRestDays(state.currentEmployee ? state.currentEmployee.rest_days : [0, 6]);
      banner.innerHTML = `<span class="text-rose-600 font-semibold">ช่วงวันที่เลือกตรงกับวันหยุดทั้งหมด (เวรหยุดของพนักงาน: ${escapeHtml(restLabel)} หรือตรงกับวันหยุดนักขัตฤกษ์)</span>`;
    } else {
      if (durationType === "hourly") {
        const timeStart = document.getElementById("leave-form-time-start")?.value || "08:00";
        const timeEnd = document.getElementById("leave-form-time-end")?.value || "12:00";
        banner.innerHTML = `<span class="font-bold text-indigo-900">ลา ${hours} ชั่วโมง</span> (เวลา ${timeStart} - ${timeEnd} น. เทียบเท่า ${workingDays} วันทำการ)`;
      } else {
        banner.textContent = `คำนวณวันทำงานสุทธิ (ตัดเวรหยุดของพนักงาน และวันหยุดนักขัตฤกษ์ออกแล้ว)`;
      }
    }

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
   * Helper: แปลงเวรหยุดประจำสัปดาห์ (Array ของตัวเลข 0-6) เป็นข้อความภาษาไทย
   */
  function formatRestDays(restDays) {
    if (!restDays || !Array.isArray(restDays) || restDays.length === 0) {
      return "ไม่มีวันหยุดประจำ (เข้ากะ/เวรหมุนเวียน)";
    }
    const dayNames = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัส", "ศุกร์", "เสาร์"];
    const sorted = [...restDays].map(Number).sort((a, b) => a - b);
    if (sorted.length === 2 && sorted.includes(0) && sorted.includes(6)) return "เสาร์ - อาทิตย์";
    if (sorted.length === 1 && sorted.includes(0)) return "วันอาทิตย์";
    if (sorted.length === 1 && sorted.includes(6)) return "วันเสาร์";
    return sorted.map(d => dayNames[d]).join(", ");
  }

  let currentModalRestDays = new Set([0, 6]);
  const DAYS_OF_WEEK = [
    { day: 0, name: "อาทิตย์" },
    { day: 1, name: "จันทร์" },
    { day: 2, name: "อังคาร" },
    { day: 3, name: "พุธ" },
    { day: 4, name: "พฤหัส" },
    { day: 5, name: "ศุกร์" },
    { day: 6, name: "เสาร์" }
  ];

  function renderRestDaysButtons() {
    const grid = document.getElementById("rest-days-buttons-grid");
    const summaryText = document.getElementById("rest-days-summary-text");
    if (!grid) return;

    grid.innerHTML = DAYS_OF_WEEK.map(d => {
      const isRest = currentModalRestDays.has(d.day);
      if (isRest) {
        return `
          <button type="button" onclick="window.toggleRestDay(${d.day})" class="p-1 sm:p-2 rounded-xl text-[10px] sm:text-xs font-bold border-2 border-rose-500 bg-rose-50 text-rose-700 flex flex-col items-center gap-0.5 sm:gap-1 shadow-xs transition-all hover:bg-rose-100">
            <span>${d.name}</span>
            <span class="text-[8px] sm:text-[9px] bg-rose-500 text-white rounded-full px-1 sm:px-1.5 py-0.2 font-semibold">หยุด</span>
          </button>
        `;
      } else {
        return `
          <button type="button" onclick="window.toggleRestDay(${d.day})" class="p-1 sm:p-2 rounded-xl text-[10px] sm:text-xs font-medium border border-slate-200 bg-slate-50 text-slate-600 hover:bg-white hover:border-slate-300 flex flex-col items-center gap-0.5 sm:gap-1 transition-all">
            <span>${d.name}</span>
            <span class="text-[8px] sm:text-[9px] text-slate-400">ทำงาน</span>
          </button>
        `;
      }
    }).join("");

    if (summaryText) {
      summaryText.textContent = formatRestDays(Array.from(currentModalRestDays));
    }
  }

  window.toggleRestDay = function(dayNumber) {
    if (currentModalRestDays.has(dayNumber)) {
      currentModalRestDays.delete(dayNumber);
    } else {
      currentModalRestDays.add(dayNumber);
    }
    renderRestDaysButtons();
  };

  window.setRestDaysPreset = function(daysArray) {
    currentModalRestDays = new Set(daysArray);
    renderRestDaysButtons();
  };

  /**
   * อัปเดตแสดงโควตาวันลาคงเหลือและเวรหยุดของพนักงานที่ถูกเลือกในฟอร์มยื่นคำขอ
   */
  function updateEmployeeLiveQuota(empId) {
    const container = document.getElementById("emp-live-quota-container");
    const deptInput = document.getElementById("leave-form-emp-dept");
    const restDaysText = document.getElementById("emp-rest-days-text");

    if (!empId) {
      state.currentEmployee = null;
      if (container) container.classList.add("hidden");
      if (deptInput) deptInput.value = "";
      calculateFormDays();
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

      if (restDaysText) {
        restDaysText.textContent = formatRestDays(emp.rest_days);
      }

      if (container) container.classList.remove("hidden");
      calculateFormDays();
    }
  }

  /**
   * แนบเอกสารหลักฐาน (Multi-attachments) พร้อมบีบอัดรูปภาพอัตโนมัติป้องกันปัญหาโคต้าเต็ม
   */
  async function handleFilesUpload(files) {
    if (!files || files.length === 0) return;

    for (let file of Array.from(files)) {
      if (file.size > 20 * 1024 * 1024) {
        Swal.fire({
          icon: "warning",
          title: "ไฟล์มีขนาดใหญ่เกินไป",
          text: `ไฟล์ ${file.name} มีขนาดเกิน 20MB`
        });
        continue;
      }

      try {
        const fileObj = await LeaveAPI.compressImageFile(file);
        state.tempAttachments.push(fileObj);
      } catch (err) {
        console.error("File compression/read error:", err);
      }
    }

    renderAttachmentsPreview();
  }

  /**
   * เรนเดอร์รูปภาพ/ไฟล์แนบที่เลือกในฟอร์มยื่นคำขอลา
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
            ? `<img src="${item.base64}" alt="${escapeHtml(item.name)}" class="w-12 h-12 rounded-lg object-cover border border-slate-100 shrink-0 cursor-pointer" onclick="window.previewFullImage('${item.base64}')" title="คลิกเพื่อดูภาพเต็ม">`
            : `<div class="w-12 h-12 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center shrink-0 font-bold text-xs"><i data-lucide="file" class="w-6 h-6"></i></div>`
          }
          <div class="min-w-0 flex-1">
            <p class="text-xs font-medium text-slate-800 truncate" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</p>
            <p class="text-[10px] text-slate-400">${sizeKb} KB (บีบอัดแล้ว)</p>
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
   * แนบเอกสาร/ถ่ายรูปเพิ่มเติมในหน้าต่างแก้ไขคำขอลา (Edit Modal)
   */
  async function handleEditFilesUpload(files) {
    if (!files || files.length === 0) return;

    for (let file of Array.from(files)) {
      if (file.size > 20 * 1024 * 1024) {
        Swal.fire({
          icon: "warning",
          title: "ไฟล์มีขนาดใหญ่เกินไป",
          text: `ไฟล์ ${file.name} มีขนาดเกิน 20MB`
        });
        continue;
      }

      try {
        const fileObj = await LeaveAPI.compressImageFile(file);
        state.editAttachments.push(fileObj);
      } catch (err) {
        console.error("Edit file read error:", err);
      }
    }

    renderEditAttachmentsPreview();
  }

  /**
   * เรนเดอร์รูปภาพในหน้าต่างแก้ไขคำขอลา (Edit Modal)
   */
  function renderEditAttachmentsPreview() {
    const container = document.getElementById("edit-attachment-preview-list");
    if (!container) return;

    if (!state.editAttachments || state.editAttachments.length === 0) {
      container.innerHTML = `<div class="col-span-1 sm:col-span-2 text-center py-3 text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">ยังไม่มีรูปภาพหรือเอกสารแนบ</div>`;
      return;
    }

    container.innerHTML = state.editAttachments.map((item, index) => {
      const isImg = (item.type && item.type.startsWith("image/")) || (item.url && !String(item.url).endsWith(".pdf"));
      const displaySrc = item.base64 || item.url || "#";
      const sizeKb = item.size ? Math.round(item.size / 1024) + " KB" : (item.url ? "Cloud File" : "");

      return `
        <div class="relative group bg-white border border-slate-200 rounded-xl p-2.5 flex items-center gap-2.5 shadow-2xs">
          ${isImg 
            ? `<img src="${displaySrc}" alt="${escapeHtml(item.name || 'Attachment')}" class="w-12 h-12 rounded-lg object-cover border border-slate-100 shrink-0 cursor-pointer hover:opacity-90 transition-opacity" onclick="window.previewFullImage('${displaySrc}')" title="คลิกเพื่อดูภาพเต็ม">`
            : `<div class="w-12 h-12 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center shrink-0 font-bold text-xs"><i data-lucide="file" class="w-5 h-5"></i></div>`
          }
          <div class="min-w-0 flex-1">
            <p class="text-xs font-semibold text-slate-800 truncate" title="${escapeHtml(item.name || 'ไฟล์แนบ')}">${escapeHtml(item.name || 'ไฟล์แนบ')}</p>
            <p class="text-[10px] text-slate-400">${sizeKb}</p>
            ${item.url ? `<a href="${item.url}" target="_blank" class="text-[10px] text-blue-600 hover:underline flex items-center gap-0.5 mt-0.5">เปิดในไดรฟ์ <i data-lucide="external-link" class="w-3 h-3"></i></a>` : `<span class="text-[9px] text-emerald-600 font-semibold bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">รูปใหม่</span>`}
          </div>
          <button type="button" onclick="window.removeEditAttachment(${index})" class="text-slate-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50 transition-colors" title="ลบรูปนี้">
            <i data-lucide="trash-2" class="w-4 h-4 text-rose-500"></i>
          </button>
        </div>
      `;
    }).join("");

    initLucide();
  }

  window.removeEditAttachment = function(index) {
    if (state.editAttachments && state.editAttachments[index] !== undefined) {
      state.editAttachments.splice(index, 1);
      renderEditAttachmentsPreview();
    }
  };

  window.previewFullImage = function(src) {
    if (!src || src === "#") return;
    Swal.fire({
      imageUrl: src,
      imageAlt: "รูปภาพหลักฐานการลา",
      showConfirmButton: false,
      showCloseButton: true,
      customClass: {
        popup: 'max-w-2xl p-2'
      }
    });
  };

  /**
   * View Mode Controls: ควบคุมการสลับมุมมอง "ตาราง" (Table) vs "การ์ด" (Cards)
   */
  function updateHistoryViewModeUI() {
    const mode = state.historyViewMode || (window.innerWidth < 768 ? "cards" : "table");
    const tableContainer = document.getElementById("history-table-container");
    const cardsContainer = document.getElementById("history-cards-container");
    const tableBtn = document.getElementById("btn-history-view-table");
    const cardsBtn = document.getElementById("btn-history-view-cards");

    if (!tableContainer || !cardsContainer) return;

    if (mode === "cards") {
      tableContainer.classList.add("hidden");
      cardsContainer.classList.remove("hidden");

      cardsBtn?.classList.add("bg-white", "text-blue-600", "shadow-xs");
      cardsBtn?.classList.remove("text-slate-500", "hover:text-slate-700");

      tableBtn?.classList.remove("bg-white", "text-blue-600", "shadow-xs");
      tableBtn?.classList.add("text-slate-500", "hover:text-slate-700");
    } else {
      tableContainer.classList.remove("hidden");
      cardsContainer.classList.add("hidden");

      tableBtn?.classList.add("bg-white", "text-blue-600", "shadow-xs");
      tableBtn?.classList.remove("text-slate-500", "hover:text-slate-700");

      cardsBtn?.classList.remove("bg-white", "text-blue-600", "shadow-xs");
      cardsBtn?.classList.add("text-slate-500", "hover:text-slate-700");
    }
  }

  window.setHistoryViewMode = function(mode) {
    state.historyViewMode = mode;
    try {
      localStorage.setItem("LEAVE_HISTORY_VIEW", mode);
    } catch (e) {}
    updateHistoryViewModeUI();
  };

  function updateReportViewModeUI() {
    const mode = state.reportViewMode || (window.innerWidth < 768 ? "cards" : "table");
    const tableContainer = document.getElementById("report-table-container");
    const cardsContainer = document.getElementById("report-cards-container");
    const tableBtn = document.getElementById("btn-report-view-table");
    const cardsBtn = document.getElementById("btn-report-view-cards");

    if (!tableContainer || !cardsContainer) return;

    if (mode === "cards") {
      tableContainer.classList.add("hidden");
      cardsContainer.classList.remove("hidden");

      cardsBtn?.classList.add("bg-white", "text-blue-600", "shadow-xs");
      cardsBtn?.classList.remove("text-slate-500", "hover:text-slate-700");

      tableBtn?.classList.remove("bg-white", "text-blue-600", "shadow-xs");
      tableBtn?.classList.add("text-slate-500", "hover:text-slate-700");
    } else {
      tableContainer.classList.remove("hidden");
      cardsContainer.classList.add("hidden");

      tableBtn?.classList.add("bg-white", "text-blue-600", "shadow-xs");
      tableBtn?.classList.remove("text-slate-500", "hover:text-slate-700");

      cardsBtn?.classList.remove("bg-white", "text-blue-600", "shadow-xs");
      cardsBtn?.classList.add("text-slate-500", "hover:text-slate-700");
    }
  }

  window.setReportViewMode = function(mode) {
    state.reportViewMode = mode;
    try {
      localStorage.setItem("LEAVE_REPORT_VIEW", mode);
    } catch (e) {}
    updateReportViewModeUI();
  };

  /**
   * 2. แท็บประวัติการลา (Leave History - รองรับทั้งแบบตาราง และแบบการ์ดบนมือถือ)
   */
  function renderLeaveHistoryTable() {
    const tbody = document.getElementById("history-table-body");
    const cardsContainer = document.getElementById("history-cards-container");
    const countSpan = document.getElementById("history-total-count");

    const searchTerm = (document.getElementById("filter-history-search")?.value || "").toLowerCase().trim();
    const deptFilter = document.getElementById("filter-history-dept")?.value || "";
    const typeFilter = document.getElementById("filter-history-type")?.value || "";

    let filtered = [...state.leaveRequests];

    if (deptFilter) filtered = filtered.filter(r => r.department === deptFilter);
    if (typeFilter) filtered = filtered.filter(r => r.leave_type === typeFilter);
    if (searchTerm) {
      filtered = filtered.filter(r => {
        return (
          String(r.request_id || "").toLowerCase().includes(searchTerm) ||
          String(r.emp_id || "").toLowerCase().includes(searchTerm) ||
          String(r.emp_name || "").toLowerCase().includes(searchTerm) ||
          String(r.department || "").toLowerCase().includes(searchTerm)
        );
      });
    }

    if (countSpan) {
      countSpan.textContent = `แสดงทั้งหมด ${filtered.length} รายการ`;
    }

    if (filtered.length === 0) {
      if (tbody) tbody.innerHTML = `<tr><td colspan="9" class="text-center py-10 text-slate-400">ไม่พบประวัติการลา</td></tr>`;
      if (cardsContainer) {
        cardsContainer.innerHTML = `
          <div class="col-span-full text-center py-12 px-4 text-slate-400 bg-white rounded-2xl border border-slate-200">
            <i data-lucide="clipboard-x" class="w-8 h-8 mx-auto mb-2 text-slate-300"></i>
            <p class="font-medium text-slate-500 text-xs">ไม่พบประวัติการลา</p>
          </div>
        `;
      }
      updateHistoryViewModeUI();
      initLucide();
      return;
    }

    // 1. เรนเดอร์แบบตาราง (Table View)
    if (tbody) {
      tbody.innerHTML = filtered.map(req => {
        const typeInfo = CONFIG.LEAVE_TYPES[req.leave_type] || CONFIG.LEAVE_TYPES.other;
        const statusBadge = getStatusBadge(req.status);
        const attachmentsCount = (req.attachments && Array.isArray(req.attachments)) ? req.attachments.length : 0;
        
        const createdFormatted = LeaveAPI.formatDateTime(req.created_at);
        const startDMY = LeaveAPI.formatDateDMY(req.start_date);
        const endDMY = LeaveAPI.formatDateDMY(req.end_date);

        let durationLabel = `${startDMY} ถึง ${endDMY}`;
        if (req.leave_duration_type === "hourly") {
          durationLabel = `${startDMY} <span class="text-amber-700 block font-bold text-[10px]">(รายชั่วโมง ${req.leave_hours || ""} ชม.)</span>`;
        } else if (req.leave_duration_type === "morning") {
          durationLabel = `${startDMY} <span class="text-blue-600 block text-[10px]">(ครึ่งวันเช้า)</span>`;
        } else if (req.leave_duration_type === "afternoon") {
          durationLabel = `${startDMY} <span class="text-blue-600 block text-[10px]">(ครึ่งวันบ่าย)</span>`;
        }

        return `
          <tr class="hover:bg-slate-50 transition-colors">
            <td class="py-3 px-4">
              <span class="font-mono font-bold text-slate-800 block">${escapeHtml(req.request_id)}</span>
              <span class="text-[10px] text-slate-400">${createdFormatted}</span>
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
            <td class="py-3 px-4 font-mono text-xs text-slate-700">
              ${durationLabel}
            </td>
            <td class="py-3 px-4 text-center font-bold text-slate-800">${req.total_days}</td>
            <td class="py-3 px-4 text-slate-600 max-w-xs truncate" title="${escapeHtml(req.reason)}">
              ${escapeHtml(req.reason)}
            </td>
            <td class="py-3 px-4">
              ${attachmentsCount > 0 
                ? `<span class="inline-flex items-center gap-1 text-[11px] text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                    <i data-lucide="paperclip" class="w-3 h-3"></i> ${attachmentsCount} ไฟล์
                  </span>` 
                : `<span class="text-slate-400 text-[11px]">-</span>`}
            </td>
            <td class="py-3 px-4 text-center">${statusBadge}</td>
            <td class="py-3 px-4 text-right">
              <div class="flex items-center justify-end gap-1.5">
                <button onclick="window.openEditLeaveModal('${escapeHtml(req.request_id)}')" class="p-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors" title="แก้ไขการลา">
                  <i data-lucide="edit-3" class="w-4 h-4"></i>
                </button>
                <button onclick="window.confirmDeleteLeave('${escapeHtml(req.request_id)}')" class="p-1.5 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-lg transition-colors" title="ลบรายการลา">
                  <i data-lucide="trash-2" class="w-4 h-4"></i>
                </button>
                <button onclick="window.viewLeaveDetail('${escapeHtml(req.request_id)}')" class="p-1.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg transition-colors" title="ดูรายละเอียด / พิมพ์ใบลา">
                  <i data-lucide="printer" class="w-4 h-4"></i>
                </button>
              </div>
            </td>
          </tr>
        `;
      }).join("");
    }

    // 2. เรนเดอร์แบบการ์ด (Cards View - ออกแบบสำหรับมือถือและหน้าจอสัมผัสโดยเฉพาะ)
    if (cardsContainer) {
      cardsContainer.innerHTML = filtered.map(req => {
        const typeInfo = CONFIG.LEAVE_TYPES[req.leave_type] || CONFIG.LEAVE_TYPES.other;
        const statusBadge = getStatusBadge(req.status);
        const attachmentsCount = (req.attachments && Array.isArray(req.attachments)) ? req.attachments.length : 0;
        
        const createdFormatted = LeaveAPI.formatDateTime(req.created_at);
        const startDMY = LeaveAPI.formatDateDMY(req.start_date);
        const endDMY = LeaveAPI.formatDateDMY(req.end_date);

        let durationLabel = `${startDMY} ถึง ${endDMY}`;
        if (req.leave_duration_type === "hourly") {
          durationLabel = `${startDMY} (รายชั่วโมง ${req.leave_hours || ""} ชม.)`;
        } else if (req.leave_duration_type === "morning") {
          durationLabel = `${startDMY} (ครึ่งวันเช้า)`;
        } else if (req.leave_duration_type === "afternoon") {
          durationLabel = `${startDMY} (ครึ่งวันบ่าย)`;
        }

        return `
          <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex flex-col justify-between hover:border-blue-300 transition-all space-y-3">
            <div>
              <!-- Card Header: ID & Status -->
              <div class="flex items-start justify-between gap-2 pb-2.5 border-b border-slate-100">
                <div>
                  <span class="font-mono font-bold text-xs text-blue-600 block">${escapeHtml(req.request_id)}</span>
                  <span class="text-[10px] text-slate-400">${createdFormatted}</span>
                </div>
                <div>${statusBadge}</div>
              </div>

              <!-- Employee Info -->
              <div class="py-2 flex items-center gap-2.5">
                <div class="w-9 h-9 rounded-full bg-blue-50 text-blue-600 font-bold flex items-center justify-center text-xs shrink-0 border border-blue-100">
                  ${escapeHtml((req.emp_name || "E").charAt(0))}
                </div>
                <div class="min-w-0 flex-1">
                  <h4 class="font-bold text-slate-800 text-xs truncate">${escapeHtml(req.emp_name)}</h4>
                  <p class="text-[10px] text-slate-400 truncate">${escapeHtml(req.emp_id)} • ${escapeHtml(req.department)}</p>
                </div>
              </div>

              <!-- Leave Details Box -->
              <div class="bg-slate-50/80 rounded-xl p-2.5 space-y-1.5 text-xs border border-slate-100">
                <div class="flex items-center justify-between">
                  <span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold ${typeInfo.badgeClass}">
                    ${typeInfo.name.split(" ")[0]}
                  </span>
                  <span class="font-bold text-blue-700 font-mono text-xs bg-white px-2 py-0.5 rounded border border-slate-200">
                    ${req.total_days} วันทำการ
                  </span>
                </div>

                <div class="flex items-center gap-1.5 text-[11px] text-slate-600">
                  <i data-lucide="calendar" class="w-3.5 h-3.5 text-blue-500 shrink-0"></i>
                  <span>${durationLabel}</span>
                </div>

                ${req.reason ? `
                  <div class="pt-1 border-t border-slate-200/60 text-[11px] text-slate-600 line-clamp-2">
                    <span class="font-semibold text-slate-700">เหตุผล:</span> ${escapeHtml(req.reason)}
                  </div>
                ` : ""}

                ${attachmentsCount > 0 ? `
                  <div class="pt-1">
                    <span class="inline-flex items-center gap-1 text-[10px] text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 font-medium">
                      <i data-lucide="paperclip" class="w-3 h-3"></i> ไฟล์แนบ ${attachmentsCount} รายการ
                    </span>
                  </div>
                ` : ""}
              </div>
            </div>

            <!-- Action Buttons -->
            <div class="pt-2 border-t border-slate-100 flex items-center justify-end gap-1.5">
              <button type="button" onclick="window.viewLeaveDetail('${escapeHtml(req.request_id)}')" class="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors">
                <i data-lucide="printer" class="w-3.5 h-3.5"></i> ดูใบลา
              </button>
              <button type="button" onclick="window.openEditLeaveModal('${escapeHtml(req.request_id)}')" class="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors">
                <i data-lucide="edit-3" class="w-3.5 h-3.5"></i> แก้ไข
              </button>
              <button type="button" onclick="window.confirmDeleteLeave('${escapeHtml(req.request_id)}')" class="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg text-xs font-semibold flex items-center transition-colors" title="ลบรายการ">
                <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
              </button>
            </div>
          </div>
        `;
      }).join("");
    }

    updateHistoryViewModeUI();
    initLucide();
  }

  /**
   * เปิด Modal แก้ไขข้อมูลการลา
   */
  window.openEditLeaveModal = function(requestId) {
    const req = state.leaveRequests.find(r => r.request_id === requestId);
    if (!req) return;

    document.getElementById("edit-leave-modal-id").textContent = req.request_id;
    document.getElementById("edit-leave-id").value = req.request_id;
    document.getElementById("edit-leave-emp-id").value = req.emp_id;
    document.getElementById("edit-leave-emp-name").textContent = `${req.emp_id} - ${req.emp_name}`;
    document.getElementById("edit-leave-emp-dept").textContent = req.department;

    document.getElementById("edit-leave-type").value = req.leave_type;
    document.getElementById("edit-leave-duration-type").value = req.leave_duration_type || "full";
    document.getElementById("edit-leave-start-date").value = LeaveAPI.formatDateISO(req.start_date);
    document.getElementById("edit-leave-end-date").value = LeaveAPI.formatDateISO(req.end_date);
    document.getElementById("edit-leave-reason").value = req.reason || "";

    const hourlyBox = document.getElementById("edit-hourly-box");
    if (req.leave_duration_type === "hourly") {
      hourlyBox.classList.remove("hidden");
      document.getElementById("edit-leave-hours").value = req.leave_hours || 2;
      document.getElementById("edit-leave-time-range").value = req.leave_time_range || "";
    } else {
      hourlyBox.classList.add("hidden");
    }

    // โหลดรูปภาพเอกสารแนบเดิมเข้าสู่ state.editAttachments สำหรับการแก้ไข
    state.editAttachments = Array.isArray(req.attachments) 
      ? JSON.parse(JSON.stringify(req.attachments))
      : [];
    renderEditAttachmentsPreview();

    document.getElementById("modal-edit-leave").classList.remove("hidden");
    initLucide();
  };

  /**
   * ยืนยันการลบคำขอลา (Delete Leave)
   * เมื่อลบแล้วจะลบออกจากทั้ง "ประวัติการลา" และ "รายงาน" พร้อมคืนสิทธิ์วันลาให้พนักงานทันที
   */
  window.confirmDeleteLeave = async function(requestId) {
    const req = state.leaveRequests.find(r => String(r.request_id).trim() === String(requestId).trim());
    const empName = req ? req.emp_name : "";
    const totalDays = req ? req.total_days : 1;
    const leaveTypeObj = req ? (CONFIG.LEAVE_TYPES[req.leave_type] || CONFIG.LEAVE_TYPES.other) : null;
    const leaveTypeName = leaveTypeObj ? leaveTypeObj.name.split(" ")[0] : "วันลา";

    const confirm = await Swal.fire({
      title: "ยืนยันการลบรายการลา?",
      html: `
        <div class="text-left bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs space-y-1 my-2">
          <p><b>รหัสคำขอ:</b> <span class="font-mono text-blue-600">${requestId}</span></p>
          ${empName ? `<p><b>พนักงาน:</b> ${escapeHtml(empName)}</p>` : ""}
          ${leaveTypeName ? `<p><b>ประเภทการลา:</b> ${leaveTypeName} (${totalDays} วันทำการ)</p>` : ""}
        </div>
        <div class="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-semibold">
          ✨ ระบบจะคืนสิทธิ์วันลาจำนวน <b>${totalDays} วัน</b> กลับเข้าสู่ยอดคงเหลือของพนักงานทันที
        </div>
      `,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#e11d48",
      cancelButtonColor: "#64748b",
      confirmButtonText: "ใช่, ลบรายการและคืนวันลา",
      cancelButtonText: "ยกเลิก"
    });

    if (confirm.isConfirmed) {
      Swal.fire({
        title: "กำลังลบข้อมูล...",
        text: "กำลังปรับปรุงรายงานและคืนสิทธิ์วันลา",
        allowOutsideClick: false,
        didOpen: () => {
          Swal.showLoading();
        }
      });

      // 1. นำออกจาก state.leaveRequests ทันที (ทำให้หายไปจากประวัติ, รายงาน และคืนโควต้าทันที)
      state.leaveRequests = state.leaveRequests.filter(r => String(r.request_id).trim() !== String(requestId).trim());

      // 2. เรียก API เพื่อลบออกจาก Storage และส่งคำสั่งลบไปยัง Google Sheets
      const res = await window.leaveAPI.deleteLeaveRequest(requestId, req || {});

      // 3. รีเฟรชการแสดงผลทุกจุดบนหน้าจอทันที
      updateDashboardKPIs();
      renderDashboardRecentTable();
      renderDashboardCharts();
      renderLeaveHistoryTable();
      renderReports();
      renderEmployeeCards();

      // 4. แจ้งเตือนสถานะสำเร็จ
      if (res && res.sheetUpdated === false) {
        Swal.fire({
          icon: "info",
          title: "ลบและคืนสิทธิ์วันลาเรียบร้อยแล้ว",
          html: `
            <p class="text-sm text-slate-700">ระบบได้ลบใบลาออกจาก<b>ประวัติการลา</b>และ<b>รายงาน</b> พร้อม<b>คืนวันลาให้พนักงาน</b>เรียบร้อยแล้วครับ</p>
            <div class="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 text-left">
              <b>คำแนะนำสำหรับ Google Sheet:</b><br>
              หากต้องการให้แถวใน Google Sheet ถูกลบถาวรด้วย อย่าลืมเข้าไปที่ Apps Script แล้วกด <b>Deploy > Manage deployments > แก้ไข (รูปดินสอ) > Version: New version > กด Deploy</b> ครับ
            </div>
          `,
          confirmButtonText: "รับทราบ"
        });
      } else {
        Swal.fire({
          icon: "success",
          title: "ลบรายการลาเรียบร้อยแล้ว",
          text: `ลบออกจากประวัติและรายงาน พร้อมคืนสิทธิ์วันลา ${totalDays} วัน เรียบร้อยแล้ว`,
          timer: 2000,
          showConfirmButton: false
        });
      }
    }
  };

  /**
   * ดูรายละเอียดคำขอและสั่งพิมพ์ใบลาใน Modal
   */
  window.viewLeaveDetail = function(requestId) {
    const req = state.leaveRequests.find(r => r.request_id === requestId);
    if (!req) return;

    state.selectedLeaveRequest = req;

    document.getElementById("detail-modal-req-id").textContent = req.request_id;
    document.getElementById("detail-modal-created-at").textContent = "ยื่นคำขอเมื่อ: " + LeaveAPI.formatDateTime(req.created_at);
    document.getElementById("detail-modal-emp-name").textContent = req.emp_name;
    document.getElementById("detail-modal-emp-id").textContent = "รหัส: " + req.emp_id;
    document.getElementById("detail-modal-dept").textContent = req.department;

    const typeInfo = CONFIG.LEAVE_TYPES[req.leave_type] || CONFIG.LEAVE_TYPES.other;
    document.getElementById("detail-modal-type").textContent = typeInfo.name;
    document.getElementById("detail-modal-days").textContent = `${req.total_days} วันทำการ`;
    
    const startDMY = LeaveAPI.formatDateDMY(req.start_date);
    const endDMY = LeaveAPI.formatDateDMY(req.end_date);
    document.getElementById("detail-modal-date-range").textContent = `${startDMY} ถึง ${endDMY}`;
    document.getElementById("detail-modal-reason").textContent = req.reason || "-";

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

            <!-- Rest Days Info -->
            <div class="mt-3 flex items-center justify-between text-[11px] text-slate-500 bg-slate-50 border border-slate-200/80 rounded-lg px-2.5 py-1.5">
              <span class="flex items-center gap-1 text-slate-600 font-medium">
                <i data-lucide="calendar" class="w-3.5 h-3.5 text-blue-500"></i> เวรหยุดประจำสัปดาห์:
              </span>
              <span class="font-bold text-blue-700">${formatRestDays(emp.rest_days)}</span>
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

    // ตั้งค่า Checkbox เวรหยุดประจำสัปดาห์
    const empRestDays = Array.isArray(emp.rest_days) ? emp.rest_days.map(Number) : [0, 6];
    window.setRestDaysPreset(empRestDays);

    document.getElementById("modal-employee").classList.remove("hidden");
    initLucide();
  };

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

  window.viewEmployeeLeaveHistory = function(empId) {
    switchTab("tab-leave-history");
    const historySearch = document.getElementById("filter-history-search");
    if (historySearch) {
      historySearch.value = empId;
      renderLeaveHistoryTable();
    }
  };

  /**
   * 5. Holidays Table
   * แสดงวันที่ในรูปแบบ วัน/เดือน/ปี (DD/MM/YYYY) ตามมาตรฐาน และลบรายการได้ 100%
   */
  function renderHolidaysTable() {
    const tbody = document.getElementById("holidays-table-body");
    if (!tbody) return;

    // กรองและ Normalize ข้อมูลวันหยุดให้สะอาดและถูกต้องเสมอ
    const validHolidays = (state.holidays || [])
      .map(h => LeaveAPI.normalizeHoliday(h))
      .filter(h => h && h.holiday_date);

    if (validHolidays.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" class="text-center py-8 text-slate-400">ยังไม่มีข้อมูลวันหยุดนักขัตฤกษ์ในระบบ กรุณากดปุ่ม "โหลดวันหยุดไทย" หรือ "เพิ่มวันหยุดเอง"</td></tr>`;
      return;
    }

    const sorted = [...validHolidays].sort((a, b) => {
      const dateA = a.holiday_date;
      const dateB = b.holiday_date;
      return dateA.localeCompare(dateB);
    });

    tbody.innerHTML = sorted.map(h => {
      const cleanISO = h.holiday_date;
      const dmy = LeaveAPI.formatDateDMY(cleanISO);
      
      let thaiLabel = "";
      try {
        const dObj = new Date(cleanISO + "T00:00:00");
        thaiLabel = dObj.toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" });
      } catch (e) {
        thaiLabel = dmy;
      }

      const safeId = escapeHtml(String(h.id || ""));
      const safeDate = escapeHtml(String(cleanISO));
      const safeName = escapeHtml(String(h.name || ""));
      const displayYear = h.year || cleanISO.slice(0, 4);
      const thYear = displayYear ? (parseInt(displayYear) + 543) : "";

      return `
        <tr class="hover:bg-slate-50 transition-colors">
          <td class="py-3 px-4">
            <span class="font-mono font-bold text-slate-800 text-sm">${dmy}</span>
            <span class="text-slate-400 text-xs block">${thaiLabel}</span>
          </td>
          <td class="py-3 px-4 font-semibold text-slate-800">${safeName}</td>
          <td class="py-3 px-4 text-center font-mono text-slate-500">
            ${displayYear} ${thYear ? `<span class="text-xs text-slate-400 font-sans">(พ.ศ. ${thYear})</span>` : ""}
          </td>
          <td class="py-3 px-4 text-right">
            <button onclick="window.confirmDeleteHoliday('${safeId}', '${safeDate}', '${safeName}')" class="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 ml-auto">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
              <span>ลบออก</span>
            </button>
          </td>
        </tr>
      `;
    }).join("");

    initLucide();
  }

  window.confirmDeleteHoliday = async function(id, holidayDate, holidayName) {
    const confirm = await Swal.fire({
      title: "ยืนยันการลบวันหยุด?",
      html: `ต้องการลบ <b>"${holidayName}"</b><br><span class="text-xs text-slate-500">วันที่ ${LeaveAPI.formatDateDMY(holidayDate)}</span> หรือไม่?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#e11d48",
      confirmButtonText: "ลบวันหยุดนี้",
      cancelButtonText: "ยกเลิก"
    });

    if (confirm.isConfirmed) {
      try {
        await window.leaveAPI.deleteHoliday(id, holidayDate, holidayName);
        Swal.fire({ icon: "success", title: "ลบวันหยุดเรียบร้อย", timer: 1200, showConfirmButton: false });
        await loadData();
      } catch (err) {
        Swal.fire({ icon: "error", title: "ไม่สามารถลบได้", text: err.message });
      }
    }
  };

  /**
   * 6. Reports & Export
   * แสดงรายงานประวัติการลา พร้อมแสดงการ์ดสรุปยอดวันลาแยกประเภท (เช่น 3/10 วัน) เมื่อเลือกพนักงาน
   */
  function renderReports() {
    const tbody = document.getElementById("report-table-body");
    const summaryText = document.getElementById("report-summary-text");
    const periodText = document.getElementById("report-header-period");
    const empSummaryCard = document.getElementById("report-employee-summary-card");

    const selectedYear = document.getElementById("report-filter-year")?.value || "";
    const startDate = document.getElementById("report-filter-start")?.value || "";
    const endDate = document.getElementById("report-filter-end")?.value || "";
    const empId = document.getElementById("report-filter-emp")?.value || "";
    const leaveType = document.getElementById("report-filter-type")?.value || "";

    // 1. ตรวจสอบการเลือกพนักงาน เพื่อแสดงการ์ดสรุปยอดวันลาแยกแต่ละประเภท (เช่น ลาพักร้อน 3/10 วัน)
    const selectedEmp = empId ? state.employees.find(e => String(e.emp_id).trim() === String(empId).trim()) : null;

    if (selectedEmp && empSummaryCard) {
      const balances = window.leaveAPI.calculateEmployeeBalances(selectedEmp, state.leaveRequests);
      const totalUsed = (balances.annual.used + balances.personal.used + balances.sick.used + balances.other.used);
      const totalQuota = (balances.annual.quota + balances.personal.quota + balances.sick.quota + balances.other.quota);
      const totalRemaining = (balances.annual.remaining + balances.personal.remaining + balances.sick.remaining + balances.other.remaining);

      const annualPct = Math.min(100, Math.round((balances.annual.used / (balances.annual.quota || 1)) * 100));
      const personalPct = Math.min(100, Math.round((balances.personal.used / (balances.personal.quota || 1)) * 100));
      const sickPct = Math.min(100, Math.round((balances.sick.used / (balances.sick.quota || 1)) * 100));
      const otherPct = Math.min(100, Math.round((balances.other.used / (balances.other.quota || 1)) * 100));

      empSummaryCard.classList.remove("hidden");
      empSummaryCard.innerHTML = `
        <div class="bg-gradient-to-r from-slate-50 via-blue-50/30 to-indigo-50/20 border border-slate-200 rounded-xl p-4 my-3 text-slate-800 shadow-xs">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
            <div class="flex items-center gap-3">
              <div class="w-11 h-11 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-sm shadow-sm shrink-0">
                ${escapeHtml(selectedEmp.name.charAt(0))}
              </div>
              <div>
                <h3 class="font-bold text-base text-slate-900 flex items-center gap-2">
                  <span>${escapeHtml(selectedEmp.name)}</span>
                  <span class="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-blue-100 text-blue-800">${escapeHtml(selectedEmp.emp_id)}</span>
                </h3>
                <p class="text-xs text-slate-500 mt-0.5">
                  แผนก: <span class="font-medium text-slate-700">${escapeHtml(selectedEmp.department)}</span> • 
                  ตำแหน่ง: <span class="font-medium text-slate-700">${escapeHtml(selectedEmp.position || "-")}</span>
                </p>
              </div>
            </div>
            <div class="sm:text-right bg-white sm:bg-transparent p-2 sm:p-0 rounded-lg border sm:border-0 border-slate-200">
              <span class="text-[11px] text-slate-500 block font-medium">ภาพรวมการใช้วันลาทั้งหมด</span>
              <span class="text-base font-extrabold text-blue-700 font-mono">ใช้ไป ${totalUsed} / ${totalQuota} วัน</span>
              <span class="text-[11px] text-emerald-600 font-semibold block">(สิทธิ์คงเหลือรวม ${totalRemaining} วัน)</span>
            </div>
          </div>

          <!-- 4 Quota Badges Grid: แสดงแยกแต่ละประเภทวันหยุดและวันหยุดที่หยุดได้ เช่น 3/10 -->
          <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
            <!-- 1. ลาพักร้อน (Annual Leave) -->
            <div class="bg-white p-3 rounded-xl border border-blue-100 shadow-xs">
              <div class="flex items-center justify-between text-xs font-semibold text-blue-700 mb-1">
                <span>ลาพักร้อน</span>
                <span class="font-mono bg-blue-50 text-blue-800 px-1.5 py-0.5 rounded text-[11px] font-bold">${balances.annual.used}/${balances.annual.quota} วัน</span>
              </div>
              <div class="text-xl font-black text-slate-900 font-mono">
                ${balances.annual.used} <span class="text-xs font-medium text-slate-400">/ ${balances.annual.quota} วัน</span>
              </div>
              <div class="w-full bg-slate-100 rounded-full h-1.5 mt-2 overflow-hidden">
                <div class="bg-blue-600 h-1.5 rounded-full transition-all duration-300" style="width: ${annualPct}%"></div>
              </div>
              <div class="flex justify-between items-center text-[10px] mt-1.5 font-medium">
                <span class="text-slate-400">ใช้ไป ${annualPct}%</span>
                <span class="text-emerald-700 font-bold">คงเหลือ ${balances.annual.remaining} วัน</span>
              </div>
            </div>

            <!-- 2. ลากิจ (Personal Leave) -->
            <div class="bg-white p-3 rounded-xl border border-purple-100 shadow-xs">
              <div class="flex items-center justify-between text-xs font-semibold text-purple-700 mb-1">
                <span>ลากิจ</span>
                <span class="font-mono bg-purple-50 text-purple-800 px-1.5 py-0.5 rounded text-[11px] font-bold">${balances.personal.used}/${balances.personal.quota} วัน</span>
              </div>
              <div class="text-xl font-black text-slate-900 font-mono">
                ${balances.personal.used} <span class="text-xs font-medium text-slate-400">/ ${balances.personal.quota} วัน</span>
              </div>
              <div class="w-full bg-slate-100 rounded-full h-1.5 mt-2 overflow-hidden">
                <div class="bg-purple-600 h-1.5 rounded-full transition-all duration-300" style="width: ${personalPct}%"></div>
              </div>
              <div class="flex justify-between items-center text-[10px] mt-1.5 font-medium">
                <span class="text-slate-400">ใช้ไป ${personalPct}%</span>
                <span class="text-emerald-700 font-bold">คงเหลือ ${balances.personal.remaining} วัน</span>
              </div>
            </div>

            <!-- 3. ลาป่วย (Sick Leave) -->
            <div class="bg-white p-3 rounded-xl border border-rose-100 shadow-xs">
              <div class="flex items-center justify-between text-xs font-semibold text-rose-700 mb-1">
                <span>ลาป่วย</span>
                <span class="font-mono bg-rose-50 text-rose-800 px-1.5 py-0.5 rounded text-[11px] font-bold">${balances.sick.used}/${balances.sick.quota} วัน</span>
              </div>
              <div class="text-xl font-black text-slate-900 font-mono">
                ${balances.sick.used} <span class="text-xs font-medium text-slate-400">/ ${balances.sick.quota} วัน</span>
              </div>
              <div class="w-full bg-slate-100 rounded-full h-1.5 mt-2 overflow-hidden">
                <div class="bg-rose-600 h-1.5 rounded-full transition-all duration-300" style="width: ${sickPct}%"></div>
              </div>
              <div class="flex justify-between items-center text-[10px] mt-1.5 font-medium">
                <span class="text-slate-400">ใช้ไป ${sickPct}%</span>
                <span class="text-emerald-700 font-bold">คงเหลือ ${balances.sick.remaining} วัน</span>
              </div>
            </div>

            <!-- 4. ลาอื่นๆ (Other Leave) -->
            <div class="bg-white p-3 rounded-xl border border-amber-100 shadow-xs">
              <div class="flex items-center justify-between text-xs font-semibold text-amber-700 mb-1">
                <span>ลาอื่นๆ</span>
                <span class="font-mono bg-amber-50 text-amber-800 px-1.5 py-0.5 rounded text-[11px] font-bold">${balances.other.used}/${balances.other.quota} วัน</span>
              </div>
              <div class="text-xl font-black text-slate-900 font-mono">
                ${balances.other.used} <span class="text-xs font-medium text-slate-400">/ ${balances.other.quota} วัน</span>
              </div>
              <div class="w-full bg-slate-100 rounded-full h-1.5 mt-2 overflow-hidden">
                <div class="bg-amber-600 h-1.5 rounded-full transition-all duration-300" style="width: ${otherPct}%"></div>
              </div>
              <div class="flex justify-between items-center text-[10px] mt-1.5 font-medium">
                <span class="text-slate-400">ใช้ไป ${otherPct}%</span>
                <span class="text-emerald-700 font-bold">คงเหลือ ${balances.other.remaining} วัน</span>
              </div>
            </div>
          </div>
        </div>
      `;
    } else if (empSummaryCard) {
      empSummaryCard.classList.add("hidden");
      empSummaryCard.innerHTML = "";
    }

    let filtered = [...state.leaveRequests];

    if (selectedYear) {
      filtered = filtered.filter(r => {
        const sY = LeaveAPI.formatDateISO(r.start_date).slice(0, 4);
        const eY = LeaveAPI.formatDateISO(r.end_date).slice(0, 4);
        return sY === selectedYear || eY === selectedYear;
      });
    }
    if (startDate) filtered = filtered.filter(r => LeaveAPI.formatDateISO(r.start_date) >= startDate);
    if (endDate) filtered = filtered.filter(r => LeaveAPI.formatDateISO(r.end_date) <= endDate);
    if (empId) filtered = filtered.filter(r => String(r.emp_id).trim() === String(empId).trim());
    if (leaveType) filtered = filtered.filter(r => r.leave_type === leaveType);

    if (periodText) {
      const yearStr = selectedYear ? `[ประจำปี พ.ศ. ${parseInt(selectedYear) + 543} (${selectedYear})]` : "";
      const dateRangeStr = (startDate && endDate) ? `(ช่วงวันที่ ${startDate} ถึง ${endDate})` : "";
      periodText.textContent = `ข้อมูล ณ วันที่: ${new Date().toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" })} ${yearStr} ${dateRangeStr}`.trim();
    }

    const cardsContainer = document.getElementById("report-cards-container");

    if (summaryText) {
      const totalDays = filtered.reduce((acc, curr) => acc + Number(curr.total_days || 0), 0);
      summaryText.textContent = `รวมรายการขอลาทั้งสิ้น ${filtered.length} รายการ (รวม ${totalDays} วันทำการ)`;
    }

    if (filtered.length === 0) {
      if (tbody) tbody.innerHTML = `<tr><td colspan="10" class="text-center py-8 text-slate-400">ไม่พบประวัติการลาตามเงื่อนไขที่เลือก</td></tr>`;
      if (cardsContainer) {
        cardsContainer.innerHTML = `
          <div class="col-span-full text-center py-10 px-4 text-slate-400 bg-white rounded-2xl border border-slate-200">
            <i data-lucide="clipboard-x" class="w-8 h-8 mx-auto mb-2 text-slate-300"></i>
            <p class="font-medium text-slate-500 text-xs">ไม่พบประวัติการลาตามเงื่อนไขที่เลือก</p>
          </div>
        `;
      }
      updateReportViewModeUI();
      initLucide();
      return;
    }

    // 1. เรนเดอร์แบบตาราง (Table View สำหรับ Desktop และการพิมพ์รายงานทางการ)
    if (tbody) {
      tbody.innerHTML = filtered.map((req, index) => {
        const typeInfo = CONFIG.LEAVE_TYPES[req.leave_type] || CONFIG.LEAVE_TYPES.other;
        const startDMY = LeaveAPI.formatDateDMY(req.start_date);
        const endDMY = LeaveAPI.formatDateDMY(req.end_date);

        return `
          <tr>
            <td class="py-2.5 px-3 text-center">${index + 1}</td>
            <td class="py-2.5 px-3 font-mono">${escapeHtml(req.emp_id)}</td>
            <td class="py-2.5 px-3 font-semibold">${escapeHtml(req.emp_name)}</td>
            <td class="py-2.5 px-3">${escapeHtml(req.department)}</td>
            <td class="py-2.5 px-3">${typeInfo.name.split(" ")[0]}</td>
            <td class="py-2.5 px-3 font-mono text-[11px]">${startDMY} ถึง ${endDMY}</td>
            <td class="py-2.5 px-3 text-center font-bold">${req.total_days}</td>
            <td class="py-2.5 px-3 text-slate-600 max-w-xs truncate">${escapeHtml(req.reason)}</td>
            <td class="py-2.5 px-3 text-center font-semibold text-emerald-700">บันทึกแล้ว</td>
            <td class="py-2.5 px-3 text-right no-print">
              <div class="flex items-center justify-end gap-1.5">
                <button onclick="window.viewLeaveDetail('${escapeHtml(req.request_id)}')" class="p-1 text-blue-600 hover:text-blue-800 font-semibold text-xs inline-flex items-center gap-1 bg-blue-50 hover:bg-blue-100 rounded px-2 py-1 transition-colors" title="ดูใบลาและสั่งพิมพ์">
                  <i data-lucide="eye" class="w-3.5 h-3.5"></i> ดูใบลา
                </button>
                <button onclick="window.confirmDeleteLeave('${escapeHtml(req.request_id)}')" class="p-1 text-rose-600 hover:text-rose-800 font-semibold text-xs inline-flex items-center gap-1 bg-rose-50 hover:bg-rose-100 rounded px-2 py-1 transition-colors" title="ลบรายการลาและคืนวันลา">
                  <i data-lucide="trash-2" class="w-3.5 h-3.5"></i> ลบออก
                </button>
              </div>
            </td>
          </tr>
        `;
      }).join("");
    }

    // 2. เรนเดอร์แบบการ์ด (Cards View สำหรับหน้าจอมือถือ)
    if (cardsContainer) {
      cardsContainer.innerHTML = filtered.map((req, index) => {
        const typeInfo = CONFIG.LEAVE_TYPES[req.leave_type] || CONFIG.LEAVE_TYPES.other;
        const startDMY = LeaveAPI.formatDateDMY(req.start_date);
        const endDMY = LeaveAPI.formatDateDMY(req.end_date);

        return `
          <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex flex-col justify-between hover:border-blue-300 transition-all space-y-3">
            <div>
              <!-- Top: Index, Type & Status -->
              <div class="flex items-center justify-between gap-2 pb-2 border-b border-slate-100">
                <div class="flex items-center gap-2">
                  <span class="w-6 h-6 rounded-md bg-slate-100 text-slate-700 font-bold text-xs flex items-center justify-center font-mono">
                    ${index + 1}
                  </span>
                  <span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${typeInfo.badgeClass}">
                    ${typeInfo.name.split(" ")[0]}
                  </span>
                </div>
                <span class="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
                  <i data-lucide="check" class="w-3 h-3"></i> บันทึกแล้ว
                </span>
              </div>

              <!-- Employee Info -->
              <div class="py-2 flex items-center gap-2.5">
                <div class="w-9 h-9 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-xs shrink-0 shadow-xs">
                  ${escapeHtml((req.emp_name || "E").charAt(0))}
                </div>
                <div class="min-w-0 flex-1">
                  <h4 class="font-bold text-slate-900 text-xs truncate">${escapeHtml(req.emp_name)}</h4>
                  <p class="text-[11px] text-slate-500 truncate">รหัส: <span class="font-mono text-slate-700">${escapeHtml(req.emp_id)}</span> • ${escapeHtml(req.department)}</p>
                </div>
              </div>

              <!-- Details Box -->
              <div class="bg-slate-50 rounded-xl p-2.5 space-y-1.5 text-xs text-slate-700 border border-slate-100">
                <div class="flex items-center justify-between">
                  <span class="text-slate-500 text-[11px]">จำนวนวันทำการ:</span>
                  <span class="font-extrabold text-blue-700 font-mono text-sm">${req.total_days} วัน</span>
                </div>
                <div class="flex items-center gap-1.5 text-[11px] text-slate-600">
                  <i data-lucide="calendar" class="w-3.5 h-3.5 text-slate-400 shrink-0"></i>
                  <span>ช่วงวันที่: <b>${startDMY}</b> ถึง <b>${endDMY}</b></span>
                </div>
                ${req.reason ? `
                  <div class="pt-1 border-t border-slate-200/60 text-[11px] text-slate-600 line-clamp-2">
                    <span class="font-semibold text-slate-700">เหตุผล:</span> ${escapeHtml(req.reason)}
                  </div>
                ` : ""}
              </div>
            </div>

            <!-- Action Buttons -->
            <div class="pt-2 border-t border-slate-100 flex items-center justify-end gap-1.5">
              <button type="button" onclick="window.viewLeaveDetail('${escapeHtml(req.request_id)}')" class="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors">
                <i data-lucide="eye" class="w-3.5 h-3.5"></i> ดูใบลา
              </button>
              <button type="button" onclick="window.confirmDeleteLeave('${escapeHtml(req.request_id)}')" class="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors">
                <i data-lucide="trash-2" class="w-3.5 h-3.5"></i> ลบออก
              </button>
            </div>
          </div>
        `;
      }).join("");
    }

    updateReportViewModeUI();
    initLucide();

    initLucide();
  }

  function exportToExcel() {
    const table = document.querySelector("#printable-report-section table");
    if (!table) return;

    const empId = document.getElementById("report-filter-emp")?.value || "";
    const selectedYear = document.getElementById("report-filter-year")?.value || "";
    const selectedEmp = empId ? state.employees.find(e => String(e.emp_id).trim() === String(empId).trim()) : null;

    const wb = XLSX.utils.table_to_book(table, { sheet: "Leave_Report" });
    const today = new Date().toISOString().slice(0, 10);
    const suffix = selectedEmp ? `_${selectedEmp.emp_id}_${selectedEmp.name.replace(/\s+/g, "_")}` : "";
    const yearSuffix = selectedYear ? `_Year${selectedYear}` : "";
    XLSX.writeFile(wb, `Leave_History_Report${suffix}${yearSuffix}_${today}.xlsx`);
  }

  function openPrintableLeaveSlip(req) {
    if (!req) return;

    // ซ่อน modal รายละเอียดคำขอลา เพื่อไม่ให้แสดงซ้อนอยู่เบื้องหลังหรือหลุดไปหน้าพิมพ์
    document.getElementById("modal-leave-detail")?.classList.add("hidden");
    document.getElementById("modal-printable-report")?.classList.add("hidden");

    const emp = state.employees.find(e => String(e.emp_id).trim() === String(req.emp_id).trim());
    const balances = emp ? window.leaveAPI.calculateEmployeeBalances(emp, state.leaveRequests) : null;
    const typeInfo = CONFIG.LEAVE_TYPES[req.leave_type] || CONFIG.LEAVE_TYPES.other;

    document.getElementById("slip-req-id").textContent = req.request_id;
    document.getElementById("slip-date").textContent = LeaveAPI.formatDateDMY(req.created_at);
    document.getElementById("slip-emp-name").textContent = req.emp_name;
    document.getElementById("slip-emp-id").textContent = req.emp_id;
    document.getElementById("slip-emp-dept").textContent = req.department;
    document.getElementById("slip-emp-position").textContent = emp ? emp.position : "-";

    document.getElementById("slip-leave-type").textContent = typeInfo.name;
    document.getElementById("slip-leave-days").textContent = `${req.total_days} วันทำการ`;
    document.getElementById("slip-leave-start").textContent = LeaveAPI.formatDateDMY(req.start_date);
    document.getElementById("slip-leave-end").textContent = LeaveAPI.formatDateDMY(req.end_date);
    document.getElementById("slip-leave-reason").textContent = req.reason || "-";

    const balContainer = document.getElementById("slip-leave-balances");
    if (balances && balContainer) {
      balContainer.innerHTML = `
        <table class="slip-balance-table" style="width: 100%; border-collapse: collapse; margin-top: 4px; text-align: center; border: 1px solid #cbd5e1;">
          <tbody>
            <tr>
              <td style="width: 25%; padding: 8px 4px; border: 1px solid #cbd5e1; background: #ffffff; text-align: center;">
                <span style="display: block; font-size: 11px; color: #1e40af; font-weight: 600;">พักร้อนคงเหลือ</span>
                <span style="display: block; font-size: 14px; font-weight: 700; color: #1d4ed8; margin-top: 2px;">${balances.annual.remaining} วัน</span>
              </td>
              <td style="width: 25%; padding: 8px 4px; border: 1px solid #cbd5e1; background: #ffffff; text-align: center;">
                <span style="display: block; font-size: 11px; color: #6b21a8; font-weight: 600;">ลากิจคงเหลือ</span>
                <span style="display: block; font-size: 14px; font-weight: 700; color: #7e22ce; margin-top: 2px;">${balances.personal.remaining} วัน</span>
              </td>
              <td style="width: 25%; padding: 8px 4px; border: 1px solid #cbd5e1; background: #ffffff; text-align: center;">
                <span style="display: block; font-size: 11px; color: #9f1239; font-weight: 600;">ลาป่วยคงเหลือ</span>
                <span style="display: block; font-size: 14px; font-weight: 700; color: #e11d48; margin-top: 2px;">${balances.sick.remaining} วัน</span>
              </td>
              <td style="width: 25%; padding: 8px 4px; border: 1px solid #cbd5e1; background: #ffffff; text-align: center;">
                <span style="display: block; font-size: 11px; color: #92400e; font-weight: 600;">อื่นๆ คงเหลือ</span>
                <span style="display: block; font-size: 14px; font-weight: 700; color: #d97706; margin-top: 2px;">${balances.other.remaining} วัน</span>
              </td>
            </tr>
          </tbody>
        </table>
      `;
    }

    // ตรวจจับเบราว์เซอร์ LINE สำหรับแจ้งเตือนการสั่งพิมพ์
    const isLine = /Line|FBAN|FBAV|Instagram/i.test(navigator.userAgent);
    const slipLineAlert = document.getElementById("line-browser-slip-alert");
    if (slipLineAlert) {
      if (isLine) {
        slipLineAlert.classList.remove("hidden");
      } else {
        slipLineAlert.classList.add("hidden");
      }
    }

    document.getElementById("modal-printable-slip").classList.remove("hidden");
    initLucide();
  }

  /**
   * เปิดหน้าต่างพิมพ์รายงานสรุปประวัติการลาอย่างเป็นทางการ (Official Printable Report Modal)
   * รองรับทั้งการแสดงตัวอย่างบนจอมือถือ, การสั่งพิมพ์ AirPrint / Print,
   * และการดาวน์โหลดรายงานเป็นไฟล์ HTML / PDF สำหรับเปิดใน Safari หรือส่งต่อ
   */
  function openPrintableReportModal() {
    // ซ่อน modal อื่นๆ เพื่อป้องกันการแสดงผลซ้อนในหน้าพิมพ์
    document.getElementById("modal-leave-detail")?.classList.add("hidden");
    document.getElementById("modal-printable-slip")?.classList.add("hidden");

    const selectedYear = document.getElementById("report-filter-year")?.value || "";
    const startDate = document.getElementById("report-filter-start")?.value || "";
    const endDate = document.getElementById("report-filter-end")?.value || "";
    const empId = document.getElementById("report-filter-emp")?.value || "";
    const leaveType = document.getElementById("report-filter-type")?.value || "";

    let filtered = [...state.leaveRequests];
    if (selectedYear) {
      filtered = filtered.filter(r => {
        const sY = LeaveAPI.formatDateISO(r.start_date).slice(0, 4);
        const eY = LeaveAPI.formatDateISO(r.end_date).slice(0, 4);
        return sY === selectedYear || eY === selectedYear;
      });
    }
    if (startDate) filtered = filtered.filter(r => LeaveAPI.formatDateISO(r.start_date) >= startDate);
    if (endDate) filtered = filtered.filter(r => LeaveAPI.formatDateISO(r.end_date) <= endDate);
    if (empId) filtered = filtered.filter(r => String(r.emp_id).trim() === String(empId).trim());
    if (leaveType) filtered = filtered.filter(r => r.leave_type === leaveType);

    const selectedEmp = empId ? state.employees.find(e => String(e.emp_id).trim() === String(empId).trim()) : null;
    const now = new Date();
    const nowDateThai = now.toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" });
    const nowTime = now.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });

    let periodLabel = "ประวัติทั้งหมด";
    if (startDate && endDate) {
      periodLabel = `${LeaveAPI.formatDateDMY(startDate)} ถึง ${LeaveAPI.formatDateDMY(endDate)}`;
    } else if (startDate) {
      periodLabel = `ตั้งแต่วันที่ ${LeaveAPI.formatDateDMY(startDate)}`;
    } else if (endDate) {
      periodLabel = `ถึงวันที่ ${LeaveAPI.formatDateDMY(endDate)}`;
    }

    const yearLabel = selectedYear ? `พ.ศ. ${parseInt(selectedYear) + 543} (${selectedYear})` : "ทุกปี";

    let filterScopeLabel = "พนักงานทุกคนในระบบ";
    if (selectedEmp) {
      filterScopeLabel = `${selectedEmp.name} (รหัส: ${selectedEmp.emp_id} • แผนก: ${selectedEmp.department})`;
    }

    let typeScopeLabel = "ทุกประเภทการลา";
    if (leaveType && CONFIG.LEAVE_TYPES[leaveType]) {
      typeScopeLabel = CONFIG.LEAVE_TYPES[leaveType].name;
    }

    // สรุปยอดโควตาวันลาเมื่อเลือกพนักงานเฉพาะราย (ใช้ตาราง 4 ช่องเรียบร้อย ไม่พังในทุกเบราว์เซอร์)
    let quotaHtml = "";
    if (selectedEmp) {
      const balances = window.leaveAPI.calculateEmployeeBalances(selectedEmp, state.leaveRequests);
      quotaHtml = `
        <div class="border border-slate-300 rounded-lg p-3 bg-slate-50/90 text-xs" style="border: 1px solid #cbd5e1; background: #f8fafc; padding: 10px; border-radius: 8px; margin: 10px 0;">
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; margin-bottom: 8px;">
            <span style="font-weight: 700; color: #1e293b;">📊 สรุปสิทธิ์วันลาคงเหลือของพนักงาน (ณ วันที่พิมพ์):</span>
            <span style="font-family: monospace; font-size: 11px; color: #64748b;">${escapeHtml(selectedEmp.emp_id)} - ${escapeHtml(selectedEmp.name)}</span>
          </div>
          <table style="width: 100%; border-collapse: collapse; text-align: center; border: 1px solid #cbd5e1;">
            <tbody>
              <tr>
                <td style="width: 25%; padding: 8px 6px; border: 1px solid #cbd5e1; background: #ffffff; text-align: center;">
                  <span style="display: block; font-size: 11px; color: #1e40af; font-weight: 600;">ลาพักร้อน</span>
                  <span style="display: block; font-size: 13px; font-weight: 700; color: #0f172a; margin-top: 1px;">${balances.annual.used} / ${balances.annual.quota} วัน</span>
                  <span style="display: block; font-size: 10px; color: #047857; font-weight: 600;">เหลือ ${balances.annual.remaining} วัน</span>
                </td>
                <td style="width: 25%; padding: 8px 6px; border: 1px solid #cbd5e1; background: #ffffff; text-align: center;">
                  <span style="display: block; font-size: 11px; color: #6b21a8; font-weight: 600;">ลากิจ</span>
                  <span style="display: block; font-size: 13px; font-weight: 700; color: #0f172a; margin-top: 1px;">${balances.personal.used} / ${balances.personal.quota} วัน</span>
                  <span style="display: block; font-size: 10px; color: #047857; font-weight: 600;">เหลือ ${balances.personal.remaining} วัน</span>
                </td>
                <td style="width: 25%; padding: 8px 6px; border: 1px solid #cbd5e1; background: #ffffff; text-align: center;">
                  <span style="display: block; font-size: 11px; color: #9f1239; font-weight: 600;">ลาป่วย</span>
                  <span style="display: block; font-size: 13px; font-weight: 700; color: #0f172a; margin-top: 1px;">${balances.sick.used} / ${balances.sick.quota} วัน</span>
                  <span style="display: block; font-size: 10px; color: #047857; font-weight: 600;">เหลือ ${balances.sick.remaining} วัน</span>
                </td>
                <td style="width: 25%; padding: 8px 6px; border: 1px solid #cbd5e1; background: #ffffff; text-align: center;">
                  <span style="display: block; font-size: 11px; color: #92400e; font-weight: 600;">ลาอื่นๆ</span>
                  <span style="display: block; font-size: 13px; font-weight: 700; color: #0f172a; margin-top: 1px;">${balances.other.used} / ${balances.other.quota} วัน</span>
                  <span style="display: block; font-size: 10px; color: #047857; font-weight: 600;">เหลือ ${balances.other.remaining} วัน</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      `;
    }

    const totalDays = filtered.reduce((acc, curr) => acc + Number(curr.total_days || 0), 0);

    let rowsHtml = "";
    if (filtered.length === 0) {
      rowsHtml = `<tr><td colspan="9" class="p-6 text-center text-slate-400 italic">ไม่พบประวัติการลาตามเงื่อนไขที่เลือก</td></tr>`;
    } else {
      rowsHtml = filtered.map((req, index) => {
        const typeInfo = CONFIG.LEAVE_TYPES[req.leave_type] || CONFIG.LEAVE_TYPES.other;
        const startDMY = LeaveAPI.formatDateDMY(req.start_date);
        const endDMY = LeaveAPI.formatDateDMY(req.end_date);
        let durationText = `${startDMY} - ${endDMY}`;
        if (req.leave_duration_type === "hourly") {
          durationText = `${startDMY} (${req.leave_hours || ""} ชม.)`;
        } else if (req.leave_duration_type === "morning") {
          durationText = `${startDMY} (ครึ่งวันเช้า)`;
        } else if (req.leave_duration_type === "afternoon") {
          durationText = `${startDMY} (ครึ่งวันบ่าย)`;
        }

        return `
          <tr class="border-b border-slate-300">
            <td class="p-2 border border-slate-300 text-center font-mono">${index + 1}</td>
            <td class="p-2 border border-slate-300 font-mono text-center font-semibold">${escapeHtml(req.emp_id)}</td>
            <td class="p-2 border border-slate-300 font-medium text-slate-900">${escapeHtml(req.emp_name)}</td>
            <td class="p-2 border border-slate-300 text-slate-700">${escapeHtml(req.department)}</td>
            <td class="p-2 border border-slate-300 text-center font-semibold text-slate-800">${typeInfo.name.split(" ")[0]}</td>
            <td class="p-2 border border-slate-300 text-center font-mono text-[11px]">${durationText}</td>
            <td class="p-2 border border-slate-300 text-center font-bold text-blue-900">${req.total_days}</td>
            <td class="p-2 border border-slate-300 text-slate-600 text-[11px]">${escapeHtml(req.reason || "-")}</td>
            <td class="p-2 border border-slate-300 text-center font-semibold text-emerald-700 text-[11px]">บันทึกแล้ว</td>
          </tr>
        `;
      }).join("");
    }

    const sheetContainer = document.getElementById("printable-report-sheet");
    if (sheetContainer) {
      sheetContainer.innerHTML = `
        <div class="border-2 border-slate-900 p-5 sm:p-7 rounded-xl space-y-5 bg-white text-slate-900">
          <!-- Document Header -->
          <div class="text-center border-b-2 border-slate-900 pb-4">
            <h1 class="text-xl sm:text-2xl font-black tracking-tight text-slate-900">รายงานสรุปประวัติการลางานของพนักงาน</h1>
            <p class="text-xs text-slate-600 mt-1">LEAVE HISTORY &amp; ATTENDANCE SUMMARY REPORT • บริษัท เจริญอุตสาหกรรม จำกัด (มหาชน)</p>
            
            <table style="width: 100%; border-collapse: collapse; margin-top: 14px; border: none; font-size: 12px; text-align: left;">
              <tbody>
                <tr>
                  <td style="border: none; padding: 3px 0; width: 33.33%;"><b>วันที่พิมพ์รายงาน:</b> ${nowDateThai} (${nowTime} น.)</td>
                  <td style="border: none; padding: 3px 0; width: 33.33%;"><b>ประจำปีรายงาน:</b> ${yearLabel}</td>
                  <td style="border: none; padding: 3px 0; width: 33.33%;"><b>ประเภทการลา:</b> ${typeScopeLabel}</td>
                </tr>
                <tr>
                  <td style="border: none; padding: 3px 0;" colspan="2"><b>ขอบเขตข้อมูล:</b> ${filterScopeLabel}</td>
                  <td style="border: none; padding: 3px 0;"><b>ช่วงวันที่:</b> ${periodLabel}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Employee Quota Breakdown (if employee selected) -->
          ${quotaHtml}

          <!-- Official Table -->
          <div class="overflow-x-auto">
            <table class="w-full text-xs border-collapse border border-slate-400">
              <thead class="bg-slate-100 font-bold border-b-2 border-slate-400 text-slate-900">
                <tr>
                  <th class="p-2 border border-slate-400 text-center w-10">ลำดับ</th>
                  <th class="p-2 border border-slate-400 text-center w-20">รหัส</th>
                  <th class="p-2 border border-slate-400 text-left">ชื่อ - นามสกุล</th>
                  <th class="p-2 border border-slate-400 text-left">แผนก</th>
                  <th class="p-2 border border-slate-400 text-center">ประเภทลา</th>
                  <th class="p-2 border border-slate-400 text-center">ช่วงวันที่ลา</th>
                  <th class="p-2 border border-slate-400 text-center w-16">วันทำการ</th>
                  <th class="p-2 border border-slate-400 text-left">เหตุผลความจำเป็น</th>
                  <th class="p-2 border border-slate-400 text-center w-16">สถานะ</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml}
              </tbody>
              <tfoot class="bg-slate-100 font-bold border-t-2 border-slate-400 text-slate-900">
                <tr>
                  <td colspan="6" class="p-2.5 border border-slate-400 text-right">รวมจำนวนวันลาสุทธิทั้งหมด:</td>
                  <td class="p-2.5 border border-slate-400 text-center text-blue-900 text-sm font-black">${totalDays} วัน</td>
                  <td colspan="2" class="p-2.5 border border-slate-400 text-slate-600 font-semibold">(${filtered.length} รายการ)</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <!-- Signatures Footer (3 Columns Side by Side) -->
          <table class="signatures-table" style="width: 100%; border-collapse: collapse; margin-top: 35px; border: none; text-align: center;">
            <tbody>
              <tr>
                <td style="width: 33.33%; padding: 0 12px; border: none; vertical-align: top; text-align: center;">
                  <div style="height: 45px; border-bottom: 1px dotted #475569; margin: 0 10px 8px 10px;"></div>
                  <p style="margin: 0; font-weight: 600; font-size: 12px; color: #0f172a;">(ลงชื่อผู้จัดทำรายงาน)</p>
                  <p style="margin: 4px 0 0 0; font-size: 11px; color: #64748b;">วันที่ ......../......../............</p>
                </td>
                <td style="width: 33.33%; padding: 0 12px; border: none; vertical-align: top; text-align: center;">
                  <div style="height: 45px; border-bottom: 1px dotted #475569; margin: 0 10px 8px 10px;"></div>
                  <p style="margin: 0; font-weight: 600; font-size: 12px; color: #0f172a;">(ลงชื่อหัวหน้างาน / ผู้ตรวจสอบ)</p>
                  <p style="margin: 4px 0 0 0; font-size: 11px; color: #64748b;">วันที่ ......../......../............</p>
                </td>
                <td style="width: 33.33%; padding: 0 12px; border: none; vertical-align: top; text-align: center;">
                  <div style="height: 45px; border-bottom: 1px dotted #475569; margin: 0 10px 8px 10px;"></div>
                  <p style="margin: 0; font-weight: 600; font-size: 12px; color: #0f172a;">(ลงชื่อผู้อนุมัติฝ่ายบุคคล HR)</p>
                  <p style="margin: 4px 0 0 0; font-size: 11px; color: #64748b;">วันที่ ......../......../............</p>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      `;
    }

    // ตรวจจับ LINE In-App Browser
    const isLine = /Line|FBAN|FBAV|Instagram/i.test(navigator.userAgent);
    const lineAlert = document.getElementById("line-browser-report-alert");
    if (lineAlert) {
      if (isLine) {
        lineAlert.classList.remove("hidden");
      } else {
        lineAlert.classList.add("hidden");
      }
    }

    document.getElementById("modal-printable-report")?.classList.remove("hidden");
    initLucide();
  }

  window.openPrintableReportModal = openPrintableReportModal;

  window.triggerPrintReport = function() {
    document.body.classList.add("printing-report-modal");
    document.querySelectorAll("#modal-leave-detail, #modal-employee, #modal-holiday, #modal-printable-slip, #modal-departments, #modal-edit-leave").forEach(m => m.classList.add("hidden"));
    try {
      window.print();
    } catch (err) {
      console.warn("Print error:", err);
    }
    setTimeout(() => {
      document.body.classList.remove("printing-report-modal");
    }, 1000);
  };

  window.triggerPrintSlip = function() {
    document.body.classList.add("printing-slip-modal");
    document.querySelectorAll("#modal-leave-detail, #modal-employee, #modal-holiday, #modal-printable-report, #modal-departments, #modal-edit-leave").forEach(m => m.classList.add("hidden"));
    try {
      window.print();
    } catch (err) {
      console.warn("Print error:", err);
    }
    setTimeout(() => {
      document.body.classList.remove("printing-slip-modal");
    }, 1000);
  };

  window.addEventListener("afterprint", () => {
    document.body.classList.remove("printing-report-modal", "printing-slip-modal");
  });

  window.downloadReportAsHtml = function() {
    const sheet = document.getElementById("printable-report-sheet");
    if (!sheet) return;

    const sheetContent = sheet.innerHTML;
    const today = new Date().toISOString().slice(0, 10);
    const empId = document.getElementById("report-filter-emp")?.value || "";
    const selectedYear = document.getElementById("report-filter-year")?.value || "";

    const fullHtml = `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>รายงานสรุปประวัติการลางาน_${today}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Prompt:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: 'Prompt', system-ui, -apple-system, sans-serif;
      margin: 0;
      padding: 24px;
      background-color: #f1f5f9;
      color: #0f172a;
      font-size: 13px;
    }
    .page-container {
      max-width: 960px;
      margin: 0 auto;
      background: #ffffff;
      padding: 32px;
      border-radius: 12px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.08);
    }
    table {
      width: 100% !important;
      border-collapse: collapse !important;
      margin: 12px 0 !important;
    }
    th, td {
      border: 1px solid #cbd5e1 !important;
      padding: 8px 10px !important;
      text-align: left;
    }
    th {
      background-color: #f8fafc !important;
      font-weight: 700;
      color: #0f172a;
    }
    table.signatures-table,
    table.signatures-table td,
    .signatures-table td {
      border: none !important;
      padding: 0 12px !important;
      text-align: center !important;
      vertical-align: top !important;
    }
    table.signatures-table div {
      height: 45px !important;
      border-bottom: 1px dotted #475569 !important;
      margin: 0 10px 8px 10px !important;
    }
    .text-center { text-align: center !important; }
    .text-right { text-align: right !important; }
    .font-bold { font-weight: 700 !important; }
    .font-mono { font-family: monospace !important; }
    .btn-topbar {
      max-width: 960px;
      margin: 0 auto 16px auto;
      display: flex;
      justify-content: flex-end;
      gap: 10px;
    }
    .btn-action {
      background: #2563eb;
      color: white;
      border: none;
      padding: 10px 20px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 2px 6px rgba(37,99,235,0.3);
    }
    @media print {
      body { background: #ffffff !important; padding: 0 !important; }
      .page-container { box-shadow: none !important; padding: 0 !important; max-width: 100% !important; border-radius: 0 !important; }
      .btn-topbar { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="btn-topbar">
    <button class="btn-action" onclick="window.print()">🖨️ สั่งพิมพ์เอกสารนี้ (AirPrint / Save as PDF)</button>
  </div>
  <div class="page-container">
    ${sheetContent}
  </div>
  <script>
    window.addEventListener("load", function() {
      setTimeout(function() {
        try { window.print(); } catch(e) {}
      }, 500);
    });
  <\/script>
</body>
</html>`;

    const blob = new Blob([fullHtml], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Leave_Report_${empId ? empId + "_" : ""}${selectedYear ? "Year" + selectedYear + "_" : ""}${today}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    Swal.fire({
      icon: "success",
      title: "ดาวน์โหลดเอกสารเรียบร้อย!",
      html: `
        <div class="text-left text-xs bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-1.5 text-slate-700">
          <p class="font-bold text-blue-700">📲 คำแนะนำสำหรับมือถือ (iPhone/Android):</p>
          <p>1. แตะเปิดไฟล์ HTML ที่ดาวน์โหลดใน <b>Safari หรือ Chrome</b></p>
          <p>2. ระบบจะเปิดหน้าสั่งพิมพ์ (AirPrint) ให้อัตโนมัติทันที</p>
          <p>3. คุณสามารถเลือก <b>แชร์ > บันทึกเป็น PDF</b> ใน Safari เพื่อบันทึกเป็นไฟล์ PDF ได้เลยครับ</p>
        </div>
      `,
      confirmButtonText: "ตกลง"
    });
  };

  window.downloadSlipAsHtml = function() {
    const sheet = document.getElementById("printable-slip-content");
    if (!sheet) return;

    const sheetContent = sheet.innerHTML;
    const reqId = document.getElementById("slip-req-id")?.textContent || "Slip";

    const fullHtml = `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ใบคำขอลางาน_${reqId}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Prompt:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: 'Prompt', system-ui, -apple-system, sans-serif;
      margin: 0;
      padding: 24px;
      background-color: #f1f5f9;
      color: #0f172a;
      font-size: 13px;
    }
    .page-container {
      max-width: 820px;
      margin: 0 auto;
      background: #ffffff;
      padding: 32px;
      border-radius: 12px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.08);
    }
    table {
      width: 100% !important;
      border-collapse: collapse !important;
      margin: 12px 0 !important;
    }
    th, td {
      border: 1px solid #cbd5e1 !important;
      padding: 8px 10px !important;
      text-align: left;
    }
    th {
      background-color: #f8fafc !important;
      font-weight: 700;
      color: #0f172a;
    }
    table.signatures-table,
    table.signatures-table td,
    .signatures-table td {
      border: none !important;
      padding: 0 12px !important;
      text-align: center !important;
      vertical-align: top !important;
    }
    table.signatures-table div {
      height: 45px !important;
      border-bottom: 1px dotted #475569 !important;
      margin: 0 10px 8px 10px !important;
    }
    .text-center { text-align: center !important; }
    .text-right { text-align: right !important; }
    .font-bold { font-weight: 700 !important; }
    .font-mono { font-family: monospace !important; }
    .btn-topbar {
      max-width: 820px;
      margin: 0 auto 16px auto;
      display: flex;
      justify-content: flex-end;
      gap: 10px;
    }
    .btn-action {
      background: #2563eb;
      color: white;
      border: none;
      padding: 10px 20px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 2px 6px rgba(37,99,235,0.3);
    }
    @media print {
      body { background: #ffffff !important; padding: 0 !important; }
      .page-container { box-shadow: none !important; padding: 0 !important; max-width: 100% !important; border-radius: 0 !important; }
      .btn-topbar { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="btn-topbar">
    <button class="btn-action" onclick="window.print()">🖨️ สั่งพิมพ์เอกสารนี้ (AirPrint / Save as PDF)</button>
  </div>
  <div class="page-container">
    ${sheetContent}
  </div>
  <script>
    window.addEventListener("load", function() {
      setTimeout(function() {
        try { window.print(); } catch(e) {}
      }, 500);
    });
  <\/script>
</body>
</html>`;

    const blob = new Blob([fullHtml], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Leave_Slip_${reqId}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  function getStatusBadge(status) {
    if (status === "Cancelled") {
      return `<span class="badge-status badge-status-cancelled">ยกเลิกแล้ว</span>`;
    }
    return `<span class="badge-status badge-status-approved"><i data-lucide="check" class="w-3 h-3"></i> บันทึกแล้ว</span>`;
  }

  function openMobileSidebar() {
    const sidebar = document.getElementById("sidebar");
    const backdrop = document.getElementById("sidebar-backdrop");
    if (sidebar) sidebar.classList.remove("-translate-x-full");
    if (backdrop) backdrop.classList.remove("hidden");
    document.body.classList.add("overflow-hidden");
  }

  function closeMobileSidebar() {
    const sidebar = document.getElementById("sidebar");
    const backdrop = document.getElementById("sidebar-backdrop");
    if (sidebar) sidebar.classList.add("-translate-x-full");
    if (backdrop) backdrop.classList.add("hidden");
    document.body.classList.remove("overflow-hidden");
  }

  function switchTab(targetTabId) {
    document.querySelectorAll(".tab-pane").forEach(pane => pane.classList.add("hidden"));
    
    // Desktop Nav Items
    document.querySelectorAll(".nav-item").forEach(item => {
      item.classList.remove("active", "bg-blue-600", "text-white");
      item.classList.add("text-slate-400");
    });

    // Mobile Bottom Nav Items
    document.querySelectorAll(".bottom-nav-item").forEach(item => {
      item.classList.remove("active", "text-blue-600");
      item.classList.add("text-slate-500");
    });

    const activePane = document.getElementById(targetTabId);
    if (activePane) activePane.classList.remove("hidden");

    // Active Desktop Item
    const activeBtn = document.querySelector(`.nav-item[data-tab="${targetTabId}"]`);
    if (activeBtn) {
      activeBtn.classList.add("active", "bg-blue-600", "text-white");
      activeBtn.classList.remove("text-slate-400");
    }

    // Active Mobile Bottom Item
    const activeBottomBtn = document.querySelector(`.bottom-nav-item[data-tab="${targetTabId}"]`);
    if (activeBottomBtn) {
      activeBottomBtn.classList.add("active", "text-blue-600");
      activeBottomBtn.classList.remove("text-slate-500");
    }

    // ปิด Sidebar Drawer บนมือถือ อัตโนมัติเมื่อเลือกเมนู
    closeMobileSidebar();

    // เลื่อนหน้าจอกลับด้านบนสุดเพื่อความสะดวกในการใช้งาน
    window.scrollTo({ top: 0, behavior: "smooth" });

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
      case "tab-leave-history":
        pageTitle.textContent = "ประวัติการลา";
        pageSubtitle.textContent = "ตรวจสอบ แก้ไข หรือลบรายการลาที่บันทึกผิดพลาด";
        renderLeaveHistoryTable();
        updateHistoryViewModeUI();
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
        updateReportViewModeUI();
        break;
      case "tab-settings":
        pageTitle.textContent = "เชื่อมต่อ Google Sheets";
        pageSubtitle.textContent = "ตั้งค่าผูก Web App API เพื่อจัดเก็บข้อมูลบน Google Drive & Sheet";
        break;
    }

    initLucide();
  }

  // เผยแพร่ switchTab สู่ Global Window
  window.switchTab = switchTab;

  function initEventHandlers() {
    // Desktop Nav Items
    document.querySelectorAll(".nav-item").forEach(btn => {
      btn.addEventListener("click", () => {
        const tab = btn.getAttribute("data-tab");
        switchTab(tab);
      });
    });

    // Mobile Bottom Tab Items
    document.querySelectorAll(".bottom-nav-item[data-tab]").forEach(btn => {
      btn.addEventListener("click", () => {
        const tab = btn.getAttribute("data-tab");
        if (tab) switchTab(tab);
      });
    });

    // Mobile Drawer Triggers
    document.getElementById("btn-open-sidebar-mobile")?.addEventListener("click", openMobileSidebar);
    document.getElementById("btn-bottom-more-menu")?.addEventListener("click", openMobileSidebar);
    document.getElementById("btn-close-sidebar")?.addEventListener("click", closeMobileSidebar);
    document.getElementById("sidebar-backdrop")?.addEventListener("click", closeMobileSidebar);

    const mobileMenuBtn = document.getElementById("mobile-menu-btn");
    if (mobileMenuBtn) {
      mobileMenuBtn.addEventListener("click", openMobileSidebar);
    }

    document.getElementById("btn-quick-new-leave")?.addEventListener("click", () => {
      switchTab("tab-leave-request");
    });

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

    document.querySelector(".btn-goto-reports")?.addEventListener("click", () => {
      switchTab("tab-leave-history");
    });

    document.getElementById("leave-form-emp-select")?.addEventListener("change", (e) => {
      updateEmployeeLiveQuota(e.target.value);
    });

    document.getElementById("leave-form-duration-type")?.addEventListener("change", () => {
      calculateFormDays();
    });

    document.getElementById("leave-form-type")?.addEventListener("change", () => {
      calculateFormDays();
    });

    document.getElementById("leave-form-hours-select")?.addEventListener("change", () => {
      calculateFormDays();
    });
    document.getElementById("leave-form-time-start")?.addEventListener("change", () => {
      calculateFormDays();
    });
    document.getElementById("leave-form-time-end")?.addEventListener("change", () => {
      calculateFormDays();
    });

    // Dropzone & File Input Events
    const dropzone = document.getElementById("dropzone-area");
    const fileInput = document.getElementById("file-input-multiple");

    if (dropzone && fileInput) {
      dropzone.addEventListener("click", () => fileInput.click());
      fileInput.addEventListener("change", (e) => {
        handleFilesUpload(e.target.files);
        e.target.value = "";
      });

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

      const durationType = document.getElementById("leave-form-duration-type").value;
      let reasonText = document.getElementById("leave-form-reason").value.trim();
      let hours = 0;
      let timeRange = "";

      if (durationType === "hourly") {
        hours = Number(document.getElementById("leave-form-hours-select")?.value || 2);
        const tStart = document.getElementById("leave-form-time-start")?.value || "";
        const tEnd = document.getElementById("leave-form-time-end")?.value || "";
        timeRange = `${tStart} - ${tEnd}`;
        reasonText = `[ลา ${hours} ชม. เวลา ${timeRange}] ${reasonText}`;
      }

      const payload = {
        emp_id: state.currentEmployee.emp_id,
        emp_name: state.currentEmployee.name,
        department: state.currentEmployee.department,
        leave_type: document.getElementById("leave-form-type").value,
        leave_duration_type: durationType,
        leave_hours: hours,
        leave_time_range: timeRange,
        start_date: document.getElementById("leave-form-start-date").value,
        end_date: document.getElementById("leave-form-end-date").value,
        total_days: totalDays,
        reason: reasonText,
        attachments: state.tempAttachments
      };

      const btn = document.getElementById("btn-submit-leave-form");
      btn.disabled = true;
      btn.innerHTML = `<i data-lucide="loader" class="w-4 h-4 animate-spin"></i> กำลังบันทึกข้อมูล...`;

      try {
        const res = await window.leaveAPI.submitLeaveRequest(payload);
        
        // บันทึกลง in-memory state ทันที ไม่ต้องรอเครือข่าย เพื่อให้แสดงผลในประวัติและรายงานทันที 100%
        const newRecord = res.record || {
          ...payload,
          request_id: res.request_id,
          status: "Approved",
          approved_by: "ระบบบันทึกอัตโนมัติ",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        const existsIdx = state.leaveRequests.findIndex(r => r.request_id === newRecord.request_id);
        if (existsIdx !== -1) {
          state.leaveRequests[existsIdx] = newRecord;
        } else {
          state.leaveRequests.unshift(newRecord);
        }

        // ล้างตัวกรองค้นหาในหน้าประวัติ เพื่อให้รายการใหม่ที่เพิ่งบันทึกแสดงขึ้นมาทันทีแน่นอน
        const histSearch = document.getElementById("filter-history-search");
        const histDept = document.getElementById("filter-history-dept");
        const histType = document.getElementById("filter-history-type");
        if (histSearch) histSearch.value = "";
        if (histDept) histDept.value = "";
        if (histType) histType.value = "";

        // ล้างแบบฟอร์ม
        document.getElementById("form-leave-request").reset();
        state.tempAttachments = [];
        renderAttachmentsPreview();
        updateEmployeeLiveQuota(null);

        // อัปเดตทุกหน้าจอทันที
        updateDashboardKPIs();
        renderDashboardCharts();
        renderDashboardRecentTable();
        renderLeaveHistoryTable();
        renderReports();
        renderEmployeeCards();

        // สลับไปยังหน้าประวัติการลา
        switchTab("tab-leave-history");

        if (res.cloudSynced) {
          await Swal.fire({
            icon: "success",
            title: "ยื่นใบลาสำเร็จ!",
            html: `
              <div class="text-left text-xs bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-1.5">
                <p><b>รหัสคำขอ:</b> <span class="font-mono text-blue-600 font-bold">${res.request_id || ""}</span></p>
                <p><b>พนักงาน:</b> ${escapeHtml(payload.emp_name)}</p>
                <p><b>จำนวนวันลา:</b> <span class="text-blue-700 font-bold">${payload.total_days} วันทำการ</span></p>
                <p><b>สถานะ:</b> <span class="text-emerald-600 font-bold">บันทึกสำเร็จ (ซิงค์ Google Sheets แล้ว)</span></p>
              </div>
              <p class="text-xs text-emerald-600 font-semibold mt-2.5 flex items-center justify-center gap-1">
                <span>☁️ ข้อมูลซิงค์ขึ้น Google Sheets และแสดงผลในคอมพิวเตอร์เรียบร้อยแล้ว</span>
              </p>
            `,
            confirmButtonText: "ตกลง"
          });
        } else {
          // แจ้งเตือนชัดเจนว่าบันทึกเฉพาะในมือถือเครื่องนี้ ยังไม่ได้ส่งไป Google Sheets (คอมพิวเตอร์)
          const alertRes = await Swal.fire({
            icon: "warning",
            title: "บันทึกในเครื่องแล้ว (ยังไม่ซิงค์ไปคอม)",
            html: `
              <div class="text-left text-xs bg-amber-50 p-3.5 rounded-xl border border-amber-200 space-y-1.5 text-amber-900">
                <p><b>รหัสคำขอ:</b> <span class="font-mono font-bold">${res.request_id || ""}</span></p>
                <p><b>พนักงาน:</b> ${escapeHtml(payload.emp_name)}</p>
                <p><b>จำนวนวันลา:</b> <b class="text-blue-700">${payload.total_days} วันทำการ</b></p>
                <div class="mt-2.5 pt-2 border-t border-amber-200 text-[11px] leading-relaxed">
                  ⚠️ <b>สาเหตุที่ในคอมยังไม่ขึ้น:</b><br>
                  เครื่องนี้กำลังทำงานใน <b>โหมดออฟไลน์ / จำลอง</b> (ยังไม่ได้ตั้งค่า Google Sheets บนมือถือนี้) ข้อมูลจึงถูกบันทึกไว้ในมือถือเท่านั้น<br><br>
                  👉 <b>วิธีแก้:</b> ไปที่เมนู <b>"เชื่อมต่อ Google Sheets"</b> เพื่อใส่ URL เดียวกับในคอมพิวเตอร์ แล้วข้อมูลจะซิงค์ให้อัตโนมัติทันที
                </div>
              </div>
            `,
            showCancelButton: true,
            confirmButtonColor: "#2563eb",
            cancelButtonColor: "#64748b",
            confirmButtonText: "ไปที่หน้าเชื่อมต่อ Google Sheets",
            cancelButtonText: "รับทราบ / ไว้ทีหลัง"
          });

          if (alertRes.isConfirmed) {
            switchTab("tab-settings");
          }
        }

        // ดึงข้อมูลซิงค์เพิ่มเติมในพื้นหลัง (Background Sync)
        loadData().catch(e => console.warn("Background loadData error:", e));
      } catch (err) {
        Swal.fire({ icon: "error", title: "เกิดข้อผิดพลาดในการส่งคำขอ", text: err.message });
      } finally {
        btn.disabled = false;
        btn.innerHTML = `<i data-lucide="send" class="w-4 h-4"></i> <span>บันทึกยื่นใบลา</span>`;
        initLucide();
      }
    });

    // Edit Modal File Upload Triggers (ปุ่มเพิ่มรูป/ถ่ายรูปใหม่ในหน้าแก้ไข)
    const btnEditAddAtt = document.getElementById("btn-edit-add-attachment");
    const editFileInput = document.getElementById("edit-file-input-multiple");
    if (btnEditAddAtt && editFileInput) {
      btnEditAddAtt.addEventListener("click", () => editFileInput.click());
      editFileInput.addEventListener("change", (e) => {
        if (e.target.files && e.target.files.length > 0) {
          handleEditFilesUpload(e.target.files);
          e.target.value = "";
        }
      });
    }

    // Form Edit Leave Submit
    document.getElementById("form-edit-leave")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const requestId = document.getElementById("edit-leave-id").value;
      const durationType = document.getElementById("edit-leave-duration-type").value;
      let hours = 0;
      let timeRange = "";
      let totalDays = 1;

      const startDate = document.getElementById("edit-leave-start-date").value;
      const endDate = document.getElementById("edit-leave-end-date").value;

      if (durationType === "hourly") {
        hours = Number(document.getElementById("edit-leave-hours").value || 2);
        timeRange = document.getElementById("edit-leave-time-range").value.trim();
        totalDays = Math.round((hours / 8) * 100) / 100;
      } else {
        const empId = document.getElementById("edit-leave-emp-id")?.value;
        const emp = state.employees.find(e => String(e.emp_id).trim() === String(empId).trim());
        totalDays = window.leaveAPI.calculateWorkingDays(startDate, endDate, durationType, state.holidays, hours, emp);
      }

      const payload = {
        request_id: requestId,
        leave_type: document.getElementById("edit-leave-type").value,
        leave_duration_type: durationType,
        leave_hours: hours,
        leave_time_range: timeRange,
        start_date: startDate,
        end_date: endDate,
        total_days: totalDays,
        reason: document.getElementById("edit-leave-reason").value.trim(),
        attachments: state.editAttachments || []
      };

      const submitBtn = e.target.querySelector('button[type="submit"]');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = `<i data-lucide="loader" class="w-4 h-4 animate-spin"></i> กำลังบันทึก...`;
      }

      try {
        const res = await window.leaveAPI.updateLeaveRequest(payload);
        
        // อัปเดตใน state ทันที
        const reqIdx = state.leaveRequests.findIndex(r => String(r.request_id).trim() === String(requestId).trim());
        if (reqIdx !== -1) {
          state.leaveRequests[reqIdx] = {
            ...state.leaveRequests[reqIdx],
            ...payload,
            attachments: res.attachments || payload.attachments,
            updated_at: new Date().toISOString()
          };
        }

        Swal.fire({
          icon: "success",
          title: "บันทึกการแก้ไขเรียบร้อยแล้ว",
          text: "ข้อมูลวันลาและรูปภาพหลักฐานได้รับการปรับปรุงเรียบร้อยแล้ว",
          timer: 1800,
          showConfirmButton: false
        });
        document.getElementById("modal-edit-leave").classList.add("hidden");

        updateDashboardKPIs();
        renderDashboardCharts();
        renderDashboardRecentTable();
        renderLeaveHistoryTable();
        renderReports();
        renderEmployeeCards();

        await loadData();
      } catch (err) {
        Swal.fire({ icon: "error", title: "เกิดข้อผิดพลาดในการบันทึก", text: err.message });
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = `บันทึกการแก้ไข`;
        }
        initLucide();
      }
    });

    document.getElementById("edit-leave-duration-type")?.addEventListener("change", (e) => {
      const box = document.getElementById("edit-hourly-box");
      if (e.target.value === "hourly") {
        box.classList.remove("hidden");
        document.getElementById("edit-leave-end-date").value = document.getElementById("edit-leave-start-date").value;
      } else {
        box.classList.add("hidden");
      }
    });

    // History Filters
    document.getElementById("filter-history-search")?.addEventListener("input", () => renderLeaveHistoryTable());
    document.getElementById("filter-history-dept")?.addEventListener("change", () => renderLeaveHistoryTable());
    document.getElementById("filter-history-type")?.addEventListener("change", () => renderLeaveHistoryTable());

    // Toggle View Mode (สลับระหว่าง ตาราง vs การ์ด)
    document.getElementById("btn-history-view-table")?.addEventListener("click", () => window.setHistoryViewMode("table"));
    document.getElementById("btn-history-view-cards")?.addEventListener("click", () => window.setHistoryViewMode("cards"));
    document.getElementById("btn-report-view-table")?.addEventListener("click", () => window.setReportViewMode("table"));
    document.getElementById("btn-report-view-cards")?.addEventListener("click", () => window.setReportViewMode("cards"));

    // Departments Modal Events
    document.getElementById("btn-open-departments-modal")?.addEventListener("click", () => {
      renderDepartmentsList();
      document.getElementById("modal-departments")?.classList.remove("hidden");
      initLucide();
    });

    document.getElementById("btn-sidebar-departments")?.addEventListener("click", () => {
      closeMobileSidebar();
      renderDepartmentsList();
      document.getElementById("modal-departments")?.classList.remove("hidden");
      initLucide();
    });

    document.getElementById("btn-add-department")?.addEventListener("click", () => {
      window.addDepartment();
    });

    document.getElementById("input-new-department")?.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        window.addDepartment();
      }
    });

    // Clean Duplicate Holidays
    document.getElementById("btn-clean-duplicate-holidays")?.addEventListener("click", async () => {
      const confirm = await Swal.fire({
        title: "ลบวันหยุดที่ซ้ำซ้อนกัน?",
        text: "ระบบจะตรวจสอบและลบแถวที่ชื่อและวันที่ตรงกันออก ให้เหลือเพียง 1 รายการ",
        icon: "question",
        showCancelButton: true,
        confirmButtonText: "ลบรายการซ้ำ",
        cancelButtonText: "ยกเลิก"
      });

      if (confirm.isConfirmed) {
        try {
          const res = await window.leaveAPI.cleanDuplicateHolidays();
          Swal.fire({ icon: "success", title: "สำเร็จ", text: res.message, timer: 1500, showConfirmButton: false });
          await loadData();
        } catch (err) {
          Swal.fire({ icon: "error", title: "เกิดข้อผิดพลาด", text: err.message });
        }
      }
    });

    // Clear All Holidays (ลบข้อมูลวันหยุดนักขัตฤกษ์ทั้งหมดในหน้านี้)
    document.getElementById("btn-clear-all-holidays")?.addEventListener("click", async () => {
      if (!state.holidays || state.holidays.length === 0) {
        Swal.fire({ icon: "info", title: "ไม่มีข้อมูลวันหยุดในระบบ", text: "ยังไม่มีรายการวันหยุดให้ลบครับ" });
        return;
      }

      const confirm = await Swal.fire({
        title: "ยืนยันการลบวันหยุดทั้งหมด?",
        html: `ต้องการลบข้อมูลวันหยุดนักขัตฤกษ์ทั้งหมดจำนวน <b>${state.holidays.length} รายการ</b> ออกจากระบบหรือไม่?<br><span class="text-xs text-slate-500">(คุณสามารถกด "โหลดวันหยุดไทยมาตรฐาน" เพื่อนำกลับมาได้ตลอดเวลา)</span>`,
        icon: "warning",
        showCancelButton: true,
        confirmButtonColor: "#e11d48",
        cancelButtonColor: "#64748b",
        confirmButtonText: "ใช่, ลบทั้งหมด",
        cancelButtonText: "ยกเลิก"
      });

      if (confirm.isConfirmed) {
        Swal.fire({
          title: "กำลังลบข้อมูลวันหยุด...",
          allowOutsideClick: false,
          didOpen: () => Swal.showLoading()
        });

        try {
          state.holidays = [];
          renderHolidaysTable();
          await window.leaveAPI.clearAllHolidays();
          Swal.fire({ icon: "success", title: "ลบวันหยุดทั้งหมดเรียบร้อยแล้ว", timer: 1500, showConfirmButton: false });
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
      // ตั้งค่าเวรหยุดเริ่มต้นเป็น เสาร์ - อาทิตย์
      window.setRestDaysPreset([0, 6]);
      document.getElementById("modal-employee").classList.remove("hidden");
      initLucide();
    });

    // Save Employee Form
    document.getElementById("form-employee")?.addEventListener("submit", async (e) => {
      e.preventDefault();

      // ดึงเวรหยุดประจำสัปดาห์ที่ผู้ใช้เลือก (0=อาทิตย์, ..., 6=เสาร์)
      const restDays = Array.from(currentModalRestDays);

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
        other_leave_quota: Number(document.getElementById("emp-modal-quota-other").value || 0),
        rest_days: restDays
      };

      try {
        // อัปเดต in-memory state ทันที
        const empIdx = state.employees.findIndex(emp => String(emp.emp_id).trim() === payload.emp_id);
        if (empIdx !== -1) {
          state.employees[empIdx] = { ...state.employees[empIdx], ...payload };
        } else {
          state.employees.push(payload);
        }

        if (state.currentEmployee && String(state.currentEmployee.emp_id).trim() === payload.emp_id) {
          state.currentEmployee = { ...state.currentEmployee, ...payload };
          updateEmployeeLiveQuota(payload.emp_id);
        }

        await window.leaveAPI.saveEmployee(payload);
        Swal.fire({ icon: "success", title: "บันทึกข้อมูลพนักงานเรียบร้อย", timer: 1500, showConfirmButton: false });
        document.getElementById("modal-employee").classList.add("hidden");
        await loadData();

        // รีเฟรชข้อมูลในฟอร์มยื่นคำขอลาทันทีหากเลือกพนักงานคนนี้อยู่
        const currentLeaveEmpSelect = document.getElementById("leave-form-emp-select");
        if (currentLeaveEmpSelect && currentLeaveEmpSelect.value === payload.emp_id) {
          updateEmployeeLiveQuota(payload.emp_id);
        }
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
      const rawDate = document.getElementById("holiday-modal-date").value;
      const cleanDate = LeaveAPI.formatDateISO(rawDate);
      const payload = {
        holiday_date: cleanDate,
        name: document.getElementById("holiday-modal-name").value.trim(),
        year: Number(cleanDate.slice(0, 4))
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
    document.getElementById("report-filter-year")?.addEventListener("change", () => renderReports());
    document.getElementById("report-filter-emp")?.addEventListener("change", () => renderReports());
    document.getElementById("report-filter-type")?.addEventListener("change", () => renderReports());
    document.getElementById("btn-export-excel")?.addEventListener("click", () => exportToExcel());
    document.getElementById("btn-print-report")?.addEventListener("click", () => openPrintableReportModal());
    document.getElementById("btn-modal-print-report-now")?.addEventListener("click", () => window.triggerPrintReport());
    document.getElementById("btn-modal-download-report-html")?.addEventListener("click", () => window.downloadReportAsHtml());

    // Settings: Save GAS URL
    document.getElementById("btn-save-gas-url")?.addEventListener("click", async () => {
      const url = document.getElementById("setting-gas-url").value.trim();
      window.leaveAPI.setGasUrl(url);
      updateConnectionIndicator();
      Swal.fire({ icon: "success", title: "บันทึกการตั้งค่าแล้ว", timer: 1500, showConfirmButton: false });
      loadData();
    });

    // Mobile Sync: Copy Mobile Link
    document.getElementById("btn-copy-mobile-sync-link")?.addEventListener("click", async () => {
      const gasUrl = window.leaveAPI.getGasUrl();
      if (!gasUrl) {
        Swal.fire({
          icon: "info",
          title: "ยังไม่ได้ระบุ Web App URL",
          text: "กรุณาระบุและบันทึก Google Apps Script Web App URL ในช่องด้านบนก่อน เพื่อสร้างลิงก์สำหรับมือถือ"
        });
        return;
      }
      const syncUrl = window.location.origin + window.location.pathname + "?gasUrl=" + encodeURIComponent(gasUrl);
      
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(syncUrl);
        } else {
          const tempInput = document.createElement("textarea");
          tempInput.value = syncUrl;
          document.body.appendChild(tempInput);
          tempInput.select();
          document.execCommand("copy");
          document.body.removeChild(tempInput);
        }

        Swal.fire({
          icon: "success",
          title: "คัดลอกลิงก์สำเร็จ!",
          html: `
            <div class="text-left text-xs bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1.5 text-slate-700">
              <p class="font-bold text-blue-700">📲 วิธีใช้งาน:</p>
              <p>1. ส่งลิงก์นี้เข้าไปในแชท LINE หรือแอปส่งข้อความ</p>
              <p>2. เปิดลิงก์นี้บน iPhone หรือมือถือของคุณ</p>
              <p>3. มือถือจะเชื่อมต่อกับ Google Sheet เดียวกันทันที ไม่ต้องพิมพ์ URL เอง!</p>
            </div>
          `,
          confirmButtonText: "ตกลง"
        });
      } catch (e) {
        Swal.fire({ icon: "error", title: "ไม่สามารถคัดลอกได้", text: "กรุณาคัดลอกจากกล่องข้อความโดยตรงครับ" });
      }
    });

    // Mobile Sync: Show QR Code
    document.getElementById("btn-show-mobile-qr")?.addEventListener("click", () => {
      const gasUrl = window.leaveAPI.getGasUrl();
      if (!gasUrl) {
        Swal.fire({
          icon: "info",
          title: "ยังไม่ได้ระบุ Web App URL",
          text: "กรุณาระบุและบันทึก Google Apps Script Web App URL ในช่องด้านบนก่อน เพื่อสร้าง QR Code"
        });
        return;
      }
      const syncUrl = window.location.origin + window.location.pathname + "?gasUrl=" + encodeURIComponent(gasUrl);
      const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&margin=10&data=${encodeURIComponent(syncUrl)}`;

      Swal.fire({
        title: "สแกนด้วยกล้องมือถือ (iPhone/Android)",
        html: `
          <div class="flex flex-col items-center justify-center p-2 space-y-3">
            <img src="${qrImageUrl}" alt="Mobile Sync QR Code" class="w-56 h-56 rounded-xl border border-slate-200 shadow-md p-1 bg-white" />
            <p class="text-xs text-slate-600 leading-relaxed max-w-sm text-center">
              ใช้กล้อง iPhone หรือแอป LINE สแกน QR Code นี้<br>
              เพื่อเปิดระบบลางานที่ <b>เชื่อมต่อ Google Sheets</b> เรียบร้อยแล้วทันที!
            </p>
          </div>
        `,
        confirmButtonText: "ปิดหน้าต่าง",
        confirmButtonColor: "#2563eb"
      });
    });

    // Sync Pending Requests Now
    document.getElementById("btn-sync-pending-now")?.addEventListener("click", async () => {
      if (!window.leaveAPI.isLive()) {
        Swal.fire({
          icon: "warning",
          title: "ยังไม่ได้เชื่อมต่อ Google Sheets",
          text: "กรุณาระบุ URL ด้านบนและกดบันทึกก่อนทำการซิงค์ครับ"
        });
        return;
      }

      const btn = document.getElementById("btn-sync-pending-now");
      btn.disabled = true;
      btn.innerHTML = `<i data-lucide="loader" class="w-4 h-4 animate-spin"></i> กำลังซิงค์...`;

      try {
        const res = await window.leaveAPI.autoSyncPendingRequests();
        await loadData();
        Swal.fire({
          icon: "success",
          title: "ซิงค์ข้อมูลเรียบร้อยแล้ว",
          text: res.syncedCount > 0 ? `นำส่งรายการลาที่ค้างส่ง ${res.syncedCount} รายการขึ้น Google Sheet แล้ว` : "ไม่มีรายการลาค้างส่งในอุปกรณ์นี้"
        });
      } catch (err) {
        Swal.fire({ icon: "error", title: "การซิงค์ล้มเหลว", text: err.message });
      } finally {
        btn.disabled = false;
        btn.innerHTML = `<i data-lucide="refresh-cw" class="w-4 h-4"></i> <span>ซิงค์รายการค้างส่งขึ้นชีตทันที</span>`;
        initLucide();
      }
    });

    // Mobile connection indicator click
    document.getElementById("mobile-db-indicator")?.addEventListener("click", () => {
      switchTab("tab-settings");
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
        document.querySelectorAll("#modal-leave-detail, #modal-employee, #modal-holiday, #modal-printable-slip, #modal-printable-report, #modal-departments, #modal-edit-leave").forEach(m => m.classList.add("hidden"));
      });
    });

    // Tap backdrop to close modals (Mobile & Desktop convenience)
    document.querySelectorAll("#modal-leave-detail, #modal-employee, #modal-holiday, #modal-printable-slip, #modal-printable-report, #modal-departments, #modal-edit-leave").forEach(modal => {
      modal.addEventListener("click", (e) => {
        if (e.target === modal) {
          modal.classList.add("hidden");
        }
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
