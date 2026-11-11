/**
 * Leave Management System - API Client & Data Manager
 * จัดการเชื่อมต่อ Google Apps Script API และสำรองข้อมูลลง LocalStorage
 */

class LeaveAPI {
  constructor() {
    this.gasUrl = localStorage.getItem(CONFIG.STORAGE_KEYS.GAS_URL) || "";
    this.mode = localStorage.getItem(CONFIG.STORAGE_KEYS.APP_MODE) || (this.gasUrl ? "live" : "demo");
    this.initLocalStorage();
  }

  /**
   * เริ่มต้นโครงสร้าง LocalStorage ด้วย Initial Data หากยังไม่มี
   */
  initLocalStorage() {
    if (!localStorage.getItem(CONFIG.STORAGE_KEYS.EMPLOYEES)) {
      localStorage.setItem(CONFIG.STORAGE_KEYS.EMPLOYEES, JSON.stringify(CONFIG.INITIAL_DATA.employees));
    }
    if (!localStorage.getItem(CONFIG.STORAGE_KEYS.LEAVE_REQUESTS)) {
      localStorage.setItem(CONFIG.STORAGE_KEYS.LEAVE_REQUESTS, JSON.stringify(CONFIG.INITIAL_DATA.leaveRequests));
    }
    if (!localStorage.getItem(CONFIG.STORAGE_KEYS.HOLIDAYS)) {
      const currentYear = new Date().getFullYear();
      const defaultHols = CONFIG.DEFAULT_HOLIDAYS_GENERATOR(currentYear);
      localStorage.setItem(CONFIG.STORAGE_KEYS.HOLIDAYS, JSON.stringify(defaultHols));
    }
    if (!localStorage.getItem(CONFIG.STORAGE_KEYS.DEPARTMENTS)) {
      localStorage.setItem(CONFIG.STORAGE_KEYS.DEPARTMENTS, JSON.stringify(CONFIG.DEPARTMENTS));
    }
  }

  /**
   * จัดการรายชื่อแผนก (Departments)
   */
  getDepartments() {
    try {
      const depts = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.DEPARTMENTS) || "[]");
      return depts && depts.length > 0 ? depts : CONFIG.DEPARTMENTS;
    } catch (e) {
      return CONFIG.DEPARTMENTS;
    }
  }

  saveDepartments(deptList) {
    localStorage.setItem(CONFIG.STORAGE_KEYS.DEPARTMENTS, JSON.stringify(deptList));
    return deptList;
  }

  setGasUrl(url) {
    this.gasUrl = (url || "").trim();
    localStorage.setItem(CONFIG.STORAGE_KEYS.GAS_URL, this.gasUrl);
    if (this.gasUrl) {
      this.mode = "live";
    } else {
      this.mode = "demo";
    }
    localStorage.setItem(CONFIG.STORAGE_KEYS.APP_MODE, this.mode);
  }

  getGasUrl() {
    return this.gasUrl;
  }

  setMode(mode) {
    this.mode = mode;
    localStorage.setItem(CONFIG.STORAGE_KEYS.APP_MODE, mode);
  }

  isLive() {
    return this.mode === "live" && Boolean(this.gasUrl);
  }

  /**
   * ทดสอบเชื่อมต่อ Google Apps Script Web App
   */
  async testConnection(targetUrl) {
    const url = targetUrl || this.gasUrl;
    if (!url) throw new Error("กรุณากรอก Web App URL");

    try {
      const separator = url.includes("?") ? "&" : "?";
      const res = await fetch(`${url}${separator}action=ping&_t=${Date.now()}`);
      if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
      const data = await res.json();
      return data.success;
    } catch (err) {
      throw new Error(`ไม่สามารถเชื่อมต่อได้: ${err.message}`);
    }
  }

  /**
   * ดึงข้อมูลทั้งหมดจากระบบ (Employees, LeaveRequests, Holidays)
   */
  async fetchAllData() {
    if (this.isLive()) {
      try {
        const separator = this.gasUrl.includes("?") ? "&" : "?";
        const res = await fetch(`${this.gasUrl}${separator}action=getAllData&_t=${Date.now()}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (data.success) {
          // ซิงค์แคชลง LocalStorage เพื่อให้เปิดดูแบบออฟไลน์ได้
          if (data.employees) localStorage.setItem(CONFIG.STORAGE_KEYS.EMPLOYEES, JSON.stringify(data.employees));
          if (data.leaveRequests) localStorage.setItem(CONFIG.STORAGE_KEYS.LEAVE_REQUESTS, JSON.stringify(data.leaveRequests));
          if (data.holidays) localStorage.setItem(CONFIG.STORAGE_KEYS.HOLIDAYS, JSON.stringify(data.holidays));

          return {
            employees: data.employees || [],
            leaveRequests: data.leaveRequests || [],
            holidays: data.holidays || [],
            source: "live"
          };
        }
      } catch (err) {
        console.warn("Fetch from Google Sheets failed, fallback to local storage:", err);
      }
    }

    // Fallback หรือ โหมด Demo
    return {
      employees: JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.EMPLOYEES) || "[]"),
      leaveRequests: JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.LEAVE_REQUESTS) || "[]"),
      holidays: JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.HOLIDAYS) || "[]"),
      source: "local"
    };
  }

  /**
   * ยื่นคำขอลาใหม่ (Submit Leave)
   */
  async submitLeaveRequest(requestData) {
    if (this.isLive()) {
      try {
        const res = await fetch(this.gasUrl, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify({
            action: "submitLeave",
            payload: requestData
          })
        });
        const result = await res.json();
        if (result.success) {
          return result;
        }
        throw new Error(result.message || "Failed to submit leave request to Google Sheets");
      } catch (err) {
        console.warn("GAS submission error, saving to local instead:", err);
      }
    }

    // Local / Offline fallback
    const leaves = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.LEAVE_REQUESTS) || "[]");
    const requestId = "LV-" + new Date().toISOString().slice(0, 10).replace(/-/g, "") + "-" + Math.floor(1000 + Math.random() * 9000);
    
    const localRecord = {
      ...requestData,
      request_id: requestId,
      status: "Approved", // ปรับสถานะเริ่มต้นเป็น Approved ทันที
      approved_by: "HR Administrator",
      rejection_reason: "",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    leaves.unshift(localRecord);
    localStorage.setItem(CONFIG.STORAGE_KEYS.LEAVE_REQUESTS, JSON.stringify(leaves));

    return {
      success: true,
      message: "บันทึกคำขอลาเรียบร้อยแล้ว",
      request_id: requestId,
      attachments: localRecord.attachments
    };
  }

  /**
   * แก้ไขคำขอลา (Update Leave Request)
   */
  async updateLeaveRequest(leaveData) {
    if (this.isLive()) {
      try {
        const res = await fetch(this.gasUrl, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify({
            action: "updateLeaveRequest",
            payload: leaveData
          })
        });
        const result = await res.json();
        if (result.success) return result;
      } catch (err) {
        console.warn("GAS update leave error, fallback to local:", err);
      }
    }

    const leaves = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.LEAVE_REQUESTS) || "[]");
    const index = leaves.findIndex(l => l.request_id === leaveData.request_id);
    if (index !== -1) {
      leaves[index] = {
        ...leaves[index],
        ...leaveData,
        updated_at: new Date().toISOString()
      };
      localStorage.setItem(CONFIG.STORAGE_KEYS.LEAVE_REQUESTS, JSON.stringify(leaves));
      return { success: true, message: "แก้ไขข้อมูลการลาเรียบร้อยแล้ว" };
    }
    throw new Error("ไม่พบรายการลานี้ในระบบ");
  }

  /**
   * ลบคำขอลา (Delete Leave Request)
   */
  async deleteLeaveRequest(requestId) {
    if (this.isLive()) {
      try {
        const res = await fetch(this.gasUrl, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify({
            action: "deleteLeaveRequest",
            payload: { request_id: requestId }
          })
        });
        const result = await res.json();
        if (result.success) return result;
      } catch (err) {
        console.warn("GAS delete leave error, fallback to local:", err);
      }
    }

    let leaves = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.LEAVE_REQUESTS) || "[]");
    leaves = leaves.filter(l => l.request_id !== requestId);
    localStorage.setItem(CONFIG.STORAGE_KEYS.LEAVE_REQUESTS, JSON.stringify(leaves));
    return { success: true, message: "ลบรายการลาเรียบร้อยแล้ว" };
  }

  /**
   * บันทึกหรือแก้ไขพนักงาน
   */
  async saveEmployee(empData) {
    if (this.isLive()) {
      try {
        const res = await fetch(this.gasUrl, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify({
            action: "saveEmployee",
            payload: empData
          })
        });
        const result = await res.json();
        if (result.success) return result;
      } catch (err) {
        console.warn("GAS save employee failed, fallback to local:", err);
      }
    }

    const employees = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.EMPLOYEES) || "[]");
    const idx = employees.findIndex(e => String(e.emp_id).trim() === String(empData.emp_id).trim());
    if (idx !== -1) {
      employees[idx] = { ...employees[idx], ...empData };
    } else {
      employees.push({
        ...empData,
        created_at: new Date().toISOString()
      });
    }
    localStorage.setItem(CONFIG.STORAGE_KEYS.EMPLOYEES, JSON.stringify(employees));
    return { success: true, message: "บันทึกข้อมูลพนักงานเรียบร้อยแล้ว" };
  }

  /**
   * ลบพนักงาน
   */
  async deleteEmployee(empId) {
    if (this.isLive()) {
      try {
        const res = await fetch(this.gasUrl, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify({
            action: "deleteEmployee",
            payload: { emp_id: empId }
          })
        });
        const result = await res.json();
        if (result.success) return result;
      } catch (err) {
        console.warn("GAS delete employee error:", err);
      }
    }

    let employees = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.EMPLOYEES) || "[]");
    employees = employees.filter(e => String(e.emp_id).trim() !== String(empId).trim());
    localStorage.setItem(CONFIG.STORAGE_KEYS.EMPLOYEES, JSON.stringify(employees));
    return { success: true, message: "ลบพนักงานสำเร็จ" };
  }

  /**
   * บันทึกวันหยุดนักขัตฤกษ์
   */
  async saveHoliday(holidayData) {
    if (this.isLive()) {
      try {
        const res = await fetch(this.gasUrl, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify({
            action: "saveHoliday",
            payload: holidayData
          })
        });
        const result = await res.json();
        if (result.success) return result;
      } catch (err) {
        console.warn("GAS save holiday error:", err);
      }
    }

    const holidays = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.HOLIDAYS) || "[]");
    const id = holidayData.id || ("H-" + Date.now());
    const idx = holidays.findIndex(h => h.id === id);
    const item = { ...holidayData, id: id };
    if (idx !== -1) {
      holidays[idx] = item;
    } else {
      holidays.push(item);
    }
    localStorage.setItem(CONFIG.STORAGE_KEYS.HOLIDAYS, JSON.stringify(holidays));
    return { success: true, message: "บันทึกวันหยุดเรียบร้อย" };
  }

  /**
   * ลบวันหยุด (รองรับการค้นหาจาก id, วันที่ หรือชื่อ)
   */
  async deleteHoliday(holidayId, holidayDate = "", holidayName = "") {
    if (this.isLive()) {
      try {
        const res = await fetch(this.gasUrl, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify({
            action: "deleteHoliday",
            payload: {
              id: holidayId,
              holiday_date: holidayDate,
              name: holidayName
            }
          })
        });
        const result = await res.json();
        if (result.success) return result;
      } catch (err) {
        console.warn("GAS delete holiday error:", err);
      }
    }

    let holidays = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.HOLIDAYS) || "[]");
    holidays = holidays.filter(h => {
      if (holidayId && String(h.id).trim() === String(holidayId).trim()) return false;
      if (holidayDate && holidayName && String(h.name).trim() === String(holidayName).trim() && String(h.holiday_date).includes(holidayDate)) return false;
      return true;
    });
    localStorage.setItem(CONFIG.STORAGE_KEYS.HOLIDAYS, JSON.stringify(holidays));
    return { success: true, message: "ลบวันหยุดเรียบร้อย" };
  }

  /**
   * ล้างวันหยุดทั้งหมด
   */
  async clearAllHolidays() {
    if (this.isLive()) {
      try {
        const res = await fetch(this.gasUrl, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify({
            action: "clearAllHolidays"
          })
        });
        const result = await res.json();
        if (result.success) return result;
      } catch (err) {
        console.warn("GAS clear all holidays error:", err);
      }
    }

    localStorage.setItem(CONFIG.STORAGE_KEYS.HOLIDAYS, JSON.stringify([]));
    return { success: true, message: "ล้างวันหยุดทั้งหมดเรียบร้อยแล้ว" };
  }

  /**
   * ลบรายการวันหยุดที่ซ้ำซ้อนออก
   */
  async cleanDuplicateHolidays() {
    if (this.isLive()) {
      try {
        const res = await fetch(this.gasUrl, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify({
            action: "cleanDuplicateHolidays"
          })
        });
        const result = await res.json();
        if (result.success) return result;
      } catch (err) {
        console.warn("GAS clean duplicates error:", err);
      }
    }

    let holidays = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.HOLIDAYS) || "[]");
    const seen = new Set();
    const unique = [];

    for (let h of holidays) {
      const cleanDate = LeaveAPI.formatDateISO(h.holiday_date);
      const key = `${cleanDate}_${String(h.name).trim()}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(h);
      }
    }

    localStorage.setItem(CONFIG.STORAGE_KEYS.HOLIDAYS, JSON.stringify(unique));
    return { success: true, message: `ลบรายการซ้ำซ้อนเรียบร้อยแล้ว คงเหลือ ${unique.length} รายการ` };
  }

  /**
   * ซิงค์ชุดวันหยุดมาตรฐานประจำปี
   */
  async syncDefaultHolidays(year) {
    const list = CONFIG.DEFAULT_HOLIDAYS_GENERATOR(year);
    if (this.isLive()) {
      try {
        const res = await fetch(this.gasUrl, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify({
            action: "syncDefaultHolidays",
            payload: { year, holidays: list }
          })
        });
        const result = await res.json();
        if (result.success) return result;
      } catch (err) {
        console.warn("GAS sync holidays error:", err);
      }
    }

    let holidays = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.HOLIDAYS) || "[]");
    holidays = holidays.filter(h => Number(h.year) !== Number(year));
    holidays = holidays.concat(list);
    localStorage.setItem(CONFIG.STORAGE_KEYS.HOLIDAYS, JSON.stringify(holidays));
    return { success: true, message: `โหลดวันหยุดปี ${year} สำเร็จ (${list.length} วัน)` };
  }

  /**
   * Helper: คำนวณวันทำงานจริง ระหว่าง startDate ถึง endDate (ไม่นับ เสาร์-อาทิตย์ และวันหยุดนักขัตฤกษ์)
   * รองรับ durationType: 'full', 'morning', 'afternoon', 'hourly'
   */
  calculateWorkingDays(startDateStr, endDateStr, durationType = "full", holidayList = [], hours = 2) {
    if (!startDateStr || !endDateStr) return 0;
    
    const cleanStart = LeaveAPI.formatDateISO(startDateStr);
    const cleanEnd = LeaveAPI.formatDateISO(endDateStr);

    const start = new Date(cleanStart);
    const end = new Date(cleanEnd);
    if (start > end) return 0;

    const holidaySet = new Set(
      holidayList.map(h => LeaveAPI.formatDateISO(h.holiday_date))
    );

    let workingDays = 0;
    let curr = new Date(start);

    while (curr <= end) {
      const dayOfWeek = curr.getDay(); // 0 = อาทิตย์, 6 = เสาร์
      const dateStr = LeaveAPI.formatDateISO(curr);

      if (dayOfWeek !== 0 && dayOfWeek !== 6 && !holidaySet.has(dateStr)) {
        workingDays += 1;
      }

      curr.setDate(curr.getDate() + 1);
    }

    // กรณีเลือกรายชั่วโมง (1 วันทำงาน = 8 ชั่วโมง)
    if (durationType === "hourly") {
      if (workingDays === 0) return 0;
      const h = Number(hours) || 1;
      return Math.round((h / 8) * 100) / 100; // เช่น 2 ชม. = 0.25 วัน
    }

    // กรณีเลือกครึ่งวัน
    if (durationType === "morning" || durationType === "afternoon") {
      return workingDays > 0 ? 0.5 : 0;
    }

    return workingDays;
  }

  /**
   * Helper: คำนวณสิทธิ์วันลาคงเหลือของพนักงานแต่ละคน
   */
  calculateEmployeeBalances(employee, allLeaveRequests, currentYear = new Date().getFullYear()) {
    if (!employee) return null;

    const quotas = {
      annual: Number(employee.annual_leave_quota || 0),
      personal: Number(employee.personal_leave_quota || 0),
      sick: Number(employee.sick_leave_quota || 0),
      other: Number(employee.other_leave_quota || 0)
    };

    const used = {
      annual: 0,
      personal: 0,
      sick: 0,
      other: 0
    };

    const empLeaves = allLeaveRequests.filter(l => {
      if (String(l.emp_id).trim() !== String(employee.emp_id).trim()) return false;
      if (l.status === "Rejected" || l.status === "Cancelled") return false;
      
      const leaveYear = new Date(l.start_date).getFullYear();
      return leaveYear === currentYear;
    });

    for (let req of empLeaves) {
      const type = req.leave_type;
      const days = Number(req.total_days || 0);
      if (type === "annual") used.annual += days;
      else if (type === "personal") used.personal += days;
      else if (type === "sick") used.sick += days;
      else used.other += days;
    }

    return {
      emp_id: employee.emp_id,
      name: employee.name,
      department: employee.department,
      position: employee.position,
      year: currentYear,
      annual: {
        quota: quotas.annual,
        used: used.annual,
        remaining: Math.max(0, Math.round((quotas.annual - used.annual) * 100) / 100)
      },
      personal: {
        quota: quotas.personal,
        used: used.personal,
        remaining: Math.max(0, Math.round((quotas.personal - used.personal) * 100) / 100)
      },
      sick: {
        quota: quotas.sick,
        used: used.sick,
        remaining: Math.max(0, Math.round((quotas.sick - used.sick) * 100) / 100)
      },
      other: {
        quota: quotas.other,
        used: used.other,
        remaining: Math.max(0, Math.round((quotas.other - used.other) * 100) / 100)
      }
    };
  }

  /**
   * แปลงวันที่เป็น YYYY-MM-DD ที่สะอาด
   */
  static formatDateISO(dateInput) {
    if (!dateInput) return "";
    if (typeof dateInput === "string") {
      if (dateInput.includes("T")) {
        const d = new Date(dateInput);
        if (!isNaN(d.getTime())) {
          const year = d.getFullYear();
          const month = String(d.getMonth() + 1).padStart(2, "0");
          const day = String(d.getDate()).padStart(2, "0");
          return `${year}-${month}-${day}`;
        }
      }
      return dateInput.slice(0, 10);
    }
    if (dateInput instanceof Date) {
      const year = dateInput.getFullYear();
      const month = String(dateInput.getMonth() + 1).padStart(2, "0");
      const day = String(dateInput.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    }
    return String(dateInput);
  }

  /**
   * แปลงวันที่เป็นรูปแบบ วัน/เดือน/ปี (DD/MM/YYYY)
   */
  static formatDateDMY(dateInput, thaiBuddhistYear = false) {
    if (!dateInput) return "-";
    const iso = LeaveAPI.formatDateISO(dateInput);
    if (!iso || !iso.includes("-")) return String(dateInput);

    const parts = iso.split("-");
    if (parts.length < 3) return iso;

    let year = Number(parts[0]);
    const month = parts[1];
    const day = parts[2];

    if (thaiBuddhistYear) {
      year += 543;
    }

    return `${day}/${month}/${year}`;
  }

  /**
   * แปลงวันที่และเวลาเป็น วัน/เดือน/ปี และเวลาจริง (เช่น 11/11/2026 14:15 น.)
   */
  static formatDateTime(dateInput) {
    if (!dateInput) return "-";
    try {
      const d = new Date(dateInput);
      if (isNaN(d.getTime())) return String(dateInput);
      
      const day = String(d.getDate()).padStart(2, "0");
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const year = d.getFullYear();
      const hh = String(d.getHours()).padStart(2, "0");
      const mm = String(d.getMinutes()).padStart(2, "0");
      
      return `${day}/${month}/${year} ${hh}:${mm} น.`;
    } catch (e) {
      return String(dateInput);
    }
  }

  /**
   * แปลง File Object เป็น Base64 string พร้อม metadata
   */
  static fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        resolve({
          name: file.name,
          type: file.type,
          size: file.size,
          base64: reader.result
        });
      };
      reader.onerror = error => reject(error);
      reader.readAsDataURL(file);
    });
  }
}

// Instance พร้อมใช้งาน
window.leaveAPI = new LeaveAPI();
