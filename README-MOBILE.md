# 📱 TIA Enterprise Mobile App Guide

**Tirupati Intellect Authority** • *Empowering Tirupati with AI*  
**Founder & CEO:** M. Bhargav Rayudu (B.Tech Mechatronics • CAD Diploma)  
**Official GSTIN:** `37EYLPM8018M1ZN`

---

## 🚀 How to Use / Install on Mobile

### Method 1: Instant PWA Mobile App (1-Tap Installation on Any Phone)

The portal has been converted into a **Progressive Web App (PWA)** with native mobile behaviors:

#### On Android (Google Chrome, Edge, Brave, Samsung Internet):
1. Open the live URL:  
   👉 **`https://tia-tirupati-intellect-authority.onrender.com`** *(or `http://<your-pc-ip>:3000` locally)*
2. A banner will appear at the top: **"Install TIA Enterprise Mobile"**. Tap **"Install"**.
   *(Alternatively, tap the 3 dots **⋮** at the top right of Chrome and select **"Install app"** or **"Add to Home screen"**)*.
3. The **TIA Mobile App** icon will appear on your phone's home screen and app drawer.
4. When opened, it runs in **full-screen standalone mode** with no browser address bar!

#### On iPhone / iPad (Safari):
1. Open the URL in **Safari**:  
   👉 **`https://tia-tirupati-intellect-authority.onrender.com`**
2. Tap the **Share** button (the square icon with an upward arrow ⎋ at the bottom).
3. Scroll down and tap **"Add to Home Screen"** ➕.
4. Tap **"Add"** in the top right corner.
5. The **TIA Mobile App** icon appears on your iOS Home Screen and opens full-screen like a native app.

---

### Method 2: Compile to Native Android APK (via Capacitor)

If you want to generate a native `.apk` file for Android distribution:

1. Install Capacitor dependencies:
   ```bash
   npm install @capacitor/core @capacitor/cli @capacitor/android
   ```

2. Initialize and add the Android platform:
   ```bash
   npx cap add android
   ```

3. Sync web assets:
   ```bash
   npx cap sync
   ```

4. Open in Android Studio to build APK:
   ```bash
   npx cap open android
   ```
   In Android Studio, click **Build > Build Bundle(s) / APK(s) > Build APK(s)** to generate the `.apk` file.

---

## 📱 Mobile App Features

* **Mobile Bottom Navigation Bar**:
  - 🏠 **Home**: Live attendance, 1-click Check In/Out, shift timer, and executive KPI cards.
  - 💬 **Messages**: Executive chat with CEO, CMO, PM, Tech Manager, and P.A with file sharing, voice notes, and WhatsApp links.
  - 💻 **IDE & Code**: Full mobile code workstation, runner, and Software Forge.
  - 🎓 **Courses**: Course catalog & complete 3-part Dealers/Contracts directory.
  - 💵 **Payslips**: Employee remuneration management and student bill receipts.
* **Offline Caching**: Powered by [`sw.js`](file:///e:/TIA%20portal/public/sw.js) for fast mobile loading.
* **Touch-Optimized**: Safe-area insets for iPhone notch/dynamic island and 44px+ touch targets.
