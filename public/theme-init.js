// Pre-paint copy of src/hub/theme.ts (same key and light default) so the first frame matches the app.
try {
  const preference = localStorage.getItem("atk-hub-original-theme") || "light";
  const theme =
    preference === "dark" ||
    (preference === "system" && matchMedia("(prefers-color-scheme: dark)").matches)
      ? "dark"
      : "light";
  document.documentElement.classList.toggle("dark", theme === "dark");
  // No inline color-scheme: hub.css sets it per theme class, and an inline value would go stale on toggle.
  document.documentElement.dataset.theme = theme;
} catch {
  document.documentElement.dataset.theme = "light";
}
