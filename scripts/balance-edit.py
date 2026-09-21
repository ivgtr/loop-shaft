from pathlib import Path
import subprocess

def replace(path, old, new):
    p=Path(path); s=p.read_text(); assert old in s, (path, old[:100]); p.write_text(s.replace(old,new))

# Compact lift controls use one selected slot; desktop uses a paged list.
# Verify the real selected name and activation, rather than assuming identical DOM IDs.
replace('tests/e2e/balance.spec.ts', "  await expect(ui(page, 'lift-item-dispatch-PRIORITY')).toHaveAttribute('aria-pressed', 'true');", "  const priorityControl = ui(page, width < 680 ? 'lift-selected' : 'lift-item-dispatch-PRIORITY');\n  await expect(priorityControl).toHaveAttribute('aria-pressed', 'true');\n  await expect(priorityControl).toHaveAccessibleName('PRIORITY shipments');")
replace('tests/e2e/balance.spec.ts', "  await expect(ui(page, 'lift-item-relay')).toHaveAttribute('aria-pressed', 'true');", "  await expect(ui(page, width < 680 ? 'lift-selected' : 'lift-item-relay')).toHaveAttribute('aria-pressed', 'true');\n  await expect(ui(page, 'lift-activate')).toHaveAccessibleName('ENABLE RELAY');")
# Exploration's single source of truth is the actual connection state, not a constant relay branch.
replace('src/render/gameUi.ts', '    const relay = true; // D-030 exploration no longer requires the full automation chain.\n', '')
replace('src/render/gameUi.ts', "text: !relay ? 'LIFT · FIT AUTO RELAY' : connected ? 'LIFT · TRAVEL TO D-030' : 'LIFT · OPEN D-030 CONNECTION',", "text: connected ? 'LIFT · TRAVEL TO D-030' : 'LIFT · OPEN D-030 CONNECTION',")
replace('src/render/gameUi.ts', "action: { type: 'lift-open', tab: !relay ? 'dispatch' : connected ? 'travel' : 'extend', id: !relay ? 'relay' : 'D-030' },", "action: { type: 'lift-open', tab: connected ? 'travel' : 'extend', id: 'D-030' },")
# No temporary editor or write-enabled workflow is part of the final PR tree.
Path('.github/workflows/balance-workbench.yml').unlink()
subprocess.run(['git','add','.github/workflows/balance-workbench.yml'],check=True)
print('Final compact-control regression and workbench cleanup applied.')
