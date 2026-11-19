# Getting Started with Velm (Local Edition)

> **Important Security Notice (Unsigned Builds)**
> Velm desktop installers and the developer-mode browser extension are currently **unsigned** (not notarized by Apple or signed with a Microsoft Authenticode certificate). Your operating system or browser will show a security warning when you first open or load Velm.
> **Only download Velm from the official GitHub Releases page** and verify the file's SHA-256 checksum against `SHA256SUMS.txt` before installing. If you do not trust the source, do not install it.

---

## 1. What Velm Is (and What It Isn't)

- **100% Local:** Velm runs entirely on your own computer or Chromebook. There is no Velm cloud server, no account registration, and no telemetry.
- **Direct School Connections:** Your Canvas LMS access token and StudentVUE / ParentVUE credentials are sent **only** over HTTPS directly from your device to your school district's Canvas and Edupoint Synergy servers.
- **Independent Open-Source Project:** Velm is **not** affiliated with, endorsed by, or supported by Instructure (Canvas) or Edupoint (Synergy / StudentVUE / ParentVUE).

---

## 2. Verifying Downloads with `SHA256SUMS.txt`

Every GitHub Release includes a `SHA256SUMS.txt` file listing the cryptographic checksum of each download artifact. Verify your downloaded file before opening it:

### macOS (Terminal)
```bash
shasum -a 256 Velm-*-mac-*.dmg
```
Compare the printed hash with the matching line in `SHA256SUMS.txt`.

### Windows (PowerShell)
```powershell
Get-FileHash .\Velm-*-win-x64-setup.exe -Algorithm SHA256
```
Compare the `Hash` value (case-insensitive) with `SHA256SUMS.txt`.

### Linux (Terminal)
```bash
sha256sum -c SHA256SUMS.txt --ignore-missing
```

---

## 3. Per-OS Installation Instructions

### macOS (Apple Silicon & Intel — `.dmg`)

1. Open `Velm-<version>-mac-arm64.dmg` (Apple Silicon M1/M2/M3/M4) or `Velm-<version>-mac-x64.dmg` (Intel) and drag **Velm** into your **Applications** folder.
2. **macOS 15 (Sequoia) and newer:** Control-click → *Open* **no longer bypasses** Gatekeeper for unsigned apps. Instead:
   1. Try opening **Velm** once from Applications. macOS will display *"Velm cannot be opened because Apple cannot check it for malicious software."* Click **Done** (or **OK**).
   2. Open **System Settings → Privacy & Security** and scroll down to the **Security** section.
   3. Find the message about **Velm** being blocked and click **Open Anyway**.
   4. Confirm with your macOS password or Touch ID.
3. **Advanced Terminal alternative** (if you prefer):
   ```bash
   xattr -dr com.apple.quarantine /Applications/Velm.app
   ```
4. **Updates on macOS:** Automatic in-app updates require Apple code signing, so updates are manual — download the latest `.dmg` from GitHub Releases and replace `/Applications/Velm.app`.

### Windows 10 / 11 (`.exe` Installer)

1. Double-click `Velm-<version>-win-x64-setup.exe`.
2. Windows Defender SmartScreen will show **"Windows protected your PC"** because the installer is unsigned.
3. Click **More info**, verify the filename matches the release you downloaded, and click **Run anyway**.
4. *(Note)* Some third-party antivirus suites may flag newly released unsigned installers. Always verify the `SHA256SUMS.txt` checksum first.

### Linux (`.AppImage` or `.deb`)

**AppImage (portable):**
```bash
chmod +x Velm-*-linux-x64.AppImage
./Velm-*-linux-x64.AppImage
```
*(Ubuntu 22.04+ / Debian 12+ may require `libfuse2` to run AppImages: `sudo apt install libfuse2`.)*

**Debian / Ubuntu (`.deb`):**
```bash
sudo apt install ./Velm-*-linux-x64.deb
```

### Chrome / Personal Chromebook Extension (Developer Mode)

> **School-Managed Chromebooks:** Many school districts disable Chrome Developer Mode and unpacked extensions via Google Admin policy. If the **Developer mode** toggle is grayed out in `chrome://extensions`, your managed Chromebook does not allow unpacked extensions — use the Desktop app on a personal computer instead.

1. Download `velm-extension-chrome-<version>.zip` from GitHub Releases and **unzip it to a permanent folder** (for example, `Documents/VelmExtension`). *Do not delete this folder — Chrome loads the extension directly from it.*
2. Open Chrome and navigate to `chrome://extensions`.
3. Turn on **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select the unzipped folder containing `manifest.json`.
5. Pin the Velm icon to your toolbar and click it to open the dashboard.
6. **Multiple Students in the Chrome Extension:** Chrome extensions share one cookie jar per Chrome profile. To track multiple students with StudentVUE, create a **separate Chrome profile per student** and load Velm in each profile. *(The Desktop app supports multiple students in one window with isolated cookie partitions.)*
7. **Updating the Extension:** Download the new zip, extract it over your existing permanent folder, then click the **Reload** icon on Velm in `chrome://extensions`.

### Firefox Extension (Desktop — Temporary / Unpacked)

1. Download `velm-extension-firefox-<version>.zip` from GitHub Releases and unzip it to a folder.
2. Open Firefox (`121+`) and navigate to `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on…** and select `manifest.json` inside the unzipped folder.
4. Click the Velm icon in your toolbar to open the dashboard. *(Temporary add-ons stay loaded until Firefox restarts; signed Mozilla AMO distribution is planned for a future release.)*
5. **Multiple Students:** Just like Chrome, use a separate Firefox profile (or Firefox Multi-Account Container) per student.

---

## 4. First-Run Setup

1. **Canvas LMS:**
   - Enter your school's Canvas domain (e.g., `school.instructure.com`).
   - Generate a **Canvas Personal Access Token** in Canvas under *Account → Settings → Approved Integrations → + New Access Token* and paste it into Velm.
2. **StudentVUE / ParentVUE (Optional):**
   - Click **Verify StudentVUE** or **Sync Official Grades** in the student menu.
   - Select or type your district's Edupoint Synergy domain (e.g., `md-mcps-psv.edupoint.com`) and enter your StudentVUE or ParentVUE credentials.
   - **SSO Districts (Browser Extension):** If your school uses Google/Microsoft/Clever SSO for StudentVUE, sign into StudentVUE in another browser tab first, then check **"Reuse open StudentVUE/ParentVUE tab (for SSO districts)"** inside Velm — no password entry required.
   - Velm connects directly to your district's Synergy SOAP/PXP2 endpoint from your device — no middleware server is needed.
3. **AI Academic Advisor (Optional — Off by Default):**
   - Open the **AI Academic Advisor** and click **Configure AI**.
   - **Most Private (On-Device):** Install [Ollama](https://ollama.com) or [LM Studio](https://lmstudio.ai) on your computer and click **Detect Local AI** — student data never leaves your machine.
   - **Bring Your Own Cloud Key:** Connect OpenAI, Anthropic, Google Gemini, OpenRouter, or Mistral with your own API key (stored in your OS keychain / encrypted store).
   - **Reputable Free Tiers:** Groq, GitHub Models, or OpenRouter `:free` models (requires a free account key). Note that free tiers may log prompts — keep **"Minimize student data"** enabled to redact emails and student IDs before prompts leave your device.
4. **Offline Preview / Mock JSON Mode (Optional):**
   - On the Login screen, click **Demo** for built-in sample data, or **Mock JSON** to load a local `velm-mock-store.v1.json` snapshot completely offline (zero network requests).

---

## 5. Where Your Data Lives & How to Wipe It

Velm stores your settings, cached grades, and encrypted API keys strictly on your own device:

- **macOS:** `~/Library/Application Support/Velm/` (API keys encrypted via macOS Keychain / `safeStorage`)
- **Windows:** `%APPDATA%\Velm\` (API keys encrypted via Windows DPAPI / `safeStorage`)
- **Linux:** `~/.config/Velm/` (API keys encrypted via Secret Service / KWallet / `safeStorage`)
- **Chrome / Firefox Extension:** Browser profile's extension local storage (`chrome.storage.local` / WebCrypto AES-GCM)

To wipe all Velm data:
- Use **Remove Student** / **Clear Saved Data** inside the app, or
- Quit Velm and delete the application data folder listed above.

---

## 6. Uninstalling & Reporting Issues

- **macOS:** Quit Velm, drag `/Applications/Velm.app` to the Trash, and optionally delete `~/Library/Application Support/Velm/`.
- **Windows:** Uninstall **Velm** via *Settings → Apps → Installed apps*, and optionally delete `%APPDATA%\Velm\`.
- **Linux:** Delete the `.AppImage` file (or `sudo apt remove velm`), and optionally delete `~/.config/Velm/`.
- **Chrome Extension:** Open `chrome://extensions`, click **Remove** on Velm, and delete the unzipped extension folder.
- **Firefox Extension:** Open `about:debugging#/runtime/this-firefox`, click **Remove** on Velm (or restart Firefox), and delete the unzipped folder.

**Reporting Bugs:** Open an issue on GitHub. Before pasting any console logs, double-check that no Canvas access tokens, passwords, or student names appear in your report (Velm automatically redacts tokens and passwords in its built-in logger, but always verify before posting publicly).
