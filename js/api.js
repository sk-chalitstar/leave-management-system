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
   * จัดการแผนก (Departments)
   */
  getDepartments() {
    try {
      const depts = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.DEPARTMENTS) || "[]");
      return depts.length > 0 ? depts : CONFIG.DEPARTMENTS;
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
    
    // สำหรับ Local จำลองการเก็บไฟล์เป็น Data URL / Object
    const localRecord = {
      ...requestData,
      request_id: requestId,
      status: "Pending",
      approved_by: "",
      rejection_reason: "",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    leaves.unshift(localRecord);
    localStorage.setItem(CONFIG.STORAGE_KEYS.LEAVE_REQUESTS, JSON.stringify(leaves));

    return {
      success: true,
      message: "บันทึกคำขอลาเรียบร้อยแล้ว (โหมดจัดเก็บข้อมูลในระบบ)",
      request_id: requestId,
      attachments: localRecord.attachments
    };
  }

  /**
   * อัปเดตสถานะการลา (อนุมัติ / ไม่อนุมัติ)
   */
  async updateLeaveStatus(requestId, status, approver = "Administrator", rejectionReason = "") {
    if (this.isLive()) {
      try {
        const res = await fetch(this.gasUrl, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify({
            action: "updateLeaveStatus",
            payload: {
              request_id: requestId,
              status: status,
              approved_by: approver,
              rejection_reason: rejectionReason
            }
          })
        });
        const result = await res.json();
        if (result.success) return result;
      } catch (err) {
        console.warn("GAS status update failed, fallback to local:", err);
      }
    }

    // Local update
    const leaves = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.LEAVE_REQUESTS) || "[]");
    const index = leaves.findIndex(l => l.request_id === requestId);
    if (index !== -1) {
      leaves[index].status = status;
      leaves[index].approved_by = approver;
      leaves[index].rejection_reason = rejectionReason;
      leaves[index].updated_at = new Date().toISOString();
      localStorage.setItem(CONFIG.STORAGE_KEYS.LEAVE_REQUESTS, JSON.stringify(leaves));
      return { success: true, message: `อัปเดตสถานะเป็น ${status} สำเร็จ` };
    }
    throw new Error("ไม่พบคำขอนี้ในระบบ");
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

    // Local Storage
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
   * ลบวันหยุด
   */
  async deleteHoliday(holidayId) {
    if (this.isLive()) {
      try {
        const res = await fetch(this.gasUrl, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify({
            action: "deleteHoliday",
            payload: { id: holidayId }
          })
        });
        const result = await res.json();
        if (result.success) return result;
      } catch (err) {
        console.warn("GAS delete holiday error:", err);
      }
    }

    let holidays = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.HOLIDAYS) || "[]");
    holidays = holidays.filter(h => h.id !== holidayId);
    localStorage.setItem(CONFIG.STORAGE_KEYS.HOLIDAYS, JSON.stringify(holidays));
    return { success: true, message: "ลบวันหยุดเรียบร้อย" };
  }

  /**
   * ซิงค์วันหยุดประจำปีจาก Default Template
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
    // ลบวันหยุดของปีนั้นออกก่อนแล้วใส่ชุดใหม่
    holidays = holidays.filter(h => Number(h.year) !== Number(year));
    holidays = holidays.concat(list);
    localStorage.setItem(CONFIG.STORAGE_KEYS.HOLIDAYS, JSON.stringify(holidays));
    return { success: true, message: `โหลดวันหยุดปี ${year} สำเร็จ (${list.length} วัน)` };
  }

  /**
   * Helper: คำนวณวันทำงานจริง ระหว่าง startDate ถึง endDate (ไม่นับ เสาร์-อาทิตย์ และวันหยุดนักขัตฤกษ์)
   */
  calculateWorkingDays(startDateStr, endDateStr, durationType = "full", holidayList = []) {
    if (!startDateStr || !endDateStr) return 0;
    
    const start = new Date(startDateStr);
    const end = new Date(endDateStr);
    if (start > end) return 0;

    // รวบรวมชุดวันที่ของวันหยุดนักขัตฤกษ์เป็น Set ของ string 'YYYY-MM-DD'
    const holidaySet = new Set(
      holidayList.map(h => {
        let d = h.holiday_date;
        if (d instanceof Date) {
          d = d.toISOString().slice(0, 10);
        } else if (typeof d === "string") {
          d = d.slice(0, 10);
        }
        return d;
      })
    );

    let workingDays = 0;
    let curr = new Date(start);

    while (curr <= end) {
      const dayOfWeek = curr.getDay(); // 0 = อาทิตย์, 6 = เสาร์
      const dateStr = curr.toISOString().slice(0, 10);

      // ถ้าไม่ใช่วันเสาร์-อาทิตย์ และไม่ใช่วันหยุดนักขัตฤกษ์
      if (dayOfWeek !== 0 && dayOfWeek !== 6 && !holidaySet.has(dateStr)) {
        workingDays += 1;
      }

      curr.setDate(curr.getDate() + 1);
    }

    // กรณีเลือกครึ่งวัน (เช้าหรือบ่าย) ใน 1 วันทำงาน
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

    // สิทธิ์เต็ม
    const quotas = {
      annual: Number(employee.annual_leave_quota || 0),
      personal: Number(employee.personal_leave_quota || 0),
      sick: Number(employee.sick_leave_quota || 0),
      other: Number(employee.other_leave_quota || 0)
    };

    // นับจำนวนวันลาที่ถูกใช้ไปในปีปัจจุบัน (Approved หรือ Pending)
    const used = {
      annual: 0,
      personal: 0,
      sick: 0,
      other: 0
    };

    const empLeaves = allLeaveRequests.filter(l => {
      if (String(l.emp_id).trim() !== String(employee.emp_id).trim()) return false;
      if (l.status === "Rejected" || l.status === "Cancelled") return false;
      
      // กรองเฉพาะปีที่ระบุ
      const leaveYear = new Date(l.start_date).getFullYear();
      return leaveYear === currentYear;
    });

    for (let req of empLeaves) {
      const type = req.leave_type;
      const days = Number(req.total_days || 0);
      if (type === "annual") used.annual += days;
      else if (type === "personal") used.personal += days;
      else if (type === "sick") used.sick += days;
      else used.other += days; // maternity, ordination, other
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
        remaining: Math.max(0, quotas.annual - used.annual)
      },
      personal: {
        quota: quotas.personal,
        used: used.personal,
        remaining: Math.max(0, quotas.personal - used.personal)
      },
      sick: {
        quota: quotas.sick,
        used: used.sick,
        remaining: Math.max(0, quotas.sick - used.sick)
      },
      other: {
        quota: quotas.other,
        used: used.other,
        remaining: Math.max(0, quotas.other - used.other)
      }
    };
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
