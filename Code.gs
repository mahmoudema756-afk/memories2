/**
 * ============================================================================
 * مشروع "ذكريات" (Memories v3.0) - كود Google Apps Script
 * ============================================================================
 * ملف Backend لإدارة قواعد البيانات وتعدد الصور ووضع الأدمن المحمي.
 * 
 * الجداول (Sheets):
 * 1. Albums: AlbumID, PersonName, Title, PinHash, CreatedAt, CoverImage
 * 2. Photos: PhotoID, AlbumID, ImageData, Notes, Occasion, CreatedAt
 */

// كلمة سر الأدمن (يمكنك تغييرها بسهولة من هنا)
const ADMIN_PASSWORD = 'admin123';

// فاصل الصور المتعددة في الشيت
const IMAGE_DELIMITER = '|||';

// أسماء الشيتات
const SHEET_ALBUMS = 'Albums';
const SHEET_PHOTOS = 'Photos';

/**
 * تهيئة الشيتات وتأكيد وجود العناوين الرئيسية
 */
function setupSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // شيت الألبومات
  let albumSheet = ss.getSheetByName(SHEET_ALBUMS);
  if (!albumSheet) {
    albumSheet = ss.insertSheet(SHEET_ALBUMS);
    albumSheet.appendRow(['AlbumID', 'PersonName', 'Title', 'PinHash', 'CreatedAt', 'CoverImage']);
    albumSheet.getRange(1, 1, 1, 6).setFontWeight('bold').setBackground('#f4ece1');
  }

  // شيت الصور
  let photoSheet = ss.getSheetByName(SHEET_PHOTOS);
  if (!photoSheet) {
    photoSheet = ss.insertSheet(SHEET_PHOTOS);
    photoSheet.appendRow(['PhotoID', 'AlbumID', 'ImageData', 'Notes', 'Occasion', 'CreatedAt']);
    photoSheet.getRange(1, 1, 1, 6).setFontWeight('bold').setBackground('#f4ece1');
  }

  return { albumSheet, photoSheet };
}

/**
 * تشفير الـ PIN باستخدام SHA-256 على مستوى السيرفر
 */
function hashPin(pin) {
  if (!pin) return '';
  const rawHash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, pin.toString(), Utilities.Charset.UTF_8);
  return rawHash.map(function(byte) {
    let v = (byte < 0 ? byte + 256 : byte).toString(16);
    return v.length === 1 ? '0' + v : v;
  }).join('');
}

/**
 * التحقق من صلاحيات الأدمن
 */
function checkAdminAuth(password) {
  return String(password || '').trim() === String(ADMIN_PASSWORD).trim();
}

/**
 * معالج الطلبات من نوع GET (جلب البيانات)
 */
function doGet(e) {
  try {
    setupSheets();
    const action = (e && e.parameter && e.parameter.action) ? e.parameter.action : 'getAlbums';

    if (action === 'getAlbums') {
      return jsonResponse(getAlbumsList());
    }
    
    if (action === 'getAlbum') {
      const albumId = e.parameter.albumId;
      if (!albumId) return jsonResponse({ status: 'error', message: 'AlbumID مطلوب' });
      return jsonResponse(getAlbumDetails(albumId));
    }

    return jsonResponse({ status: 'error', message: 'الإجراء المطلوب غير معروف' });
  } catch (err) {
    return jsonResponse({ status: 'error', message: err.toString() });
  }
}

/**
 * معالج الطلبات من نوع POST (إنشاء، تعديل، حذف، تحقق، أدمن)
 */
function doPost(e) {
  try {
    setupSheets();
    let data;
    if (e && e.postData && e.postData.contents) {
      data = JSON.parse(e.postData.contents);
    } else if (e && e.parameter) {
      data = e.parameter;
    } else {
      data = {};
    }

    const action = data.action;

    // تسجيل دخول الأدمن
    if (action === 'adminLogin') {
      if (checkAdminAuth(data.password)) {
        return jsonResponse({ status: 'success', message: 'تم تفعيل وضع الأدمن بنجاح 🔐', isAdmin: true });
      } else {
        return jsonResponse({ status: 'error', message: 'كلمة سر الأدمن غير صحيحة!' });
      }
    }

    if (action === 'createAlbum') {
      return jsonResponse(createAlbum(data));
    }

    if (action === 'verifyPin') {
      return jsonResponse(verifyAlbumPin(data.albumId, data.pin));
    }

    if (action === 'addPhoto') {
      return jsonResponse(addPhoto(data));
    }

    if (action === 'deletePhoto') {
      return jsonResponse(deletePhoto(data));
    }

    if (action === 'deleteAlbum') {
      return jsonResponse(deleteAlbum(data));
    }

    if (action === 'updatePhoto') {
      return jsonResponse(updatePhoto(data));
    }

    if (action === 'updateAlbum') {
      return jsonResponse(updateAlbum(data));
    }

    return jsonResponse({ status: 'error', message: 'الإجراء المطلوب غير معروف' });
  } catch (err) {
    return jsonResponse({ status: 'error', message: 'خطأ بالسيرفر: ' + err.toString() });
  }
}

/**
 * جلب جميع الألبومات
 */
function getAlbumsList() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_ALBUMS);
  const rows = sheet.getDataRange().getValues();
  
  if (rows.length <= 1) {
    return { status: 'success', albums: [] };
  }

  const albums = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (r[0]) {
      albums.push({
        albumId: String(r[0]),
        personName: String(r[1]),
        title: String(r[2]),
        createdAt: r[4],
        coverImage: String(r[5] || '')
      });
    }
  }

  return { status: 'success', albums: albums };
}

/**
 * جلب ألبوم محدد مع صوره (دعم تعدد الصور)
 */
function getAlbumDetails(albumId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  const albumSheet = ss.getSheetByName(SHEET_ALBUMS);
  const albumRows = albumSheet.getDataRange().getValues();
  let foundAlbum = null;

  for (let i = 1; i < albumRows.length; i++) {
    if (String(albumRows[i][0]) === String(albumId)) {
      foundAlbum = {
        albumId: String(albumRows[i][0]),
        personName: String(albumRows[i][1]),
        title: String(albumRows[i][2]),
        createdAt: albumRows[i][4],
        coverImage: String(albumRows[i][5] || '')
      };
      break;
    }
  }

  if (!foundAlbum) {
    return { status: 'error', message: 'الألبوم غير موجود' };
  }

  const photoSheet = ss.getSheetByName(SHEET_PHOTOS);
  const photoRows = photoSheet.getDataRange().getValues();
  const photos = [];

  for (let j = 1; j < photoRows.length; j++) {
    if (String(photoRows[j][1]) === String(albumId)) {
      const rawImgData = String(photoRows[j][2] || '');
      // إذا كانت تحتوي على فاصل الصور المتعددة
      const imageList = rawImgData.indexOf(IMAGE_DELIMITER) !== -1 
        ? rawImgData.split(IMAGE_DELIMITER) 
        : [rawImgData];

      photos.push({
        photoId: String(photoRows[j][0]),
        albumId: String(photoRows[j][1]),
        imageData: imageList[0] || '', // الصورة الأولى كغلاف
        images: imageList,             // مصفوفة الصور الكاملة
        notes: String(photoRows[j][3] || ''),
        occasion: String(photoRows[j][4] || ''),
        createdAt: photoRows[j][5]
      });
    }
  }

  return { status: 'success', album: foundAlbum, photos: photos };
}

/**
 * إنشاء ألبوم جديد
 */
function createAlbum(data) {
  const personName = (data.personName || '').trim();
  const title = (data.title || '').trim();
  const pin = (data.pin || '').trim();
  const coverImage = (data.coverImage || '').trim();

  if (!personName || !title || !pin) {
    return { status: 'error', message: 'يرجى إدخال اسم الشخص، اللقب، والرقم السري' };
  }

  const albumId = 'alb_' + new Date().getTime() + '_' + Math.floor(Math.random() * 1000);
  const pinHash = hashPin(pin);
  const createdAt = new Date().toISOString();

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_ALBUMS);
  sheet.appendRow([albumId, personName, title, pinHash, createdAt, coverImage]);

  return {
    status: 'success',
    message: 'تم إنشاء الألبوم بنجاح',
    album: { albumId, personName, title, createdAt, coverImage }
  };
}

/**
 * التحقق من الـ PIN على الخادم
 */
function verifyAlbumPin(albumId, pin) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_ALBUMS);
  const rows = sheet.getDataRange().getValues();

  const pinHash = hashPin(pin);

  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(albumId)) {
      const storedHash = String(rows[i][3]);
      if (storedHash === pinHash) {
        return { status: 'success', message: 'تم التحقق من الرقم السري بنجاح', verified: true };
      } else {
        return { status: 'error', message: 'الرقم السري خاطئ!', verified: false };
      }
    }
  }

  return { status: 'error', message: 'الألبوم غير موجود' };
}

/**
 * إضافة ذكرى جديدة (دعم الصور المتعددة والأدمن)
 */
function addPhoto(data) {
  const albumId = data.albumId;
  const pin = data.pin;
  const isAdmin = checkAdminAuth(data.adminPassword);
  
  // imageData قد يكون مصفوفة من الصور أو نص واحد
  let rawImages = data.images || data.imageData || [];
  if (!Array.isArray(rawImages)) {
    rawImages = [rawImages];
  }
  const formattedImages = rawImages.filter(img => img && String(img).trim() !== '').join(IMAGE_DELIMITER);

  if (!albumId || !formattedImages) {
    return { status: 'error', message: 'معرف الألبوم وبيانات الصور مطلوبة' };
  }

  // إذا لم يكن أدمن، يتم التحقق من الـ PIN
  if (!isAdmin) {
    const auth = verifyAlbumPin(albumId, pin);
    if (!auth.verified) return auth;
  }

  const photoId = 'pho_' + new Date().getTime() + '_' + Math.floor(Math.random() * 1000);
  const createdAt = new Date().toISOString();
  const notes = data.notes || '';
  const occasion = data.occasion || '';

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const photoSheet = ss.getSheetByName(SHEET_PHOTOS);
  photoSheet.appendRow([photoId, albumId, formattedImages, notes, occasion, createdAt]);

  // تحديث غلاف الألبوم إذا لم يكن له غلاف بعد
  const firstImg = rawImages[0] || '';
  const albumSheet = ss.getSheetByName(SHEET_ALBUMS);
  const albumRows = albumSheet.getDataRange().getValues();
  for (let i = 1; i < albumRows.length; i++) {
    if (String(albumRows[i][0]) === String(albumId)) {
      if (!albumRows[i][5] && firstImg) {
        albumSheet.getRange(i + 1, 6).setValue(firstImg);
      }
      break;
    }
  }

  return {
    status: 'success',
    message: 'تمت إضافة الذكرى بنجاح',
    photo: { photoId, albumId, imageData: firstImg, images: rawImages, notes, occasion, createdAt }
  };
}

/**
 * حذف ذكرى محددة (دعم الأدمن)
 */
function deletePhoto(data) {
  const albumId = data.albumId;
  const photoId = data.photoId;
  const pin = data.pin;
  const isAdmin = checkAdminAuth(data.adminPassword);

  if (!isAdmin) {
    const auth = verifyAlbumPin(albumId, pin);
    if (!auth.verified) return auth;
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const photoSheet = ss.getSheetByName(SHEET_PHOTOS);
  const rows = photoSheet.getDataRange().getValues();

  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(photoId)) {
      photoSheet.deleteRow(i + 1);
      return { status: 'success', message: 'تم حذف الذكرى بنجاح' };
    }
  }

  return { status: 'error', message: 'الذكرى غير موجودة' };
}

/**
 * حذف ألبوم بالكامل (دعم الأدمن)
 */
function deleteAlbum(data) {
  const albumId = data.albumId;
  const pin = data.pin;
  const isAdmin = checkAdminAuth(data.adminPassword);

  if (!isAdmin) {
    const auth = verifyAlbumPin(albumId, pin);
    if (!auth.verified) return auth;
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const albumSheet = ss.getSheetByName(SHEET_ALBUMS);
  const albumRows = albumSheet.getDataRange().getValues();

  for (let i = 1; i < albumRows.length; i++) {
    if (String(albumRows[i][0]) === String(albumId)) {
      albumSheet.deleteRow(i + 1);
      break;
    }
  }

  const photoSheet = ss.getSheetByName(SHEET_PHOTOS);
  let photoRows = photoSheet.getDataRange().getValues();
  for (let j = photoRows.length - 1; j >= 1; j--) {
    if (String(photoRows[j][1]) === String(albumId)) {
      photoSheet.deleteRow(j + 1);
    }
  }

  return { status: 'success', message: 'تم حذف الألبوم بالكامل بنجاح' };
}

/**
 * تعديل ألبوم (اسم الشخص / اللقب / الغلاف) - ميزة الأدمن
 */
function updateAlbum(data) {
  const albumId = data.albumId;
  const isAdmin = checkAdminAuth(data.adminPassword);

  if (!isAdmin) {
    return { status: 'error', message: 'عذراً، هذه الصلاحية مخصصة للأدمن فقط' };
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const albumSheet = ss.getSheetByName(SHEET_ALBUMS);
  const rows = albumSheet.getDataRange().getValues();

  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(albumId)) {
      if (data.personName) albumSheet.getRange(i + 1, 2).setValue(data.personName);
      if (data.title) albumSheet.getRange(i + 1, 3).setValue(data.title);
      if (data.coverImage) albumSheet.getRange(i + 1, 6).setValue(data.coverImage);
      return { status: 'success', message: 'تم تحديث ألبوم الشخص بنجاح' };
    }
  }

  return { status: 'error', message: 'الألبوم غير موجود' };
}

/**
 * تعديل ذكرى (الملاحظات / المناسبة / الصور) - دعم الأدمن
 */
function updatePhoto(data) {
  const albumId = data.albumId;
  const photoId = data.photoId;
  const pin = data.pin;
  const isAdmin = checkAdminAuth(data.adminPassword);

  if (!isAdmin) {
    const auth = verifyAlbumPin(albumId, pin);
    if (!auth.verified) return auth;
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const photoSheet = ss.getSheetByName(SHEET_PHOTOS);
  const rows = photoSheet.getDataRange().getValues();

  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(photoId)) {
      if (data.notes !== undefined) photoSheet.getRange(i + 1, 4).setValue(data.notes);
      if (data.occasion !== undefined) photoSheet.getRange(i + 1, 5).setValue(data.occasion);
      if (data.images && Array.isArray(data.images)) {
        photoSheet.getRange(i + 1, 3).setValue(data.images.join(IMAGE_DELIMITER));
      }
      return { status: 'success', message: 'تم تحديث الذكرى بنجاح' };
    }
  }

  return { status: 'error', message: 'لم يتم العثور على الذكرى' };
}

/**
 * تنسيق رد JSON
 */
function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
