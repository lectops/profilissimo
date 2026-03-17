const puppeteer = require("puppeteer");
const path = require("path");
const fs = require("fs");

const WIDTH = 1280;
const HEIGHT = 800;

const PROFILES = [
  { name: "Work", email: "sarah@acmecorp.com", color: "#1a73e8", initial: "W", current: true },
  { name: "Personal", email: "sarah.chen@gmail.com", color: "#e8710a", initial: "P", current: false },
  { name: "Freelance", email: "hello@sarahchen.dev", color: "#9334e6", initial: "F", current: false },
];

async function generateScreenshots() {
  const browser = await puppeteer.launch({ headless: true });

  // Screenshot 1: Popup showing profile list
  await screenshot1_popup(browser);

  // Screenshot 2: Context menu "Open link in..."
  await screenshot2_contextMenu(browser);

  // Screenshot 3: Onboarding page
  await screenshot3_onboarding(browser);

  // Screenshot 4: Options page
  await screenshot4_options(browser);

  await browser.close();
  console.log("All screenshots generated!");
}

async function screenshot1_popup(browser) {
  const page = await browser.newPage();
  await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });

  const html = `<!DOCTYPE html>
<html><head><style>
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f5f5f5; display: flex; align-items: center; justify-content: center; height: 100vh; }
  .browser-bar { position: absolute; top: 0; left: 0; right: 0; height: 72px; background: #dee1e6; display: flex; align-items: center; padding: 0 16px; gap: 12px; }
  .browser-dots { display: flex; gap: 8px; }
  .browser-dots span { width: 12px; height: 12px; border-radius: 50%; }
  .browser-dots .red { background: #ff5f57; }
  .browser-dots .yellow { background: #febc2e; }
  .browser-dots .green { background: #28c840; }
  .tab-bar { display: flex; gap: 2px; margin-left: 20px; align-items: flex-end; }
  .tab { background: #c8ccd1; padding: 8px 16px; border-radius: 8px 8px 0 0; font-size: 12px; color: #5f6368; min-width: 120px; }
  .tab.active { background: #fff; color: #202124; }
  .url-bar { position: absolute; top: 72px; left: 0; right: 0; height: 40px; background: #fff; display: flex; align-items: center; padding: 0 16px; border-bottom: 1px solid #e0e0e0; }
  .url-input { background: #f1f3f4; border-radius: 20px; padding: 6px 16px; font-size: 13px; color: #5f6368; flex: 1; max-width: 600px; margin: 0 auto; text-align: center; }
  .page-content { position: absolute; top: 112px; left: 0; right: 0; bottom: 0; background: #fff; display: flex; align-items: flex-start; justify-content: center; padding-top: 60px; }
  .page-text { color: #ccc; font-size: 18px; }

  .popup-overlay { position: absolute; top: 68px; right: 80px; z-index: 100; }
  .popup { width: 280px; background: #fff; border-radius: 12px; box-shadow: 0 4px 24px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.05); overflow: hidden; }
  .popup-container { padding: 12px; }
  .popup-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #e8eaed; }
  .popup-title { font-size: 14px; font-weight: 600; color: #202124; }
  .gear-icon { color: #5f6368; font-size: 16px; }
  .profile-item { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 6px; cursor: pointer; }
  .profile-item:hover { background: #f1f3f4; }
  .profile-item.current { opacity: 0.5; }
  .profile-color { width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 12px; color: #fff; flex-shrink: 0; }
  .profile-name { font-size: 13px; color: #202124; flex: 1; }
  .current-badge { font-size: 10px; color: #5f6368; text-transform: uppercase; letter-spacing: 0.5px; }

  .ext-icon { position: absolute; top: 76px; right: 86px; width: 28px; height: 28px; z-index: 50; }
  .ext-icon img { width: 100%; height: 100%; }
  .arrow-line { position: absolute; top: 96px; right: 160px; width: 2px; height: 0; background: transparent; }
</style></head><body>
  <div class="browser-bar">
    <div class="browser-dots"><span class="red"></span><span class="yellow"></span><span class="green"></span></div>
    <div class="tab-bar">
      <div class="tab active">GitHub - project-alpha</div>
      <div class="tab">Google Docs</div>
    </div>
  </div>
  <div class="url-bar">
    <div class="url-input">github.com/acmecorp/project-alpha/pull/42</div>
  </div>
  <div class="page-content">
    <div class="page-text">github.com</div>
  </div>

  <div class="popup-overlay">
    <div class="popup">
      <div class="popup-container">
        <div class="popup-header">
          <span class="popup-title">Transfer tab to:</span>
          <span class="gear-icon">⚙</span>
        </div>
        ${PROFILES.map(p => `
          <div class="profile-item${p.current ? ' current' : ''}" ${!p.current ? 'style="background:#f1f3f4"' : ''}>
            <div class="profile-color" style="background:${p.color}">${p.initial}</div>
            <span class="profile-name">${p.name} (${p.email})</span>
            ${p.current ? '<span class="current-badge">current</span>' : ''}
          </div>
        `).join("")}
      </div>
    </div>
  </div>
</body></html>`;

  await page.setContent(html, { waitUntil: "networkidle0" });
  // Remove hover highlight from all except "Personal" (to show it being selected)
  await page.evaluate(() => {
    document.querySelectorAll('.profile-item').forEach((el, i) => {
      if (i === 1) el.style.background = '#f1f3f4';
      else if (i !== 0) el.style.background = '';
    });
  });
  await page.screenshot({ path: path.join(__dirname, "01-popup.png") });
  await page.close();
  console.log("Generated 01-popup.png");
}

async function screenshot2_contextMenu(browser) {
  const page = await browser.newPage();
  await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });

  const html = `<!DOCTYPE html>
<html><head><style>
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #fff; }
  .browser-bar { height: 72px; background: #dee1e6; display: flex; align-items: center; padding: 0 16px; gap: 12px; }
  .browser-dots { display: flex; gap: 8px; }
  .browser-dots span { width: 12px; height: 12px; border-radius: 50%; }
  .browser-dots .red { background: #ff5f57; }
  .browser-dots .yellow { background: #febc2e; }
  .browser-dots .green { background: #28c840; }
  .tab-bar { display: flex; gap: 2px; margin-left: 20px; align-items: flex-end; }
  .tab { background: #c8ccd1; padding: 8px 16px; border-radius: 8px 8px 0 0; font-size: 12px; color: #5f6368; }
  .tab.active { background: #fff; color: #202124; }
  .url-bar { height: 40px; background: #fff; display: flex; align-items: center; padding: 0 16px; border-bottom: 1px solid #e0e0e0; }
  .url-input { background: #f1f3f4; border-radius: 20px; padding: 6px 16px; font-size: 13px; color: #5f6368; flex: 1; max-width: 600px; margin: 0 auto; text-align: center; }

  .page { padding: 60px 80px; }
  .page h1 { font-size: 22px; color: #202124; margin-bottom: 16px; }
  .page p { font-size: 14px; color: #5f6368; line-height: 1.8; max-width: 500px; }
  .page a { color: #1a73e8; text-decoration: underline; cursor: pointer; }
  .highlight-link { background: #e8f0fe; padding: 2px 4px; border-radius: 3px; }

  .context-menu { position: absolute; top: 240px; left: 260px; background: #fff; border-radius: 8px; box-shadow: 0 2px 16px rgba(0,0,0,0.2), 0 0 0 1px rgba(0,0,0,0.05); min-width: 220px; padding: 4px 0; font-size: 13px; z-index: 10; }
  .ctx-item { padding: 6px 24px; color: #202124; cursor: pointer; display: flex; align-items: center; justify-content: space-between; }
  .ctx-item:hover { background: #f1f3f4; }
  .ctx-item.disabled { color: #bbb; }
  .ctx-sep { height: 1px; background: #e8eaed; margin: 4px 0; }
  .ctx-arrow { color: #999; font-size: 11px; }
  .ctx-item.highlighted { background: #e8f0fe; }

  .submenu { position: absolute; top: 178px; left: 470px; background: #fff; border-radius: 8px; box-shadow: 0 2px 16px rgba(0,0,0,0.2), 0 0 0 1px rgba(0,0,0,0.05); min-width: 240px; padding: 4px 0; font-size: 13px; z-index: 20; }
  .sub-item { padding: 6px 24px; color: #202124; cursor: pointer; }
  .sub-item:hover { background: #f1f3f4; }
  .sub-item.current { color: #bbb; }
</style></head><body>
  <div class="browser-bar">
    <div class="browser-dots"><span class="red"></span><span class="yellow"></span><span class="green"></span></div>
    <div class="tab-bar">
      <div class="tab active">Team Slack - #engineering</div>
      <div class="tab">Calendar</div>
    </div>
  </div>
  <div class="url-bar">
    <div class="url-input">app.slack.com/client/T01234/C56789</div>
  </div>

  <div class="page">
    <h1>Team Standup Notes</h1>
    <p>Hey team, here's the PR for the new dashboard feature:<br><br>
    <a class="highlight-link">github.com/acmecorp/dashboard/pull/127</a><br><br>
    Please review when you get a chance. Deadline is Friday.</p>
  </div>

  <div class="context-menu">
    <div class="ctx-item">Open Link in New Tab</div>
    <div class="ctx-item">Open Link in New Window</div>
    <div class="ctx-sep"></div>
    <div class="ctx-item">Copy Link Address</div>
    <div class="ctx-sep"></div>
    <div class="ctx-item highlighted">Open link in... <span class="ctx-arrow">▶</span></div>
    <div class="ctx-item">Open page in... <span class="ctx-arrow">▶</span></div>
    <div class="ctx-sep"></div>
    <div class="ctx-item disabled">Save Link As...</div>
  </div>

  <div class="submenu">
    <div class="sub-item current">Work (sarah@acmecorp.com) ✓</div>
    <div class="sub-item" style="background:#f1f3f4">Personal (sarah.chen@gmail.com)</div>
    <div class="sub-item">Freelance (hello@sarahchen.dev)</div>
  </div>
</body></html>`;

  await page.setContent(html, { waitUntil: "networkidle0" });
  await page.screenshot({ path: path.join(__dirname, "02-context-menu.png") });
  await page.close();
  console.log("Generated 02-context-menu.png");
}

async function screenshot3_onboarding(browser) {
  const page = await browser.newPage();
  await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });

  const logoPath = path.resolve(__dirname, "../extension/public/icons/p-logo.png");
  const logoBase64 = fs.readFileSync(logoPath).toString("base64");

  const html = `<!DOCTYPE html>
<html><head><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f8f9fa; display: flex; align-items: center; justify-content: center; height: 100vh; }
  .card { background: #fff; border-radius: 16px; box-shadow: 0 2px 12px rgba(0,0,0,0.08); max-width: 540px; width: 100%; padding: 48px; text-align: center; }
  .logo { width: 64px; height: 64px; margin-bottom: 16px; }
  h1 { font-size: 24px; color: #202124; margin-bottom: 8px; }
  .subtitle { color: #5f6368; margin-bottom: 32px; font-size: 14px; }
  .step { text-align: left; margin-bottom: 24px; }
  .step-header { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
  .step-num { width: 28px; height: 28px; background: #1a73e8; color: #fff; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 13px; flex-shrink: 0; }
  .step-title { font-weight: 600; color: #202124; font-size: 15px; }
  .code-block { display: flex; align-items: center; background: #f1f3f4; border-radius: 8px; padding: 12px 16px; font-family: "SF Mono", Monaco, monospace; font-size: 12px; color: #202124; gap: 12px; }
  .code-text { flex: 1; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .copy-btn { background: #1a73e8; color: #fff; border: none; border-radius: 6px; padding: 6px 14px; font-size: 12px; font-weight: 500; cursor: pointer; flex-shrink: 0; }
  .step-desc { color: #5f6368; font-size: 13px; margin-left: 40px; }
  .note { background: #e8f0fe; border-radius: 8px; padding: 12px 16px; font-size: 12px; color: #1967d2; text-align: left; margin-top: 24px; }
</style></head><body>
  <div class="card">
    <img src="data:image/png;base64,${logoBase64}" class="logo" alt="">
    <h1>Welcome to Profilissimo</h1>
    <p class="subtitle">One quick setup step to get started</p>
    <div class="step">
      <div class="step-header">
        <div class="step-num">1</div>
        <div class="step-title">Install the helper app</div>
      </div>
      <div class="code-block">
        <span class="code-text">curl -fsSL https://raw.githubusercontent.com/user/profilissimo/main/installer/install.sh | bash</span>
        <button class="copy-btn">Copy</button>
      </div>
    </div>
    <div class="step">
      <div class="step-header">
        <div class="step-num">2</div>
        <div class="step-title">Restart Chrome</div>
      </div>
      <p class="step-desc">Quit Chrome completely (Cmd+Q) and reopen it.</p>
    </div>
    <div class="note">💡 The helper app only needs to be installed once, but the extension must be installed in each Chrome profile you want to transfer tabs from.</div>
  </div>
</body></html>`;

  await page.setContent(html, { waitUntil: "networkidle0" });
  await page.screenshot({ path: path.join(__dirname, "03-onboarding.png") });
  await page.close();
  console.log("Generated 03-onboarding.png");
}

async function screenshot4_options(browser) {
  const page = await browser.newPage();
  await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });

  const html = `<!DOCTYPE html>
<html><head><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f8f9fa; display: flex; align-items: center; justify-content: center; height: 100vh; }
  .card { background: #fff; border-radius: 16px; box-shadow: 0 2px 12px rgba(0,0,0,0.08); max-width: 480px; width: 100%; padding: 36px; }
  h1 { font-size: 20px; color: #202124; margin-bottom: 24px; text-align: center; }

  .section { margin-bottom: 24px; }
  .section-title { font-size: 13px; font-weight: 600; color: #5f6368; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px; }
  .scope-badge { font-size: 10px; font-weight: 400; text-transform: uppercase; letter-spacing: 0.3px; padding: 2px 6px; border-radius: 4px; margin-left: 6px; }
  .scope-global { background: #e8f0fe; color: #1967d2; }
  .scope-profile { background: #fce8e6; color: #c5221f; }

  .field { margin-bottom: 16px; }
  .field label { display: block; font-size: 13px; color: #202124; margin-bottom: 4px; font-weight: 500; }
  .field .desc { font-size: 12px; color: #80868b; margin-bottom: 6px; }
  select { width: 100%; padding: 8px 12px; border: 1px solid #dadce0; border-radius: 6px; font-size: 13px; color: #202124; background: #fff; }
  .checkbox-field { display: flex; align-items: center; gap: 8px; }
  .checkbox-field input { width: 16px; height: 16px; }
  .kbd { display: inline-block; padding: 2px 8px; background: #f1f3f4; border: 1px solid #dadce0; border-radius: 4px; font-family: monospace; font-size: 12px; color: #202124; }

  .status-bar { display: flex; align-items: center; gap: 8px; padding: 10px 14px; background: #e6f4ea; border-radius: 8px; margin-bottom: 24px; font-size: 13px; color: #137333; }
  .status-dot { width: 8px; height: 8px; background: #34a853; border-radius: 50%; }
  .version { margin-left: auto; font-size: 11px; color: #5f6368; }

  .sep { height: 1px; background: #e8eaed; margin: 24px 0; }
</style></head><body>
  <div class="card">
    <h1>Profilissimo Settings</h1>

    <div class="status-bar">
      <span class="status-dot"></span>
      Helper app connected
      <span class="version">v1.0.0</span>
    </div>

    <div class="section">
      <div class="section-title">Transfer Behavior <span class="scope-badge scope-global">all profiles</span></div>
      <div class="field">
        <label>Default profile</label>
        <div class="desc">Used when clicking the toolbar icon or pressing the keyboard shortcut</div>
        <select><option>Personal (sarah.chen@gmail.com)</option></select>
      </div>
      <div class="field">
        <div class="checkbox-field">
          <input type="checkbox" checked>
          <label>Close source tab after transfer</label>
        </div>
      </div>
    </div>

    <div class="sep"></div>

    <div class="section">
      <div class="section-title">Keyboard Shortcut <span class="scope-badge scope-profile">this profile</span></div>
      <div class="field">
        <div class="desc">Current shortcut: <span class="kbd">Ctrl</span> + <span class="kbd">Shift</span> + <span class="kbd">P</span></div>
        <div class="desc" style="margin-top:6px">Change at chrome://extensions/shortcuts</div>
      </div>
    </div>
  </div>
</body></html>`;

  await page.setContent(html, { waitUntil: "networkidle0" });
  await page.screenshot({ path: path.join(__dirname, "04-options.png") });
  await page.close();
  console.log("Generated 04-options.png");
}

generateScreenshots().catch(console.error);
