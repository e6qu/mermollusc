import { layout } from "@m/layout";
import { parse } from "@m/parser";
import { paint, toDisplayList } from "@m/renderer";
import { isOk } from "@m/std";

const SAMPLE = `flowchart TD
  A[Start] --> B{Choice}
  B -->|yes| C(Process)
  B -->|no| D(End)
  C --> D
`;

const MARGIN = 24;

const run = async (): Promise<void> => {
  const canvas = document.querySelector<HTMLCanvasElement>("#stage");
  if (canvas === null) throw new Error("playground: #stage canvas not found");
  const ctx = canvas.getContext("2d");
  if (ctx === null) throw new Error("playground: 2d context unavailable");

  const parsed = parse(SAMPLE);
  if (!isOk(parsed)) throw new Error(`parse failed: ${parsed.error.errors.join("; ")}`);

  const laid = await layout(parsed.value);
  if (!isOk(laid)) throw new Error(`layout failed: ${laid.error.message}`);

  const scene = laid.value;
  canvas.width = Math.ceil(scene.extent.size.width) + MARGIN * 2;
  canvas.height = Math.ceil(scene.extent.size.height) + MARGIN * 2;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.translate(MARGIN, MARGIN);
  paint(ctx, toDisplayList(scene));
  ctx.restore();
};

run().catch((e: unknown) => {
  console.error(e);
});
