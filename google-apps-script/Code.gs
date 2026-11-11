/**
 * ===================================================================
 * Leave Management System - Google Apps Script Backend (API & Database)
 * ===================================================================
 * รองรับการทำงานร่วมกับ GitHub Pages Web App
 * - Sheet 1: Employees (รายชื่อพนักงาน, ตำแหน่ง, แผนก, โควตาวันลา)
 * - Sheet 2: LeaveRequests (คำขอลา, วันที่, ประเภท, ไฟล์แนบ, สถานะ)
 * - Sheet 3: Holidays (วันหยุดนักขัตฤกษ์ประจำปี)
 * - Sheet 4: Settings (การตั้งค่าทั่วไป)
 * - Google Drive: สร้างโฟลเดอร์ "Leave_Attachments" เก็บไฟล์แนบอัตโนมัติ
 * ===================================================================
 */

// ชื่อโฟลเดอร์สำหรับเก็บไฟล์แนบใน Google Drive
const ATTACHMENT_FOLDER_NAME = "Leave_Attachments";

/**
 * Handle GET Requests: ดึงข้อมูลพนักงาน, คำขอลา, วันหยุด, สถิติ
 */
function doGet(e) {
  try {
    const action = e.parameter.action || "getAllData";
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    initSheetsIfNeeded(ss);

    let result = {};

    switch (action) {
      case "getAllData":
        result = {
          success: true,
          employees: getEmployeesData(ss),
          leaveRequests: getLeaveRequestsData(ss),
          holidays: getHolidaysData(ss)
        };
        break;

      case "getEmployees":
        result = { success: true, data: getEmployeesData(ss) };
        break;

      case "getLeaveRequests":
        result = { success: true, data: getLeaveRequestsData(ss) };
        break;

      case "getHolidays":
        result = { success: true, data: getHolidaysData(ss) };
        break;

      case "ping":
        result = { success: true, message: "Leave Management API is active and ready." };
        break;

      default:
        result = { success: false, message: "Unknown action: " + action };
    }

    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Handle POST Requests: บันทึกคำขอลา, อัปเดตสถานะ, เพิ่มพนักงาน, จัดการวันหยุด, อัปโหลดไฟล์
 */
function doPost(e) {
  try {
    let postData = {};
    if (e.postData && e.postData.contents) {
      postData = JSON.parse(e.postData.contents);
    } else {
      postData = e.parameter;
    }

    const action = postData.action;
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    initSheetsIfNeeded(ss);

    let result = {};

    switch (action) {
      case "submitLeave":
        result = handleSubmitLeave(ss, postData.payload);
        break;

      case "updateLeaveStatus":
        result = handleUpdateLeaveStatus(ss, postData.payload);
        break;

      case "updateLeaveRequest":
        result = handleUpdateLeaveRequest(ss, postData.payload);
        break;

      case "deleteLeaveRequest":
        result = handleDeleteLeaveRequest(ss, postData.payload);
        break;

      case "saveEmployee":
        result = handleSaveEmployee(ss, postData.payload);
        break;

      case "deleteEmployee":
        result = handleDeleteEmployee(ss, postData.payload);
        break;

      case "saveHoliday":
        result = handleSaveHoliday(ss, postData.payload);
        break;

      case "deleteHoliday":
        result = handleDeleteHoliday(ss, postData.payload);
        break;

      case "clearAllHolidays":
        result = handleClearAllHolidays(ss);
        break;

      case "cleanDuplicateHolidays":
        result = handleCleanDuplicateHolidays(ss);
        break;

      case "syncDefaultHolidays":
        result = handleSyncDefaultHolidays(ss, postData.payload);
        break;

      default:
        result = { success: false, message: "Invalid action: " + action };
    }

    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * เริ่มต้นสร้าง Header ของแต่ละชีตอัตโนมัติหากยังไม่มี
 */
function initSheetsIfNeeded(ss) {
  // 1. Sheet: Employees
  let empSheet = ss.getSheetByName("Employees");
  if (!empSheet) {
    empSheet = ss.insertSheet("Employees");
    empSheet.appendRow([
      "emp_id", "name", "email", "department", "position", 
      "phone", "annual_leave_quota", "personal_leave_quota", "sick_leave_quota", 
      "other_leave_quota", "created_at"
    ]);
    empSheet.getRange(1, 1, 1, 11).setFontWeight("bold").setBackground("#EEF2F6");

    // เพิ่มข้อมูลตัวอย่างเริ่มต้น
    empSheet.appendRow(["EMP-001", "สมชาย ใจดี", "somchai@company.com", "ฝ่ายไอที", "Senior Developer", "081-234-5678", 10, 6, 30, 15, new Date().toISOString()]);
    empSheet.appendRow(["EMP-002", "กานดา สุขสม", "kanda@company.com", "ฝ่ายบุคคล (HR)", "HR Specialist", "082-345-6789", 12, 6, 30, 15, new Date().toISOString()]);
    empSheet.appendRow(["EMP-003", "วิชัย มั่งมี", "wichai@company.com", "ฝ่ายขายและการตลาด", "Sales Executive", "083-456-7890", 8, 6, 30, 15, new Date().toISOString()]);
  }

  // 2. Sheet: LeaveRequests
  let leaveSheet = ss.getSheetByName("LeaveRequests");
  if (!leaveSheet) {
    leaveSheet = ss.insertSheet("LeaveRequests");
    leaveSheet.appendRow([
      "request_id", "emp_id", "emp_name", "department", "leave_type", 
      "start_date", "end_date", "leave_duration_type", "total_days", 
      "reason", "attachments_json", "status", "approved_by", "rejection_reason", 
      "created_at", "updated_at"
    ]);
    leaveSheet.getRange(1, 1, 1, 16).setFontWeight("bold").setBackground("#EEF2F6");
  }

  // 3. Sheet: Holidays
  let holSheet = ss.getSheetByName("Holidays");
  if (!holSheet) {
    holSheet = ss.insertSheet("Holidays");
    holSheet.appendRow(["id", "holiday_date", "name", "year"]);
    holSheet.getRange(1, 1, 1, 4).setFontWeight("bold").setBackground("#EEF2F6");
    
    // ใส่วันหยุดนักขัตฤกษ์ไทยเริ่มต้น
    const currentYear = new Date().getFullYear();
    const defaultHols = [
      [`H-${currentYear}-01`, `${currentYear}-01-01`, "วันขึ้นปีใหม่", currentYear],
      [`H-${currentYear}-02`, `${currentYear}-02-26`, "วันมาฆบูชา", currentYear],
      [`H-${currentYear}-03`, `${currentYear}-04-06`, "วันพระบาทสมเด็จพระพุทธยอดฟ้าจุฬาโลกมหาราช (วันจักรี)", currentYear],
      [`H-${currentYear}-04`, `${currentYear}-04-13`, "วันสงกรานต์", currentYear],
      [`H-${currentYear}-05`, `${currentYear}-04-14`, "วันสงกรานต์", currentYear],
      [`H-${currentYear}-06`, `${currentYear}-04-15`, "วันสงกรานต์", currentYear],
      [`H-${currentYear}-07`, `${currentYear}-05-01`, "วันแรงงานแห่งชาติ", currentYear],
      [`H-${currentYear}-08`, `${currentYear}-05-04`, "วันฉัตรมงคล", currentYear],
      [`H-${currentYear}-09`, `${currentYear}-07-28`, "วันเฉลิมพระชนมพรรษาพระบาทสมเด็จพระวชิรเกล้าเจ้าอยู่หัว", currentYear],
      [`H-${currentYear}-10`, `${currentYear}-08-12`, "วันแม่แห่งชาติ", currentYear],
      [`H-${currentYear}-11`, `${currentYear}-10-13`, "วันนวมินทรมหาราช", currentYear],
      [`H-${currentYear}-12`, `${currentYear}-10-23`, "วันปิยมหาราช", currentYear],
      [`H-${currentYear}-13`, `${currentYear}-12-05`, "วันพ่อแห่งชาติ", currentYear],
      [`H-${currentYear}-14`, `${currentYear}-12-10`, "วันรัฐธรรมนูญ", currentYear],
      [`H-${currentYear}-15`, `${currentYear}-12-31`, "วันสิ้นปี", currentYear]
    ];
    defaultHols.forEach(h => holSheet.appendRow(h));
  }
}

/**
 * ดึงข้อมูลพนักงานทั้งหมด
 */
function getEmployeesData(ss) {
  const sheet = ss.getSheetByName("Employees");
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  const headers = data[0];
  const list = [];
  for (let i = 1; i < data.length; i++) {
    let row = data[i];
    let obj = {};
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = row[j];
    }
    list.push(obj);
  }
  return list;
}

/**
 * ดึงข้อมูลการลาทั้งหมด
 */
function getLeaveRequestsData(ss) {
  const sheet = ss.getSheetByName("LeaveRequests");
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  const headers = data[0];
  const list = [];
  for (let i = 1; i < data.length; i++) {
    let row = data[i];
    let obj = {};
    for (let j = 0; j < headers.length; j++) {
      let val = row[j];
      // Format วันที่เป็น string YYYY-MM-DD
      if (val instanceof Date) {
        val = Utilities.formatDate(val, Session.getScriptTimeZone(), "yyyy-MM-dd");
      }
      obj[headers[j]] = val;
    }
    // Parse attachments JSON
    if (obj.attachments_json && typeof obj.attachments_json === "string") {
      try {
        obj.attachments = JSON.parse(obj.attachments_json);
      } catch (e) {
        obj.attachments = [];
      }
    } else {
      obj.attachments = [];
    }
    list.push(obj);
  }
  return list;
}

/**
 * ดึงข้อมูลวันหยุด
 */
function getHolidaysData(ss) {
  const sheet = ss.getSheetByName("Holidays");
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  const headers = data[0];
  const list = [];
  for (let i = 1; i < data.length; i++) {
    let row = data[i];
    let obj = {};
    for (let j = 0; j < headers.length; j++) {
      let val = row[j];
      if (val instanceof Date) {
        val = Utilities.formatDate(val, Session.getScriptTimeZone(), "yyyy-MM-dd");
      } else if (typeof val === "string" && val.indexOf("T") > -1) {
        val = val.split("T")[0];
      }
      obj[headers[j]] = val;
    }
    list.push(obj);
  }
  return list;
}

/**
 * อัปโหลดไฟล์ Base64 ไปยัง Google Drive ในโฟลเดอร์ Leave_Attachments
 */
function uploadAttachmentsToDrive(attachments) {
  if (!attachments || !Array.isArray(attachments) || attachments.length === 0) {
    return [];
  }

  // ค้นหาหรือสร้างโฟลเดอร์สำหรับเก็บไฟล์แนบ
  let folder;
  const folders = DriveApp.getFoldersByName(ATTACHMENT_FOLDER_NAME);
  if (folders.hasNext()) {
    folder = folders.next();
  } else {
    folder = DriveApp.createFolder(ATTACHMENT_FOLDER_NAME);
    folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  }

  const uploadedFiles = [];
  for (let item of attachments) {
    // ถ้าไฟล์มี url อยู่แล้วไม่ต้องอัปโหลดซ้ำ
    if (item.url && !item.base64) {
      uploadedFiles.push(item);
      continue;
    }

    if (item.base64) {
      try {
        let contentType = item.type || "application/octet-stream";
        let rawBase64 = item.base64;
        if (rawBase64.indexOf(",") > -1) {
          rawBase64 = rawBase64.split(",")[1];
        }

        const decoded = Utilities.base64Decode(rawBase64);
        const timestamp = new Date().getTime();
        const safeName = `${timestamp}_${item.name || "attachment"}`;
        const blob = Utilities.newBlob(decoded, contentType, safeName);
        const file = folder.createFile(blob);
        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

        uploadedFiles.push({
          name: item.name || "File",
          type: item.type || contentType,
          size: item.size || 0,
          url: file.getUrl(),
          downloadUrl: file.getDownloadUrl(),
          id: file.getId()
        });
      } catch (err) {
        // หากไฟล์อัปโหลดไม่ได้ บันทึกชื่อและ error ไว้
        uploadedFiles.push({
          name: item.name,
          error: "Upload failed: " + err.message
        });
      }
    }
  }

  return uploadedFiles;
}

/**
 * บันทึกคำขอลาใหม่ (Submit Leave Request)
 */
function handleSubmitLeave(ss, payload) {
  const sheet = ss.getSheetByName("LeaveRequests");
  const requestId = "LV-" + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMdd-HHmmss");

  // อัปโหลดไฟล์แนบไปยัง Google Drive
  let uploadedAttachments = [];
  if (payload.attachments && payload.attachments.length > 0) {
    uploadedAttachments = uploadAttachmentsToDrive(payload.attachments);
  }

  const newRow = [
    requestId,
    payload.emp_id || "",
    payload.emp_name || "",
    payload.department || "",
    payload.leave_type || "annual",
    payload.start_date || "",
    payload.end_date || "",
    payload.leave_duration_type || "full", // full, morning, afternoon
    Number(payload.total_days || 1),
    payload.reason || "",
    JSON.stringify(uploadedAttachments),
    "Pending", // สถานะเริ่มต้น: Pending (รออนุมัติ)
    "", // approved_by
    "", // rejection_reason
    new Date().toISOString(),
    new Date().toISOString()
  ];

  sheet.appendRow(newRow);

  return {
    success: true,
    message: "บันทึกคำขอลาเรียบร้อยแล้ว",
    request_id: requestId,
    attachments: uploadedAttachments
  };
}

/**
 * อัปเดตสถานะการลา (อนุมัติ / ไม่อนุมัติ / ยกเลิก)
 */
function handleUpdateLeaveStatus(ss, payload) {
  const sheet = ss.getSheetByName("LeaveRequests");
  const data = sheet.getDataRange().getValues();
  const requestId = payload.request_id;
  const newStatus = payload.status; // 'Approved', 'Rejected', 'Cancelled'
  const approver = payload.approved_by || "Administrator";
  const rejectionReason = payload.rejection_reason || "";

  let foundRow = -1;
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === requestId) {
      foundRow = i + 1;
      break;
    }
  }

  if (foundRow === -1) {
    return { success: false, message: "ไม่พบรหัสคำขอนี้ในระบบ: " + requestId };
  }

  // Columns: 12: status, 13: approved_by, 14: rejection_reason, 16: updated_at
  sheet.getRange(foundRow, 12).setValue(newStatus);
  sheet.getRange(foundRow, 13).setValue(approver);
  sheet.getRange(foundRow, 14).setValue(rejectionReason);
  sheet.getRange(foundRow, 16).setValue(new Date().toISOString());

  return {
    success: true,
    message: `อัปเดตสถานะคำขอลา ${requestId} เป็น "${newStatus}" เรียบร้อยแล้ว`
  };
}

/**
 * แก้ไขข้อมูลคำขอลา (Edit Leave Request)
 */
function handleUpdateLeaveRequest(ss, payload) {
  const sheet = ss.getSheetByName("LeaveRequests");
  const data = sheet.getDataRange().getValues();
  const requestId = payload.request_id;

  let foundRow = -1;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(requestId).trim()) {
      foundRow = i + 1;
      break;
    }
  }

  if (foundRow === -1) {
    return { success: false, message: "ไม่พบรหัสคำขอนี้ในระบบ: " + requestId };
  }

  // Update specific fields:
  // 5: leave_type, 6: start_date, 7: end_date, 8: leave_duration_type, 9: total_days, 10: reason, 16: updated_at
  if (payload.leave_type) sheet.getRange(foundRow, 5).setValue(payload.leave_type);
  if (payload.start_date) sheet.getRange(foundRow, 6).setValue(payload.start_date);
  if (payload.end_date) sheet.getRange(foundRow, 7).setValue(payload.end_date);
  if (payload.leave_duration_type) sheet.getRange(foundRow, 8).setValue(payload.leave_duration_type);
  if (payload.total_days !== undefined) sheet.getRange(foundRow, 9).setValue(Number(payload.total_days));
  if (payload.reason) sheet.getRange(foundRow, 10).setValue(payload.reason);
  sheet.getRange(foundRow, 16).setValue(new Date().toISOString());

  return { success: true, message: "แก้ไขข้อมูลคำขอลาเรียบร้อยแล้ว" };
}

/**
 * ลบคำขอลา (Delete Leave Request)
 * รองรับการลบด้วย request_id หรือค้นหาสำรองด้วย emp_id + start_date
 */
function handleDeleteLeaveRequest(ss, payload) {
  const sheet = ss.getSheetByName("LeaveRequests");
  if (!sheet) return { success: false, message: "ไม่พบ Sheet 'LeaveRequests'" };

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return { success: false, message: "ไม่มีข้อมูลใน LeaveRequests" };

  const requestId = String(payload.request_id || "").trim();
  const empId = String(payload.emp_id || "").trim();
  const startDate = String(payload.start_date || "").trim();

  // 1. ค้นหาด้วย request_id ก่อน
  if (requestId) {
    for (let i = 1; i < data.length; i++) {
      const rowId = String(data[i][0] || "").trim();
      if (rowId === requestId || rowId.toLowerCase() === requestId.toLowerCase()) {
        sheet.deleteRow(i + 1);
        return { success: true, message: "ลบคำขอลาสำเร็จ (แถวที่ " + (i + 1) + ")" };
      }
    }
  }

  // 2. ถ้าไม่พบด้วย request_id ให้ค้นหาด้วย emp_id และ start_date (กรณี fallback)
  if (empId && startDate) {
    for (let i = 1; i < data.length; i++) {
      const rowEmpId = String(data[i][1] || "").trim();
      let rowStart = data[i][5];
      if (rowStart instanceof Date) {
        rowStart = Utilities.formatDate(rowStart, Session.getScriptTimeZone(), "yyyy-MM-dd");
      } else if (typeof rowStart === "string") {
        rowStart = rowStart.split("T")[0].trim();
      }

      if (rowEmpId === empId && String(rowStart).indexOf(startDate) > -1) {
        sheet.deleteRow(i + 1);
        return { success: true, message: "ลบคำขอลาสำเร็จ (ตรงกับพนักงาน " + empId + " วันที่ " + startDate + ")" };
      }
    }
  }

  return { success: false, message: "ไม่พบคำขอรหัส " + requestId + " ใน Google Sheet" };
}

/**
 * เพิ่มหรือแก้ไขข้อมูลพนักงาน (Save / Update Employee)
 */
function handleSaveEmployee(ss, payload) {
  const sheet = ss.getSheetByName("Employees");
  const data = sheet.getDataRange().getValues();
  const empId = payload.emp_id;

  let foundRow = -1;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(empId).trim()) {
      foundRow = i + 1;
      break;
    }
  }

  const rowValues = [
    payload.emp_id,
    payload.name || "",
    payload.email || "",
    payload.department || "",
    payload.position || "",
    payload.phone || "",
    Number(payload.annual_leave_quota || 0),
    Number(payload.personal_leave_quota || 0),
    Number(payload.sick_leave_quota || 0),
    Number(payload.other_leave_quota || 0),
    payload.created_at || new Date().toISOString()
  ];

  if (foundRow > -1) {
    // แก้ไขข้อมูลแถวเดิม
    sheet.getRange(foundRow, 1, 1, rowValues.length).setValues([rowValues]);
    return { success: true, message: "แก้ไขข้อมูลพนักงานเรียบร้อยแล้ว", emp_id: empId };
  } else {
    // เพิ่มพนักงานใหม่
    sheet.appendRow(rowValues);
    return { success: true, message: "เพิ่มพนักงานใหม่เรียบร้อยแล้ว", emp_id: empId };
  }
}

/**
 * ลบพนักงาน
 */
function handleDeleteEmployee(ss, payload) {
  const sheet = ss.getSheetByName("Employees");
  const data = sheet.getDataRange().getValues();
  const empId = payload.emp_id;

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(empId).trim()) {
      sheet.deleteRow(i + 1);
      return { success: true, message: `ลบพนักงาน ${empId} สำเร็จ` };
    }
  }

  return { success: false, message: "ไม่พบรหัสพนักงาน: " + empId };
}

/**
 * เพิ่ม/อัปเดตวันหยุดนักขัตฤกษ์
 */
function handleSaveHoliday(ss, payload) {
  const sheet = ss.getSheetByName("Holidays");
  const data = sheet.getDataRange().getValues();
  const holId = payload.id || ("H-" + new Date().getTime());

  let foundRow = -1;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(holId).trim()) {
      foundRow = i + 1;
      break;
    }
  }

  const rowValues = [
    holId,
    payload.holiday_date,
    payload.name,
    payload.year || new Date(payload.holiday_date).getFullYear()
  ];

  if (foundRow > -1) {
    sheet.getRange(foundRow, 1, 1, 4).setValues([rowValues]);
    return { success: true, message: "อัปเดตวันหยุดเรียบร้อย", id: holId };
  } else {
    sheet.appendRow(rowValues);
    return { success: true, message: "เพิ่มวันหยุดใหม่เรียบร้อย", id: holId };
  }
}

/**
 * ลบวันหยุด (รองรับการหาจาก ID หรือ วันที่ + ชื่อ)
 */
function handleDeleteHoliday(ss, payload) {
  const sheet = ss.getSheetByName("Holidays");
  const data = sheet.getDataRange().getValues();
  const holId = payload.id ? String(payload.id).trim() : "";
  const targetDate = payload.holiday_date ? String(payload.holiday_date).split("T")[0].trim() : "";
  const targetName = payload.name ? String(payload.name).trim() : "";

  for (let i = 1; i < data.length; i++) {
    const rowId = String(data[i][0]).trim();
    let rowDate = data[i][1];
    if (rowDate instanceof Date) {
      rowDate = Utilities.formatDate(rowDate, Session.getScriptTimeZone(), "yyyy-MM-dd");
    } else if (typeof rowDate === "string" && rowDate.indexOf("T") > -1) {
      rowDate = rowDate.split("T")[0];
    }
    rowDate = String(rowDate).trim();
    const rowName = String(data[i][2]).trim();

    if ((holId && rowId === holId) || (targetDate && targetName && rowDate === targetDate && rowName === targetName)) {
      sheet.deleteRow(i + 1);
      return { success: true, message: "ลบวันหยุดสำเร็จ" };
    }
  }

  return { success: false, message: "ไม่พบวันหยุดนี้ในระบบ" };
}

/**
 * ล้างวันหยุดทั้งหมด
 */
function handleClearAllHolidays(ss) {
  const sheet = ss.getSheetByName("Holidays");
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.deleteRows(2, lastRow - 1);
  }
  return { success: true, message: "ล้างวันหยุดทั้งหมดเรียบร้อย" };
}

/**
 * ลบวันหยุดที่ซ้ำซ้อนออก
 */
function handleCleanDuplicateHolidays(ss) {
  const sheet = ss.getSheetByName("Holidays");
  const data = sheet.getDataRange().getValues();
  if (data.length <= 2) return { success: true, message: "ไม่มีรายการซ้ำซ้อน" };

  const seen = {};
  const rowsToDelete = [];

  for (let i = 1; i < data.length; i++) {
    let rowDate = data[i][1];
    if (rowDate instanceof Date) {
      rowDate = Utilities.formatDate(rowDate, Session.getScriptTimeZone(), "yyyy-MM-dd");
    } else if (typeof rowDate === "string" && rowDate.indexOf("T") > -1) {
      rowDate = rowDate.split("T")[0];
    }
    const key = String(rowDate).trim() + "_" + String(data[i][2]).trim();

    if (seen[key]) {
      rowsToDelete.push(i + 1);
    } else {
      seen[key] = true;
    }
  }

  // ลบจากล่างขึ้นบน
  for (let k = rowsToDelete.length - 1; k >= 0; k--) {
    sheet.deleteRow(rowsToDelete[k]);
  }

  return { success: true, message: `ลบรายการซ้ำซ้อนออก ${rowsToDelete.length} รายการแล้ว` };
}

/**
 * ซิงค์ชุดวันหยุดมาตรฐานประจำปี (ลบของปีนั้นก่อนเพื่อป้องกันการซ้ำซ้อน)
 */
function handleSyncDefaultHolidays(ss, payload) {
  const sheet = ss.getSheetByName("Holidays");
  const year = Number(payload.year || new Date().getFullYear());
  const holidays = payload.holidays || [];

  // ลบวันหยุดของปีนั้นออกก่อน
  const data = sheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (Number(data[i][3]) === year) {
      sheet.deleteRow(i + 1);
    }
  }

  for (let h of holidays) {
    sheet.appendRow([
      "H-" + year + "-" + Utilities.getUuid().substring(0, 5),
      h.holiday_date,
      h.name,
      year
    ]);
  }

  return { success: true, message: `ซิงค์วันหยุดประจำปี ${year} สำเร็จ` };
}
