/**
 * A queue for the harness: only so many runs at once on this machine.
 *
 * Several teammates run the harness at the same time, and a run is heavy: a
 * Vite server and a headless Chrome each. Twenty to fifty at once starve one
 * another: screens "never settle" inside the time allowed, and the machine
 * runs out of file handles (EMFILE). So a run takes one of a few slots before
 * it starts anything, and waits its turn when they are all taken.
 *
 * A slot is a file under `.harness/slots/`, created exclusively and holding the
 * pid of the run that has it. A run that died without giving its slot back
 * (a crash, kill -9) is found by its pid and its slot is taken over.
 *
 * `HARNESS_SLOTS` sets how many runs may go at once (default: half the
 * processors, between 2 and 6). `HARNESS_SLOTS=0` switches the queue off.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

function slotCount() {
  const asked = process.env.HARNESS_SLOTS;
  if (asked !== undefined && asked !== "") {
    const count = Number(asked);
    if (Number.isInteger(count) && count >= 0) return count;
  }
  return Math.min(6, Math.max(2, Math.floor(os.cpus().length / 2)));
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code !== "ESRCH";
  }
}

/** Takes slot `file` if it is free, or held by a run that is gone. */
function tryTake(file) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      fs.writeFileSync(file, String(process.pid), { flag: "wx" });
      return true;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
    let holder = Number.NaN;
    try {
      holder = Number(fs.readFileSync(file, "utf8"));
    } catch {
      continue; // Given back between the two looks: try once more.
    }
    if (Number.isInteger(holder) && isAlive(holder)) return false;
    // Its run is gone. Removing and taking are two steps, so another waiting run may win: that is fine.
    fs.rmSync(file, { force: true });
  }
  return false;
}

/**
 * Waits for a slot and takes it. Returns how to give it back; the slot is also
 * given back when the process exits without doing so.
 *
 * @param {string} harnessDir the project's `.harness` folder
 * @param {{ log?: (line: string) => void }} [options]
 * @returns {Promise<() => void>}
 */
export async function acquireSlot(harnessDir, { log = (line) => console.error(line) } = {}) {
  const count = slotCount();
  if (count === 0) return () => {};
  const dir = path.join(harnessDir, "slots");
  fs.mkdirSync(dir, { recursive: true });

  const started = Date.now();
  let said = false;
  for (;;) {
    for (let index = 0; index < count; index += 1) {
      const file = path.join(dir, `slot-${index}`);
      if (!tryTake(file)) continue;
      if (said) log(`harness: started after ${Math.round((Date.now() - started) / 1000)} s in the queue`);
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        try {
          // Only our own: a slot taken over after a long stall is somebody else's now.
          if (Number(fs.readFileSync(file, "utf8")) === process.pid) fs.rmSync(file, { force: true });
        } catch {
          // Already gone.
        }
        process.off("exit", release);
      };
      process.on("exit", release);
      return release;
    }
    if (!said) {
      said = true;
      log(`harness: ${count} runs are going on this machine; waiting for one to finish…`);
    }
    // Not all waiting runs wake at the same instant.
    await sleep(300 + Math.floor(Math.random() * 500));
  }
}
