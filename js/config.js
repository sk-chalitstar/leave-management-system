/**
 * Leave Management System - Global Configuration & Seed Data
 */

const CONFIG = {
  APP_NAME: "LeaveFlow Pro",
  APP_TITLE: "ระบบจัดการบันทึกการลางานแบบครบวงจร",
  STORAGE_KEYS: {
    GAS_URL: "lms_gas_webapp_url",
    APP_MODE: "lms_mode", // 'live' or 'demo'
    EMPLOYEES: "lms_employees",
    LEAVE_REQUESTS: "lms_leave_requests",
    HOLIDAYS: "lms_holidays",
    DEPARTMENTS: "lms_departments",
    SETTINGS: "lms_settings"
  },
  
  // ประเภทการลาและสีประจำหมวดหมู่
  LEAVE_TYPES: {
    annual: {
      id: "annual",
      name: "ลาพักร้อน (Annual Leave)",
      color: "blue",
      badgeClass: "bg-blue-100 text-blue-800 border-blue-200",
      quotaField: "annual_leave_quota",
      defaultQuota: 10,
      description: "ใช้วันพักผ่อนประจำปี"
    },
    personal: {
      id: "personal",
      name: "ลากิจ (Personal Leave)",
      color: "purple",
      badgeClass: "bg-purple-100 text-purple-800 border-purple-200",
      quotaField: "personal_leave_quota",
      defaultQuota: 6,
      description: "ลาเพื่อทำธุระจำเป็นส่วนตัว"
    },
    sick: {
      id: "sick",
      name: "ลาป่วย (Sick Leave)",
      color: "rose",
      badgeClass: "bg-rose-100 text-rose-800 border-rose-200",
      quotaField: "sick_leave_quota",
      defaultQuota: 30,
      description: "ลาเจ็บป่วยตามจริง (เกิน 3 วันต้องมีใบรับรองแพทย์)"
    },
    maternity: {
      id: "maternity",
      name: "ลาคลอดบุตร (Maternity Leave)",
      color: "pink",
      badgeClass: "bg-pink-100 text-pink-800 border-pink-200",
      quotaField: "other_leave_quota",
      defaultQuota: 98,
      description: "ลาเพื่อคลอดบุตรตามกฎหมายแรงงาน"
    },
    ordination: {
      id: "ordination",
      name: "ลาอุปสมบท / พิธีทางศาสนา (Religious Leave)",
      color: "amber",
      badgeClass: "bg-amber-100 text-amber-800 border-amber-200",
      quotaField: "other_leave_quota",
      defaultQuota: 15,
      description: "ลาเพื่ออุปสมบทหรือประกอบพิธีกรรมทางศาสนา"
    },
    other: {
      id: "other",
      name: "ลาอื่นๆ (Other Leave)",
      color: "gray",
      badgeClass: "bg-gray-100 text-gray-800 border-gray-200",
      quotaField: "other_leave_quota",
      defaultQuota: 10,
      description: "ลาฝึกอบรม, ลารับราชการทหาร, ฯลฯ"
    }
  },

  // แผนกในองค์กร (สามารถเพิ่ม/แก้ไข/ลบเองได้ในระบบ)
  DEPARTMENTS: [
    "ฝ่ายบริหารจัดการ (Management)",
    "ฝ่ายบุคคลและธุรการ (HR & Administration)",
    "ฝ่ายเทคโนโลยีสารสนเทศ (IT & Software Development)",
    "ฝ่ายบัญชีและการเงิน (Accounting & Finance)",
    "ฝ่ายขายและการตลาด (Sales & Marketing)",
    "ฝ่ายบริการลูกค้า (Customer Service & Support)",
    "ฝ่ายปฏิบัติการ (Operations)",
    "ฝ่ายคลังสินค้าและโลจิสติกส์ (Warehouse & Logistics)",
    "ฝ่ายจัดซื้อและพัสดุ (Procurement & Purchasing)",
    "ฝ่ายผลิตและโรงงาน (Production & Manufacturing)",
    "ฝ่ายควบคุมคุณภาพ (Quality Assurance - QA/QC)",
    "ฝ่ายซ่อมบำรุงและวิศวกรรม (Engineering & Maintenance)",
    "ฝ่ายกฎหมายและกำกับดูแล (Legal & Compliance)",
    "ฝ่ายออกแบบและสื่อสารองค์กร (Design & Corporate Communications)",
    "ฝ่ายความปลอดภัยและชีวอนามัย (Safety & Environment)"
  ],

  // วันหยุดนักขัตฤกษ์ไทยเริ่มต้นประจำปี
  DEFAULT_HOLIDAYS_GENERATOR: (year) => [
    { id: `H-${year}-01`, holiday_date: `${year}-01-01`, name: "วันขึ้นปีใหม่", year: year },
    { id: `H-${year}-02`, holiday_date: `${year}-02-26`, name: "วันมาฆบูชา", year: year },
    { id: `H-${year}-03`, holiday_date: `${year}-04-06`, name: "วันพระบาทสมเด็จพระพุทธยอดฟ้าจุฬาโลกมหาราช (วันจักรี)", year: year },
    { id: `H-${year}-04`, holiday_date: `${year}-04-13`, name: "วันสงกรานต์", year: year },
    { id: `H-${year}-05`, holiday_date: `${year}-04-14`, name: "วันสงกรานต์", year: year },
    { id: `H-${year}-06`, holiday_date: `${year}-04-15`, name: "วันสงกรานต์", year: year },
    { id: `H-${year}-07`, holiday_date: `${year}-05-01`, name: "วันแรงงานแห่งชาติ", year: year },
    { id: `H-${year}-08`, holiday_date: `${year}-05-04`, name: "วันฉัตรมงคล", year: year },
    { id: `H-${year}-09`, holiday_date: `${year}-06-03`, name: "วันเฉลิมพระชนมพรรษาสมเด็จพระนางเจ้าฯ พระบรมราชินี", year: year },
    { id: `H-${year}-10`, holiday_date: `${year}-07-28`, name: "วันเฉลิมพระชนมพรรษาพระบาทสมเด็จพระวชิรเกล้าเจ้าอยู่หัว", year: year },
    { id: `H-${year}-11`, holiday_date: `${year}-08-12`, name: "วันแม่แห่งชาติ (วันเฉลิมพระชนมพรรษาสมเด็จพระพันปีหลวง)", year: year },
    { id: `H-${year}-12`, holiday_date: `${year}-10-13`, name: "วันนวมินทรมหาราช", year: year },
    { id: `H-${year}-13`, holiday_date: `${year}-10-23`, name: "วันปิยมหาราช", year: year },
    { id: `H-${year}-14`, holiday_date: `${year}-12-05`, name: "วันพ่อแห่งชาติ (วันชาติ)", year: year },
    { id: `H-${year}-15`, holiday_date: `${year}-12-10`, name: "วันรัฐธรรมนูญ", year: year },
    { id: `H-${year}-16`, holiday_date: `${year}-12-31`, name: "วันสิ้นปี", year: year }
  ],

  // ข้อมูลตัวอย่างเริ่มต้น (Initial Mock Data สำหรับใช้งานทันทีแบบไม่ต้องรอผูก Sheet)
  INITIAL_DATA: {
    employees: [
      {
        emp_id: "EMP-001",
        name: "สมชาย ใจดี",
        email: "somchai@company.com",
        department: "ฝ่ายไอทีและพัฒนาระบบ (IT & Software)",
        position: "Senior Fullstack Developer",
        phone: "081-234-5678",
        annual_leave_quota: 10,
        personal_leave_quota: 6,
        sick_leave_quota: 30,
        other_leave_quota: 15,
        rest_days: [0, 6],
        created_at: "2024-01-15T08:00:00Z"
      },
      {
        emp_id: "EMP-002",
        name: "กานดา สุขสม",
        email: "kanda@company.com",
        department: "ฝ่ายบุคคล (HR)",
        position: "HR & Talent Specialist",
        phone: "082-345-6789",
        annual_leave_quota: 12,
        personal_leave_quota: 6,
        sick_leave_quota: 30,
        other_leave_quota: 15,
        rest_days: [0, 6],
        created_at: "2024-02-01T08:00:00Z"
      },
      {
        emp_id: "EMP-003",
        name: "วิชัย มั่งมี",
        email: "wichai@company.com",
        department: "ฝ่ายขายและการตลาด (Sales & Marketing)",
        position: "Senior Sales Executive",
        phone: "083-456-7890",
        annual_leave_quota: 10,
        personal_leave_quota: 6,
        sick_leave_quota: 30,
        other_leave_quota: 15,
        rest_days: [0, 6],
        created_at: "2024-03-10T08:00:00Z"
      },
      {
        emp_id: "EMP-004",
        name: "พิมพา เจริญสุข",
        email: "pimpa@company.com",
        department: "ฝ่ายบัญชีและการเงิน (Finance & Accounting)",
        position: "Accounting Manager",
        phone: "084-567-8901",
        annual_leave_quota: 14,
        personal_leave_quota: 6,
        sick_leave_quota: 30,
        other_leave_quota: 15,
        rest_days: [0, 6],
        created_at: "2023-11-01T08:00:00Z"
      },
      {
        emp_id: "EMP-005",
        name: "ณัฐพล พัฒนกิจ",
        email: "nattapon@company.com",
        department: "ฝ่ายปฏิบัติการ (Operations)",
        position: "Operations Supervisor",
        phone: "085-678-9012",
        annual_leave_quota: 8,
        personal_leave_quota: 6,
        sick_leave_quota: 30,
        other_leave_quota: 15,
        rest_days: [0, 6],
        created_at: "2024-04-20T08:00:00Z"
      }
    ],

    leaveRequests: [
      {
        request_id: "LV-20261101-001",
        emp_id: "EMP-001",
        emp_name: "สมชาย ใจดี",
        department: "ฝ่ายไอทีและพัฒนาระบบ (IT & Software)",
        leave_type: "annual",
        start_date: "2026-11-16",
        end_date: "2026-11-17",
        leave_duration_type: "full",
        total_days: 2,
        reason: "ไปพักผ่อนต่างจังหวัดกับครอบครัว",
        attachments: [
          { name: "ใบจองที่พัก.pdf", type: "application/pdf", size: 145000, url: "#" }
        ],
        status: "Approved",
        approved_by: "HR Manager",
        rejection_reason: "",
        created_at: "2026-11-05T09:30:00Z",
        updated_at: "2026-11-06T10:15:00Z"
      },
      {
        request_id: "LV-20261102-002",
        emp_id: "EMP-003",
        emp_name: "วิชัย มั่งมี",
        department: "ฝ่ายขายและการตลาด (Sales & Marketing)",
        leave_type: "sick",
        start_date: "2026-11-08",
        end_date: "2026-11-08",
        leave_duration_type: "full",
        total_days: 1,
        reason: "มีไข้หวัด ปวดศีรษะ ไปพบแพทย์ที่คลินิก",
        attachments: [
          { name: "medical_cert_01.jpg", type: "image/jpeg", size: 284000, url: "https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?auto=format&fit=crop&w=600&q=80" }
        ],
        status: "Approved",
        approved_by: "HR Manager",
        rejection_reason: "",
        created_at: "2026-11-08T07:45:00Z",
        updated_at: "2026-11-08T11:00:00Z"
      },
      {
        request_id: "LV-20261103-003",
        emp_id: "EMP-002",
        emp_name: "กานดา สุขสม",
        department: "ฝ่ายบุคคล (HR)",
        leave_type: "personal",
        start_date: "2026-11-20",
        end_date: "2026-11-20",
        leave_duration_type: "morning",
        total_days: 0.5,
        reason: "ติดต่อทำธุรกรรมที่กรมการกงสุล",
        attachments: [],
        status: "Pending",
        approved_by: "",
        rejection_reason: "",
        created_at: "2026-11-10T14:20:00Z",
        updated_at: "2026-11-10T14:20:00Z"
      }
    ]
  }
};
