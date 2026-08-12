/**
 * Генерация фирменных артов BGASkins через OpenRouter (GPT Image 2).
 *
 * Запуск:  OPENROUTER_API_KEY=sk-or-... npx tsx scripts/generate-art.ts [only-slug]
 * Результат: public/art/<slug>.png  (+ манифест public/art/manifest.json)
 *
 * Модель можно переопределить: ART_MODEL=openai/gpt-image-2 (по умолчанию).
 */
import fs from "node:fs";
import path from "node:path";

const KEY = process.env.OPENROUTER_API_KEY;
const MODEL = process.env.ART_MODEL || "openai/gpt-image-2";
const OUT_DIR = path.join(process.cwd(), "public", "art");

const STYLE =
  "Modern esports e-commerce aesthetic, dark charcoal background (#0a0c10), " +
  "neon amber (#ffb129) and hot orange (#ff6a00) accent lighting with subtle electric violet, " +
  "volumetric glow, high contrast, sharp detail, premium gaming brand look, no text, no logos, no watermarks";

const JOBS: { slug: string; size: string; prompt: string }[] = [
  {
    slug: "hero-bg",
    size: "1536x1024",
    prompt:
      `Wide cinematic hero background for a CS2 skin marketplace: abstract tactical armory scene, ` +
      `floating holographic rifle silhouettes dissolving into glowing amber particles, depth of field, ` +
      `dark negative space on the left for headline text. ${STYLE}`,
  },
  {
    slug: "hero-knife",
    size: "1024x1024",
    prompt:
      `Dramatic product-style render of a generic futuristic butterfly-style knife with a flame-pattern blade, ` +
      `floating at a dynamic angle over a dark background, rim-lit with amber and violet neon, ` +
      `subtle smoke, centered composition, transparent-looking dark backdrop. ${STYLE}`,
  },
  {
    slug: "og-card",
    size: "1536x1024",
    prompt:
      `Social share banner background for a premium CS2 skins store: sleek dark composition with ` +
      `an angled glowing display case of weapon silhouettes, amber energy streaks, ` +
      `empty central area reserved for a logotype. ${STYLE}`,
  },
  {
    slug: "empty-state",
    size: "1024x1024",
    prompt:
      `Minimal illustration for an "nothing found" empty state: a lone opened weapon case with ` +
      `a faint amber hologram question mark above it, tiny floating particles, lots of dark negative space. ${STYLE}`,
  },
  {
    slug: "steps-trade",
    size: "1024x1024",
    prompt:
      `Icon-style illustration of two holographic hands exchanging a glowing item card, ` +
      `amber wireframe style on dark background, centered, generous margins. ${STYLE}`,
  },
];

async function generate(job: (typeof JOBS)[number]): Promise<void> {
  console.log(`→ ${job.slug} (${MODEL}, ${job.size})...`);
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://bgaskins.cc",
      "X-Title": "BGASkins Art Pipeline",
    },
    body: JSON.stringify({
      model: MODEL,
      modalities: ["image", "text"],
      messages: [{ role: "user", content: `${job.prompt}\n\nImage size: ${job.size}.` }],
    }),
  });
  if (!res.ok) {
    throw new Error(`OpenRouter HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const data = (await res.json()) as {
    choices?: {
      message?: {
        images?: { image_url?: { url?: string } }[];
        content?: string;
      };
    }[];
    error?: { message?: string };
  };
  if (data.error) throw new Error(`OpenRouter: ${data.error.message}`);
  const url = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!url) throw new Error(`Нет изображения в ответе: ${JSON.stringify(data).slice(0, 300)}`);

  let buf: Buffer;
  if (url.startsWith("data:")) {
    buf = Buffer.from(url.split(",")[1], "base64");
  } else {
    const img = await fetch(url);
    buf = Buffer.from(await img.arrayBuffer());
  }
  fs.writeFileSync(path.join(OUT_DIR, `${job.slug}.png`), buf);
  console.log(`  ✓ public/art/${job.slug}.png (${(buf.length / 1024).toFixed(0)} KB)`);
}

async function main() {
  if (!KEY) {
    console.error("OPENROUTER_API_KEY не задан. Добавь ключ в .env.local или окружение.");
    process.exit(1);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const only = process.argv[2];
  const jobs = only ? JOBS.filter((j) => j.slug === only) : JOBS;
  if (!jobs.length) {
    console.error(`Неизвестный slug "${only}". Доступны: ${JOBS.map((j) => j.slug).join(", ")}`);
    process.exit(1);
  }
  const results: Record<string, string> = {};
  for (const job of jobs) {
    try {
      await generate(job);
      results[job.slug] = `/art/${job.slug}.png`;
    } catch (e) {
      console.error(`  ✗ ${job.slug}: ${e instanceof Error ? e.message : e}`);
    }
  }
  const manifestPath = path.join(OUT_DIR, "manifest.json");
  const prev = fs.existsSync(manifestPath)
    ? (JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Record<string, string>)
    : {};
  fs.writeFileSync(manifestPath, JSON.stringify({ ...prev, ...results }, null, 2));
  console.log("Готово. Манифест:", manifestPath);
}

main();
