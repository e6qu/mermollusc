import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const routePath = "modules/layout/src/core/route.ts";
const mazePath = "modules/layout/src/core/maze.ts";

const origRouteContent = fs.readFileSync(routePath, "utf-8");
const origMazeContent = fs.readFileSync(mazePath, "utf-8");

const crossingCosts = [30, 50, 75, 100, 150];
const turnPenalties = [5, 10, 15, 20, 25];

const results = {};

console.log("Starting layout parameter sweep...");

try {
  for (const cc of crossingCosts) {
    for (const tp of turnPenalties) {
      console.log(`Evaluating CROSSING_COST = ${cc}, TURN_PENALTY = ${tp}...`);

      // Modify route.ts
      const newRoute = origRouteContent.replace(
        /const CROSSING_COST = \d+;/,
        `const CROSSING_COST = ${cc};`
      );
      fs.writeFileSync(routePath, newRoute, "utf-8");

      // Modify maze.ts
      const newMaze = origMazeContent.replace(
        /const TURN_PENALTY = \d+;/,
        `const TURN_PENALTY = ${tp};`
      );
      fs.writeFileSync(mazePath, newMaze, "utf-8");

      // Clear old temp JSON if exists
      if (fs.existsSync("app/playground/sweep_temp.json")) {
        fs.unlinkSync("app/playground/sweep_temp.json");
      }

      // Run render_one.test.mjs via vitest
      try {
        execSync("pnpm exec vitest run app/playground/test/integration/render_one.test.mjs", {
          encoding: "utf-8",
          stdio: ["ignore", "pipe", "ignore"],
        });

        if (fs.existsSync("app/playground/sweep_temp.json")) {
          const output = fs.readFileSync("app/playground/sweep_temp.json", "utf-8");
          const parsed = JSON.parse(output.trim());
          results[cc + "_" + tp] = parsed;
        } else {
          console.error("Temp output file not generated for CC = %d, TP = %d", cc, tp);
        }
      } catch (err) {
        console.error("Failed to run for CC = %d, TP = %d: %s", cc, tp, err.message);
      }
    }
  }
} finally {
  // Restore files
  console.log("Restoring original route.ts and maze.ts contents...");
  fs.writeFileSync(routePath, origRouteContent, "utf-8");
  fs.writeFileSync(mazePath, origMazeContent, "utf-8");

  // Cleanup temp file
  if (fs.existsSync("app/playground/sweep_temp.json")) {
    fs.unlinkSync("app/playground/sweep_temp.json");
  }
}

console.log("Generating HTML dashboard...");

// Build the HTML by piece to avoid escaping headaches with template literals inside template literals
let htmlParts = [];
htmlParts.push(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Mermollusc Layout Evaluation Dashboard</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Outfit:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #0b0f19;
      --card-bg: #111827;
      --card-border: #1f2937;
      --text: #f3f4f6;
      --text-muted: #9ca3af;
      --accent: #3b82f6;
      --accent-hover: #2563eb;
      --success: #10b981;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      background-color: var(--bg);
      color: var(--text);
      font-family: 'Inter', sans-serif;
      padding: 2rem;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      gap: 2rem;
    }

    header {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      border-bottom: 1px solid var(--card-border);
      padding-bottom: 1.5rem;
    }

    h1 {
      font-family: 'Outfit', sans-serif;
      font-size: 2rem;
      font-weight: 700;
      background: linear-gradient(to right, #60a5fa, #3b82f6);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .description {
      color: var(--text-muted);
      font-size: 1rem;
    }

    .dashboard-layout {
      display: grid;
      grid-template-columns: 320px 1fr;
      gap: 2rem;
      flex: 1;
    }

    .control-panel {
      background-color: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 1.5rem;
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
      height: fit-content;
      position: sticky;
      top: 2rem;
    }

    .control-group {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    label {
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .value-display {
      font-family: 'JetBrains Mono', monospace;
      font-size: 1.125rem;
      color: var(--accent);
      font-weight: 500;
    }

    select, input[type="range"] {
      width: 100%;
      background: #1f2937;
      border: 1px solid var(--card-border);
      color: var(--text);
      padding: 0.75rem;
      border-radius: 8px;
      outline: none;
      font-family: inherit;
    }

    input[type="range"] {
      padding: 0;
      height: 6px;
      -webkit-appearance: none;
      border-radius: 3px;
      background: #374151;
    }

    input[type="range"]::-webkit-slider-thumb {
      -webkit-appearance: none;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: var(--accent);
      cursor: pointer;
      transition: background 0.15s ease;
    }

    input[type="range"]::-webkit-slider-thumb:hover {
      background: var(--accent-hover);
    }

    .stats-card {
      background-color: #1e293b;
      border-radius: 8px;
      padding: 1rem;
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1rem;
      text-align: center;
    }

    .stat {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .stat-val {
      font-family: 'JetBrains Mono', monospace;
      font-size: 1.5rem;
      font-weight: 600;
      color: var(--text);
    }

    .stat-label {
      font-size: 0.75rem;
      color: var(--text-muted);
      text-transform: uppercase;
    }

    .preview-area {
      background-color: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 2rem;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 500px;
      box-shadow: inset 0 2px 4px rgba(0,0,0,0.3);
      overflow: auto;
    }

    .preview-container {
      width: 100%;
      height: 100%;
      display: flex;
      justify-content: center;
      align-items: center;
    }

    .preview-container svg {
      max-width: 100%;
      height: auto;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.5);
    }

    .matrix-section {
      border-top: 1px solid var(--card-border);
      padding-top: 2rem;
    }

    .matrix-title {
      font-family: 'Outfit', sans-serif;
      font-size: 1.5rem;
      margin-bottom: 1rem;
    }

    .matrix-grid {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 1rem;
    }

    .matrix-cell {
      background-color: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 8px;
      padding: 1rem;
      cursor: pointer;
      transition: all 0.2s ease;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .matrix-cell:hover, .matrix-cell.active {
      border-color: var(--accent);
      background-color: #1e293b;
    }

    .matrix-cell-title {
      font-size: 0.875rem;
      font-weight: 600;
    }

    .matrix-cell-stats {
      font-size: 0.75rem;
      color: var(--text-muted);
      display: flex;
      justify-content: space-between;
    }
  </style>
</head>
<body>

  <header>
    <h1>Mermollusc Layout Evaluator</h1>
    <div class="description">Interactively sweep, evaluate, and optimize orthogonal edge routing parameters.</div>
  </header>

  <div class="dashboard-layout">
    <div class="control-panel">
      <div class="control-group">
        <label for="crossing-cost">Crossing Cost</label>
        <div class="value-display" id="cc-val">75</div>
        <input type="range" id="crossing-cost" min="0" max="4" step="1" value="2">
      </div>

      <div class="control-group">
        <label for="turn-penalty">Turn Penalty</label>
        <div class="value-display" id="tp-val">15</div>
        <input type="range" id="turn-penalty" min="0" max="4" step="1" value="2">
      </div>

      <div class="stats-card">
        <div class="stat">
          <div class="stat-val" id="stat-crossings">-</div>
          <div class="stat-label">Crossings</div>
        </div>
        <div class="stat">
          <div class="stat-val" id="stat-length">-</div>
          <div class="stat-label">Length (px)</div>
        </div>
        <div class="stat">
          <div class="stat-val" id="stat-bends">-</div>
          <div class="stat-label">Bends</div>
        </div>
      </div>
    </div>

    <div class="preview-area">
      <div class="preview-container" id="svg-preview"></div>
    </div>
  </div>

  <div class="matrix-section">
    <h2 class="matrix-title">All Combinations Matrix</h2>
    <div class="matrix-grid" id="matrix-grid"></div>
  </div>

  <script>
`);

// Inject raw JSON data
htmlParts.push("    const data = " + JSON.stringify(results) + ";\n");
htmlParts.push("    const crossingCosts = " + JSON.stringify(crossingCosts) + ";\n");
htmlParts.push("    const turnPenalties = " + JSON.stringify(turnPenalties) + ";\n");

htmlParts.push(`
    const ccSlider = document.getElementById('crossing-cost');
    const tpSlider = document.getElementById('turn-penalty');
    const ccVal = document.getElementById('cc-val');
    const tpVal = document.getElementById('tp-val');

    const statCrossings = document.getElementById('stat-crossings');
    const statLength = document.getElementById('stat-length');
    const statBends = document.getElementById('stat-bends');

    const svgPreview = document.getElementById('svg-preview');
    const matrixGrid = document.getElementById('matrix-grid');

    function update() {
      const cc = crossingCosts[ccSlider.value];
      const tp = turnPenalties[tpSlider.value];

      ccVal.textContent = cc;
      tpVal.textContent = tp;

      const key = cc + "_" + tp;
      const res = data[key];

      if (res) {
        svgPreview.innerHTML = res.svg;
        statCrossings.textContent = res.conflicts;
        statLength.textContent = res.length;
        statBends.textContent = res.bends;
      }

      // Update active cell in matrix
      document.querySelectorAll('.matrix-cell').forEach(cell => {
        cell.classList.remove('active');
        if (cell.dataset.key === key) {
          cell.classList.add('active');
        }
      });
    }

    // Generate matrix grid cells
    for (const cc of crossingCosts) {
      for (const tp of turnPenalties) {
        const key = cc + "_" + tp;
        const res = data[key];
        if (!res) continue;

        const cell = document.createElement('div');
        cell.className = 'matrix-cell';
        cell.dataset.key = key;
        cell.innerHTML = '<div class="matrix-cell-title">CC: ' + cc + ' | TP: ' + tp + '</div>' +
          '<div class="matrix-cell-stats">' +
            '<span>🔀 ' + res.conflicts + '</span>' +
            '<span>📏 ' + res.length + 'px</span>' +
            '<span>↩️ ' + res.bends + '</span>' +
          '</div>';

        cell.addEventListener('click', () => {
          ccSlider.value = crossingCosts.indexOf(cc);
          tpSlider.value = turnPenalties.indexOf(tp);
          update();
        });

        matrixGrid.appendChild(cell);
      }
    }

    ccSlider.addEventListener('input', update);
    tpSlider.addEventListener('input', update);

    update();
  </script>
</body>
</html>
`);

const htmlContent = htmlParts.join("");
const artifactPath = "/Users/zardoz/.gemini/antigravity-cli/brain/80452080-83f3-4553-8434-2d1e215a0b86/layout_evaluator.html";
fs.writeFileSync(artifactPath, htmlContent, "utf-8");

console.log(`Dashboard generated successfully at: ${artifactPath}`);
