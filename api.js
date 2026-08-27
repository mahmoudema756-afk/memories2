/**
 * ============================================================================
 * مشروع "ذكريات" (Memories v3.0) - خدمات الاتصال بالسيرفر والضغط
 * ============================================================================
 */

const ApiService = {
  
  getUrl() {
    return CONFIG.webAppUrl || localStorage.getItem(CONFIG.storageKeys.url) || '';
  },

  async call(action, payload = {}, method = 'POST') {
    const url = this.getUrl();
    if (!url) {
      throw new Error('DEMO_MODE');
    }

    // إرفاق صلاحيات الأدمن تلقائياً إن كانت الجلسة مفعلة
    const adminPass = sessionStorage.getItem(CONFIG.storageKeys.adminSession) || '';
    const fullPayload = { 
      action, 
      adminPassword: adminPass,
      ...payload 
    };

    try {
      if (method === 'GET') {
        const params = new URLSearchParams(fullPayload).toString();
        const response = await fetch(`${url}?${params}`);
        return await response.json();
      } else {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(fullPayload)
        });
        return await response.json();
      }
    } catch (err) {
      console.error('API Fetch Error:', err);
      throw new Error('تعذر الاتصال بـ Google Sheets. تأكد من اتصال الإنترنت وحالة السيرفر.');
    }
  },

  async hashPinClient(pin) {
    if (!pin) return '';
    const msgBuffer = new TextEncoder().encode(pin);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  },

  /**
   * ضغط صورة واحدة بواسطة Canvas
   */
  compressSingleImage(file, maxDimension = 1000, quality = 0.72) {
    return new Promise((resolve, reject) => {
      if (!file) {
        resolve('');
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          if (width > maxDimension || height > maxDimension) {
            if (width > height) {
              height = Math.round((height * maxDimension) / width);
              width = maxDimension;
            } else {
              width = Math.round((width * maxDimension) / height);
              height = maxDimension;
            }
          }

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          const compressedBase64 = canvas.toDataURL('image/jpeg', quality);
          resolve(compressedBase64);
        };
        img.onerror = () => reject(new Error('فشل قراءة ملف الصورة'));
        img.src = e.target.result;
      };
      reader.onerror = () => reject(new Error('حدث خطأ أثناء قراءة الملف'));
      reader.readAsDataURL(file);
    });
  },

  /**
   * ضغط عدة صور دفعة واحدة
   */
  async compressMultipleImages(fileList, maxDimension = 1000, quality = 0.72) {
    const promises = Array.from(fileList).map(file => this.compressSingleImage(file, maxDimension, quality));
    return await Promise.all(promises);
  }
};
