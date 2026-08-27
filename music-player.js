/* ============================================================
   مشغل موسيقى الذكريات — تشغيل تلقائي + تتابع + تكرار
   ------------------------------------------------------------
   يعتمد على العناصر الموجودة بالفعل في index.html:
     #bgAudioPlayer     -> وسم <audio>
     #btnAudioToggle    -> زر تشغيل/إيقاف
     #audioPlayIcon     -> أيقونة الزر (fa-music / fa-pause)
     #btnAudioNext      -> زر الأغنية التالية
     #audioTrackTitle   -> نص اسم/رقم الأغنية الحالية

   طريقة الاستخدام:
   1) أنشئ مجلد باسم "songs" بجانب index.html.
   2) حط ملفات الأغاني جواه بنفس الأسماء الموجودة في المصفوفة تحت
      (song1.mp3, song2.mp3 ... الخ)، أو غيّر المصفوفة بأسمائك.
   3) ضيف هذا السطر في index.html قبل </body> وقبل app.js مباشرة:
        <script src="music-player.js"></script>
   ============================================================ */

(function () {
  /* -----------------------------------------------------------
   * 1) قائمة التشغيل — عدّل هنا بس لو زودت أو غيّرت الأغاني
   * --------------------------------------------------------- */
  const PLAYLIST = [
    { src: "songs/song1.mp3", label: "أغنية 1" },
    { src: "songs/song2.mp3", label: "أغنية 2" },
    { src: "songs/song3.mp3", label: "أغنية 3" },
    { src: "songs/song4.mp3", label: "أغنية 4" },
    { src: "songs/song5.mp3", label: "أغنية 5" }
  ];

  const DEFAULT_VOLUME = 0.55;

  let currentIndex = 0;
  let hasStartedOnce = false;

  /* -----------------------------------------------------------
   * 2) عناصر DOM
   * --------------------------------------------------------- */
  const audio = document.getElementById("bgAudioPlayer");
  const btnToggle = document.getElementById("btnAudioToggle");
  const playIcon = document.getElementById("audioPlayIcon");
  const btnNext = document.getElementById("btnAudioNext");
  const trackTitle = document.getElementById("audioTrackTitle");
  const floatingPlayer = document.getElementById("audioFloatingPlayer");

  if (!audio) {
    console.warn("مشغل الموسيقى: لم يتم العثور على عنصر #bgAudioPlayer");
    return;
  }

  audio.volume = DEFAULT_VOLUME;

  /* -----------------------------------------------------------
   * 3) شريط تحكم بمستوى الصوت (يُضاف تلقائياً بجانب باقي الأزرار)
   * --------------------------------------------------------- */
  function injectVolumeSlider() {
    if (!floatingPlayer || document.getElementById("audioVolumeRange")) return;

    const wrap = document.createElement("div");
    wrap.style.display = "flex";
    wrap.style.alignItems = "center";
    wrap.style.gap = "4px";

    const icon = document.createElement("i");
    icon.className = "fa-solid fa-volume-low";
    icon.style.fontSize = "0.8rem";
    icon.style.opacity = "0.85";

    const range = document.createElement("input");
    range.type = "range";
    range.id = "audioVolumeRange";
    range.min = "0";
    range.max = "1";
    range.step = "0.05";
    range.value = String(DEFAULT_VOLUME);
    range.style.width = "60px";
    range.style.cursor = "pointer";
    range.addEventListener("input", () => {
      audio.volume = parseFloat(range.value);
    });

    wrap.appendChild(icon);
    wrap.appendChild(range);
    floatingPlayer.appendChild(wrap);
  }

  /* -----------------------------------------------------------
   * 4) وظائف التشغيل الأساسية
   * --------------------------------------------------------- */
  function loadTrack(index, autoplay) {
    currentIndex = ((index % PLAYLIST.length) + PLAYLIST.length) % PLAYLIST.length;
    const track = PLAYLIST[currentIndex];
    audio.src = track.src;
    if (trackTitle) trackTitle.textContent = "🎵 " + track.label;

    if (autoplay) {
      const playPromise = audio.play();
      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(() => {
          // المتصفح رفض التشغيل التلقائي، هيتشغل مع أول تفاعل من المستخدم
          setPlayIcon(false);
        });
      }
    }
  }

  function setPlayIcon(isPlaying) {
    if (!playIcon) return;
    playIcon.classList.toggle("fa-music", !isPlaying);
    playIcon.classList.toggle("fa-pause", isPlaying);
  }

  function playCurrent() {
    const playPromise = audio.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => setPlayIcon(false));
    }
  }

  function pauseCurrent() {
    audio.pause();
  }

  window.toggleAudioPlay = function () {
    if (audio.paused) {
      playCurrent();
    } else {
      pauseCurrent();
    }
  };

  window.playNextSong = function () {
    loadTrack(currentIndex + 1, !audio.paused || !hasStartedOnce);
  };

  function playPrevSong() {
    loadTrack(currentIndex - 1, true);
  }

  /* -----------------------------------------------------------
   * 5) الانتقال التلقائي + التكرار عند انتهاء كل أغنية
   * --------------------------------------------------------- */
  audio.addEventListener("ended", () => {
    loadTrack(currentIndex + 1, true); // يلف على أول أغنية تلقائياً بعد آخر واحدة
  });

  audio.addEventListener("play", () => setPlayIcon(true));
  audio.addEventListener("pause", () => setPlayIcon(false));

  if (btnToggle) btnToggle.addEventListener("click", window.toggleAudioPlay);
  if (btnNext) btnNext.addEventListener("click", window.playNextSong);

  /* -----------------------------------------------------------
   * 6) محاولة التشغيل التلقائي عند فتح الصفحة
   *    ولو المتصفح منعه، هيبدأ مع أول لمسة/نقرة من المستخدم
   * --------------------------------------------------------- */
  function attemptAutoplay() {
    loadTrack(0, true);
    hasStartedOnce = true;
  }

  function startOnFirstInteraction() {
    if (!audio.paused) return; // بالفعل شغّال
    playCurrent();
  }

  document.addEventListener("DOMContentLoaded", () => {
    injectVolumeSlider();
    attemptAutoplay();

    ["click", "touchstart", "keydown"].forEach((evt) => {
      document.addEventListener(
        evt,
        function onFirstInteraction() {
          startOnFirstInteraction();
          document.removeEventListener(evt, onFirstInteraction);
        },
        { once: true }
      );
    });
  });
})();
