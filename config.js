/**
 * ============================================================================
 * مشروع "ذكريات" (Memories v3.2) - ملف الإعدادات ومصفوفة الموسيقى (5 أغاني)
 * ============================================================================
 */

// قائمة ملفات الأغاني في مجلد songs المباشر (5 أغاني)
const BACKGROUND_SONGS = [
  'songs/song1.mp3',
  'songs/song2.mp3',
  'songs/song3.mp3',
  'songs/song4.mp3',
  'songs/song5.mp3'
];

const CONFIG = {
  // رابط الـ Web App المحدث الخاص بـ Google Apps Script
  webAppUrl: 'https://script.google.com/macros/s/AKfycbxdaFXMeGkZDiL0dZUnJE3uoLoiLXXkXIn4hNAqDWErGQT6f_Dcokkd_5pBrLMJYR9u/exec',

  // أوقات الانتظار ومفاتيح التخزين
  storageKeys: {
    url: 'memories_webapp_url',
    demoAlbums: 'memories_demo_albums_v2',
    unlockedPins: 'memories_unlocked_pins',
    adminSession: 'memories_admin_session'
  }
};
