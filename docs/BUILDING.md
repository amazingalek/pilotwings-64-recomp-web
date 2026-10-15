# Building

The procedure, from a clean machine to the game running. Why each step is the
way it is lives in [PORTING.md](PORTING.md).

The port builds for **Windows** and **Linux** from this one tree. macOS is not
supported. [Linux](#linux) has a script that does everything; Windows is step by
step, below.

You need your own dump of **Pilotwings 64 (USA)**:
SHA-1 `ec771aedf54ee1b214c25404fb4ec51cfd43191a`. `.z64`, `.n64`, `.v64` or a ZIP
holding one of them. Nothing else works, and nothing derived from the dump is
ever committed.

## Linux

Tested on Ubuntu 26.04 (x86-64) under WSL2, with Clang 21 and Mesa's software Vulkan (llvmpipe): builds from a clean clone, and plays through the menus into a flight at 20-25 frames per second, a limit of software rendering. Not yet run on Linux hardware with a GPU.

```sh
git clone --recurse-submodules https://github.com/danielgomesvieira2000/pilotwings-64-recomp
cd pilotwings-64-recomp
bash tools/setup_linux.sh            # prints the packages that are missing
bash tools/setup_linux.sh --install  # installs them, with sudo
bash tools/build_linux.sh "/path/to/Pilotwings 64 (USA).z64"
./build-linux/Pilotwings64Recomp
```

| Package | Needed by |
|---|---|
| `clang`, `lld` | the port (not GCC, which has miscompiled recompiled code) and the MIPS patches. A versioned `clang-21` counts; `build_linux.sh` picks the newest, and `PW64_CC`/`PW64_CXX` override it |
| `cmake`, `ninja-build`, `pkg-config`, `git` | the build |
| `gcc`, `make`, `rsync`, `python3`, `python3-venv`, `binutils-mips-linux-gnu` | the decompilation's build (IDO 5.3, splat) |
| `libsdl2-dev`, `libfreetype-dev`, `libgtk-3-dev` | the window, input and audio; the menus' fonts; the dump picker |
| `libvulkan-dev`, `mesa-vulkan-drivers`, `vulkan-tools` | RT64 renders through Vulkan on Linux. Skip the Mesa drivers if the NVIDIA or AMD proprietary stack is installed |

The dump is needed on the first build only; after that `bash tools/build_linux.sh`
rebuilds from source. Pass the dump again after changing
`recomp/pilotwings64.us.toml`, and run `python3 tools/build_patches.py` after
changing a patch.

Settings and saves live in `$XDG_DATA_HOME/Pilotwings64Recomp`, or
`~/.local/share/Pilotwings64Recomp`; a `portable.txt` beside the executable
keeps them there instead.

`python3 tools/package_release.py --version 0.1.1` makes the release archive
(see *Packaging*).

## Windows

### Requirements

| Tool | Why |
|---|---|
| Git | the repository and its submodules |
| CMake 3.20+ and Ninja | the build |
| LLVM (clang-cl) | compiling the port; recompiled code is validated against Clang, and **modern GCC is known to miscompile it** |
| Visual Studio 2022 Build Tools (C++ workload) | the Windows SDK and C runtime clang-cl links against |
| Python 3.10+ | the tools in `tools/` |
| WSL with Ubuntu | the decompilation's compiler, both recompilers, the MIPS Clang |

```powershell
winget install --id Git.Git
winget install --id Kitware.CMake
winget install --id Ninja-build.Ninja
winget install --id LLVM.LLVM
winget install --id Python.Python.3.12
winget install --id Microsoft.VisualStudio.2022.BuildTools `
    --override "--quiet --wait --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
wsl --install -d Ubuntu
```

`pwsh -File tools/check_toolchain.ps1` reports what is present.

### Inside WSL (Ubuntu)

```sh
sudo apt update
sudo apt install build-essential cmake ninja-build git rsync \
    binutils-mips-linux-gnu python3 python3-venv python3-pip \
    clang lld
```

- `build-essential cmake ninja-build`: building N64Recomp and RSPRecomp.
- `binutils-mips-linux-gnu python3-venv rsync`: the decompilation's build
  (it creates its own Python environment for splat).
- `clang lld`: compiling the C patches for MIPS. Any version from 15 on; the
  newest installed is used.

### 1. Clone

```powershell
git clone --recurse-submodules https://github.com/danielgomesvieira2000/pilotwings-64-recomp
cd pilotwings-64-recomp
```

An existing clone without submodules: `git submodule update --init --recursive`.

### 2. Patch the submodules

```powershell
python tools/patch_all.py
```

Idempotent; rerun after any submodule update. Each script says at its top what
it changes and why.

### 3. Build the recompilers

```powershell
wsl -d Ubuntu -- bash tools/wsl_build_recompiler.sh
```

Builds N64Recomp and RSPRecomp into `lib/N64ModernRuntime/N64Recomp/build-linux`.

### 4. Generate the game

```powershell
python tools/generate_game.py "C:\path\to\Pilotwings 64 (USA).z64"
```

This verifies the dump and runs, in order:

1. `tools/build_elf.sh`: builds the decompilation (IDO 5.3, the first time also
   its toolchain) into `pilotwings64.us.elf`, refusing it unless it matches the
   dump. On WSL the build runs in a mirror under `~/.cache`. The first run takes
   several minutes.
2. `tools/recompile.sh`: N64Recomp into `RecompiledFuncs/`, the reference
   symbols, and RSPRecomp's audio microcode.
3. `tools/build_patches.py`: the C patches into `RecompiledPatches/`.

The steps can be run on their own. After changing a patch only step 3 is
needed; after changing `recomp/pilotwings64.us.toml` (for example adding a
function to `ignored`), steps 2 and 3:

```powershell
wsl -d Ubuntu -- bash tools/recompile.sh
python tools/build_patches.py
```

### 5. Configure and build

```powershell
cmake -B build -G Ninja "-DCMAKE_C_COMPILER=clang-cl" "-DCMAKE_CXX_COMPILER=clang-cl" `
    "-DCMAKE_BUILD_TYPE=RelWithDebInfo" "-DCMAKE_POLICY_VERSION_MINIMUM=3.5" `
    "-DPW64_WITH_RUNTIME=ON" "-DPW64_WITH_RECOMPILED=ON" "-DPW64_WITH_FRONTEND=ON"
cmake --build build --target Pilotwings64Recomp
```

clang-cl finds the Build Tools' SDK and runtime on its own; an ordinary
PowerShell will do. Quote the `-D` arguments: PowerShell otherwise splits `=3.5`
at the dot.

Build **RelWithDebInfo**. A Debug build of a recompiled game is too slow to keep
audio in time.

The `PW64_WITH_*` switches exist so the tree builds at every stage: with all of
them off, CMake builds only the skeleton executable (`--identify`).

### 6. Run

```powershell
build\Pilotwings64Recomp.exe
```

Pick the dump in the launcher. It is copied into the settings directory
(`%LOCALAPPDATA%\Pilotwings64Recomp`), with saves and settings; a dump can also
be given on the command line.

`build\Pilotwings64Recomp.exe --identify <dump>` checks a dump without starting
the game.

## Packaging

```powershell
powershell -ExecutionPolicy Bypass -File tools/package_release.ps1 -BuildDir build -Version 0.1.1
```

```sh
python3 tools/package_release.py --version 0.1.1    # Linux, from build-linux
```

On Linux the archive is a `.tar.gz` with the executable, a launcher script and
a note on the distribution packages it needs at run time, with the debug info
split into a second archive. On Windows it stages the executable, the three DLLs it needs, `assets/`, the license texts
listed in `tools/third_party_licenses.txt`, and the notices into `dist/`, zips
them, and zips the debug symbols separately. It refuses to package anything that
looks like a dump or a save. The executable contains the game's code, recompiled;
see the README's *Licensing* before distributing one.

## The web page

This fork's `main` branch also builds with [Emscripten](https://emscripten.org) into a page,
`Pilotwings64Recomp.html`, that draws through WebGPU. `lib/RT64`, `lib/N64ModernRuntime` and `lib/RecompFrontend` are
upstream's own, at the same commits, and [N64Recomp-browser](https://github.com/amazingalek/N64Recomp-browser)
(`lib/N64Recomp-browser`) patches their checkouts with the web support, on top of `tools/patch_all.py`'s patches, and
makes the game a page. The patches change nothing in the desktop build. Mods are off on the page (no live
recompiler), and so is RT64's render to RAM, which on the page holds every display list for a readback of the frame:
`src/frontend.cpp` says why this game doesn't need it.

The page builds the shaders the game uses before it draws with them, so it never draws with RT64's slow ubershader in
the middle of play: `src/rt64_shaders.txt` lists them in sections (its header says what each one holds), and the build
specializes each one (`RT64_PREBUILT_SHADER_LIST` in `CMakeLists.txt`). In Chrome the whole list is built behind the
game from its first frame, and the game waits only when a frame wants 4 or more of a section's shaders that aren't
built yet, under a small "Preparing graphics" indicator in a corner. Firefox builds a pipeline in line with the rest of
its GPU work, so there those above the first section (the logos and the title screen) are built before the game
starts, and a section when the game first draws it, the game waiting. The menus are a section of their own, so Firefox
draws the title before it builds them: they wait after Start, where a player expects a moment, not before the first
frame. `tools/record_shaders.sh` records the list (its
header says how): N64Recomp-browser's recorder drives the page in headless Chrome through `tools/shader_plan.json`,
in which `tools/shader_survey.js` starts each test of each vehicle.

A frame the game waits on can take seconds there, which the game's scheduler took for a hung RCP: after 50 retraces
it sent itself the RDP's done message and built the next frames into display lists RT64 hadn't read yet, and the page
stopped on the mix of two frames' commands soon after Firefox's first wait. `patches/sched.c` takes those timeouts
out, on the desktop too, where the runtime always finishes a frame.

Played on 2026-10-15 from Pages (main 550269d, N64Recomp-browser 33d43a9), RTX 2070, 1256x645, a fresh profile each,
by N64Recomp-browser's `tools/play_page.mjs` with `tools/play_plan.json`: the launcher, Load ROM, the title and the
menus, then a hang glider test and a gyrocopter test flown for 30 s each. Firefox 158, three runs: the title and
menus' 80 pipelines took 19-29 s before the first frame, the glider's 13 2.2-2.8 s and the gyrocopter's 35 10-11 s,
then 59-60 presents a second, sound short only in the waits (0-23 frames in all), no WebGPU errors, and no run
stopped (the page before `patches/sched.c` stopped in two of three, soon after the first wait). Chrome 155 headless,
the same files served with the cross-origin headers, beside another game's page: one wait of 5.9 s for 9 pipelines at
the title while the rest built behind the game, then 57 presents a second (median), no WebGPU errors; on an earlier
build, alone on the GPU, 60 and no sound short.

Played again from Pages, built on N64Recomp-browser 7277a2e (rt64-web 8bea892, tile copies reused from one display list
to the next, which a page with render to RAM off needs; main 4448311) on 2026-10-15, RTX 2070, 1256x645, a fresh profile
each, the host lightly loaded, by `tools/play_plan.json`: headless Chrome 155 waited 4.1 s for 9 at the title and drew
58.2 presents a second (median), Firefox 158 waited 18.2 s for the title and menus' 80, 1.8 s for the glider's 13 and
8.2 s for the gyrocopter's 35, and drew 57.8. Sound short only in Chrome's wait at the title, no WebGPU errors in either.
Firefox's one exception is the first load, before `coi_serviceworker.js`'s reload made the page cross-origin isolated.

At 3840x2000, the stand-in for a laptop's integrated graphics (`play_page.mjs --size 3840x2000 --play 25`), from the
same page on 2026-10-15, RTX 2070, a fresh profile each, the host 22% busy: headless Chrome 155 waited 5.0 s for 9 at
the title and drew 58.2 presents a second (median; 42-59 while the rest built behind it), sound 5,306 frames short in
its wait; Firefox 158 waited 30.7 s for the title and menus' 80 before the first frame and then drew 60, no sound
short. No WebGPU errors in either. In one Firefox run of two the first load sat 60 s before `coi_serviceworker.js`'s
reload.

Played again from Pages with the menus a section of their own, built on N64Recomp-browser bcdcb78 (v0.42.0, whose
rt64-web ee2dd6a builds the section after the boot on the boot's threads in Chrome; main 2a5ba44), on 2026-10-15, RTX
2070, 1256x645, a fresh profile each, a busy host, by `tools/play_plan.json`, two runs each: Firefox 158 waited 6.7-7.3
s for the logos and the title's 33 before the first frame, 18.0-18.9 s for the menus' 47 after Start, 2.2-3.1 s for
the glider's 13 and 7.3-9.8 s for the gyrocopter's 35, and drew 55.6-57.2 presents a second (median, its waits
included); headless Chrome 155 waited 4.2-4.9 s for 9 at the title and nowhere else, and drew 58.2-58.8. Sound short
only in the waits, no WebGPU errors. The same build served locally, against one without ee2dd6a, two Chrome runs each,
interleaved: 4.2-4.5 s at the title and no other wait, against 5.0-5.2 s there and 3.1-3.3 s for 34 of the menus'
after Start, where the menus' sound fell 91,000-98,000 frames short.

With steps 1 and 2 done, patch the submodules with the web support too (the same commands run again when CMake
configures, and do nothing to a checkout that has them):

```sh
for p in "rt64 lib/RT64" "plume lib/RT64/src/contrib/plume" "hlslpp lib/RT64/src/contrib/hlslpp" \
         "N64ModernRuntime lib/N64ModernRuntime" "N64Recomp lib/N64ModernRuntime/N64Recomp" \
         "RecompFrontend lib/RecompFrontend"; do
    cmake -P lib/N64Recomp-browser/patches/apply.cmake $p
done
```

Then steps 3 and 4 (on Linux: `bash tools/wsl_build_recompiler.sh` and `python3 tools/generate_game.py <dump>`), which
build N64Recomp from the patched checkout: its `funcs.h` declares every function the recompiled code calls, which a
WebAssembly link needs. Then, with the Emscripten SDK installed and activated and
[naga](https://github.com/gfx-rs/wgpu/tree/trunk/naga) installed (`cargo install naga-cli`):

```sh
embuilder build sdl2-mt freetype-legacysjlj      # once
emcmake cmake -S . -B build-web -G Ninja -DCMAKE_BUILD_TYPE=Release -DRT64_NAGA_EXECUTABLE=$(command -v naga)
cmake --build build-web --target Pilotwings64Recomp
```

Give naga as a full path, as above: a bare name is taken as a file in the build dir. A first build compiles about
700 files. [ccache](https://ccache.dev) on `PATH` when you configure makes later builds of a new build dir compile nothing compiled before (keep the build dir inside the checkout, as `build-web` is), and
`-DN64RECOMP_BROWSER_FAST_LINK=ON` makes the last step, the link, take seconds instead of minutes, for a page you only
want to try.

`build-web` then holds `Pilotwings64Recomp.html`, `.js`, `.wasm`, `.data` and `coi_serviceworker.js`. The page needs
a browser with WebGPU (Chrome or Edge 113 and up, or Firefox 141 and up) and must be cross-origin isolated: serve the
folder with `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`, or on a host
that can't set headers, as is, and `coi_serviceworker.js` sets them after one reload. The player picks their dump in
the launcher; it, the settings and the saves are kept in the browser's IndexedDB for that origin. On the page the
keyboard is the desktop's.

## Troubleshooting

| Symptom | Cause |
|---|---|
| `Illegal macro parameter name` from IDO | CRLF checkout of the decompilation; `build_elf.sh` fixes it, so run the script rather than `make` directly |
| `funcs.h` ends mid-line; compile errors in `RecompiledFuncs` | a Windows build of N64Recomp; use the WSL one (step 3) |
| `No available targets are compatible with triple "mips"` | Windows LLVM; the patches must build through WSL (`build_patches.py` does) |
| `duplicate symbol` for a game function at link | a `RECOMP_PATCH` missing from `ignored`; `build_patches.py` normally stops first |
| `error: undefined symbol` naming a function a patch calls | `RecompiledFuncs` is older than the config; rerun `recompile.sh` then `build_patches.py` |
| Lookup miss at startup | a stale `RecompiledFuncs/`; regenerate (step 4) |
