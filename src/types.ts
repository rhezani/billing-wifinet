export interface Customer {
  id: string; // "ID Pelanggan" e.g., PEL001
  nama: string; // "Nama"
  alamat: string; // "Alamat"
  tagihan: number; // "Tagihan"
  status: "Lunas" | "Belum Lunas"; // "Status"
  bulan: string; // "Bulan Tagihan" e.g., "Juli 2026"
}

export type MenuType = "📊 Dashboard" | "⏳ Belum Lunas" | "🗓️ Riwayat" | "📥 Export" | "📤 Import";

export interface DashboardStats {
  totalCustomers: number;
  unpaidCount: number;
  unpaidAmount: number;
  paidCount: number;
  paidAmount: number;
}
