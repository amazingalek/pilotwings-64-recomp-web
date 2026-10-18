// Evaluated in the page by N64Recomp-browser's tools/record_shaders.mjs and tools/play_page.mjs (tools/shader_plan.json,
// tools/play_plan.json), to start any test of any vehicle by code, without anyone playing. It needs no change to the
// game. The state block D_80362698 (the decompilation's src/app/game.h, Unk80362690) holds the game state at +0 and the
// player's record from +0xC: pilot, vehicle, class and test, u16 each. go() presses through the menus as a player would
// (Start on the title, A everywhere else), writes the vehicle and class it was asked for at the pilot select, as the
// port's own PW64_TEST_VEHICLE knob writes the vehicle (src/testdrive.cpp), and on the test details screen, whose menu
// sets the test from its own cursor (testMenuMainRender, src/app/test_menu.c), moves that cursor with C-right; the test
// setup then loads the test's island with taskInitTest. A class or test a fresh save hasn't unlocked starts the same way.
//
// - tests() lists every test the game knows: the table D_803798E0[class 8][test 5][vehicle 7] (src/app/task.c), 12
//   bytes an entry, the task's index at +8 (0xFF for none).
// - go(vehicle, cls, test, stop) resolves with the state once the game reaches state stop (the test flying,
//   TEST_UPDATE, unless told), or false after 90 s.
// - fly(ms) holds A (throttle, or the rocket belt's thrust) and banks left and right, looking through the C views.
// - flyAll(ms, throttle) flies as a player does in a longer test: banks left and right in turn, climbs and dives,
//   presses B (the gyrocopter's missiles) each turn and Z or a C view now and then, and holds A unless throttle is
//   false (the skydive, whose A opens the chute).
// - land(ms) presses A every 1.5 s (the cannonball's shot, then on through the results) until the test has ended and
//   the game is back in its menus, and resolves with the state. The results menu (Check photo, Replay, Next) opens on
//   Replay after a photo test, and its cursor wraps, so on it land() moves the cursor up to Next, the last item, first
//   (sMenuCurSelect and sMenuItemCount, src/app/menu_utils.c, at their addresses in the US build's map).
// - state() gives the state, island (map), vehicle, class and test.
// RDRAM is found as the recorder's n64r finds it; halfwords sit at the address XOR 2 in its little-endian words.
(() => {
  if (!window.__rdram) {
    const h = HEAPU32;
    for (let i = 2; i < h.length - 8; i++) {
      if (h[i] === 0xB0000000 && h[i - 2] <= 2 && (h[i + 4] === 0x400000 || h[i + 4] === 0x800000)) {
        window.__rdram = i * 4 - 0x308;
        break;
      }
    }
  }
  const base = window.__rdram;
  const off = (a) => base + (a - 0x80000000);
  const r8 = (a) => HEAPU8[off(a) ^ 3];
  const r16 = (a) => HEAPU16[(off(a) ^ 2) >>> 1];
  const w16 = (a, v) => { HEAPU16[(off(a) ^ 2) >>> 1] = v; };
  const r32 = (a) => HEAPU32[off(a) >>> 2];
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const block = 0x80362698;
  const menuCount = 0x8036BDF0, menuCursor = 0x8036BE10;
  const TITLE = 0, PILOT_SELECT = 3, TEST_DETAILS = 2, TEST_UPDATE = 5, RESULTS = 6, RESULTS_CB = 13, CONGRATULATIONS = 14;
  // The port's keyboard (src/frontend.cpp): X is A, C is B, Z is Z, Enter is Start, the arrows the stick, IJKL the C
  // buttons.
  const keys = {
    A: ['KeyX', 'x', 88], B: ['KeyC', 'c', 67], Z: ['KeyZ', 'z', 90], START: ['Enter', 'Enter', 13],
    LEFT: ['ArrowLeft', 'ArrowLeft', 37], RIGHT: ['ArrowRight', 'ArrowRight', 39], UP: ['ArrowUp', 'ArrowUp', 38],
    DOWN: ['ArrowDown', 'ArrowDown', 40], CUP: ['KeyI', 'i', 73], CDOWN: ['KeyK', 'k', 75], CLEFT: ['KeyJ', 'j', 74],
    CRIGHT: ['KeyL', 'l', 76],
  };
  const send = (type, [code, key, keyCode]) =>
    window.dispatchEvent(new KeyboardEvent(type, { code, key, keyCode, which: keyCode, bubbles: true }));
  const press = async (name, ms = 150) => { send('keydown', keys[name]); await sleep(ms); send('keyup', keys[name]); };
  window.state = () => ({
    state: r32(block), map: r16(block + 4), vehicle: r16(block + 0xE), cls: r16(block + 0x10), test: r16(block + 0x12),
  });
  window.tests = () => {
    const list = [];
    for (let cls = 0; cls < 8; cls++) {
      for (let test = 0; test < 5; test++) {
        for (let vehicle = 0; vehicle < 7; vehicle++) {
          const entry = 0x803798E0 + ((cls * 5 + test) * 7 + vehicle) * 12;
          if (r8(entry + 8) !== 0xFF) list.push({ vehicle, cls, test });
        }
      }
    }
    return list;
  };
  window.go = async (vehicle, cls, test, stop = TEST_UPDATE, ms = 90000) => {
    let picked = false;
    for (let t = 0; t < ms; t += 800) {
      const s = r32(block);
      if (s === stop) return window.state();
      if (s === PILOT_SELECT) {
        w16(block + 0xE, vehicle);
        w16(block + 0x10, cls);
      }
      if (s === TEST_DETAILS && !picked) {
        picked = true;
        await sleep(1500);
        for (let i = 0; i < test; i++) {
          await press('CRIGHT');
          await sleep(400);
        }
      }
      await press(s === TITLE ? 'START' : 'A');
      await sleep(650);
    }
    return false;
  };
  window.fly = async (ms) => {
    send('keydown', keys.A);
    for (let t = 0; t < ms; t += 4000) {
      const turn = (t / 4000) % 2 ? 'LEFT' : 'RIGHT';
      send('keydown', keys[turn]);
      await sleep(1500);
      send('keyup', keys[turn]);
      await press((t / 4000) % 2 ? 'UP' : 'DOWN', 600);
      await sleep(1900);
    }
    send('keyup', keys.A);
    return window.state();
  };
  window.flyAll = async (ms, throttle = true) => {
    if (throttle) send('keydown', keys.A);
    const extras = ['B', 'CUP', 'B', 'Z', 'B', 'CDOWN', 'B', 'CLEFT'];
    for (let t = 0, i = 0; t < ms; t += 4000, i++) {
      const turn = i % 2 ? 'LEFT' : 'RIGHT';
      send('keydown', keys[turn]);
      await sleep(1200);
      send('keyup', keys[turn]);
      await press(extras[i % extras.length]);
      await press(i % 2 ? 'UP' : 'DOWN', 500);
      await sleep(400);
      await press('B');
      await sleep(1450);
    }
    if (throttle) send('keyup', keys.A);
    return window.state();
  };
  window.land = async (ms = 60000) => {
    for (let t = 0, ended = false; t < ms; t += 1500) {
      const s = r32(block);
      ended = ended || (s !== TEST_UPDATE);
      if (ended && ![TEST_UPDATE, RESULTS, RESULTS_CB, CONGRATULATIONS].includes(s)) return window.state();
      const count = r32(menuCount);
      await press(s === RESULTS && count > 1 && r32(menuCursor) !== count - 1 ? 'UP' : 'A');
      await sleep(1350);
    }
    return window.state();
  };
  return base ? 'rdram at ' + base.toString(16) + ', state ' + JSON.stringify(window.state()) : 'no rdram';
})();
