import React, { useState, useEffect, useRef } from 'react';
import { 
  Wifi, 
  Search, 
  Plus, 
  Trash2, 
  Edit3, 
  Download, 
  UploadCloud, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  Users, 
  Check, 
  X,
  Info,
  DollarSign
} from 'lucide-react';
import { Customer, MenuType, DashboardStats } from './types';
import { 
  loadCustomers, 
  saveCustomers, 
  exportToExcel, 
  parseExcelFile, 
  DEFAULT_CUSTOMERS,
  getCurrentIndonesianMonth
} from './utils/excelHelper';
import { User } from 'firebase/auth';
import { 
  initAuth, 
  googleSignIn, 
  logout, 
  getOrCreateBackupFolder, 
  uploadBackupFile, 
  listBackupFiles, 
  downloadBackupFile, 
  deleteBackupFileFromDrive, 
  exportToGoogleSheets 
} from './utils/googleDriveHelper';

export default function App() {
  // Application State
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [activeTab, setActiveTab] = useState<MenuType>("📊 Dashboard");
  
  // Search & Filters
  const [searchDashboard, setSearchDashboard] = useState("");
  const [searchBelumLunas, setSearchBelumLunas] = useState("");
  const [selectedMonth, setSelectedMonth] = useState<string>("Semua Bulan");
  
  // "Belum Lunas" working state (for local modifications before saving)
  const [workingBelumLunas, setWorkingBelumLunas] = useState<Customer[]>([]);
  
  // Custom Toast Notification State
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);
  
  // Customer Add/Edit Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formAddress, setFormAddress] = useState("");
  const [formBill, setFormBill] = useState(150000);
  const [formStatus, setFormStatus] = useState<"Lunas" | "Belum Lunas">("Belum Lunas");
  const [formId, setFormId] = useState("");
  const [formMonth, setFormMonth] = useState("");

  // Export State
  const [exportCategory, setExportCategory] = useState<string>("Semua Data Pelanggan");

  // Import State
  const [importedPreview, setImportedPreview] = useState<Customer[] | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Monthly History View State
  const [inspectedMonth, setInspectedMonth] = useState<string | null>(null);
  const [searchHistory, setSearchHistory] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Google Drive State
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isGoogleDriveLoading, setIsGoogleDriveLoading] = useState(false);
  const [backupFolderId, setBackupFolderId] = useState<string | null>(null);
  const [driveBackups, setDriveBackups] = useState<any[]>([]);
  const [isFetchingBackups, setIsFetchingBackups] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isDeletingBackup, setIsDeletingBackup] = useState(false);
  const [isExportingSheet, setIsExportingSheet] = useState(false);
  const [createdSheetInfo, setCreatedSheetInfo] = useState<{ name: string; url: string } | null>(null);

  // Fetch backups list helper
  const fetchBackups = async (tokenToUse?: string) => {
    const tok = tokenToUse || accessToken;
    if (!tok) return;
    setIsFetchingBackups(true);
    try {
      const folderId = await getOrCreateBackupFolder(tok);
      setBackupFolderId(folderId);
      const files = await listBackupFiles(tok, folderId);
      setDriveBackups(files);
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsFetchingBackups(false);
    }
  };

  // Google Auth initialization
  useEffect(() => {
    const unsubscribe = initAuth(
      (currentUser, token) => {
        setUser(currentUser);
        setAccessToken(token);
        fetchBackups(token);
      },
      () => {
        setUser(null);
        setAccessToken(null);
      }
    );
    return () => unsubscribe();
  }, []);

  const handleGoogleSignIn = async () => {
    setIsGoogleDriveLoading(true);
    try {
      const result = await googleSignIn();
      if (result) {
        setUser(result.user);
        setAccessToken(result.accessToken);
        showToast(`Berhasil masuk sebagai ${result.user.displayName}!`, "success");
        fetchBackups(result.accessToken);
      }
    } catch (err: any) {
      showToast("Gagal Login Google: " + err.message, "error");
    } finally {
      setIsGoogleDriveLoading(false);
    }
  };

  const handleGoogleSignOut = async () => {
    try {
      await logout();
      setUser(null);
      setAccessToken(null);
      setDriveBackups([]);
      setBackupFolderId(null);
      showToast("Berhasil keluar dari akun Google.", "info");
    } catch (err: any) {
      showToast("Gagal keluar dari Google: " + err.message, "error");
    }
  };

  const handleBackupToDrive = async () => {
    if (!accessToken) return;
    setIsBackingUp(true);
    try {
      const folderId = backupFolderId || await getOrCreateBackupFolder(accessToken);
      if (!backupFolderId) setBackupFolderId(folderId);
      
      const timestamp = new Date().toISOString().replace(/T/, "_").replace(/\..+/, "").replace(/:/g, "-");
      const fileName = `WiFi_Billing_Backup_${timestamp}.json`;
      
      await uploadBackupFile(accessToken, folderId, fileName, customers);
      showToast("Berhasil mencadangkan data ke Google Drive!", "success");
      fetchBackups(accessToken);
    } catch (err: any) {
      showToast("Gagal mencadangkan ke Google Drive: " + err.message, "error");
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleRestoreFromDrive = async (fileId: string, fileName: string) => {
    const isConfirmed = window.confirm(
      `PULIHKAN CADANGAN?\n\nApakah Anda yakin ingin memulihkan data dari backup "${fileName}"?\n\nPERINGATAN: Tindakan ini akan sepenuhnya menimpa seluruh data pelanggan yang saat ini ada di aplikasi.`
    );
    if (!isConfirmed) return;
    
    setIsRestoring(true);
    try {
      const backupData = await downloadBackupFile(accessToken!, fileId);
      if (Array.isArray(backupData)) {
        updateCustomersDatabase(backupData);
        showToast(`Berhasil memulihkan ${backupData.length} data pelanggan!`, "success");
      } else {
        throw new Error("Format file cadangan tidak valid.");
      }
    } catch (err: any) {
      showToast("Gagal memulihkan cadangan: " + err.message, "error");
    } finally {
      setIsRestoring(false);
    }
  };

  const handleDeleteBackup = async (fileId: string, fileName: string) => {
    const isConfirmed = window.confirm(
      `HAPUS CADANGAN?\n\nApakah Anda yakin ingin menghapus file backup "${fileName}" dari Google Drive secara permanen?`
    );
    if (!isConfirmed) return;
    
    setIsDeletingBackup(true);
    try {
      await deleteBackupFileFromDrive(accessToken!, fileId);
      showToast("File backup berhasil dihapus dari Google Drive.", "success");
      fetchBackups(accessToken!);
    } catch (err: any) {
      showToast("Gagal menghapus file backup: " + err.message, "error");
    } finally {
      setIsDeletingBackup(false);
    }
  };

  const handleExportToSheets = async () => {
    if (!accessToken) return;
    setIsExportingSheet(true);
    setCreatedSheetInfo(null);
    try {
      const timestamp = new Date().toLocaleDateString("id-ID", {
        day: "numeric",
        month: "long",
        year: "numeric"
      });
      const title = `Laporan Billing WiFi - Ekspor ${timestamp}`;
      const result = await exportToGoogleSheets(accessToken, title, customers);
      setCreatedSheetInfo({ name: title, url: result.spreadsheetUrl });
      showToast("Berhasil mengekspor data ke Google Sheets!", "success");
    } catch (err: any) {
      showToast("Gagal ekspor ke Google Sheets: " + err.message, "error");
    } finally {
      setIsExportingSheet(false);
    }
  };

  // Initialize Data
  useEffect(() => {
    const loaded = loadCustomers();
    setCustomers(loaded);
  }, []);

  // Sync working unpaid state whenever unpaid list or active tab changes to unpaid
  useEffect(() => {
    if (activeTab === "⏳ Belum Lunas") {
      const unpaid = customers.filter(c => c.status === "Belum Lunas");
      setWorkingBelumLunas(JSON.parse(JSON.stringify(unpaid)));
    }
  }, [activeTab, customers]);

  // Show a custom notification toast
  const showToast = (message: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 4000);
  };

  // Save updated customers list and sync
  const updateCustomersDatabase = (newList: Customer[]) => {
    setCustomers(newList);
    saveCustomers(newList);
  };

  // Calculate statistics (respects selected month)
  const getStats = (): DashboardStats => {
    const monthFiltered = selectedMonth === "Semua Bulan" 
      ? customers 
      : customers.filter(c => c.bulan === selectedMonth);

    const totalCustomers = monthFiltered.length;
    const unpaidList = monthFiltered.filter(c => c.status === "Belum Lunas");
    const paidList = monthFiltered.filter(c => c.status === "Lunas");
    
    return {
      totalCustomers,
      unpaidCount: unpaidList.length,
      unpaidAmount: unpaidList.reduce((sum, c) => sum + c.tagihan, 0),
      paidCount: paidList.length,
      paidAmount: paidList.reduce((sum, c) => sum + c.tagihan, 0)
    };
  };

  const stats = getStats();

  // Dynamic months extraction
  const getAvailableMonths = () => {
    const months = Array.from(new Set(customers.map(c => c.bulan).filter(Boolean))) as string[];
    const monthsOrder = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
    return [...months].sort((a, b) => {
      const [aMonth, aYear] = a.split(" ");
      const [bMonth, bYear] = b.split(" ");
      if (aYear !== bYear) return Number(bYear) - Number(aYear); // newer year first
      return monthsOrder.indexOf(bMonth) - monthsOrder.indexOf(aMonth); // newer month first
    });
  };

  const availableMonths = getAvailableMonths();

  // Compute monthly trends
  const getMonthlyTrends = () => {
    const months = Array.from(new Set(customers.map(c => c.bulan).filter(Boolean))) as string[];
    const monthsOrder = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
    const sortedMonthsForTrend = [...months].sort((a, b) => {
      const [aMonth, aYear] = a.split(" ");
      const [bMonth, bYear] = b.split(" ");
      if (aYear !== bYear) return Number(aYear) - Number(bYear); // older year first
      return monthsOrder.indexOf(aMonth) - monthsOrder.indexOf(bMonth); // older month first
    });

    return sortedMonthsForTrend.map(month => {
      const monthRecords = customers.filter(c => c.bulan === month);
      const paid = monthRecords.filter(c => c.status === "Lunas").reduce((sum, c) => sum + c.tagihan, 0);
      const unpaid = monthRecords.filter(c => c.status === "Belum Lunas").reduce((sum, c) => sum + c.tagihan, 0);
      const total = paid + unpaid;
      return {
        month,
        paid,
        unpaid,
        total
      };
    });
  };

  const monthlyTrends = getMonthlyTrends();

  // Reset database back to default
  const handleResetDatabase = () => {
    if (window.confirm("Apakah Anda yakin ingin menyetel ulang seluruh data pelanggan ke setelan awal?")) {
      updateCustomersDatabase(DEFAULT_CUSTOMERS);
      showToast("Database berhasil direset ke setelan awal!", "info");
    }
  };

  // Open modal for Adding Customer
  const openAddModal = () => {
    setModalMode('add');
    setEditingCustomerId(null);
    // Generate a fresh PEL ID
    const maxNum = customers.reduce((max, c) => {
      const match = c.id.match(/PEL(\d+)/);
      if (match) {
        const num = parseInt(match[1], 10);
        return num > max ? num : max;
      }
      return max;
    }, 0);
    const nextId = `PEL${String(maxNum + 1).padStart(3, '0')}`;
    
    setFormId(nextId);
    setFormName("");
    setFormAddress("");
    setFormBill(150000);
    setFormStatus("Belum Lunas");
    setFormMonth(getCurrentIndonesianMonth());
    setIsModalOpen(true);
  };

  // Open modal for Editing Customer
  const openEditModal = (customer: Customer) => {
    setModalMode('edit');
    setEditingCustomerId(customer.id);
    setFormId(customer.id);
    setFormName(customer.nama);
    setFormAddress(customer.alamat);
    setFormBill(customer.tagihan);
    setFormStatus(customer.status);
    setFormMonth(customer.bulan || getCurrentIndonesianMonth());
    setIsModalOpen(true);
  };

  // Handle Save / Submit Customer (Add or Edit)
  const handleSaveCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formAddress.trim() || !formId.trim() || !formMonth.trim()) {
      showToast("Harap isi semua kolom wajib!", "error");
      return;
    }

    if (modalMode === 'add') {
      // Check if ID already exists
      if (customers.some(c => c.id.toUpperCase() === formId.toUpperCase())) {
        showToast(`ID Pelanggan ${formId} sudah terdaftar!`, "error");
        return;
      }

      const newCustomer: Customer = {
        id: formId.trim().toUpperCase(),
        nama: formName.trim(),
        alamat: formAddress.trim(),
        tagihan: formBill,
        status: formStatus,
        bulan: formMonth.trim()
      };

      const updated = [...customers, newCustomer];
      updateCustomersDatabase(updated);
      showToast("Pelanggan baru berhasil ditambahkan! 👤", "success");
    } else {
      // Editing Mode
      const updated = customers.map(c => {
        if (c.id === editingCustomerId) {
          return {
            ...c,
            nama: formName.trim(),
            alamat: formAddress.trim(),
            tagihan: formBill,
            status: formStatus,
            bulan: formMonth.trim()
          };
        }
        return c;
      });
      updateCustomersDatabase(updated);
      showToast("Data pelanggan berhasil diperbarui!", "success");
    }

    setIsModalOpen(false);
  };

  // Delete Customer
  const handleDeleteCustomer = (id: string, name: string) => {
    if (window.confirm(`Apakah Anda yakin ingin menghapus pelanggan ${name} (${id})?`)) {
      const updated = customers.filter(c => c.id !== id);
      updateCustomersDatabase(updated);
      showToast(`Pelanggan ${name} telah dihapus.`, "info");
    }
  };

  // Toggle status directly (for custom views like dynamic monthly view or history list)
  const handleToggleCustomerStatusDirect = (id: string) => {
    const updated = customers.map(c => {
      if (c.id === id) {
        const nextStatus: "Lunas" | "Belum Lunas" = c.status === "Lunas" ? "Belum Lunas" : "Lunas";
        showToast(`Status ${c.nama} diubah menjadi ${nextStatus}!`, "success");
        return { ...c, status: nextStatus };
      }
      return c;
    });
    updateCustomersDatabase(updated);
  };

  // Toggle paid status in working state ("Belum Lunas" tab)
  const toggleWorkingStatus = (id: string, newStatus: "Lunas" | "Belum Lunas") => {
    setWorkingBelumLunas(prev => 
      prev.map(item => item.id === id ? { ...item, status: newStatus } : item)
    );
  };

  // Save Payment changes ("Belum Lunas" tab)
  const handleSavePayments = () => {
    // Create map of ID to new status
    const statusMap = new Map<string, "Lunas" | "Belum Lunas">();
    workingBelumLunas.forEach(item => {
      statusMap.set(item.id, item.status);
    });

    // Update main database
    let changedCount = 0;
    const updated = customers.map(c => {
      if (statusMap.has(c.id)) {
        const newStatus = statusMap.get(c.id)!;
        if (c.status !== newStatus) {
          changedCount++;
          return { ...c, status: newStatus };
        }
      }
      return c;
    });

    if (changedCount > 0) {
      updateCustomersDatabase(updated);
      showToast(`Berhasil memperbarui ${changedCount} status pembayaran! ✨`, "success");
    } else {
      showToast("Tidak ada perubahan status pembayaran untuk disimpan.", "info");
    }
  };

  // Export to Excel trigger
  const handleExport = () => {
    let listToExport = [...customers];
    let fileSuffix = "Semua";

    if (exportCategory === "Hanya Data Lunas") {
      listToExport = customers.filter(c => c.status === "Lunas");
      fileSuffix = "Lunas";
    } else if (exportCategory === "Hanya Data Belum Lunas") {
      listToExport = customers.filter(c => c.status === "Belum Lunas");
      fileSuffix = "Belum_Lunas";
    }

    if (listToExport.length === 0) {
      showToast("Kategori terpilih tidak memiliki data untuk diekspor!", "error");
      return;
    }

    const filename = `Laporan_Billing_${fileSuffix}.xlsx`;
    exportToExcel(listToExport, filename);
    showToast(`File ${filename} berhasil diunduh! 📥`, "success");
  };

  // File drag-over handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    setImportError(null);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.name.endsWith('.xlsx')) {
        await processUploadedFile(file);
      } else {
        setImportError("Format file salah! Harap unggah file dengan format .xlsx");
      }
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setImportError(null);
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      await processUploadedFile(file);
    }
  };

  const processUploadedFile = async (file: File) => {
    try {
      const parsed = await parseExcelFile(file);
      setImportedPreview(parsed);
      setImportError(null);
      showToast("Berhasil mempratinjau file Excel! Silakan konfirmasi.", "info");
    } catch (err: any) {
      setImportError(err.message || "Gagal mengurai file Excel.");
      setImportedPreview(null);
    }
  };

  const handleConfirmImport = () => {
    if (importedPreview && importedPreview.length > 0) {
      updateCustomersDatabase(importedPreview);
      setImportedPreview(null);
      showToast("Data Excel sukses di-import! 🎉", "success");
      setActiveTab("📊 Dashboard");
    }
  };

  // Helper formatter for Indonesian Rupiah
  const formatRupiah = (amount: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  // Filtered lists
  const filteredDashboardCustomers = customers.filter(c => {
    const matchesSearch = c.nama.toLowerCase().includes(searchDashboard.toLowerCase()) ||
      c.alamat.toLowerCase().includes(searchDashboard.toLowerCase()) ||
      c.id.toLowerCase().includes(searchDashboard.toLowerCase());
    const matchesMonth = selectedMonth === "Semua Bulan" || c.bulan === selectedMonth;
    return matchesSearch && matchesMonth;
  });

  const filteredBelumLunasCustomers = workingBelumLunas.filter(c => 
    c.nama.toLowerCase().includes(searchBelumLunas.toLowerCase()) ||
    c.alamat.toLowerCase().includes(searchBelumLunas.toLowerCase()) ||
    c.id.toLowerCase().includes(searchBelumLunas.toLowerCase())
  );

  return (
    <div className="w-full min-h-screen px-4 py-6 md:py-10">
      
      {/* Toast Notification Container */}
      {toast && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 animate-bounce duration-300">
          <div className={`flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-xl border backdrop-blur-md ${
            toast.type === 'success' 
              ? 'bg-emerald-50/90 border-emerald-200 text-emerald-800' 
              : toast.type === 'error'
              ? 'bg-rose-50/90 border-rose-200 text-rose-800'
              : 'bg-indigo-50/90 border-indigo-200 text-indigo-800'
          }`}>
            {toast.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-600" />}
            {toast.type === 'error' && <AlertCircle className="w-5 h-5 text-rose-600" />}
            {toast.type === 'info' && <Info className="w-5 h-5 text-indigo-600" />}
            <span className="font-semibold text-sm">{toast.message}</span>
          </div>
        </div>
      )}

      {/* Main Container - max-w-680px for a sleek mobile-first design */}
      <div id="main-billing-container" className="max-w-[680px] mx-auto bg-transparent">
        
        {/* BRANDING HEADER */}
        <header className="flex flex-col items-center mb-6">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-3xl">✨</span>
            <h1 className="text-4xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-purple-600">
              Billing WIFI
            </h1>
          </div>
          <p className="text-sm text-slate-500 font-medium tracking-wide uppercase">Premium Billing Management System</p>
        </header>

        {/* CUSTOM NAVIGATION (Premium Card Layout) */}
        <nav className="flex justify-center mb-8">
          <div className="bg-white/80 backdrop-blur-md border border-white/60 p-1.5 rounded-2xl shadow-sm flex gap-1 flex-wrap justify-center">
            {(["📊 Dashboard", "⏳ Belum Lunas", "🗓️ Riwayat", "📥 Export", "📤 Import"] as MenuType[]).map((tab) => {
              const isActive = activeTab === tab;
              return (
                <button
                  key={tab}
                  id={`tab-${tab.replace(/\s+/g, '-').toLowerCase()}`}
                  onClick={() => {
                    setActiveTab(tab);
                    if (tab === "📊 Dashboard") {
                      setSelectedMonth("Semua Bulan");
                    }
                  }}
                  className={`px-5 py-2 rounded-xl font-bold text-sm transition-all ${
                    isActive 
                      ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' 
                      : 'text-slate-500 hover:bg-slate-100'
                  }`}
                >
                  {tab}
                </button>
              );
            })}
          </div>
        </nav>

        {/* ==================== MENU 1: DASHBOARD ==================== */}
        {activeTab === "📊 Dashboard" && (
          <div id="dashboard-view" className="space-y-6">

            {/* Real-time stats grid (2 columns) */}
            <div className="grid grid-cols-2 gap-4 sm:gap-6">
              
              {/* Card Unpaid */}
              <div className="bg-gradient-to-br from-rose-50 to-white border-l-8 border-rose-500 p-5 sm:p-6 rounded-3xl shadow-md border border-slate-100 relative overflow-hidden group">
                <div className="absolute -right-4 -top-4 w-24 h-24 bg-rose-500/5 rounded-full"></div>
                <h3 className="text-rose-600 text-[10px] sm:text-xs font-black tracking-widest mb-1.5 uppercase block">⚠️ PERLU DITAGIH</h3>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-3xl sm:text-4xl font-black text-rose-900 leading-none">{stats.unpaidCount}</span>
                  <span className="text-rose-600 font-bold text-xs">Orang</span>
                </div>
                <p className="mt-2 text-rose-800 font-black text-md sm:text-lg">{formatRupiah(stats.unpaidAmount)}</p>
                <div className="text-[9px] text-rose-500 font-semibold mt-1">
                  Status: {selectedMonth === "Semua Bulan" ? "Gabungan Semua Bulan" : `Bulan ${selectedMonth}`}
                </div>
              </div>

              {/* Card Collected */}
              <div className="bg-gradient-to-br from-emerald-50 to-white border-l-8 border-emerald-500 p-5 sm:p-6 rounded-3xl shadow-md border border-slate-100 relative overflow-hidden group">
                <div className="absolute -right-4 -top-4 w-24 h-24 bg-emerald-500/5 rounded-full"></div>
                <h3 className="text-emerald-600 text-[10px] sm:text-xs font-black tracking-widest mb-1.5 uppercase block">✅ UANG MASUK</h3>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl sm:text-3xl font-black text-emerald-900 leading-none">{formatRupiah(stats.paidAmount)}</span>
                </div>
                <p className="mt-2 text-emerald-800 font-bold text-xs">Dari {stats.paidCount} Pembayaran</p>
                <div className="text-[9px] text-emerald-500 font-semibold mt-1">
                  Status: {selectedMonth === "Semua Bulan" ? "Gabungan Semua Bulan" : `Bulan ${selectedMonth}`}
                </div>
              </div>

            </div>

            {/* Total Registered Customers counter */}
            <div className="text-center text-xs font-black text-slate-400">
              Total Tagihan Terdaftar ({selectedMonth}): <span className="text-indigo-600">{stats.totalCustomers} Record</span>
            </div>

            {/* Customer List Header & Adding Tool */}
            <div className="bg-white/90 backdrop-blur-sm border border-slate-200 rounded-3xl shadow-xl overflow-hidden flex flex-col">
              <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h3 className="text-lg font-bold text-slate-800">Daftar Semua Pelanggan</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Kelola seluruh basis data wifi secara langsung</p>
                </div>
                
                <button
                  id="btn-add-customer"
                  onClick={openAddModal}
                  className="inline-flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-sm hover:shadow-md hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Tambah Pelanggan
                </button>
              </div>

              <div className="p-6">
                {/* Quick Search */}
                <div className="relative mb-4">
                  <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
                  <input
                    id="search-dashboard"
                    type="text"
                    placeholder="Cari berdasarkan ID, nama, atau alamat..."
                    value={searchDashboard}
                    onChange={(e) => setSearchDashboard(e.target.value)}
                    className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-2xl text-xs font-medium focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all placeholder:text-slate-400 shadow-sm"
                  />
                  {searchDashboard && (
                    <button 
                      onClick={() => setSearchDashboard("")}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Table list */}
                <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white">
                  <table className="w-full text-left border-collapse min-w-[500px]">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100">
                        <th className="px-6 py-3 text-xs font-black text-slate-400 uppercase tracking-wider">ID PEL</th>
                        <th className="px-6 py-3 text-xs font-black text-slate-400 uppercase tracking-wider">Nama</th>
                        <th className="px-6 py-3 text-xs font-black text-slate-400 uppercase tracking-wider">Alamat</th>
                        <th className="px-6 py-3 text-xs font-black text-slate-400 uppercase tracking-wider text-right">Tagihan</th>
                        <th className="px-6 py-3 text-xs font-black text-slate-400 uppercase tracking-wider text-center">Status</th>
                        <th className="px-6 py-3 text-xs font-black text-slate-400 uppercase tracking-wider text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {filteredDashboardCustomers.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-6 py-8 text-center text-xs font-medium text-slate-400">
                            Data pelanggan tidak ditemukan.
                          </td>
                        </tr>
                      ) : (
                        filteredDashboardCustomers.map((customer) => (
                          <tr key={customer.id} className="hover:bg-indigo-50/30 transition-colors">
                            <td className="px-6 py-4 text-xs font-mono font-bold text-slate-400">
                              {customer.id}
                            </td>
                            <td className="px-6 py-4 text-sm font-bold text-slate-800">
                              {customer.nama}
                            </td>
                            <td className="px-6 py-4 text-sm text-slate-500" title={customer.alamat}>
                              {customer.alamat}
                            </td>
                            <td className="px-6 py-4 text-sm font-black text-slate-800 text-right">
                              {formatRupiah(customer.tagihan)}
                            </td>
                            <td className="px-6 py-4 text-center">
                              <span className={`px-3 py-1 text-[10px] font-black uppercase rounded-full ${
                                customer.status === "Lunas"
                                  ? 'bg-emerald-100 text-emerald-600'
                                  : 'bg-rose-100 text-rose-600'
                              }`}>
                                {customer.status}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <div className="inline-flex items-center justify-end gap-1">
                                <button
                                  onClick={() => openEditModal(customer)}
                                  className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
                                  title="Edit Pelanggan"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDeleteCustomer(customer.id, customer.nama)}
                                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                                  title="Hapus Pelanggan"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Database Reset Section (Discreet footer helper) */}
            <div className="flex justify-center pt-2">
              <button
                onClick={handleResetDatabase}
                className="inline-flex items-center gap-1.5 text-[10px] font-bold text-gray-400 hover:text-indigo-500 transition-colors"
              >
                <RefreshCw className="w-3 h-3" />
                Reset ke Database Bawaan Pabrik
              </button>
            </div>

          </div>
        )}

        {/* ==================== MENU 2: DAFTAR TAGIHAN (HANYA BELUM LUNAS) ==================== */}
        {activeTab === "⏳ Belum Lunas" && (
          <div id="unpaid-view" className="space-y-6">
            <div className="bg-white/90 backdrop-blur-sm border border-slate-200 rounded-3xl shadow-xl overflow-hidden p-6">
              <div className="mb-4">
                <h3 className="text-lg font-bold text-slate-800">⏳ Daftar Belum Lunas</h3>
                <p className="text-xs text-slate-400 mt-1">
                  Ubah status menjadi 'Lunas' untuk menyelesaikan tagihan, kemudian klik simpan.
                </p>
              </div>

              {/* Unpaid Search */}
              <div className="relative mb-4">
                <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
                <input
                  id="search-unpaid"
                  type="text"
                  placeholder="Cari nama atau alamat..."
                  value={searchBelumLunas}
                  onChange={(e) => setSearchBelumLunas(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-2xl text-xs font-medium focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all placeholder:text-slate-400 shadow-sm"
                />
                {searchBelumLunas && (
                  <button 
                    onClick={() => setSearchBelumLunas("")}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Editable Table */}
              <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white">
                <table className="w-full text-left border-collapse min-w-[500px]">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="px-6 py-3 text-xs font-black text-slate-400 uppercase tracking-wider">Status Pembayaran</th>
                      <th className="px-6 py-3 text-xs font-black text-slate-400 uppercase tracking-wider">Tagihan</th>
                      <th className="px-6 py-3 text-xs font-black text-slate-400 uppercase tracking-wider">Alamat</th>
                      <th className="px-6 py-3 text-xs font-black text-slate-400 uppercase tracking-wider">Nama</th>
                      <th className="px-6 py-3 text-xs font-black text-slate-400 uppercase tracking-wider">ID PEL</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filteredBelumLunasCustomers.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-8 text-center text-xs font-medium text-slate-400">
                          Tidak ada tagihan yang belum lunas. Semuanya lunas! 🎉
                        </td>
                      </tr>
                    ) : (
                      filteredBelumLunasCustomers.map((customer) => (
                        <tr key={customer.id} className="hover:bg-indigo-50/30 transition-colors">
                          <td className="px-6 py-4">
                            <select
                              value={customer.status}
                              onChange={(e) => toggleWorkingStatus(customer.id, e.target.value as any)}
                              className={`text-xs font-bold px-3 py-1.5 rounded-xl border outline-none cursor-pointer transition-colors ${
                                customer.status === "Lunas"
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : 'bg-rose-50 text-rose-700 border-rose-200'
                              }`}
                            >
                              <option value="Belum Lunas">⏳ Belum Lunas</option>
                              <option value="Lunas">✅ Lunas</option>
                            </select>
                          </td>
                          <td className="px-6 py-4 text-sm font-black text-slate-800">
                            {formatRupiah(customer.tagihan)}
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-500" title={customer.alamat}>
                            {customer.alamat}
                          </td>
                          <td className="px-6 py-4 text-sm font-bold text-slate-800">
                            {customer.nama}
                          </td>
                          <td className="px-6 py-4 text-xs font-mono font-bold text-slate-400">
                            {customer.id}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Confirm / Save Button */}
              {workingBelumLunas.length > 0 && (
                <div className="mt-5">
                  <button
                    id="btn-save-payments"
                    onClick={handleSavePayments}
                    className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-bold text-sm py-3.5 rounded-2xl shadow-lg shadow-indigo-100 transition-all duration-300 hover:scale-[1.01] active:scale-[0.99] cursor-pointer flex items-center justify-center gap-2"
                  >
                    <Check className="w-4 h-4" />
                    💾 Simpan Pembayaran
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ==================== MENU 2.5: RIWAYAT TAGIHAN BULANAN ==================== */}
        {activeTab === "🗓️ Riwayat" && (
          <div id="history-view" className="space-y-6">
            
            {/* If no month is selected, show the summary list of months */}
            {!inspectedMonth ? (
              <div className="space-y-6">
                <div className="bg-white/90 backdrop-blur-sm border border-slate-200 rounded-3xl shadow-xl p-6">
                  <div className="mb-4">
                    <h3 className="text-lg font-bold text-slate-800">🗓️ Riwayat Tagihan Bulanan</h3>
                    <p className="text-xs text-slate-400 mt-1">
                      Daftar dan ringkasan kepatuhan pembayaran WiFi pelanggan per periode bulan.
                    </p>
                  </div>

                  {/* Summary Stats Table / Cards */}
                  <div className="grid grid-cols-1 gap-4">
                    {monthlyTrends.length === 0 ? (
                      <div className="text-center py-8 text-slate-400 text-xs font-semibold">
                        Belum ada data riwayat bulanan yang tersedia.
                      </div>
                    ) : (
                      monthlyTrends.map((trend) => {
                        const monthRecords = customers.filter(c => c.bulan === trend.month);
                        const paidPercentage = trend.total > 0 ? Math.round((trend.paid / trend.total) * 100) : 0;
                        const unpaidCount = monthRecords.filter(c => c.status === "Belum Lunas").length;
                        const paidCount = monthRecords.filter(c => c.status === "Lunas").length;

                        return (
                          <div 
                            key={trend.month}
                            className="bg-slate-50 hover:bg-slate-100/80 border border-slate-200/60 rounded-2xl p-5 transition-all duration-200 shadow-sm"
                          >
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                              <div>
                                <span className="text-base font-black text-slate-800">{trend.month}</span>
                                <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">WiFi Billing Summary</p>
                              </div>
                              <button
                                onClick={() => {
                                  setInspectedMonth(trend.month);
                                  setSearchHistory("");
                                }}
                                className="self-start sm:self-center bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-black px-4 py-2 rounded-xl transition-all duration-200 cursor-pointer"
                              >
                                Lihat Rincian 🔍
                              </button>
                            </div>

                            {/* Stats mini grid */}
                            <div className="grid grid-cols-3 gap-3 bg-white border border-slate-100 rounded-xl p-3 mb-3.5 text-center shadow-inner">
                              <div>
                                <span className="text-[9px] font-black text-slate-400 block uppercase">Total Pelanggan</span>
                                <span className="text-sm font-black text-slate-800">{monthRecords.length} Record</span>
                              </div>
                              <div>
                                <span className="text-[9px] font-black text-emerald-500 block uppercase">Lunas</span>
                                <span className="text-sm font-black text-emerald-700">{paidCount} ({paidPercentage}%)</span>
                              </div>
                              <div>
                                <span className="text-[9px] font-black text-rose-500 block uppercase">Belum Lunas</span>
                                <span className="text-sm font-black text-rose-700">{unpaidCount} Orang</span>
                              </div>
                            </div>

                            {/* Dual-bar progress indicator */}
                            <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden flex border border-slate-50 shadow-inner mb-2">
                              {trend.paid > 0 && (
                                <div 
                                  style={{ width: `${paidPercentage}%` }} 
                                  className="bg-gradient-to-r from-emerald-400 to-emerald-500 h-full transition-all duration-500"
                                />
                              )}
                              {trend.unpaid > 0 && (
                                <div 
                                  style={{ width: `${100 - paidPercentage}%` }} 
                                  className="bg-gradient-to-r from-rose-400 to-rose-500 h-full transition-all duration-500"
                                />
                              )}
                            </div>

                            {/* Footer values */}
                            <div className="flex justify-between items-center text-[10px] font-bold text-slate-500">
                              <span>Realisasi Uang Masuk: <strong className="text-emerald-600">{formatRupiah(trend.paid)}</strong></span>
                              <span>Potensi Omzet: <strong className="text-indigo-600">{formatRupiah(trend.total)}</strong></span>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            ) : (
              /* Inside selected month's billing records list */
              <div className="space-y-6">
                <div className="bg-white/90 backdrop-blur-sm border border-slate-200 rounded-3xl shadow-xl p-6">
                  
                  {/* Detail Header */}
                  <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
                    <div className="flex items-center gap-2.5">
                      <button
                        onClick={() => setInspectedMonth(null)}
                        className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition-all cursor-pointer font-bold text-xs flex items-center gap-1"
                        title="Kembali"
                      >
                        ⬅️ Kembali
                      </button>
                      <div>
                        <h3 className="text-lg font-black text-slate-800">🗓️ Rincian Tagihan {inspectedMonth}</h3>
                        <p className="text-xs text-slate-400 mt-0.5">Daftar pelanggan beserta status pembayarannya.</p>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-[10px] font-black uppercase text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full">
                        Periode Aktif
                      </span>
                    </div>
                  </div>

                  {/* Search inside this month */}
                  <div className="relative mb-4">
                    <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
                    <input
                      id="search-history"
                      type="text"
                      placeholder="Cari nama, alamat, atau ID pelanggan..."
                      value={searchHistory}
                      onChange={(e) => setSearchHistory(e.target.value)}
                      className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-2xl text-xs font-medium focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all placeholder:text-slate-400 shadow-sm"
                    />
                    {searchHistory && (
                      <button 
                        onClick={() => setSearchHistory("")}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Records Table for inspectedMonth */}
                  <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white">
                    <table className="w-full text-left border-collapse min-w-[500px]">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-100">
                          <th className="px-6 py-3 text-xs font-black text-slate-400 uppercase tracking-wider">Status</th>
                          <th className="px-6 py-3 text-xs font-black text-slate-400 uppercase tracking-wider">Tagihan</th>
                          <th className="px-6 py-3 text-xs font-black text-slate-400 uppercase tracking-wider">Alamat</th>
                          <th className="px-6 py-3 text-xs font-black text-slate-400 uppercase tracking-wider">Nama</th>
                          <th className="px-6 py-3 text-xs font-black text-slate-400 uppercase tracking-wider">ID PEL</th>
                          <th className="px-6 py-3 text-xs font-black text-slate-400 uppercase tracking-wider">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {customers
                          .filter(c => c.bulan === inspectedMonth)
                          .filter(c => 
                            c.nama.toLowerCase().includes(searchHistory.toLowerCase()) ||
                            c.alamat.toLowerCase().includes(searchHistory.toLowerCase()) ||
                            c.id.toLowerCase().includes(searchHistory.toLowerCase())
                          ).length === 0 ? (
                            <tr>
                              <td colSpan={6} className="px-6 py-8 text-center text-xs font-medium text-slate-400">
                                Tidak ada data pelanggan yang cocok dengan pencarian Anda.
                              </td>
                            </tr>
                          ) : (
                            customers
                              .filter(c => c.bulan === inspectedMonth)
                              .filter(c => 
                                c.nama.toLowerCase().includes(searchHistory.toLowerCase()) ||
                                c.alamat.toLowerCase().includes(searchHistory.toLowerCase()) ||
                                c.id.toLowerCase().includes(searchHistory.toLowerCase())
                              )
                              .map((customer) => (
                                <tr key={customer.id} className="hover:bg-indigo-50/20 transition-colors">
                                  <td className="px-6 py-4">
                                    <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${
                                      customer.status === "Lunas"
                                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                        : 'bg-rose-50 text-rose-700 border border-rose-200'
                                    }`}>
                                      {customer.status === "Lunas" ? '✅ Lunas' : '⏳ Belum Lunas'}
                                    </span>
                                  </td>
                                  <td className="px-6 py-4 text-sm font-black text-slate-800">
                                    {formatRupiah(customer.tagihan)}
                                  </td>
                                  <td className="px-6 py-4 text-sm text-slate-500" title={customer.alamat}>
                                    {customer.alamat}
                                  </td>
                                  <td className="px-6 py-4 text-sm font-bold text-slate-800">
                                    {customer.nama}
                                  </td>
                                  <td className="px-6 py-4 text-xs font-mono font-bold text-slate-400">
                                    {customer.id}
                                  </td>
                                  <td className="px-6 py-4">
                                    <div className="flex items-center gap-2">
                                      <button
                                        onClick={() => handleToggleCustomerStatusDirect(customer.id)}
                                        className="text-[10px] font-black bg-slate-50 hover:bg-slate-100 text-slate-600 px-2 py-1 rounded-lg border border-slate-200 transition-colors cursor-pointer"
                                        title="Ubah Status Pembayaran"
                                      >
                                        Ubah Status 🔄
                                      </button>
                                      <button
                                        onClick={() => openEditModal(customer)}
                                        className="text-indigo-600 hover:text-indigo-950 p-1"
                                        title="Edit Pelanggan"
                                      >
                                        <Edit3 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ))
                          )}
                      </tbody>
                    </table>
                  </div>

                </div>
              </div>
            )}

          </div>
        )}



        {/* ==================== MENU 3: EXPORT EXCEL ==================== */}
        {activeTab === "📥 Export" && (
          <div id="export-view" className="space-y-6 animate-fadeIn">
            <div className="bg-white/90 backdrop-blur-sm border border-slate-200 rounded-3xl shadow-xl overflow-hidden p-6">
              <div className="mb-6">
                <h3 className="text-lg font-bold text-slate-800">📥 Ekspor Laporan Excel</h3>
                <p className="text-xs text-slate-400 mt-0.5">Simpan database Anda langsung ke perangkat komputer atau ponsel.</p>
              </div>

              {/* Export visual banner card */}
              <div className="bg-gradient-to-br from-indigo-50/50 via-white to-purple-50/50 border border-slate-100 rounded-2xl p-6 text-center mb-6">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-600 mb-3.5">
                  <span className="text-3xl">📂</span>
                </div>
                <h4 className="text-sm font-bold text-slate-800 mb-1">Unduhan Format Otomatis</h4>
                <p className="text-xs text-slate-400 max-w-[340px] mx-auto leading-relaxed">
                  Data yang diunduh akan otomatis terformat menjadi file (.xlsx) siap pakai dengan kolom teratur.
                </p>
              </div>

              {/* Filter Category Select (Radio Button layout) */}
              <div className="space-y-3 mb-6">
                <label className="text-xs font-bold text-slate-600 block">Kategori Data:</label>
                
                <div className="grid grid-cols-1 gap-2.5">
                  {[
                    "Semua Data Pelanggan", 
                    "Hanya Data Lunas", 
                    "Hanya Data Belum Lunas"
                  ].map((cat) => {
                    const isSelected = exportCategory === cat;
                    const count = cat === "Semua Data Pelanggan" 
                      ? customers.length
                      : cat === "Hanya Data Lunas"
                      ? customers.filter(c => c.status === "Lunas").length
                      : customers.filter(c => c.status === "Belum Lunas").length;

                    return (
                      <div 
                        key={cat}
                        onClick={() => setExportCategory(cat)}
                        className={`flex items-center justify-between p-4 rounded-2xl border cursor-pointer transition-all duration-200 ${
                          isSelected 
                            ? 'bg-indigo-50/40 border-indigo-500 text-indigo-950 font-bold' 
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50/50'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                            isSelected ? 'border-indigo-600' : 'border-slate-300'
                          }`}>
                            {isSelected && <div className="w-2 h-2 rounded-full bg-indigo-600" />}
                          </div>
                          <span className="text-xs font-semibold">{cat}</span>
                        </div>
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                          {count} baris
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Trigger Export Action */}
              <button
                id="btn-export-download"
                onClick={handleExport}
                className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-bold text-sm py-4 rounded-2xl shadow-lg shadow-emerald-100 transition-all duration-300 hover:scale-[1.01] active:scale-[0.99] cursor-pointer flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" />
                📥 DOWNLOAD FILE EXCEL
              </button>

            </div>
          </div>
        )}

        {/* ==================== MENU 4: IMPORT EXCEL ==================== */}
        {activeTab === "📤 Import" && (
          <div id="import-view" className="space-y-6">
            <div className="bg-white/90 backdrop-blur-sm border border-slate-200 rounded-3xl shadow-xl overflow-hidden p-6">
              <div className="mb-4">
                <h3 className="text-lg font-bold text-slate-800">📤 Unggah File Excel</h3>
                <p className="text-xs text-slate-400 mt-0.5">Impor database WiFi massal dari berkas excel.</p>
              </div>

              {/* Requirement guidelines */}
              <div className="bg-indigo-50/40 border border-slate-200/60 rounded-2xl p-4 mb-6">
                <h5 className="text-xs font-bold text-slate-900 mb-1">Panduan Kolom File</h5>
                <p className="text-xs text-slate-500 leading-relaxed">
                  File Excel wajib memiliki 5 kolom berurutan di baris pertama:<br />
                  <strong className="text-indigo-900 font-bold">Nama | Alamat | Tagihan | Status | ID Pelanggan</strong>
                </p>
              </div>

              {/* File Dropzone Area */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-3xl p-8 text-center cursor-pointer transition-all duration-300 ${
                  isDragging 
                    ? 'border-indigo-600 bg-indigo-50/50' 
                    : 'border-indigo-100 bg-white hover:bg-slate-50/50'
                }`}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept=".xlsx"
                  className="hidden"
                />
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 mb-3">
                  <UploadCloud className="w-6 h-6 animate-bounce" />
                </div>
                <h4 className="text-xs font-bold text-slate-800 mb-1">Pilih File Excel Anda</h4>
                <p className="text-[10px] text-slate-400">Seret & taruh file .xlsx di sini, atau klik untuk memilih file.</p>
              </div>

              {/* Error state */}
              {importError && (
                <div className="mt-4 p-4 bg-rose-50 border border-rose-100 rounded-2xl flex items-start gap-3 text-rose-700">
                  <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                  <div>
                    <h5 className="text-xs font-bold">Terjadi Kesalahan</h5>
                    <p className="text-[11px] mt-0.5 leading-relaxed">{importError}</p>
                  </div>
                </div>
              )}

              {/* Import Preview Section */}
              {importedPreview && (
                <div className="mt-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-emerald-600">Pratinjau Unggahan ({importedPreview.length} Baris):</h4>
                    <button 
                      onClick={() => setImportedPreview(null)}
                      className="text-[10px] font-bold text-slate-400 hover:text-slate-600"
                    >
                      Batal
                    </button>
                  </div>

                  <div className="overflow-x-auto rounded-2xl border border-slate-100 max-h-[250px] overflow-y-auto bg-white">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-100 sticky top-0">
                          <th className="p-2.5 text-[9px] font-bold text-slate-400 uppercase">ID</th>
                          <th className="p-2.5 text-[9px] font-bold text-slate-400 uppercase">Nama</th>
                          <th className="p-2.5 text-[9px] font-bold text-slate-400 uppercase">Alamat</th>
                          <th className="p-2.5 text-[9px] font-bold text-slate-400 uppercase">Tagihan</th>
                          <th className="p-2.5 text-[9px] font-bold text-slate-400 uppercase">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {importedPreview.map((item, idx) => (
                          <tr key={idx} className="bg-white">
                            <td className="p-2.5 text-[10px] font-mono text-indigo-600">{item.id}</td>
                            <td className="p-2.5 text-[10px] font-semibold text-slate-800">{item.nama}</td>
                            <td className="p-2.5 text-[10px] text-slate-500 max-w-[120px] truncate">{item.alamat}</td>
                            <td className="p-2.5 text-[10px] font-bold text-slate-800">{formatRupiah(item.tagihan)}</td>
                            <td className="p-2.5">
                              <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${
                                item.status === "Lunas" ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                              }`}>
                                {item.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Apply imported preview */}
                  <button
                    id="btn-confirm-import"
                    onClick={handleConfirmImport}
                    className="w-full bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-bold text-sm py-3.5 rounded-2xl shadow-lg shadow-emerald-100 transition-all duration-300 hover:scale-[1.01] active:scale-[0.99] cursor-pointer"
                  >
                    🚀 Konfirmasi & Terapkan Data
                  </button>
                </div>
              )}

            </div>
          </div>
        )}

      </div>

      {/* ==================== CUSTOMER ADD / EDIT MODAL DRAWER ==================== */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white w-full max-w-[460px] rounded-3xl shadow-2xl border border-gray-100 overflow-hidden transform scale-100 transition-all">
            
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-indigo-50/50 to-purple-50/50 px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h4 className="font-extrabold text-gray-900">
                  {modalMode === 'add' ? '👤 Tambah Pelanggan Baru' : '📝 Ubah Data Pelanggan'}
                </h4>
                <p className="text-[10px] text-gray-400">Harap isi kolom di bawah ini secara teliti</p>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveCustomer} className="p-6 space-y-4">
              
              {/* Row: Customer ID & Status */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-extrabold text-gray-400 uppercase block mb-1">ID PEL *</label>
                  <input
                    type="text"
                    required
                    disabled={modalMode === 'edit'}
                    value={formId}
                    onChange={(e) => setFormId(e.target.value)}
                    placeholder="Contoh: PEL005"
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-xs font-bold uppercase focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all disabled:bg-gray-50 disabled:text-gray-400"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-extrabold text-gray-400 uppercase block mb-1">Status Tagihan</label>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value as any)}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all cursor-pointer"
                  >
                    <option value="Belum Lunas">⏳ Belum Lunas</option>
                    <option value="Lunas">✅ Lunas</option>
                  </select>
                </div>
              </div>

              {/* Input: Name */}
              <div>
                <label className="text-[10px] font-extrabold text-gray-400 uppercase block mb-1">Nama Lengkap *</label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Nama lengkap pelanggan..."
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all"
                />
              </div>

              {/* Input: Address */}
              <div>
                <label className="text-[10px] font-extrabold text-gray-400 uppercase block mb-1">Alamat Rumah *</label>
                <textarea
                  required
                  rows={2}
                  value={formAddress}
                  onChange={(e) => setFormAddress(e.target.value)}
                  placeholder="Alamat lengkap / blok rumah..."
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all resize-none"
                />
              </div>

              {/* Input: Bill Amount */}
              <div>
                <label className="text-[10px] font-extrabold text-gray-400 uppercase block mb-1">Jumlah Tagihan (Rupiah) *</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-extrabold text-gray-400">Rp</span>
                  <input
                    type="number"
                    required
                    min={0}
                    value={formBill}
                    onChange={(e) => setFormBill(Number(e.target.value))}
                    className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all"
                  />
                </div>
              </div>

              {/* Input: Month */}
              <div>
                <label className="text-[10px] font-extrabold text-gray-400 uppercase block block mb-1">Bulan Tagihan *</label>
                <select
                  required
                  value={formMonth}
                  onChange={(e) => setFormMonth(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all cursor-pointer"
                >
                  <option value="" disabled>Pilih Bulan Tagihan</option>
                  {[
                    "Januari 2026", "Februari 2026", "Maret 2026", "April 2026", "Mei 2026", "Juni 2026",
                    "Juli 2026", "Agustus 2026", "September 2026", "Oktober 2026", "November 2026", "Desember 2026",
                    "Januari 2025", "Februari 2025", "Maret 2025", "April 2025", "Mei 2025", "Juni 2025",
                    "Juli 2025", "Agustus 2025", "September 2025", "Oktober 2025", "November 2025", "Desember 2025"
                  ].map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>

              {/* Submit Form Action Buttons */}
              <div className="pt-2 flex items-center justify-end gap-3 border-t border-gray-50 mt-5">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-gray-100 text-xs font-bold text-gray-500 hover:bg-gray-50 active:bg-gray-100 transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  id="btn-submit-customer"
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white text-xs font-bold shadow-md shadow-indigo-100 hover:shadow-lg transition-all"
                >
                  {modalMode === 'add' ? 'Tambah Pelanggan' : 'Simpan Perubahan'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
}
