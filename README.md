# ineffable-web

Frontend scaffold for Ineffable (React 18 + TypeScript + Vite 6 + Tailwind CSS v4)

Quick start:

```bash
cd ineffable-web
npm install
npm run dev
```

Build:

```bash
npm run build
# dist/ will be produced
```

Integration notes (to embed into `Ineffable-rs`):

- Option A (runtime static dir): copy `dist/` into the backend machine and run the `crates/cli` in server mode with `--static-dir path/to/dist`.
- Option B (embed): copy `dist/` into `crates/cli/static/` (create that directory), then use a crate like `rust-embed` or `include_dir` to serve embedded files.
- Option C (Docker): use a multi-stage Docker build: build frontend, then copy `dist/` into backend image.

shadcn/ui: this scaffold includes placeholders; to add shadcn components run:

```bash
# from ineffable-web
npm install @radix-ui/react-* tailwindcss-animate class-variance-authority
npx shadcn-ui@latest init
```

You may need to follow the latest shadcn/ui docs to finish setup.
