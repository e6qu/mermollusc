// Scaffold: draws a placeholder. The parser/layout/renderer pipeline is not wired yet.

const canvas = document.querySelector<HTMLCanvasElement>("#stage");
if (canvas === null) throw new Error("playground: #stage canvas not found");

const ctx = canvas.getContext("2d");
if (ctx === null) throw new Error("playground: 2d context unavailable");

ctx.fillStyle = "#0b0b0b";
ctx.fillRect(0, 0, canvas.width, canvas.height);
ctx.fillStyle = "#9fe";
ctx.font = "16px monospace";
ctx.fillText("mermollusc playground — scaffold", 20, 40);
