export function initPersistence(api) {
  const open = new Promise((resolve, reject) => {
    const request = indexedDB.open("make-my-lithophane", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("projects");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const write = async (value) => {
    const db = await open;
    await new Promise((resolve, reject) => {
      const tx = db.transaction("projects", "readwrite");
      tx.objectStore("projects").put(value, "recovery");
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  };
  const read = async () => {
    const db = await open;
    return new Promise((resolve, reject) => {
      const request = db
        .transaction("projects")
        .objectStore("projects")
        .get("recovery");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  };
  let timer,
    last = "",
    enabled = true;
  function schedule() {
    if (!enabled) return;
    clearTimeout(timer);
    timer = setTimeout(async () => {
      try {
        const project = api.serialize();
        if (project !== last) {
          await write({ date: new Date().toISOString(), project });
          last = project;
        }
      } catch (error) {
        api.toast("Local recovery save failed: " + error.message, true);
      }
    }, 2500);
  }
  document.addEventListener("input", schedule);
  document.addEventListener("change", schedule);
  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-shape],#library-open,#color-studio-open"))
      schedule();
  });
  const button = document.createElement("button");
  button.id = "recover-project";
  button.className = "rail-btn";
  button.type = "button";
  button.title = "Restore local autosave";
  button.textContent = "Recover";
  document.querySelector("#tool-anchors")?.append(button);
  button.onclick = async () => {
    try {
      const saved = await read();
      if (!saved) {
        api.toast("No local autosave yet. Edit a project to create one.");
        return;
      }
      enabled = false;
      await api.restore(JSON.parse(saved.project));
      api.toast(
        "Recovered project from " + new Date(saved.date).toLocaleString(),
      );
    } catch (error) {
      api.toast(error.message, true);
    } finally {
      enabled = true;
    }
  };
  return { schedule };
}
