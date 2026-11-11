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
   * 1. Dashboard: KPIs
   */
  function updateDashboardKPIs() {
    const todayStr = LeaveAPI.formatDateISO(new Date());
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();

    // กำลังลาในวันนี้ (Approved และวันที่ตรงกับวันนี้)
    const todayLeaves = state.leaveRequests.filter(r => {
      if (r.status !== "Approved") return false;
      const s = LeaveAPI.formatDateISO(r.start_date);
      const e = LeaveAPI.formatDateISO(r.end_date);
      return s <= todayStr && todayStr <= e;
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

    if (!startDate || !endDate) {
      totalDaysSpan.textContent = "0";
      banner.textContent = "กรุณาเลือกวันที่เริ่มและสิ้นสุดการลา";
      return 0;
    }

    const workingDays = window.leaveAPI.calculateWorkingDays(startDate, endDate, durationType, state.holidays, hours);
    totalDaysSpan.textContent = workingDays;

    if (workingDays === 0) {
      banner.innerHTML = `<span class="text-rose-600 font-semibold">ช่วงวันที่เลือกตรงกับวันหยุดทั้งหมด (วันเสาร์-อาทิตย์ หรือวันหยุดนักขัตฤกษ์)</span>`;
    } else {
      if (durationType === "hourly") {
        const timeStart = document.getElementById("leave-form-time-start")?.value || "09:00";
        const timeEnd = document.getElementById("leave-form-time-end")?.value || "11:00";
        banner.innerHTML = `<span class="font-bold text-indigo-900">ลา ${hours} ชั่วโมง</span> (เวลา ${timeStart} - ${timeEnd} น. เทียบเท่า ${workingDays} วันทำการ)`;
      } else {
        banner.textContent = `คำนวณวันทำงานสุทธิ (ตัดวันเสาร์-อาทิตย์ และวันหยุดนักขัตฤกษ์ออกแล้ว)`;
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
   * แนบเอกสารหลักฐาน (Multi-attachments)
   */
  async function handleFilesUpload(files) {
    if (!files || files.length === 0) return;

    for (let file of Array.from(files)) {
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
   * 2. แท็บประวัติการลา (Leave History - แก้ไขและลบได้)
   */
  function renderLeaveHistoryTable() {
    const tbody = document.getElementById("history-table-body");
    const countSpan = document.getElementById("history-total-count");
    if (!tbody) return;

    const searchTerm = (document.getElementById("filter-history-search")?.value || "").toLowerCase().trim();
    const deptFilter = document.getElementById("filter-history-dept")?.value || "";
    const typeFilter = document.getElementById("filter-history-type")?.value || "";

    let filtered = [...state.leaveRequests];

    if (deptFilter) filtered = filtered.filter(r => r.department === deptFilter);
    if (typeFilter) filtered = filtered.filter(r => r.leave_type === typeFilter);
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

    if (countSpan) {
      countSpan.textContent = `แสดงทั้งหมด ${filtered.length} รายการ`;
    }

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" class="text-center py-10 text-slate-400">ไม่พบประวัติการลา</td></tr>`;
      return;
    }

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
            <span class="font-mono font-bold text-slate-800 block">${req.request_id}</span>
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
              <button onclick="window.openEditLeaveModal('${req.request_id}')" class="p-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors" title="แก้ไขการลา">
                <i data-lucide="edit-3" class="w-4 h-4"></i>
              </button>
              <button onclick="window.confirmDeleteLeave('${req.request_id}')" class="p-1.5 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-lg transition-colors" title="ลบรายการลา">
                <i data-lucide="trash-2" class="w-4 h-4"></i>
              </button>
              <button onclick="window.viewLeaveDetail('${req.request_id}')" class="p-1.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg transition-colors" title="ดูรายละเอียด / พิมพ์ใบลา">
                <i data-lucide="printer" class="w-4 h-4"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join("");

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

    document.getElementById("modal-edit-leave").classList.remove("hidden");
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

    const statusBox = document.getElementById("detail-modal-status-box");
    const statusSpan = document.getElementById("detail-modal-status");
    const approverSpan = document.getElementById("detail-modal-approver");
    const approverLabel = document.getElementById("detail-modal-approver-label");

    statusSpan.innerHTML = getStatusBadge(req.status);
    approverLabel.textContent = "สถานะ:";
    approverSpan.textContent = req.status;
    statusBox.className = "p-3 rounded-xl border border-emerald-200 bg-emerald-50 flex items-center justify-between";

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

    if (state.holidays.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" class="text-center py-8 text-slate-400">ยังไม่มีข้อมูลวันหยุดนักขัตฤกษ์ในระบบ กรุณากดปุ่ม "โหลดวันหยุดไทย" หรือ "เพิ่มวันหยุดเอง"</td></tr>`;
      return;
    }

    const sorted = [...state.holidays].sort((a, b) => {
      const dateA = LeaveAPI.formatDateISO(a.holiday_date);
      const dateB = LeaveAPI.formatDateISO(b.holiday_date);
      return dateA.localeCompare(dateB);
    });

    tbody.innerHTML = sorted.map(h => {
      const cleanISO = LeaveAPI.formatDateISO(h.holiday_date);
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

      return `
        <tr class="hover:bg-slate-50 transition-colors">
          <td class="py-3 px-4">
            <span class="font-mono font-bold text-slate-800 text-sm">${dmy}</span>
            <span class="text-slate-400 text-xs block">${thaiLabel}</span>
          </td>
          <td class="py-3 px-4 font-semibold text-slate-800">${safeName}</td>
          <td class="py-3 px-4 text-center font-mono text-slate-500">${h.year || cleanISO.slice(0, 4)}</td>
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

    if (startDate) filtered = filtered.filter(r => LeaveAPI.formatDateISO(r.start_date) >= startDate);
    if (endDate) filtered = filtered.filter(r => LeaveAPI.formatDateISO(r.end_date) <= endDate);
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
      tbody.innerHTML = `<tr><td colspan="10" class="text-center py-8 text-slate-400">ไม่พบประวัติการลาตามเงื่อนไขที่เลือก</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map((req, index) => {
      const typeInfo = CONFIG.LEAVE_TYPES[req.leave_type] || CONFIG.LEAVE_TYPES.other;
      const startDMY = LeaveAPI.formatDateDMY(req.start_date);
      const endDMY = LeaveAPI.formatDateDMY(req.end_date);

      return `
        <tr>
          <td class="py-2.5 px-3 text-center">${index + 1}</td>
          <td class="py-2.5 px-3 font-mono">${req.emp_id}</td>
          <td class="py-2.5 px-3 font-semibold">${escapeHtml(req.emp_name)}</td>
          <td class="py-2.5 px-3">${escapeHtml(req.department)}</td>
          <td class="py-2.5 px-3">${typeInfo.name.split(" ")[0]}</td>
          <td class="py-2.5 px-3 font-mono text-[11px]">${startDMY} ถึง ${endDMY}</td>
          <td class="py-2.5 px-3 text-center font-bold">${req.total_days}</td>
          <td class="py-2.5 px-3 text-slate-600 max-w-xs truncate">${escapeHtml(req.reason)}</td>
          <td class="py-2.5 px-3 text-center font-semibold ${req.status === 'Approved' ? 'text-emerald-700' : (req.status === 'Rejected' ? 'text-rose-700' : 'text-amber-700')}">${req.status}</td>
          <td class="py-2.5 px-3 text-right no-print">
            <div class="flex items-center justify-end gap-1.5">
              <button onclick="window.viewLeaveDetail('${req.request_id}')" class="p-1 text-blue-600 hover:text-blue-800 font-semibold text-xs inline-flex items-center gap-1 bg-blue-50 hover:bg-blue-100 rounded px-2 py-1 transition-colors" title="ดูใบลาและสั่งพิมพ์">
                <i data-lucide="eye" class="w-3.5 h-3.5"></i> ดูใบลา
              </button>
              <button onclick="window.confirmDeleteLeave('${req.request_id}')" class="p-1 text-rose-600 hover:text-rose-800 font-semibold text-xs inline-flex items-center gap-1 bg-rose-50 hover:bg-rose-100 rounded px-2 py-1 transition-colors" title="ลบรายการลาและคืนวันลา">
                <i data-lucide="trash-2" class="w-3.5 h-3.5"></i> ลบออก
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join("");

    initLucide();
  }

  function exportToExcel() {
    const table = document.querySelector("#printable-report-section table");
    if (!table) return;

    const empId = document.getElementById("report-filter-emp")?.value || "";
    const selectedEmp = empId ? state.employees.find(e => String(e.emp_id).trim() === String(empId).trim()) : null;

    const wb = XLSX.utils.table_to_book(table, { sheet: "Leave_Report" });
    const today = new Date().toISOString().slice(0, 10);
    const suffix = selectedEmp ? `_${selectedEmp.emp_id}_${selectedEmp.name.replace(/\s+/g, "_")}` : "";
    XLSX.writeFile(wb, `Leave_History_Report${suffix}_${today}.xlsx`);
  }

  function openPrintableLeaveSlip(req) {
    if (!req) return;

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

  function switchTab(targetTabId) {
    document.querySelectorAll(".tab-pane").forEach(pane => pane.classList.add("hidden"));
    document.querySelectorAll(".nav-item").forEach(item => {
      item.classList.remove("active", "bg-blue-600", "text-white");
      item.classList.add("text-slate-400");
    });

    const activePane = document.getElementById(targetTabId);
    if (activePane) activePane.classList.remove("hidden");

    const activeBtn = document.querySelector(`.nav-item[data-tab="${targetTabId}"]`);
    if (activeBtn) {
      activeBtn.classList.add("active", "bg-blue-600", "text-white");
      activeBtn.classList.remove("text-slate-400");
    }

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

  function initEventHandlers() {
    document.querySelectorAll(".nav-item").forEach(btn => {
      btn.addEventListener("click", () => {
        const tab = btn.getAttribute("data-tab");
        switchTab(tab);
      });
    });

    const mobileMenuBtn = document.getElementById("mobile-menu-btn");
    const sidebarNav = document.getElementById("sidebar-nav");
    if (mobileMenuBtn && sidebarNav) {
      mobileMenuBtn.addEventListener("click", () => {
        sidebarNav.classList.toggle("hidden");
      });
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
        Swal.fire({
          icon: "success",
          title: "ยื่นใบลาสำเร็จ!",
          text: `รหัสคำขอ: ${res.request_id || ""}`,
          confirmButtonText: "ตกลง"
        });

        document.getElementById("form-leave-request").reset();
        state.tempAttachments = [];
        renderAttachmentsPreview();
        updateEmployeeLiveQuota(null);
        await loadData();
        switchTab("tab-leave-history");
      } catch (err) {
        Swal.fire({ icon: "error", title: "เกิดข้อผิดพลาดในการส่งคำขอ", text: err.message });
      } finally {
        btn.disabled = false;
        btn.innerHTML = `<i data-lucide="send" class="w-4 h-4"></i> <span>บันทึกยื่นใบลา</span>`;
        initLucide();
      }
    });

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
        totalDays = window.leaveAPI.calculateWorkingDays(startDate, endDate, durationType, state.holidays);
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
        reason: document.getElementById("edit-leave-reason").value.trim()
      };

      try {
        await window.leaveAPI.updateLeaveRequest(payload);
        Swal.fire({ icon: "success", title: "แก้ไขข้อมูลการลาเรียบร้อยแล้ว", timer: 1500, showConfirmButton: false });
        document.getElementById("modal-edit-leave").classList.add("hidden");
        await loadData();
      } catch (err) {
        Swal.fire({ icon: "error", title: "เกิดข้อผิดพลาด", text: err.message });
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

    // Departments Modal Events
    document.getElementById("btn-open-departments-modal")?.addEventListener("click", () => {
      renderDepartmentsList();
      document.getElementById("modal-departments")?.classList.remove("hidden");
      initLucide();
    });

    document.getElementById("btn-sidebar-departments")?.addEventListener("click", () => {
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
        document.querySelectorAll("#modal-leave-detail, #modal-employee, #modal-holiday, #modal-printable-slip, #modal-departments, #modal-edit-leave").forEach(m => m.classList.add("hidden"));
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
