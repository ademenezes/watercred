"use strict";

// Cosmetic access gate for the static site. THIS IS NOT REAL SECURITY: a public
// GitHub Pages site serves its source, data (data/*.csv) and this script to
// anyone, so the gate only deters casual visitors and can be bypassed by
// reading the source or fetching the files directly. We compare a SHA-256 hash
// (not the passphrase itself) purely to keep the literal string out of the repo.
(() => {
  const KEY = "watercred_gate_ok";
  const HASH = "ab431f2fd2ee787f73d9b10df34b789d5b66735a4c9525caaea9d5acb92bdd1e";

  const form = document.getElementById("wc-gate-form");
  if (!form) return; // page has no gate
  if (sessionStorage.getItem(KEY) === "1") { document.documentElement.classList.add("wc-unlocked"); return; }

  const input = document.getElementById("wc-gate-input");
  const err = document.getElementById("wc-gate-err");

  async function sha256(text) {
    if (!window.crypto || !crypto.subtle) return null; // needs a secure context (https/localhost)
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
  }

  form.addEventListener("submit", async event => {
    event.preventDefault();
    const digest = await sha256(input.value.trim());
    if (digest === HASH) {
      sessionStorage.setItem(KEY, "1");
      document.documentElement.classList.add("wc-unlocked");
    } else {
      err.textContent = digest === null ? "This gate needs a secure (https) connection." : "Incorrect password.";
      input.value = "";
      input.focus();
    }
  });

  if (input) input.focus();
})();
