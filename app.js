/**
 * ============================================================================
 * مشروع "ذكريات" (Memories v3.2) - كود التطبيق والموسيقى والملاحظات والانميشن
 * ============================================================================
 */

// حالة الجلسة وصلاحيات الأدمن والألبومات المفتوحة
let unlockedAlbums = JSON.parse(sessionStorage.getItem(CONFIG.storageKeys.unlockedPins) || '{}');

const AppState = {
  albums: [],
  currentAlbum: null,
  photos: [],
  selectedMemoryImages: [],
  compressedCoverBase64: '',
  currentSongIndex: 0,
  isPlayingAudio: false,
  
  // حالة Lightbox المعرض المتعدد
  currentLightboxImages: [],
  currentLightboxIndex: 0,
  touchStartX: 0,
  touchEndX: 0
};

// التشغيل الأولي
document.addEventListener('DOMContentLoaded', () => {
  initAudioPlayer();
  checkAdminSession();
  loadAlbums();
  initSwipeEvents();
});

/**
 * ============================================================================
 * 1. نظام الموسيقى الخلفية المتعدد (5 أغاني) مع التتابع التلقائي
 * ============================================================================
 */
let audioPlayer = null;

function initAudioPlayer() {
  audioPlayer = document.getElementById('bgAudioPlayer');
  if (!audioPlayer) return;

  // المعالجة الفائقة لأخطاء تحميل الصوت (التخطي الآلي للملفات غير الموجودة)
  audioPlayer.onerror = (e) => {
    console.warn('تعذر تحميل ملف الصوت الحالي:', audioPlayer.src);
    setTimeout(() => {
      if (BACKGROUND_SONGS && BACKGROUND_SONGS.length > 1) {
        playNextSong();
      }
    }, 1000);
  };

  // التتابع التلقائي عند انتهاء الأغنية (Loop & Auto-advance)
  audioPlayer.onended = () => {
    playNextSong();
  };

  // فك حظر الصوت التلقائي عند أول لمسة أو نقرة في أي مكان
  const unlockAudioOnInteraction = () => {
    if (audioPlayer && !AppState.isPlayingAudio && BACKGROUND_SONGS && BACKGROUND_SONGS.length > 0) {
      audioPlayer.play().then(() => {
        AppState.isPlayingAudio = true;
        updateAudioIcon();
      }).catch(e => console.log('انتظار تفاعل المستخدم...'));
    }
    document.removeEventListener('click', unlockAudioOnInteraction);
    document.removeEventListener('touchstart', unlockAudioOnInteraction);
    document.removeEventListener('pointerdown', unlockAudioOnInteraction);
  };

  document.addEventListener('click', unlockAudioOnInteraction);
  document.addEventListener('touchstart', unlockAudioOnInteraction);
  document.addEventListener('pointerdown', unlockAudioOnInteraction);

  // مصفوفة الأغاني الخمسة من config.js
  if (BACKGROUND_SONGS && BACKGROUND_SONGS.length > 0) {
    loadAndPlaySong(AppState.currentSongIndex, true);
  }
}

function loadAndPlaySong(index, isAutoStart = false) {
  if (!audioPlayer || !BACKGROUND_SONGS || BACKGROUND_SONGS.length === 0) return;
  
  AppState.currentSongIndex = index % BACKGROUND_SONGS.length;
  const songUrl = BACKGROUND_SONGS[AppState.currentSongIndex];
  
  try {
    audioPlayer.pause();
    audioPlayer.currentTime = 0;
    audioPlayer.src = songUrl;
    audioPlayer.load();
  } catch (e) {
    console.error('Audio load error:', e);
  }

  // عرض اسم الأغنية
  const songName = songUrl.split('/').pop().replace(/\.[^/.]+$/, '');
  const trackTitleEl = document.getElementById('audioTrackTitle');
  if (trackTitleEl) {
    try {
      trackTitleEl.innerText = decodeURIComponent(songName) || `أغنية ${AppState.currentSongIndex + 1}`;
    } catch(e) {
      trackTitleEl.innerText = songName;
    }
  }

  const playPromise = audioPlayer.play();
  if (playPromise !== undefined) {
    playPromise.then(() => {
      AppState.isPlayingAudio = true;
      updateAudioIcon();
    }).catch(err => {
      console.warn('Autoplay waiting for user gesture:', err);
      AppState.isPlayingAudio = false;
      updateAudioIcon();
    });
  }
}

function toggleAudioPlay() {
  if (!audioPlayer) return;
  if (AppState.isPlayingAudio) {
    audioPlayer.pause();
    AppState.isPlayingAudio = false;
  } else {
    if (!audioPlayer.src || audioPlayer.src === '' || audioPlayer.src.endsWith('/')) {
      loadAndPlaySong(AppState.currentSongIndex);
    } else {
      audioPlayer.play().then(() => {
        AppState.isPlayingAudio = true;
      }).catch(err => {
        console.error(err);
        loadAndPlaySong(AppState.currentSongIndex);
      });
    }
  }
  updateAudioIcon();
}

function playNextSong() {
  const nextIndex = (AppState.currentSongIndex + 1) % BACKGROUND_SONGS.length;
  loadAndPlaySong(nextIndex);
}

function updateAudioIcon() {
  const icon = document.getElementById('audioPlayIcon');
  if (!icon) return;
  if (AppState.isPlayingAudio) {
    icon.className = 'fa-solid fa-pause';
  } else {
    icon.className = 'fa-solid fa-music';
  }
}

/**
 * ============================================================================
 * 2. إدارة وضع الأدمن المحمي
 * ============================================================================
 */
function checkAdminSession() {
  const adminPass = sessionStorage.getItem(CONFIG.storageKeys.adminSession);
  const badge = document.getElementById('adminActiveBadge');
  if (adminPass && badge) {
    badge.style.display = 'inline-flex';
  }
}

function isAdminActive() {
  return !!sessionStorage.getItem(CONFIG.storageKeys.adminSession);
}

function openAdminModal() {
  document.getElementById('adminPasswordInput').value = '';
  openModal('adminModal');
}

async function handleAdminLogin(e) {
  e.preventDefault();
  const password = document.getElementById('adminPasswordInput').value.trim();
  if (!password) return;

  const submitBtn = document.getElementById('btnSubmitAdmin');
  setBtnLoading(submitBtn, true);

  try {
    const res = await ApiService.call('adminLogin', { password });
    if (res.status === 'success' && res.isAdmin) {
      sessionStorage.setItem(CONFIG.storageKeys.adminSession, password);
      showToast('تم تفعيل وضع الأدمن بنجاح 🔐', 'success');
      closeModal('adminModal');
      checkAdminSession();
      if (AppState.currentAlbum) {
        updateUnlockUIState();
        renderPhotos(AppState.photos);
      }
    } else {
      showToast(res.message || 'كلمة السر غير صحيحة', 'error');
    }
  } catch (err) {
    showToast(err.message || 'حدث خطأ أثناء التحقق من كلمة سر الأدمن', 'error');
  } finally {
    setBtnLoading(submitBtn, false);
  }
}

/**
 * ============================================================================
 * 3. جلب وعرض الألبومات
 * ============================================================================
 */
async function loadAlbums() {
  try {
    const url = ApiService.getUrl();
    if (!url) {
      renderAlbums([]);
      return;
    }

    const res = await ApiService.call('getAlbums', {}, 'GET');
    if (res.status === 'success') {
      AppState.albums = res.albums || [];
      renderAlbums(AppState.albums);
    } else {
      showToast(res.message || 'تعذر جلب البيانات من السيرفر', 'error');
      renderAlbums([]);
    }

  } catch (err) {
    console.error('Load albums error:', err);
    showToast(err.message || 'حدث خطأ أثناء تحميل البيانات من السيرفر', 'error');
    renderAlbums([]);
  }
}

function renderAlbums(albumsList) {
  const grid = document.getElementById('albumsGrid');
  grid.innerHTML = '';

  if (!albumsList || albumsList.length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-box-archive"></i>
        <h3>لا توجد ألبومات حتى الآن</h3>
        <p>ابدأ بإنشاء أول ألبوم لحفظ ذكريات ومواقف الأشخاص المفضلين لديك!</p>
        <button class="btn btn-primary" onclick="openCreateAlbumModal()">
          <i class="fa-solid fa-plus"></i> إنشاء ألبوم جديد
        </button>
      </div>
    `;
    return;
  }

  albumsList.forEach((alb, index) => {
    const coverHtml = alb.coverImage 
      ? `<img src="${alb.coverImage}" class="polaroid-img" alt="${escapeHtml(alb.personName)}">`
      : `<div class="polaroid-placeholder"><i class="fa-solid fa-image fa-2x"></i><span>بدون غلاف</span></div>`;

    const card = document.createElement('div');
    card.className = 'polaroid-card';
    card.style.animationDelay = `${index * 0.07}s`;
    card.onclick = () => openAlbumView(alb.albumId);

    card.innerHTML = `
      <div class="polaroid-img-wrapper">
        ${coverHtml}
      </div>
      <div class="polaroid-content">
        <h3 class="polaroid-name">${escapeHtml(alb.personName)}</h3>
        <div class="polaroid-title">${escapeHtml(alb.title)}</div>
      </div>
      <div class="polaroid-footer">
        <span><i class="fa-regular fa-calendar"></i> ${formatDate(alb.createdAt)}</span>
        <span class="btn-sm btn-outline-gold">عرض الذكريات <i class="fa-solid fa-arrow-left"></i></span>
      </div>
    `;
    grid.appendChild(card);
  });
}

function filterAlbums() {
  const q = document.getElementById('searchInput').value.toLowerCase().trim();
  if (!q) {
    renderAlbums(AppState.albums);
    return;
  }
  const filtered = AppState.albums.filter(a => 
    (a.personName && a.personName.toLowerCase().includes(q)) || 
    (a.title && a.title.toLowerCase().includes(q))
  );
  renderAlbums(filtered);
}

/**
 * ============================================================================
 * 4. فتح وتصفح الألبوم والأنيميشن
 * ============================================================================
 */
async function openAlbumView(albumId) {
  showToast('جاري فتح ألبوم الذكريات...', 'info');
  
  try {
    const res = await ApiService.call('getAlbum', { albumId }, 'GET');
    if (res.status === 'success') {
      AppState.currentAlbum = res.album;
      AppState.photos = res.photos || [];
    } else {
      showToast(res.message || 'تعذر تحميل الألبوم', 'error');
      return;
    }

    const heroSection = document.getElementById('heroSection');
    const albumsSection = document.getElementById('albumsSection');
    const viewSec = document.getElementById('albumViewSection');

    heroSection.style.display = 'none';
    albumsSection.style.display = 'none';
    
    viewSec.classList.remove('active');
    void viewSec.offsetWidth;
    viewSec.classList.add('active');

    document.getElementById('albumViewPersonName').innerText = AppState.currentAlbum.personName;
    document.getElementById('albumViewTitle').innerText = AppState.currentAlbum.title;

    const avatarContainer = document.getElementById('albumHeaderAvatarContainer');
    if (AppState.currentAlbum.coverImage) {
      avatarContainer.innerHTML = `<img src="${AppState.currentAlbum.coverImage}" class="album-avatar" alt="${escapeHtml(AppState.currentAlbum.personName)}">`;
    } else {
      avatarContainer.innerHTML = `<div class="album-avatar-placeholder">${AppState.currentAlbum.personName.charAt(0)}</div>`;
    }

    updateUnlockUIState();
    renderPhotos(AppState.photos);
    window.scrollTo({ top: 0, behavior: 'smooth' });

  } catch (err) {
    showToast(err.message || 'حدث خطأ في تحميل الألبوم', 'error');
  }
}

function showAlbumsGrid() {
  const viewSec = document.getElementById('albumViewSection');
  viewSec.classList.remove('active');

  setTimeout(() => {
    document.getElementById('heroSection').style.display = 'block';
    document.getElementById('albumsSection').style.display = 'block';
    AppState.currentAlbum = null;
    loadAlbums();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, 200);
}

function updateUnlockUIState() {
  if (!AppState.currentAlbum) return;
  const albumId = AppState.currentAlbum.albumId;
  const isUnlocked = !!unlockedAlbums[albumId] || isAdminActive();

  const lockBadge = document.getElementById('albumLockBadge');
  const btnUnlock = document.getElementById('btnUnlockAlbum');
  const btnAdd = document.getElementById('btnAddPhoto');
  const btnDelete = document.getElementById('btnDeleteAlbum');

  if (isUnlocked) {
    lockBadge.className = 'lock-badge unlocked';
    lockBadge.innerHTML = isAdminActive() 
      ? `<i class="fa-solid fa-shield-halved"></i> <span>وضع الأدمن مفعل</span>`
      : `<i class="fa-solid fa-lock-open"></i> <span>وضع التعديل مفعل</span>`;
    btnUnlock.style.display = 'none';
    btnAdd.style.display = 'inline-flex';
    btnDelete.style.display = 'inline-flex';
  } else {
    lockBadge.className = 'lock-badge locked';
    lockBadge.innerHTML = `<i class="fa-solid fa-lock"></i> <span>وضع العرض فقط</span>`;
    btnUnlock.style.display = 'inline-flex';
    btnAdd.style.display = 'none';
    btnDelete.style.display = 'none';
  }
}

function renderPhotos(photosList) {
  const grid = document.getElementById('photosGrid');
  grid.innerHTML = '';

  if (!photosList || photosList.length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-camera-retro"></i>
        <h3>لا توجد صور في هذا الألبوم بعد</h3>
        <p>قم بتفعيل وضع التعديل باستخدام الرقم السري لإضافة أول ذكرى وصورة!</p>
      </div>
    `;
    return;
  }

  const isUnlocked = !!unlockedAlbums[AppState.currentAlbum.albumId] || isAdminActive();

  photosList.forEach((pho, index) => {
    const card = document.createElement('div');
    card.className = 'photo-card';
    card.style.setProperty('--stagger-index', index);

    const imagesArray = pho.images && pho.images.length > 0 ? pho.images : [pho.imageData];
    const firstImage = imagesArray[0] || '';
    const extraCount = imagesArray.length - 1;

    const multiBadgeHtml = extraCount > 0 
      ? `<div class="multi-photo-badge"><i class="fa-solid fa-layer-group"></i> +${extraCount} صور</div>`
      : '';

    const deleteBtnHtml = isUnlocked 
      ? `<button class="action-btn delete" onclick="confirmDeletePhoto('${pho.photoId}')" title="حذف الذكرى"><i class="fa-solid fa-trash-can"></i></button>`
      : '';

    card.innerHTML = `
      <div class="photo-img-container" onclick="openLightboxForPhoto('${pho.photoId}')">
        ${multiBadgeHtml}
        <img src="${firstImage}" class="photo-img" alt="ذكرى">
        <div class="photo-zoom-icon"><i class="fa-solid fa-magnifying-glass-plus"></i></div>
      </div>
      <div class="photo-details">
        <div class="photo-occasion">
          <i class="fa-solid fa-tag"></i> ${escapeHtml(pho.occasion) || 'ذكرى خاصة'}
        </div>
        ${pho.notes ? `<div class="photo-notes">"${escapeHtml(pho.notes)}"</div>` : ''}
        <div class="photo-meta">
          <span><i class="fa-regular fa-clock"></i> ${formatDate(pho.createdAt)}</span>
          ${deleteBtnHtml}
        </div>
      </div>
    `;
    grid.appendChild(card);
  });
}

/**
 * ============================================================================
 * 5. إضافة الذكرى والمعاينة المصغرة المحجمة
 * ============================================================================
 */
function openAddPhotoModal() {
  const albumId = AppState.currentAlbum.albumId;
  if (!unlockedAlbums[albumId] && !isAdminActive()) {
    openPinModal();
    return;
  }
  document.getElementById('addPhotoForm').reset();
  AppState.selectedMemoryImages = [];
  renderThumbnailPreviews();
  openModal('addPhotoModal');
}

async function handleMultipleFilesSelect(input) {
  const files = input.files;
  if (!files || files.length === 0) return;

  showToast('جاري تحضير وتصغير الصور المختارة...', 'info');

  try {
    const compressedList = await ApiService.compressMultipleImages(files);
    AppState.selectedMemoryImages.push(...compressedList);
    renderThumbnailPreviews();
  } catch (err) {
    showToast('فشل معالجة الصور المختارة', 'error');
  }
}

function renderThumbnailPreviews() {
  const container = document.getElementById('thumbPreviewGrid');
  container.innerHTML = '';

  AppState.selectedMemoryImages.forEach((imgBase64, index) => {
    const item = document.createElement('div');
    item.className = 'thumb-preview-item';
    item.innerHTML = `
      <img src="${imgBase64}" alt="معاينة ${index + 1}">
      <button type="button" class="thumb-remove-btn" onclick="removeSelectedThumbnail(${index})" title="حذف الصورة"><i class="fa-solid fa-xmark"></i></button>
    `;
    container.appendChild(item);
  });
}

function removeSelectedThumbnail(index) {
  AppState.selectedMemoryImages.splice(index, 1);
  renderThumbnailPreviews();
}

async function handleAddPhoto(e) {
  e.preventDefault();
  const albumId = AppState.currentAlbum.albumId;
  const pin = unlockedAlbums[albumId] || '';
  const occasion = document.getElementById('photoOccasion').value.trim();
  const notes = document.getElementById('photoNotes').value.trim();
  const images = AppState.selectedMemoryImages;

  if (!images || images.length === 0) {
    showToast('يرجى اختيار صورة واحدة على الأقل للذكرى', 'error');
    return;
  }
  if (!occasion) {
    showToast('يرجى كتابة المناسبة أو الموقف', 'error');
    return;
  }

  const submitBtn = document.getElementById('btnSubmitPhoto');
  setBtnLoading(submitBtn, true);

  try {
    const res = await ApiService.call('addPhoto', { albumId, pin, images, occasion, notes });
    if (res.status === 'success') {
      showToast('تمت إضافة الذكرى وحفظ صورها بنجاح! 📸', 'success');
      closeModal('addPhotoModal');
      await openAlbumView(albumId);
    } else {
      showToast(res.message || 'فشل إرسال الذكرى', 'error');
    }
  } catch (err) {
    showToast(err.message || 'حدث خطأ أثناء إضافة الذكرى', 'error');
  } finally {
    setBtnLoading(submitBtn, false);
  }
}

async function handleSingleFileSelect(input, previewId) {
  const file = input.files[0];
  if (!file) return;

  try {
    const compressed = await ApiService.compressSingleImage(file);
    const preview = document.getElementById(previewId);
    preview.src = compressed;
    preview.style.display = 'block';
    AppState.compressedCoverBase64 = compressed;
  } catch (err) {
    showToast('فشل قراءة صورة الغلاف', 'error');
  }
}

/**
 * ============================================================================
 * 6. المعرض العائم (Lightbox) والسحب باللمس Swipe
 * ============================================================================
 */
function openLightboxForPhoto(photoId) {
  const pho = AppState.photos.find(p => p.photoId === photoId);
  if (!pho) return;

  AppState.currentLightboxImages = pho.images && pho.images.length > 0 ? pho.images : [pho.imageData];
  AppState.currentLightboxIndex = 0;

  document.getElementById('lightboxOccasion').innerHTML = `<i class="fa-solid fa-tag"></i> ${escapeHtml(pho.occasion)}`;
  document.getElementById('lightboxNotes').innerText = pho.notes ? `"${escapeHtml(pho.notes)}"` : 'لا توجد ملاحظات إضافية.';
  document.getElementById('lightboxDate').innerHTML = `<i class="fa-regular fa-clock"></i> تاريخ الذكرى: ${formatDate(pho.createdAt)}`;

  updateLightboxView();
  openModal('lightboxModal');
}

function updateLightboxView() {
  const imgs = AppState.currentLightboxImages;
  const idx = AppState.currentLightboxIndex;
  
  const imgEl = document.getElementById('lightboxImg');
  const prevBtn = document.getElementById('btnLightboxPrev');
  const nextBtn = document.getElementById('btnLightboxNext');
  const dotsContainer = document.getElementById('lightboxDots');

  imgEl.src = imgs[idx] || '';

  if (imgs.length > 1) {
    prevBtn.style.display = 'flex';
    nextBtn.style.display = 'flex';
  } else {
    prevBtn.style.display = 'none';
    nextBtn.style.display = 'none';
  }

  dotsContainer.innerHTML = '';
  if (imgs.length > 1) {
    imgs.forEach((_, i) => {
      const dot = document.createElement('div');
      dot.className = `dot ${i === idx ? 'active' : ''}`;
      dot.onclick = () => {
        AppState.currentLightboxIndex = i;
        updateLightboxView();
      };
      dotsContainer.appendChild(dot);
    });
  }
}

function navigateLightbox(direction) {
  const total = AppState.currentLightboxImages.length;
  if (total <= 1) return;

  AppState.currentLightboxIndex = (AppState.currentLightboxIndex + direction + total) % total;
  
  const imgEl = document.getElementById('lightboxImg');
  imgEl.style.opacity = '0.3';
  setTimeout(() => {
    updateLightboxView();
    imgEl.style.opacity = '1';
  }, 150);
}

function initSwipeEvents() {
  const viewport = document.getElementById('lightboxViewport');
  if (!viewport) return;

  viewport.addEventListener('touchstart', (e) => {
    AppState.touchStartX = e.changedTouches[0].screenX;
  }, { passive: true });

  viewport.addEventListener('touchend', (e) => {
    AppState.touchEndX = e.changedTouches[0].screenX;
    handleSwipeGesture();
  }, { passive: true });
}

function handleSwipeGesture() {
  const diffX = AppState.touchStartX - AppState.touchEndX;
  if (Math.abs(diffX) > 40) {
    if (diffX > 0) {
      navigateLightbox(1);
    } else {
      navigateLightbox(-1);
    }
  }
}

/**
 * ============================================================================
 * 7. إنشاء وحذف الألبومات والتحقق من PIN
 * ============================================================================
 */
async function handleCreateAlbum(e) {
  e.preventDefault();
  const personName = document.getElementById('albumPersonName').value.trim();
  const title = document.getElementById('albumTitle').value.trim();
  const pin = document.getElementById('albumPin').value.trim();
  const coverImage = AppState.compressedCoverBase64;

  if (!personName || !title || !pin) {
    showToast('يرجى إدخال جميع الحقول المطلوبة', 'error');
    return;
  }

  const submitBtn = document.getElementById('btnSubmitAlbum');
  setBtnLoading(submitBtn, true);

  try {
    const res = await ApiService.call('createAlbum', { personName, title, pin, coverImage });
    if (res.status === 'success') {
      showToast('تم إنشاء الألبوم بنجاح في Google Sheets! 🎉', 'success');
      unlockedAlbums[res.album.albumId] = pin;
      sessionStorage.setItem(CONFIG.storageKeys.unlockedPins, JSON.stringify(unlockedAlbums));

      closeModal('createAlbumModal');
      resetAlbumForm();
      await loadAlbums();
    } else {
      showToast(res.message || 'فشل إنشاء الألبوم', 'error');
    }
  } catch (err) {
    showToast(err.message || 'حدث خطأ أثناء حفظ الألبوم', 'error');
  } finally {
    setBtnLoading(submitBtn, false);
  }
}

function resetAlbumForm() {
  document.getElementById('createAlbumForm').reset();
  document.getElementById('albumCoverPreview').style.display = 'none';
  AppState.compressedCoverBase64 = '';
}

function openPinModal() {
  if (!AppState.currentAlbum) return;
  document.getElementById('pinAlbumName').innerText = AppState.currentAlbum.personName;
  document.getElementById('inputPinCode').value = '';
  openModal('pinModal');
}

async function handleVerifyPin(e) {
  e.preventDefault();
  const pin = document.getElementById('inputPinCode').value.trim();
  const albumId = AppState.currentAlbum.albumId;

  if (!pin) return;

  const submitBtn = document.getElementById('btnSubmitPin');
  setBtnLoading(submitBtn, true);

  try {
    const res = await ApiService.call('verifyPin', { albumId, pin });
    if (res.status === 'success' && res.verified) {
      unlockedAlbums[albumId] = pin;
      sessionStorage.setItem(CONFIG.storageKeys.unlockedPins, JSON.stringify(unlockedAlbums));
      showToast('تم تفعيل وضع التعديل بنجاح 🔓', 'success');
      closeModal('pinModal');
      updateUnlockUIState();
      renderPhotos(AppState.photos);
    } else {
      showToast(res.message || 'الرقم السري خاطئ! تعذر الفتح.', 'error');
    }
  } catch (err) {
    showToast(err.message || 'خطأ أثناء التحقق من الرقم السري', 'error');
  } finally {
    setBtnLoading(submitBtn, false);
  }
}

async function confirmDeletePhoto(photoId) {
  if (!confirm('هل أنت متأكد من رغبتك في حذف هذه الذكرى؟')) return;

  const albumId = AppState.currentAlbum.albumId;
  const pin = unlockedAlbums[albumId] || '';

  showToast('جاري الحذف من السيرفر...', 'info');

  try {
    const res = await ApiService.call('deletePhoto', { albumId, photoId, pin });
    if (res.status === 'success') {
      showToast('تم حذف الذكرى بنجاح', 'success');
      await openAlbumView(albumId);
    } else {
      showToast(res.message || 'تعذر الحذف', 'error');
    }
  } catch (err) {
    showToast(err.message || 'خطأ أثناء عملية الحذف', 'error');
  }
}

async function confirmDeleteAlbum() {
  if (!confirm('تنبيه هام: هل أنت متأكد من رغبتك في حذف الألبوم بالكامل وكافة صوره؟')) return;

  const albumId = AppState.currentAlbum.albumId;
  const pin = unlockedAlbums[albumId] || '';

  showToast('جاري حذف الألبوم من السيرفر...', 'info');

  try {
    const res = await ApiService.call('deleteAlbum', { albumId, pin });
    if (res.status === 'success') {
      showToast('تم حذف الألبوم بالكامل من Google Sheets', 'success');
      showAlbumsGrid();
    } else {
      showToast(res.message || 'تعذر حذف الألبوم', 'error');
    }
  } catch (err) {
    showToast(err.message || 'خطأ أثناء حذف الألبوم', 'error');
  }
}

/**
 * ============================================================================
 * 8. النوافذ والتنبيهات
 * ============================================================================
 */
function openModal(modalId) {
  const m = document.getElementById(modalId);
  if (m) m.classList.add('active');
}

function closeModal(modalId) {
  const m = document.getElementById(modalId);
  if (m) m.classList.remove('active');
}

function openCreateAlbumModal() {
  resetAlbumForm();
  openModal('createAlbumModal');
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  let icon = 'fa-info-circle';
  if (type === 'success') icon = 'fa-check-circle';
  if (type === 'error') icon = 'fa-exclamation-circle';

  toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(-100%)';
    toast.style.transition = 'all 0.35s ease';
    setTimeout(() => toast.remove(), 350);
  }, 3500);
}

function setBtnLoading(btn, isLoading) {
  if (isLoading) {
    btn.disabled = true;
    btn.dataset.origText = btn.innerHTML;
    btn.innerHTML = `<div class="spinner"></div> <span>جاري المعالجة...</span>`;
  } else {
    btn.disabled = false;
    if (btn.dataset.origText) {
      btn.innerHTML = btn.dataset.origText;
    }
  }
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch (e) {
    return dateStr;
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
}
