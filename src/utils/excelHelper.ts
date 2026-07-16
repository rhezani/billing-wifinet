import * as XLSX from 'xlsx';
import { Customer } from '../types';

export function getCurrentIndonesianMonth(): string {
  const months = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember"
  ];
  // Check if current date is inside July 2026 as per user system local time, otherwise dynamic.
  // We can default to "Juli 2026" if it's 2026, or use current system month.
  const now = new Date();
  const monthName = months[now.getMonth()];
  const year = now.getFullYear();
  return `${monthName} ${year}`;
}

export const DEFAULT_CUSTOMERS: Customer[] = [
  { id: "PEL001", nama: "Budi Santoso", alamat: "Jl. Merdeka No. 10", tagihan: 150000, status: "Belum Lunas", bulan: "Juli 2026" },
  { id: "PEL002", nama: "Siti Aminah", alamat: "Jl. Mawar Gg. 3", tagihan: 200000, status: "Lunas", bulan: "Juli 2026" },
  { id: "PEL003", nama: "Ahmad Fauzi", alamat: "Jl. Sudirman Kav. 5", tagihan: 125000, status: "Belum Lunas", bulan: "Juni 2026" },
  { id: "PEL004", nama: "Dewi Lestari", alamat: "Griya Asri Blok C", tagihan: 180000, status: "Lunas", bulan: "Juni 2026" },
  { id: "PEL005", nama: "Rian Hidayat", alamat: "Jl. Melati No. 12", tagihan: 150000, status: "Lunas", bulan: "Mei 2026" },
  { id: "PEL006", nama: "Eka Saputra", alamat: "Komp. Hijau Permai B3", tagihan: 175000, status: "Lunas", bulan: "Mei 2026" },
  { id: "PEL007", nama: "Farhan Malik", alamat: "Jl. Kenanga No. 8", tagihan: 150000, status: "Belum Lunas", bulan: "Juli 2026" },
  { id: "PEL008", nama: "Sari Wijaya", alamat: "Gg. Kelinci II", tagihan: 150000, status: "Lunas", bulan: "Juli 2026" },
  { id: "PEL009", nama: "Hendra Wijaya", alamat: "Jl. Pahlawan Blok F", tagihan: 200000, status: "Lunas", bulan: "Juni 2026" }
];

export const STORAGE_KEY = "billing_wifi_customers";

// Load from localStorage or return default
export function loadCustomers(): Customer[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Enforce month field existence for retrofitting old stored databases
        const migrated = parsed.map(c => ({
          ...c,
          bulan: c.bulan || "Juli 2026"
        }));
        return migrated;
      }
    }
  } catch (error) {
    console.error("Failed to load customers from storage:", error);
  }
  // Initialize with seed data
  saveCustomers(DEFAULT_CUSTOMERS);
  return DEFAULT_CUSTOMERS;
}

// Save to localStorage
export function saveCustomers(customers: Customer[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(customers));
  } catch (error) {
    console.error("Failed to save customers to storage:", error);
  }
}

// Map from application model to Excel Row
interface ExcelRow {
  "Nama": string;
  "Alamat": string;
  "Tagihan": number;
  "Status": string;
  "ID Pelanggan": string;
  "Bulan": string;
}

// Convert Application Customers to Excel worksheet and download
export function exportToExcel(customers: Customer[], filename: string): void {
  const data: ExcelRow[] = customers.map(c => ({
    "Nama": c.nama,
    "Alamat": c.alamat,
    "Tagihan": c.tagihan,
    "Status": c.status,
    "ID Pelanggan": c.id,
    "Bulan": c.bulan || getCurrentIndonesianMonth()
  }));

  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Billing");
  
  // Auto-fit columns roughly
  const maxProps = ["Nama", "Alamat", "Tagihan", "Status", "ID Pelanggan", "Bulan"];
  const cols = maxProps.map(key => {
    let maxLen = key.length;
    data.forEach(row => {
      const val = row[key as keyof ExcelRow];
      if (val !== undefined && val !== null) {
        maxLen = Math.max(maxLen, String(val).length);
      }
    });
    return { wch: maxLen + 3 };
  });
  worksheet['!cols'] = cols;

  XLSX.writeFile(workbook, filename);
}

// Parse uploaded Excel file to Customer array
export async function parseExcelFile(file: File): Promise<Customer[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        
        if (workbook.SheetNames.length === 0) {
          throw new Error("File Excel tidak memiliki sheet.");
        }
        
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const rows = XLSX.utils.sheet_to_json<any>(worksheet);

        if (rows.length === 0) {
          throw new Error("File Excel kosong atau tidak terbaca.");
        }

        // Verify required columns
        const requiredColumns = ["Nama", "Alamat", "Tagihan", "Status", "ID Pelanggan"];
        const headers = Object.keys(rows[0]);
        const missing = requiredColumns.filter(col => !headers.includes(col));

        if (missing.length > 0) {
          throw new Error(`Kolom wajib tidak lengkap. Kurang kolom: ${missing.join(', ')}`);
        }

        // Map rows to Customer objects
        const parsedCustomers: Customer[] = rows.map((row, index) => {
          let tagihanNum = Number(row["Tagihan"]);
          if (isNaN(tagihanNum)) {
            tagihanNum = 0;
          }

          let statusVal: "Lunas" | "Belum Lunas" = "Belum Lunas";
          const rowStatus = String(row["Status"]).trim().toLowerCase();
          if (rowStatus === "lunas" || rowStatus === "sudah lunas" || rowStatus === "paid") {
            statusVal = "Lunas";
          }

          return {
            id: String(row["ID Pelanggan"] || `PEL${String(index + 1).padStart(3, '0')}`).trim(),
            nama: String(row["Nama"] || "Tanpa Nama").trim(),
            alamat: String(row["Alamat"] || "Tanpa Alamat").trim(),
            tagihan: tagihanNum,
            status: statusVal,
            bulan: row["Bulan"] ? String(row["Bulan"]).trim() : getCurrentIndonesianMonth()
          };
        });

        resolve(parsedCustomers);
      } catch (err) {
        reject(err);
      }
    };
    
    reader.onerror = () => {
      reject(new Error("Gagal membaca file."));
    };

    reader.readAsArrayBuffer(file);
  });
}
