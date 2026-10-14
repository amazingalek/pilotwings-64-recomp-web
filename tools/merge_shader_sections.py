"""Merges the sections of a recorded RT64 shader list (src/rt64_shaders.txt) whose names differ only in their last
part: tools/shader_plan.json records each test in a page load and a section of its own, named
<island>-<vehicle>-<test>, and the page builds a section when a frame first asks for 4 of its shaders, so a section
for each island and vehicle is what one test waits for when it starts (the tests of one vehicle on one island draw
almost the same shaders). Sections named in fewer parts (attract, results) stay as they are. The merged sections keep
the order in which they first appear, and a description stays once in a section.

    python3 tools/merge_shader_sections.py src/rt64_shaders.txt
"""
import sys


def main(path):
    with open(path, encoding='utf-8') as f:
        lines = f.read().splitlines()
    top = []
    sections = {}
    current = None
    for line in lines:
        if line.startswith('section '):
            name = line[len('section '):].strip()
            parts = name.split('-')
            key = '-'.join(parts[:-1]) if len(parts) >= 3 else name
            current = sections.setdefault(key, [])
        elif current is None:
            top.append(line)
        elif line not in current:
            current.append(line)
    out = list(top)
    for name, shaders in sections.items():
        out.append(f'section {name}')
        out.extend(shaders)
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write('\n'.join(out) + '\n')
    print(f'{path}: {len(sections)} sections')


if __name__ == '__main__':
    main(sys.argv[1])
