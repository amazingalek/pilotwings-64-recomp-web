#!/usr/bin/env bash
# Records src/rt64_shaders.txt, the shaders the web page builds before the game draws with them, by code rather than by
# playing: N64Recomp-browser's tools/record_shaders.mjs serves the page built in <build dir>, drives it in headless
# Chrome through tools/shader_plan.json, a page load a section, in which tools/shader_survey.js presses through the
# menus and starts each test, and writes the list. tools/merge_shader_sections.py then puts the tests' sections
# together by island. Needs node 22 or later, Chrome and Python 3, and takes about 45 minutes. Then build the page
# again, so that it prebuilds the new list.
#
#   bash tools/record_shaders.sh <build dir> <ROM> [--profile <dir>] [--port <n>] [--only <section>,...]
set -euo pipefail
[ $# -ge 2 ] || { sed -n '9p' "$0"; exit 1; }
cd "$(dirname "$0")/.."
build="$1" rom="$2"
shift 2
node lib/N64Recomp-browser/tools/record_shaders.mjs tools/shader_plan.json "$build" "$rom" src/rt64_shaders.txt "$@"
python3 tools/merge_shader_sections.py src/rt64_shaders.txt
