import { initializeApp, getApps, getApp } from "firebase/app";
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  User 
} from "firebase/auth";
import firebaseConfig from "../../firebase-applet-config.json";

// Initialize Firebase App if not already initialized
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);

// Use GoogleAuthProvider with required Google Drive and Google Sheets scopes
const provider = new GoogleAuthProvider();
provider.addScope("https://www.googleapis.com/auth/drive.file");
provider.addScope("https://www.googleapis.com/auth/spreadsheets");

let isSigningIn = false;
let cachedAccessToken: string | null = null;

// Listen for Authentication state changes
export const initAuth = (
  onAuthSuccess: (user: User, token: string) => void,
  onAuthFailure: () => void
) => {
  return onAuthStateChanged(auth, async (user) => {
    if (user) {
      if (cachedAccessToken) {
        onAuthSuccess(user, cachedAccessToken);
      } else {
        // Fallback or retry, if firebase remembered the user but token needs to be retrieved again, 
        // we might prompt sign-in. Let's trigger failure so user can click Sign In 
        // and get fresh credentials, since Firebase doesn't cache OAuth tokens across reloads in standard ways.
        onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      onAuthFailure();
    }
  });
};

// Sign in with Google Popup
export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error("Gagal memperoleh access token dari Google Auth.");
    }
    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error) {
    console.error("Gagal Login dengan Google:", error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

// Get current token in memory
export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

// Sign Out from Google
export const logout = async () => {
  await auth.signOut();
  cachedAccessToken = null;
};

// ==================== GOOGLE DRIVE API FUNCTIONS ====================

// Find or Create a backup folder in Google Drive
export const getOrCreateBackupFolder = async (accessToken: string): Promise<string> => {
  const folderName = "WiFi Billing Manager Backups";
  
  // Search for the folder first
  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=name='${encodeURIComponent(folderName)}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  
  const response = await fetch(searchUrl, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  
  if (!response.ok) {
    throw new Error("Gagal mencari folder backup di Google Drive.");
  }
  
  const searchResult = await response.json();
  if (searchResult.files && searchResult.files.length > 0) {
    return searchResult.files[0].id;
  }
  
  // Create folder if not found
  const createResponse = await fetch("https://www.googleapis.com/drive/v3/files", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      name: folderName,
      mimeType: "application/vnd.google-apps.folder"
    })
  });
  
  if (!createResponse.ok) {
    throw new Error("Gagal membuat folder backup di Google Drive.");
  }
  
  const folder = await createResponse.json();
  return folder.id;
};

// Upload Backup File
export const uploadBackupFile = async (
  accessToken: string,
  folderId: string,
  fileName: string,
  customersData: any[]
): Promise<any> => {
  const boundary = "wifi_billing_boundary_marker";
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelim = `\r\n--${boundary}--`;
  
  const metadata = {
    name: fileName,
    mimeType: "application/json",
    parents: [folderId]
  };
  
  const multipartRequestBody = 
    delimiter +
    "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
    JSON.stringify(metadata) +
    delimiter +
    "Content-Type: application/json\r\n\r\n" +
    JSON.stringify(customersData, null, 2) +
    closeDelim;
    
  const response = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`
    },
    body: multipartRequestBody
  });
  
  if (!response.ok) {
    const errText = await response.text();
    console.error("Upload error details:", errText);
    throw new Error("Gagal mengunggah file backup ke Google Drive.");
  }
  
  return await response.json();
};

// List Backup Files in the Backup Folder
export const listBackupFiles = async (accessToken: string, folderId: string): Promise<any[]> => {
  const q = `'${folderId}' in parents and trashed=false`;
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,createdTime,size)&orderBy=createdTime desc`;
  
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  
  if (!response.ok) {
    throw new Error("Gagal mengambil daftar file backup dari Google Drive.");
  }
  
  const data = await response.json();
  return data.files || [];
};

// Download Backup file content
export const downloadBackupFile = async (accessToken: string, fileId: string): Promise<any[]> => {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  
  if (!response.ok) {
    throw new Error("Gagal mengunduh isi file backup dari Google Drive.");
  }
  
  return await response.json();
};

// Delete Backup File
export const deleteBackupFileFromDrive = async (accessToken: string, fileId: string): Promise<void> => {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}`;
  
  const response = await fetch(url, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  
  if (!response.ok) {
    throw new Error("Gagal menghapus file backup dari Google Drive.");
  }
};

// ==================== GOOGLE SHEETS API FUNCTIONS ====================

// Export Current Data to Google Sheet
export const exportToGoogleSheets = async (
  accessToken: string,
  spreadsheetTitle: string,
  customers: any[]
): Promise<{ spreadsheetId: string; spreadsheetUrl: string }> => {
  
  // 1. Create Spreadsheet
  const createResponse = await fetch("https://sheets.googleapis.com/v4/spreadsheets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      properties: {
        title: spreadsheetTitle
      }
    })
  });
  
  if (!createResponse.ok) {
    throw new Error("Gagal membuat spreadsheet baru di Google Sheets.");
  }
  
  const spreadsheet = await createResponse.json();
  const { spreadsheetId, spreadsheetUrl } = spreadsheet;
  
  // 2. Prepare headers and rows
  const headerRow = ["ID Pelanggan", "Nama Pelanggan", "Alamat", "Bulan Tagihan", "Jumlah Tagihan (Rp)", "Status Pembayaran"];
  const valueRows = customers.map(c => [
    c.id,
    c.nama,
    c.alamat,
    c.bulan,
    c.tagihan,
    c.status
  ]);
  
  const values = [headerRow, ...valueRows];
  
  // 3. Write data to spreadsheet cells (e.g. Sheet1!A1)
  // Sheets API doesn't know sheet name in advance sometimes, but newly created sheets default to "Sheet1" or we can use empty range which writes to first sheet
  const range = "A1"; 
  const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;
  
  const updateResponse = await fetch(updateUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      values
    })
  });
  
  if (!updateResponse.ok) {
    throw new Error("Gagal menulis data pelanggan ke dalam Google Sheets.");
  }
  
  return { spreadsheetId, spreadsheetUrl };
};
