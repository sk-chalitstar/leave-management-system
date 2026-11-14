/**
 * Leave Management System - API Client & Data Manager
 * จัดการเชื่อมต่อ Google Apps Script API และสำรองข้อมูลลง LocalStorage
 */

class LeaveAPI {
  constructor() {
    // 1. ตรวจสอบว่ามีการส่ง URL มาผ่าน Query Parameter หรือไม่ (เช่น เปิดจากลิงก์ซิงค์มือถือ ?gasUrl=...)
    try {
      const urlParams = typeof window !== "undefined" && window.location ? new URLSearchParams(window.location.search) : null;
      const queryGas = urlParams ? (urlParams.get("gasUrl") || urlParams.get("gas")) : null;
      if (queryGas) {
        const decoded = decodeURIComponent(queryGas).trim();
        if (decoded.startsWith("http")) {
          localStorage.setItem(CONFIG.STORAGE_KEYS.GAS_URL, decoded);
          localStorage.setItem(CONFIG.STORAGE_KEYS.APP_MODE, "live");
          // ล้าง URL ใน Address Bar ให้สะอาดโดยไม่ต้องรีโหลดหน้า
          if (window.history && window.history.replaceState) {
            window.history.replaceState({}, document.title, window.location.pathname);
          }
        }
      }
    } catch (e) {
      console.warn("Parse URL params error:", e);
    }

    // 2. ดึงค่าจาก LocalStorage หรือ Fallback ไปยัง CONFIG.DEFAULT_GAS_URL
    this.gasUrl = (localStorage.getItem(CONFIG.STORAGE_KEYS.GAS_URL) || (CONFIG.DEFAULT_GAS_URL || "")).trim();
    if (this.gasUrl) {
      this.mode = "live";
      localStorage.setItem(CONFIG.STORAGE_KEYS.APP_MODE, "live");
    } else {
      this.mode = localStorage.getItem(CONFIG.STORAGE_KEYS.APP_MODE) || "demo";
    }

    this.initLocalStorage();
  }

  /**
   * บันทึกรายการคำขอลาลง LocalStorage อย่างปลอดภัย (ป้องกันปัญหา QuotaExceededError โคต้าเต็ม)
   */
  safeSetLeaves(leaves) {
    try {
      localStorage.setItem(CONFIG.STORAGE_KEYS.LEAVE_REQUESTS, JSON.stringify(leaves));
    } catch (quotaErr) {
      console.warn("LocalStorage quota reached! Pruning heavy Base64 from older records...", quotaErr);
      // ตัด base64 ออกจากรายการเก่า คงเหลือเฉพาะ url และ metadata
      const pruned = (leaves || []).map((item, idx) => {
        if (idx > 0 && Array.isArray(item.attachments)) {
          return {
            ...item,
            attachments: item.attachments.map(att => {
              const { base64, ...rest } = att;
              return rest;
            })
          };
        }
        return item;
      });
      try {
        localStorage.setItem(CONFIG.STORAGE_KEYS.LEAVE_REQUESTS, JSON.stringify(pruned));
      } catch (e2) {
        // หากยังเกิน ให้ตัด base64 ออกจากทุกรายการที่เก็บในแคช
        const stripped = (leaves || []).map(item => ({
          ...item,
          attachments: (item.attachments || []).map(att => {
            const { base64, ...rest } = att;
            return rest;
          })
        }));
        try {
          localStorage.setItem(CONFIG.STORAGE_KEYS.LEAVE_REQUESTS, JSON.stringify(stripped));
        } catch (e3) {
          console.error("Critical localStorage quota error:", e3);
        }
      }
    }
  }

  /**
   * เริ่มต้นโครงสร้าง LocalStorage ด้วย Initial Data หากยังไม่มี
   */
  initLocalStorage() {
    if (!localStorage.getItem(CONFIG.STORAGE_KEYS.EMPLOYEES)) {
      localStorage.setItem(CONFIG.STORAGE_KEYS.EMPLOYEES, JSON.stringify(CONFIG.INITIAL_DATA.employees));
    }
    if (!localStorage.getItem(CONFIG.STORAGE_KEYS.LEAVE_REQUESTS)) {
      this.safeSetLeaves(CONFIG.INITIAL_DATA.leaveRequests);
    }
    if (!localStorage.getItem(CONFIG.STORAGE_KEYS.HOLIDAYS)) {
      const currentYear = new Date().getFullYear();
      const defaultHols = CONFIG.DEFAULT_HOLIDAYS_GENERATOR(currentYear);
      localStorage.setItem(CONFIG.STORAGE_KEYS.HOLIDAYS, JSON.stringify(defaultHols));
    } else {
      try {
        const cached = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.HOLIDAYS) || "[]");
        if (Array.isArray(cached) && cached.length > 0) {
          const cleaned = cached.map(h => LeaveAPI.normalizeHoliday(h)).filter(h => h && h.holiday_date);
          localStorage.setItem(CONFIG.STORAGE_KEYS.HOLIDAYS, JSON.stringify(cleaned));
        }
      } catch (e) {}
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
    let deletedIds = [];
    try {
      deletedIds = JSON.parse(localStorage.getItem("LEAVE_DELETED_REQUEST_IDS") || "[]");
    } catch (e) {
      deletedIds = [];
    }

    if (this.isLive()) {
      try {
        const separator = this.gasUrl.includes("?") ? "&" : "?";
        const res = await fetch(`${this.gasUrl}${separator}action=getAllData&_t=${Date.now()}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (data.success) {
          // กรองคำขอลาที่ถูกลบไปแล้วออก ไม่ให้แคชเก่าย้อนกลับมา และแปลงสถานะเป็น Approved ทั้งหมด (ยกเลิกขั้นตอนอนุมัติ)
          const fetchedLeaves = (data.leaveRequests || [])
            .filter(r => !deletedIds.includes(String(r.request_id).trim()))
            .map(r => {
              if (!r.status || r.status === "Pending" || r.status === "pending") {
                return { ...r, status: "Approved" };
              }
              return r;
            });
          
          let cachedCustomRestDays = {};
          try {
            cachedCustomRestDays = JSON.parse(localStorage.getItem("CUSTOM_REST_DAYS_MAP") || "{}");
          } catch (e) {}

          const normalizedEmployees = (data.employees || []).map(e => {
            const norm = this.normalizeEmployee(e);
            const idKey = String(norm.emp_id).trim();
            // หากในเครื่องเคยบันทึกเวรหยุดเฉพาะไว้ ให้ใช้ค่าที่ผู้ใช้กำหนดไว้ ไม่ให้ข้อมูลเก่าจาก Sheet มาทับ
            if (cachedCustomRestDays[idKey] !== undefined) {
              norm.rest_days = cachedCustomRestDays[idKey];
            }
            return norm;
          });

          // ซิงค์แคชลง LocalStorage เพื่อให้เปิดดูแบบออฟไลน์ได้
          localStorage.setItem(CONFIG.STORAGE_KEYS.EMPLOYEES, JSON.stringify(normalizedEmployees));
          this.safeSetLeaves(fetchedLeaves);

          // ประมวลผลและ Normalize วันหยุดที่ได้จาก Google Sheets
          const rawHolidays = data.holidays || [];
          let normalizedHolidays = rawHolidays.map(h => LeaveAPI.normalizeHoliday(h)).filter(h => h && h.holiday_date);

          // กรณีที่ Google Sheets ส่งกลับมาเป็นโครงสร้างว่าง (เช่น Header ไม่ตรง) ให้ดึงจาก Default หรือ Cache
          if (normalizedHolidays.length === 0 && rawHolidays.length > 0) {
            const currentYear = new Date().getFullYear();
            normalizedHolidays = CONFIG.DEFAULT_HOLIDAYS_GENERATOR(currentYear);
          } else if (normalizedHolidays.length === 0) {
            const cachedHols = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.HOLIDAYS) || "[]");
            normalizedHolidays = cachedHols.map(h => LeaveAPI.normalizeHoliday(h)).filter(h => h && h.holiday_date);
          }

          if (normalizedHolidays.length > 0) {
            localStorage.setItem(CONFIG.STORAGE_KEYS.HOLIDAYS, JSON.stringify(normalizedHolidays));
          }

          return {
            employees: normalizedEmployees,
            leaveRequests: fetchedLeaves,
            holidays: normalizedHolidays,
            source: "live"
          };
        }
      } catch (err) {
        console.warn("Fetch from Google Sheets failed, fallback to local storage:", err);
      }
    }

    // Fallback หรือ โหมด Demo
    let localLeaves = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.LEAVE_REQUESTS) || "[]");
    localLeaves = localLeaves
      .filter(r => !deletedIds.includes(String(r.request_id).trim()))
      .map(r => {
        if (!r.status || r.status === "Pending" || r.status === "pending") {
          return { ...r, status: "Approved" };
        }
        return r;
      });
    this.safeSetLeaves(localLeaves);
    const rawLocalEmps = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.EMPLOYEES) || "[]");
    
    let cachedCustomRestDays = {};
    try {
      cachedCustomRestDays = JSON.parse(localStorage.getItem("CUSTOM_REST_DAYS_MAP") || "{}");
    } catch (e) {}

    const normalizedLocalEmps = rawLocalEmps.map(e => {
      const norm = this.normalizeEmployee(e);
      const idKey = String(norm.emp_id).trim();
      if (cachedCustomRestDays[idKey] !== undefined) {
        norm.rest_days = cachedCustomRestDays[idKey];
      }
      return norm;
    });

    const rawLocalHols = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.HOLIDAYS) || "[]");
    const normalizedLocalHols = rawLocalHols.map(h => LeaveAPI.normalizeHoliday(h)).filter(h => h && h.holiday_date);

    return {
      employees: normalizedLocalEmps,
      leaveRequests: localLeaves,
      holidays: normalizedLocalHols,
      source: "local"
    };
  }

  normalizeEmployee(emp) {
    if (!emp) return emp;
    const empId = String(emp.emp_id || "").trim();

    let cachedCustomRestDays = {};
    try {
      cachedCustomRestDays = JSON.parse(localStorage.getItem("CUSTOM_REST_DAYS_MAP") || "{}");
    } catch (e) {}

    let restDays = null;
    if (Array.isArray(emp.rest_days)) {
      restDays = emp.rest_days.map(Number);
    } else if (emp.rest_days === "none" || emp.rest_days === "[]" || emp.rest_days === "-") {
      restDays = [];
    } else if (emp.rest_days !== undefined && emp.rest_days !== null && String(emp.rest_days).trim() !== "") {
      restDays = String(emp.rest_days).split(",").map(s => Number(s.trim())).filter(n => !isNaN(n));
    }

    // หากในเครื่องมีการบันทึกเวรหยุดเฉพาะไว้สำหรับพนักงานรหัสนี้ ให้ใช้ค่านั้นเป็นหลัก
    if (empId && cachedCustomRestDays[empId] !== undefined) {
      // ถ้าข้อมูลที่ส่งเข้ามาไม่มี rest_days หรือได้ค่าเริ่มต้น [0,6] แต่ใน cache มีค่าเฉพาะ ให้ใช้จาก cache
      if (restDays === null || (restDays.length === 2 && restDays.includes(0) && restDays.includes(6))) {
        restDays = cachedCustomRestDays[empId];
      }
    }

    if (restDays === null) {
      restDays = [0, 6];
    }

    return {
      ...emp,
      rest_days: restDays
    };
  }

  /**
   * ซิงค์รายการคำขอลาที่ค้างส่ง (Unsynced / Offline Requests) ขึ้น Google Sheets
   * ใช้เมื่อเปิดเครื่องครั้งแรก หรือเพิ่งเชื่อมต่อ URL สำเร็จ
   */
  async autoSyncPendingRequests() {
    if (!this.isLive()) return { syncedCount: 0 };

    let leaves = [];
    try {
      leaves = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.LEAVE_REQUESTS) || "[]");
    } catch (e) {
      return { syncedCount: 0 };
    }

    let deletedIds = [];
    try {
      deletedIds = JSON.parse(localStorage.getItem("LEAVE_DELETED_REQUEST_IDS") || "[]");
    } catch (e) {}

    // ค้นหารายการที่ยังไม่ได้ซิงค์ขึ้น Cloud
    const pendingList = leaves.filter(r => {
      if (deletedIds.includes(String(r.request_id).trim())) return false;
      return r.synced_to_cloud === false || r._pendingSync === true;
    });

    if (pendingList.length === 0) return { syncedCount: 0 };

    let syncedCount = 0;
    for (let req of pendingList) {
      try {
        const payload = {
          emp_id: req.emp_id,
          emp_name: req.emp_name,
          department: req.department,
          leave_type: req.leave_type,
          leave_duration_type: req.leave_duration_type || "full",
          leave_hours: req.leave_hours || 0,
          leave_time_range: req.leave_time_range || "",
          start_date: req.start_date,
          end_date: req.end_date,
          total_days: req.total_days,
          reason: req.reason,
          attachments: req.attachments || []
        };

        const res = await fetch(this.gasUrl, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify({
            action: "submitLeave",
            payload: payload
          })
        });
        const result = await res.json();
        if (result && result.success) {
          req.synced_to_cloud = true;
          delete req._pendingSync;
          if (result.request_id) req.request_id = result.request_id;
          syncedCount++;
        }
      } catch (err) {
        console.warn("Auto-sync error for request:", req.request_id, err);
      }
    }

    if (syncedCount > 0) {
      this.safeSetLeaves(leaves);
    }

    return { syncedCount };
  }

  /**
   * ยื่นคำขอลาใหม่ (Submit Leave)
   * บันทึกคำขอลาลงทั้ง LocalStorage ทันที และซิงค์ขึ้น Google Sheets เพื่อให้ข้อมูลแสดงผลบนมือถือได้แบบ Real-time 100%
   */
  async submitLeaveRequest(requestData) {
    let requestId = "LV-" + new Date().toISOString().slice(0, 10).replace(/-/g, "") + "-" + Math.floor(1000 + Math.random() * 9000);
    
    // สร้าง Record การลาใหม่สถานะ Approved ทันที
    const newRecord = {
      ...requestData,
      request_id: requestId,
      status: "Approved",
      approved_by: "ระบบบันทึกอัตโนมัติ",
      rejection_reason: "",
      synced_to_cloud: false,
      _pendingSync: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // 1. นำออกจาก Deleted IDs ทันทีถ้าเคยมี
    try {
      let deletedIds = JSON.parse(localStorage.getItem("LEAVE_DELETED_REQUEST_IDS") || "[]");
      deletedIds = deletedIds.filter(id => id !== requestId);
      localStorage.setItem("LEAVE_DELETED_REQUEST_IDS", JSON.stringify(deletedIds));
    } catch (e) {}

    // 2. บันทึกลง LocalStorage ทันทีเพื่อให้แสดงผลได้ทันทีโดยไม่ต้องรอเครือข่าย
    let leaves = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.LEAVE_REQUESTS) || "[]");
    leaves = leaves.filter(l => String(l.request_id).trim() !== requestId);
    leaves.unshift(newRecord);
    this.safeSetLeaves(leaves);

    // 3. หากเชื่อมต่อ Google Sheets ให้ส่งข้อมูลไปบันทึกลงชีต
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
        if (result && result.success) {
          newRecord.synced_to_cloud = true;
          delete newRecord._pendingSync;
          if (result.request_id) {
            newRecord.request_id = result.request_id;
          }
          if (result.attachments) {
            newRecord.attachments = result.attachments;
          }
          // อัปเดตใน LocalStorage อีกครั้งด้วย ID/ไฟล์แนบที่ได้จาก Google Drive/Sheet
          leaves = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.LEAVE_REQUESTS) || "[]");
          const idx = leaves.findIndex(l => l.request_id === requestId || l.request_id === newRecord.request_id);
          if (idx !== -1) {
            leaves[idx] = newRecord;
          } else {
            leaves.unshift(newRecord);
          }
          this.safeSetLeaves(leaves);

          return {
            success: true,
            cloudSynced: true,
            message: result.message || "บันทึกคำขอลาและซิงค์ข้อมูลไปยัง Google Sheets เรียบร้อยแล้ว",
            request_id: newRecord.request_id,
            record: newRecord,
            attachments: newRecord.attachments
          };
        }
      } catch (err) {
        console.warn("GAS submission error, saved to local cache successfully:", err);
        return {
          success: true,
          cloudSynced: false,
          offlineWarning: true,
          message: `บันทึกคำขอลาในเครื่องสำเร็จแล้ว แต่ไม่สามารถส่งไป Google Sheets ได้ (${err.message}) ระบบจะซิงค์ให้อัตโนมัติเมื่อออนไลน์`,
          request_id: newRecord.request_id,
          record: newRecord,
          attachments: newRecord.attachments
        };
      }
    }

    // กรณีทำงานในโหมดจำลอง / ออฟไลน์ (ยังไม่ได้เชื่อมต่อ Google Sheets)
    return {
      success: true,
      cloudSynced: false,
      isDemo: true,
      message: "บันทึกคำขอลาในเครื่องเรียบร้อยแล้ว (โหมดออฟไลน์) ⚠️ ยังไม่ได้เชื่อมต่อ Google Sheets",
      request_id: newRecord.request_id,
      record: newRecord,
      attachments: newRecord.attachments
    };
  }

  /**
   * แก้ไขคำขอลา (Update Leave Request)
   * รองรับการแก้ไขข้อมูล และอัปเดต/เพิ่ม/ลบ รูปภาพเอกสารแนบ
   */
  async updateLeaveRequest(leaveData) {
    let updatedAttachments = leaveData.attachments;

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
        if (result && result.success) {
          if (result.attachments) {
            updatedAttachments = result.attachments;
          }
        }
      } catch (err) {
        console.warn("GAS update leave error, fallback to local:", err);
      }
    }

    let leaves = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.LEAVE_REQUESTS) || "[]");
    const index = leaves.findIndex(l => String(l.request_id).trim() === String(leaveData.request_id).trim());
    if (index !== -1) {
      leaves[index] = {
        ...leaves[index],
        ...leaveData,
        attachments: updatedAttachments !== undefined ? updatedAttachments : (leaves[index].attachments || []),
        updated_at: new Date().toISOString()
      };
      this.safeSetLeaves(leaves);
      return { 
        success: true, 
        message: "แก้ไขข้อมูลการลาและอัปเดตรูปภาพเรียบร้อยแล้ว", 
        record: leaves[index],
        attachments: leaves[index].attachments 
      };
    }
    throw new Error("ไม่พบรายการลานี้ในระบบ");
  }

  /**
   * ลบคำขอลา (Delete Leave Request) และคืนสิทธิ์วันลา
   */
  async deleteLeaveRequest(requestId, optionalData = {}) {
    const targetId = String(requestId || "").trim();
    if (!targetId) return { success: false, message: "ไม่ระบุรหัสคำขอ" };

    // 1. บันทึกลง deletedIds เพื่อไม่ให้ fetchAllData ดึงกลับมา
    try {
      let deletedIds = JSON.parse(localStorage.getItem("LEAVE_DELETED_REQUEST_IDS") || "[]");
      if (!deletedIds.includes(targetId)) {
        deletedIds.push(targetId);
        localStorage.setItem("LEAVE_DELETED_REQUEST_IDS", JSON.stringify(deletedIds));
      }
    } catch (e) {}

    // 2. ลบออกจาก LocalStorage
    let leaves = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.LEAVE_REQUESTS) || "[]");
    leaves = leaves.filter(l => String(l.request_id).trim() !== targetId);
    this.safeSetLeaves(leaves);

    // 3. ถ้าเชื่อมต่อ Google Sheets ให้ส่งคำสั่งไปลบในชีต
    if (this.isLive()) {
      try {
        const res = await fetch(this.gasUrl, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify({
            action: "deleteLeaveRequest",
            payload: {
              request_id: targetId,
              emp_id: optionalData.emp_id || "",
              start_date: optionalData.start_date || "",
              leave_type: optionalData.leave_type || ""
            }
          })
        });
        const result = await res.json();
        if (result && result.success) {
          return { success: true, message: "ลบคำขอลาจาก Google Sheet และคืนสิทธิ์วันลาเรียบร้อยแล้ว", sheetUpdated: true };
        }
        return {
          success: true,
          message: (result && result.message) ? result.message : "ลบในระบบเรียบร้อย",
          sheetUpdated: false
        };
      } catch (err) {
        console.warn("GAS delete leave error:", err);
        return {
          success: true,
          message: `ลบในระบบเรียบร้อย (Google Sheet ยังไม่ได้รับการอัปเดต: ${err.message})`,
          sheetUpdated: false
        };
      }
    }

    return { success: true, message: "ลบรายการลาและคืนสิทธิ์วันลาเรียบร้อยแล้ว", sheetUpdated: true };
  }

  /**
   * บันทึกหรือแก้ไขพนักงาน
   */
  async saveEmployee(empData) {
    const normalizedData = this.normalizeEmployee(empData);
    const empId = String(normalizedData.emp_id).trim();

    // 1. บันทึกเวรหยุดลงใน Persistent Cache ทันที เพื่อป้องกันข้อมูลหายเมื่อดึงจาก Sheet ที่ยังไม่อัปเดต
    try {
      const cached = JSON.parse(localStorage.getItem("CUSTOM_REST_DAYS_MAP") || "{}");
      cached[empId] = normalizedData.rest_days;
      localStorage.setItem("CUSTOM_REST_DAYS_MAP", JSON.stringify(cached));
    } catch (e) {
      console.warn("Save rest days cache error:", e);
    }

    // 2. อัปเดตลงใน LocalStorage ทันที (Local Cache)
    const employees = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.EMPLOYEES) || "[]");
    const idx = employees.findIndex(e => String(e.emp_id).trim() === empId);
    if (idx !== -1) {
      employees[idx] = { ...employees[idx], ...normalizedData };
    } else {
      employees.push({
        ...normalizedData,
        created_at: new Date().toISOString()
      });
    }
    localStorage.setItem(CONFIG.STORAGE_KEYS.EMPLOYEES, JSON.stringify(employees));

    // 3. ส่งข้อมูลไปอัปเดตบน Google Sheet หากเชื่อมต่อ Live Mode
    if (this.isLive()) {
      try {
        const res = await fetch(this.gasUrl, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify({
            action: "saveEmployee",
            payload: normalizedData
          })
        });
        const result = await res.json();
        return result;
      } catch (err) {
        console.warn("GAS save employee failed, saved locally:", err);
      }
    }

    return { success: true, message: "บันทึกข้อมูลพนักงานเรียบร้อยแล้ว" };
  }

  /**
   * ลบพนักงาน
   */
  async deleteEmployee(empId) {
    const targetEmpId = String(empId).trim();

    // ล้างออกจาก Custom Rest Days Map
    try {
      const cached = JSON.parse(localStorage.getItem("CUSTOM_REST_DAYS_MAP") || "{}");
      delete cached[targetEmpId];
      localStorage.setItem("CUSTOM_REST_DAYS_MAP", JSON.stringify(cached));
    } catch (e) {}

    // ล้างออกจาก LocalStorage
    let employees = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.EMPLOYEES) || "[]");
    employees = employees.filter(e => String(e.emp_id).trim() !== targetEmpId);
    localStorage.setItem(CONFIG.STORAGE_KEYS.EMPLOYEES, JSON.stringify(employees));

    if (this.isLive()) {
      try {
        const res = await fetch(this.gasUrl, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify({
            action: "deleteEmployee",
            payload: { emp_id: targetEmpId }
          })
        });
        const result = await res.json();
        return result;
      } catch (err) {
        console.warn("GAS delete employee error:", err);
      }
    }

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
    localStorage.setItem(CONFIG.STORAGE_KEYS.HOLIDAYS, JSON.stringify([]));

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
        return result || { success: true, message: "ล้างวันหยุดทั้งหมดเรียบร้อยแล้ว" };
      } catch (err) {
        console.warn("GAS clear all holidays error:", err);
      }
    }

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

    // บันทึกลง LocalStorage เสมอ เพื่อให้หน้าจอแสดงผลได้ถูกต้องและรวดเร็วทันที
    let holidays = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.HOLIDAYS) || "[]");
    holidays = holidays.filter(h => {
      const norm = LeaveAPI.normalizeHoliday(h);
      return norm && Number(norm.year) !== Number(year);
    });
    holidays = holidays.concat(list);
    localStorage.setItem(CONFIG.STORAGE_KEYS.HOLIDAYS, JSON.stringify(holidays));

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
        return result || { success: true, message: `โหลดวันหยุดปี ${year} สำเร็จ (${list.length} วัน)` };
      } catch (err) {
        console.warn("GAS sync holidays error:", err);
      }
    }

    return { success: true, message: `โหลดวันหยุดปี ${year} สำเร็จ (${list.length} วัน)` };
  }

  /**
   * Helper: คำนวณวันทำงานจริง ระหว่าง startDate ถึง endDate
   * ไม่อิงเฉพาะเสาร์-อาทิตย์ แต่อิงตาม "เวรหยุดประจำตัวของพนักงาน (rest_days)" และ "วันหยุดนักขัตฤกษ์"
   * รองรับ durationType: 'full', 'morning', 'afternoon', 'hourly'
   */
  calculateWorkingDays(startDateStr, endDateStr, durationType = "full", holidayList = [], hours = 2, employee = null) {
    if (!startDateStr || !endDateStr) return 0;
    
    const cleanStart = LeaveAPI.formatDateISO(startDateStr);
    const cleanEnd = LeaveAPI.formatDateISO(endDateStr);

    const start = new Date(cleanStart);
    const end = new Date(cleanEnd);
    if (start > end) return 0;

    const holidaySet = new Set(
      holidayList.map(h => {
        const norm = LeaveAPI.normalizeHoliday(h);
        return norm ? norm.holiday_date : LeaveAPI.formatDateISO(h.holiday_date);
      }).filter(Boolean)
    );

    // ดึงเวรหยุดประจำตัวของพนักงาน (0=อาทิตย์, 1=จันทร์, ..., 6=เสาร์)
    // หากไม่ได้ระบุเวรหยุด (พนักงานเก่า) ให้ใช้ค่าเริ่มต้น [0, 6] (เสาร์-อาทิตย์)
    let restDays = [0, 6];
    if (employee) {
      if (Array.isArray(employee.rest_days)) {
        restDays = employee.rest_days.map(Number);
      } else if (employee.rest_days === "none" || employee.rest_days === "[]" || employee.rest_days === "-") {
        restDays = [];
      } else if (employee.rest_days !== undefined && employee.rest_days !== null && String(employee.rest_days).trim() !== "") {
        restDays = String(employee.rest_days).split(",").map(s => Number(s.trim())).filter(n => !isNaN(n));
      }
    }

    let workingDays = 0;
    let curr = new Date(start);

    while (curr <= end) {
      const dayOfWeek = curr.getDay(); // 0 = อาทิตย์, ..., 6 = เสาร์
      const dateStr = LeaveAPI.formatDateISO(curr);

      // วันที่ไม่สามารถลาได้ คือ วันที่ตรงกับ "เวรหยุดของพนักงาน" หรือ "วันหยุดนักขัตฤกษ์"
      const isRestDay = restDays.includes(dayOfWeek);
      const isPublicHoliday = holidaySet.has(dateStr);

      if (!isRestDay && !isPublicHoliday) {
        workingDays += 1;
      }

      curr.setDate(curr.getDate() + 1);
    }

    // กรณีเลือกรายชั่วโมง (1 วันทำงาน = 8 ชั่วโมง)
    if (durationType === "hourly") {
      if (workingDays === 0) return 0;
      const h = Number(hours) || 1;
      return Math.round((h / 8) * 100) / 100; // เช่น 2 ชม. = 0.25 วัน, 4 ชม. = 0.5 วัน
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
   * ค้นหาวันที่ของวันหยุดนักขัตฤกษ์ไทยจากชื่อ (Fallback lookup for Thai national holidays)
   */
  static lookupDefaultHolidayDate(name, yearInput) {
    if (!name) return "";
    let year = parseInt(yearInput) || new Date().getFullYear();
    if (year > 2400) year -= 543; // แปลง พ.ศ. เป็น ค.ศ.
    const yStr = String(year);
    const n = String(name).trim();

    if (n.includes("ปีใหม่")) return `${yStr}-01-01`;
    if (n.includes("มาฆ")) return `${yStr}-02-26`;
    if (n.includes("จักรี") || n.includes("พระพุทธยอดฟ้า")) return `${yStr}-04-06`;
    if (n.includes("สงกรานต์")) {
      if (n.includes("15") || n.includes("สาม")) return `${yStr}-04-15`;
      if (n.includes("14") || n.includes("สอง")) return `${yStr}-04-14`;
      return `${yStr}-04-13`;
    }
    if (n.includes("แรงงาน")) return `${yStr}-05-01`;
    if (n.includes("ฉัตรมงคล")) return `${yStr}-05-04`;
    if (n.includes("วิสาข")) return `${yStr}-05-22`;
    if (n.includes("พระบรมราชินี") && n.includes("เฉลิมพระชนมพรรษา")) return `${yStr}-06-03`;
    if (n.includes("อาสาฬห")) return `${yStr}-07-20`;
    if (n.includes("เข้าพรรษา")) return `${yStr}-07-21`;
    if (n.includes("วชิรเกล้า") || (n.includes("เฉลิมพระชนมพรรษา") && n.includes("อยู่หัว"))) return `${yStr}-07-28`;
    if (n.includes("แม่แห่งชาติ") || n.includes("พันปีหลวง")) return `${yStr}-08-12`;
    if (n.includes("นวมินทร")) return `${yStr}-10-13`;
    if (n.includes("ปิยมหาราช")) return `${yStr}-10-23`;
    if (n.includes("พ่อแห่งชาติ") || n.includes("วันชาติ")) return `${yStr}-12-05`;
    if (n.includes("รัฐธรรมนูญ")) return `${yStr}-12-10`;
    if (n.includes("สิ้นปี")) return `${yStr}-12-31`;
    return "";
  }

  /**
   * Helper: สกัดวันที่ ISO จากค่าใดๆ โดยไม่รับข้อความภาษาไทย
   */
  static extractValidDate(val) {
    if (!val) return "";
    if (val instanceof Date) {
      if (isNaN(val.getTime())) return "";
      const y = val.getFullYear();
      const m = String(val.getMonth() + 1).padStart(2, "0");
      const d = String(val.getDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }
    if (typeof val === "string") {
      const s = val.trim();
      // หากมีตัวอักษรภาษาไทย ปฏิเสธทันที ไม่ใช่วันที่
      if (/[\u0E00-\u0E7F]/.test(s)) return "";
      if (s.includes("T")) {
        const d = new Date(s);
        if (!isNaN(d.getTime())) {
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, "0");
          const day = String(d.getDate()).padStart(2, "0");
          return `${y}-${m}-${day}`;
        }
      }
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
      if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) {
        const parts = s.split("/");
        return `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
      }
      if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(s)) {
        const parts = s.split("-");
        return `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
      }
    }
    return "";
  }

  /**
   * Helper: แปลงและตรวจสอบโครงสร้างข้อมูลวันหยุด (Normalize Holiday Object)
   * รองรับทุกรูปแบบชื่อคีย์ทั้งภาษาไทย ภาษาอังกฤษ มีช่องว่าง หรือส่งมาเป็น Array
   */
  static normalizeHoliday(h) {
    if (!h) return null;

    let idVal = "";
    let dateVal = "";
    let nameVal = "";
    let yearVal = "";

    if (Array.isArray(h)) {
      idVal = h[0];
      dateVal = h[1];
      nameVal = h[2];
      yearVal = h[3];
    } else if (typeof h === "object") {
      idVal = h.id || h.ID || h["รหัส"] || "";

      // ค้นหา Date: ตรวจสอบ key ที่เป็นวันที่ชัดเจน (ไม่รวม key ที่เป็นชื่อ)
      const explicitDateKeys = ["holiday_date", "date", "holidayDate", "Date", "Holiday_Date", "วันที่", "วันเดือนปี", "วัน/เดือน/ปี"];
      for (const k of explicitDateKeys) {
        if (h[k] !== undefined && h[k] !== null && String(h[k]).trim() !== "") {
          const valid = LeaveAPI.extractValidDate(h[k]);
          if (valid) {
            dateVal = valid;
            break;
          }
        }
      }

      // ค้นหา Name: ตรวจสอบ key ที่เป็นชื่อวันหยุด
      const explicitNameKeys = ["name", "holiday_name", "holidayName", "Name", "Holiday_Name", "ชื่อ", "ชื่อวันหยุด", "วันหยุด", "วันหยุดนักขัตฤกษ์", "เทศกาล"];
      for (const k of explicitNameKeys) {
        if (h[k] !== undefined && h[k] !== null && String(h[k]).trim() !== "") {
          nameVal = String(h[k]).trim();
          break;
        }
      }

      // ค้นหา Year
      yearVal = h.year || h.Year || h["ปี"] || h["ปี พ.ศ./ค.ศ."] || "";
      if (yearVal && /[\u0E00-\u0E7F]/.test(String(yearVal))) {
        yearVal = "";
      }

      // หาก dateVal ยังไม่พบ ให้สแกนหา value ใน object ที่เป็นรูปแบบวันที่จริง
      if (!dateVal) {
        for (const [k, v] of Object.entries(h)) {
          const cleanK = k.toLowerCase().trim();
          if (cleanK.includes("name") || cleanK.includes("ชื่อ") || cleanK.includes("เทศกาล")) continue;
          const valid = LeaveAPI.extractValidDate(v);
          if (valid) {
            dateVal = valid;
            break;
          }
        }
      }

      // หาก nameVal ยังไม่พบ ให้หา string ภาษาไทยใน values
      if (!nameVal) {
        for (const [k, v] of Object.entries(h)) {
          if (typeof v === "string" && /[\u0E00-\u0E7F]/.test(v)) {
            nameVal = v.trim();
            break;
          }
        }
      }
    }

    // ทำความสะอาดวันที่
    let cleanISO = LeaveAPI.extractValidDate(dateVal);

    // กำหนดปีที่ถูกต้อง
    let validYear = parseInt(yearVal) || (cleanISO ? parseInt(cleanISO.slice(0, 4)) : new Date().getFullYear());
    if (validYear > 2400) validYear -= 543;

    // กู้คืนวันที่จากชื่อวันหยุดอัตโนมัติหาก dateVal หายหรือส่งมาไม่ตรงคอลัมน์
    if (!cleanISO && nameVal) {
      cleanISO = LeaveAPI.lookupDefaultHolidayDate(nameVal, validYear);
    }

    if (!cleanISO && !nameVal) return null;

    if (cleanISO && !validYear) {
      validYear = parseInt(cleanISO.slice(0, 4));
    }

    return {
      id: String(idVal || (cleanISO ? `H-${cleanISO}` : `H-${Date.now()}`)),
      holiday_date: cleanISO,
      name: String(nameVal || "").trim(),
      year: String(validYear || new Date().getFullYear())
    };
  }

  /**
   * แปลงวันที่เป็น YYYY-MM-DD ที่สะอาด (ปฏิเสธข้อความภาษาไทยเด็ดขาด)
   */
  static formatDateISO(dateInput) {
    if (!dateInput) return "";
    return LeaveAPI.extractValidDate(dateInput);
  }

  /**
   * แปลงวันที่เป็นรูปแบบ วัน/เดือน/ปี (DD/MM/YYYY)
   */
  static formatDateDMY(dateInput, thaiBuddhistYear = false) {
    if (!dateInput) return "-";
    const iso = LeaveAPI.formatDateISO(dateInput);
    if (!iso || !iso.includes("-")) return "-";

    const parts = iso.split("-");
    if (parts.length < 3) return "-";

    let year = Number(parts[0]);
    const month = parts[1];
    const day = parts[2];

    if (isNaN(year)) return "-";
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

  /**
   * บีบอัดและปรับขนาดรูปภาพอัตโนมัติ (Client-Side Image Compression)
   * แก้ปัญหาภาพถ่ายจากมือถือ (iPhone/Android) ขนาดใหญ่ 4-10MB จนเกิดปัญหา "โคต้าเต็ม" (QuotaExceededError)
   * ลดขนาดเหลือเพียง ~100-250KB โดยยังคงความคมชัดและอ่านตัวหนังสือในใบรับรองแพทย์/ใบลาได้ชัดเจน 100%
   */
  static compressImageFile(file, maxWidth = 1280, maxHeight = 1280, quality = 0.72) {
    return new Promise((resolve, reject) => {
      // หากไม่ใช่รูปภาพ (เช่น ไฟล์ PDF) ให้อ่านเป็น Base64 ปกติ
      if (!file.type || !file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = () => resolve({
          name: file.name,
          type: file.type || "application/octet-stream",
          size: file.size,
          base64: reader.result
        });
        reader.onerror = err => reject(err);
        reader.readAsDataURL(file);
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          let width = img.width;
          let height = img.height;

          // คำนวณขนาดใหม่เพื่อรักษาสัดส่วน Aspect Ratio เดิม
          if (width > height) {
            if (width > maxWidth) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            }
          } else {
            if (height > maxHeight) {
              width = Math.round((width * maxHeight) / height);
              height = maxHeight;
            }
          }

          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext("2d");
          // พื้นหลังสีขาวเผื่อภาพ PNG มีความโปร่งใส
          ctx.fillStyle = "#FFFFFF";
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);

          // แปลงเป็น JPEG ที่บีบอัดแล้ว
          const compressedBase64 = canvas.toDataURL("image/jpeg", quality);
          const approxSize = Math.round((compressedBase64.length * 3) / 4);

          const safeName = file.name.replace(/\.[^/.]+$/, "") + ".jpg";

          resolve({
            name: safeName,
            type: "image/jpeg",
            size: approxSize,
            base64: compressedBase64
          });
        };
        img.onerror = () => {
          // หาก Image render ล้มเหลว ให้ fallback ใช้ออริจินัล
          resolve({
            name: file.name,
            type: file.type,
            size: file.size,
            base64: e.target.result
          });
        };
        img.src = e.target.result;
      };
      reader.onerror = err => reject(err);
      reader.readAsDataURL(file);
    });
  }
}

// Instance พร้อมใช้งาน
window.leaveAPI = new LeaveAPI();
