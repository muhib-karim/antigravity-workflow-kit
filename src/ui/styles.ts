/**
 * Antigravity Workflow Kit - Dashboard Styles
 * Modern glassmorphism CSS with responsive layout
 * @module ui/styles
 */

export const DASHBOARD_CSS = `
:root {
    /* Frosted Glass Theme - Dark Mode */
    --bg-blur: rgba(20, 20, 25, 0.92);
    --bg-card: rgba(30, 30, 38, 0.85);
    --backdrop-filter: blur(25px) saturate(150%);
    --border-color: rgba(255, 255, 255, 0.08);
    --shadow: 0 8px 32px rgba(0, 0, 0, 0.35);
    
    --text-primary: #e4e4e7;
    --text-secondary: rgba(228, 228, 231, 0.65);
    --text-muted: rgba(228, 228, 231, 0.45);
    
    --accent: #14b8a6;
    --accent-green: #22c55e;
    --accent-yellow: #f59e0b;
    --accent-red: #ef4444;
    
    --meter-bg: rgba(255, 255, 255, 0.08);
    --separator: rgba(255, 255, 255, 0.06);
    --hover-bg: rgba(255, 255, 255, 0.05);
    
    --font-family: "Geist", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

* { box-sizing: border-box; margin: 0; padding: 0; }

body {
    font-family: var(--font-family);
    background: var(--bg-blur);
    color: var(--text-primary);
    min-height: 100vh;
    line-height: 1.5;
}

.dashboard {
    max-width: 900px;
    margin: 0 auto;
    padding: 24px;
    padding-bottom: 100px;
}

.header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-bottom: 20px;
    border-bottom: 1px solid var(--separator);
    margin-bottom: 24px;
    flex-wrap: wrap;
    gap: 12px;
}

.header-left { display: flex; align-items: center; gap: 12px; }
.header-left h1 { font-size: 22px; font-weight: 600; }
.logo { width: 28px; height: 28px; }

.header-right { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.email { color: var(--text-secondary); font-size: 12px; }

.plan-badge {
    background: rgba(20, 184, 166, 0.15);
    color: var(--accent);
    padding: 4px 10px;
    border-radius: 12px;
    font-size: 11px;
    font-weight: 600;
}

.status-badge {
    padding: 6px 14px;
    border-radius: 20px;
    font-size: 12px;
    font-weight: 600;
    white-space: nowrap;
}

.status-running { background: var(--accent-green); color: #000; }
.status-stopped { background: rgba(255,255,255,0.1); color: var(--text-secondary); }

/* Stats Grid */
.stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
    gap: 12px;
    margin-bottom: 24px;
}

.stat-card {
    background: linear-gradient(135deg, rgba(30, 30, 38, 0.9), rgba(40, 40, 50, 0.8));
    border: 1px solid var(--border-color);
    border-radius: 16px;
    padding: 20px 16px;
    text-align: center;
    backdrop-filter: blur(20px);
    position: relative;
    overflow: hidden;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.stat-card::before {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(135deg, rgba(20, 184, 166, 0.1), transparent);
    opacity: 0;
    transition: opacity 0.3s;
}

.stat-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 12px 40px rgba(20, 184, 166, 0.15);
    border-color: rgba(20, 184, 166, 0.3);
}

.stat-card:hover::before {
    opacity: 1;
}

.stat-value {
    font-size: 32px;
    font-weight: 700;
    background: linear-gradient(135deg, var(--accent), #2dd4bf);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
}

.stat-label {
    font-size: 10px;
    color: var(--text-secondary);
    margin-top: 6px;
    text-transform: uppercase;
    letter-spacing: 1px;
}

/* Sections */
.section {
    background: var(--bg-card);
    border: 1px solid var(--border-color);
    border-radius: 12px;
    padding: 20px;
    margin-bottom: 16px;
    backdrop-filter: blur(10px);
}

.section h2 {
    font-size: 13px;
    font-weight: 600;
    margin-bottom: 16px;
    color: var(--text-primary);
    display: flex;
    align-items: center;
    gap: 10px;
}

.section h2 svg {
    width: 18px;
    height: 18px;
    opacity: 0.8;
}

/* Usage Meters */
.usage-item { margin-bottom: 16px; }
.usage-item:last-child { margin-bottom: 0; }

.usage-header {
    display: flex;
    justify-content: space-between;
    margin-bottom: 8px;
    font-size: 13px;
}

.model-name { color: var(--text-primary); font-weight: 500; }
.usage-percent { font-weight: 600; }
.usage-percent.good { color: var(--accent-green); }
.usage-percent.warning { color: var(--accent-yellow); }
.usage-percent.critical { color: var(--accent-red); }

.meter-container {
    height: 10px;
    background: var(--meter-bg);
    border-radius: 6px;
    overflow: hidden;
    box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.2);
}

.meter-fill {
    height: 100%;
    border-radius: 6px;
    transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1);
    position: relative;
    overflow: hidden;
}

.meter-fill::after {
    content: '';
    position: absolute;
    top: 0;
    left: -100%;
    width: 100%;
    height: 100%;
    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent);
    animation: shine 2s ease-in-out infinite;
}

@keyframes shine {
    0% { left: -100%; }
    50%, 100% { left: 100%; }
}

.meter-fill.good { 
    background: linear-gradient(90deg, #10b981, #34d399, #22c55e); 
}
.meter-fill.warning { 
    background: linear-gradient(90deg, #f59e0b, #fbbf24, #f59e0b); 
}
.meter-fill.critical { 
    background: linear-gradient(90deg, #ef4444, #f87171, #ef4444); 
}

.usage-loading {
    color: var(--text-muted);
    font-size: 13px;
    text-align: center;
    padding: 20px;
}

/* Toggle Rows */
.toggle-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 0;
    border-bottom: 1px solid var(--separator);
    gap: 16px;
}

.toggle-row:last-child { border-bottom: none; }

.toggle-info { flex: 1; min-width: 0; }
.toggle-info h3 { font-size: 13px; font-weight: 500; }
.toggle-info p { 
    font-size: 11px; 
    color: var(--text-secondary); 
    margin-top: 2px;
    overflow: hidden;
    text-overflow: ellipsis;
}

.toggle {
    position: relative;
    width: 48px;
    height: 26px;
    flex-shrink: 0;
}

.toggle input { opacity: 0; width: 0; height: 0; }

.toggle-slider {
    position: absolute;
    cursor: pointer;
    inset: 0;
    background: rgba(255,255,255,0.1);
    border-radius: 26px;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    border: 1px solid transparent;
}

.toggle-slider:hover {
    background: rgba(255,255,255,0.15);
    border-color: rgba(255,255,255,0.1);
}

.toggle-slider:before {
    position: absolute;
    content: "";
    height: 20px;
    width: 20px;
    left: 3px;
    bottom: 2px;
    background: var(--text-secondary);
    border-radius: 50%;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow: 0 2px 5px rgba(0,0,0,0.2);
}

.toggle input:checked + .toggle-slider { 
    background: var(--accent); 
    box-shadow: 0 0 20px rgba(20, 184, 166, 0.4);
}
.toggle input:checked + .toggle-slider:before { 
    transform: translateX(22px); 
    background: white; 
    box-shadow: 0 2px 8px rgba(20, 184, 166, 0.5);
}

/* Settings */
.setting-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 0;
    border-bottom: 1px solid var(--separator);
    gap: 16px;
    flex-wrap: wrap;
}

.setting-row:last-child { border-bottom: none; }
.setting-row label { font-size: 13px; color: var(--text-primary); flex-shrink: 0; }

select {
    background: rgba(20, 20, 25, 0.95);
    border: 1px solid var(--border-color);
    color: var(--text-primary);
    padding: 8px 12px;
    border-radius: 6px;
    font-size: 12px;
    min-width: 140px;
    flex: 1;
    max-width: 200px;
}

/* Custom Number Input with Increment/Decrement Buttons */
.number-input-container {
    display: flex;
    align-items: center;
    gap: 4px; /* Slight gap for separation */
    background: transparent;
    border: none;
    height: 36px;
}

.number-btn {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(40, 40, 50, 0.6);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    position: relative;
    overflow: hidden;
}

.number-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    color: var(--text-primary);
    border-color: var(--accent);
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.number-btn:active {
    transform: translateY(0);
}

.number-btn svg {
    width: 16px;
    height: 16px;
    stroke-width: 2.5; /* Bolder icons */
}

.number-input {
    width: 60px;
    text-align: center;
    background: rgba(20, 20, 25, 0.8);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    color: var(--text-primary);
    font-size: 14px;
    font-weight: 600;
    padding: 0 4px;
    height: 36px;
    -moz-appearance: textfield;
    appearance: textfield; /* Standard property */
    font-family: var(--font-family);
    transition: all 0.2s;
}

/* Strictly hide native spinners */
.number-input::-webkit-outer-spin-button,
.number-input::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
    display: none; /* Just in case */
}

.number-input:focus {
    outline: none;
    border-color: var(--accent);
    background: rgba(30, 30, 36, 0.9);
    box-shadow: 0 0 0 2px rgba(20, 184, 166, 0.2);
}

select option {
    background: rgb(20, 20, 25);
    color: var(--text-primary);
    padding: 8px;
}

select:focus {
    outline: none;
    border-color: var(--accent);
}

/* Buttons */
.btn {
    background: linear-gradient(135deg, var(--accent), #2dd4bf);
    color: #000;
    border: none;
    padding: 12px 24px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    display: inline-flex;
    align-items: center;
    gap: 8px;
    white-space: nowrap;
    position: relative;
    overflow: hidden;
}

.btn::before {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(135deg, rgba(255,255,255,0.2), transparent);
    opacity: 0;
    transition: opacity 0.2s;
}

.btn:hover::before { opacity: 1; }

.btn svg { width: 14px; height: 14px; }

.btn:hover { 
    transform: translateY(-2px); 
    box-shadow: 0 8px 25px rgba(20, 184, 166, 0.35);
}

.btn:active {
    transform: translateY(0) scale(0.98);
}

.btn-secondary { 
    background: rgba(255,255,255,0.08); 
    color: var(--text-primary); 
}

.btn-secondary:hover {
    background: rgba(255,255,255,0.12);
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
}

/* Enable All Row */
.enable-all-row {
    display: flex;
    gap: 12px;
    margin-bottom: 16px;
    padding-bottom: 16px;
    border-bottom: 1px solid var(--separator);
}

.btn-enable-all {
    background: linear-gradient(135deg, #22c55e, #4ade80);
    color: #000;
    flex: 1;
}

/* Footer - Fixed at bottom */
.footer {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    padding: 16px 24px;
    background: var(--bg-blur);
    backdrop-filter: blur(20px);
    border-top: 1px solid var(--border-color);
    display: flex;
    gap: 12px;
    justify-content: center;
    align-items: center;
    flex-wrap: wrap;
    z-index: 100;
}

/* Sponsor/Support Link */
.sponsor-link {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--text-secondary);
    text-decoration: none;
    font-size: 12px;
    padding: 8px 14px;
    border-radius: 6px;
    background: rgba(255, 95, 95, 0.1);
    border: 1px solid rgba(255, 95, 95, 0.2);
    transition: all 0.2s;
}

.sponsor-link:hover {
    background: rgba(255, 95, 95, 0.2);
    color: #ff5f5f;
}

.sponsor-link svg {
    width: 16px;
    height: 16px;
    fill: currentColor;
}

/* Responsive */
@media (max-width: 500px) {
    .dashboard { padding: 16px; padding-bottom: 120px; }
    .header { flex-direction: column; align-items: flex-start; }
    .stat-card { padding: 12px; }
    .stat-value { font-size: 22px; }
    .footer { padding: 12px 16px; }
}
`;

// SVG Icons (Lucide-inspired, modern look)
export const ICONS = {
    bolt: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>',
    chart: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></svg>',
    toggles: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="12" x="2" y="6" rx="6" ry="6"/><circle cx="8" cy="12" r="2"/></svg>',
    brain: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/><path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4"/><path d="M17.599 6.5a3 3 0 0 0 .399-1.375"/><path d="M6.003 5.125A3 3 0 0 0 6.401 6.5"/><path d="M3.477 10.896a4 4 0 0 1 .585-.396"/><path d="M19.938 10.5a4 4 0 0 1 .585.396"/><path d="M6 18a4 4 0 0 1-1.967-.516"/><path d="M19.967 17.484A4 4 0 0 1 18 18"/></svg>',
    settings: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>',
    refresh: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>',
    save: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/></svg>',
    heart: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>',
    zap: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/></svg>',
};

export const KOFI_LINK = 'https://ko-fi.com/ai_dev_2024';
export const GITHUB_LINK = 'https://github.com/muhib-karim/antigravity-workflow-kit';
